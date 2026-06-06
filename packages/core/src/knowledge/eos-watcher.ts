import * as fs from 'fs';
import * as path from 'path';
import { RepositoryIndexer } from './indexer';
import { MetadataStore } from './metadata-store';
import { RouteScanner, ScannedRoute } from './route-scanner';
import { GraphQLParser } from './graphql-parser';
import { InfraParser } from './infra-parser';
import { GraphStore } from '../architecture/graph-store';
import { GraphLinker } from '../architecture/graph-linker';
import { ContractDiscovery } from '../architecture/contract-discovery';
import { RepoRegistry } from '../multi-repo/repo-registry';
import { getSupportedExtensions } from './lang';

export interface EosWatcherDeps {
  rootPath: string;
  eosDir: string;
  indexer: RepositoryIndexer;
  metadataStore: MetadataStore;
  graphStore: GraphStore;
  repoRegistry: RepoRegistry;
}

type ChangeType = 'source' | 'route' | 'package' | 'contract' | 'infra' | 'workspace';

const ROUTE_PATTERNS = [
  /\.controller\.[tj]sx?$/,
  /\.route\.[tj]sx?$/,
  /\.routes\.[tj]sx?$/,
  /\/routes\//,
  /\/controllers\//,
];

const CONTRACT_PATTERNS = [
  /openapi\.(yaml|yml|json)$/,
  /swagger\.(yaml|yml|json)$/,
  /\.proto$/,
  /\.graphql$/,
  /\.gql$/,
];

const INFRA_PATTERNS = [
  /docker-compose/,
  /Dockerfile/,
  /\.tf$/,
  /k8s\//,
  /deploy\//,
  /\.env\./,
];

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '.eos', '.turbo', 'target',
]);

export class EosWatcher {
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges = new Map<string, ChangeType>();
  private readonly DEBOUNCE_MS = 2000;
  private supportedExtensions: Set<string>;
  private onUpdate?: (summary: RefreshSummary) => void;

  constructor(
    private deps: EosWatcherDeps,
    onUpdate?: (summary: RefreshSummary) => void
  ) {
    this.supportedExtensions = new Set(getSupportedExtensions());
    this.onUpdate = onUpdate;
  }

  start(): void {
    try {
      this.watcher = fs.watch(this.deps.rootPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (this.shouldSkip(filename)) return;

        const fullPath = path.join(this.deps.rootPath, filename);
        const changeType = this.classifyChange(filename);
        this.pendingChanges.set(fullPath, changeType);
        this.scheduleRefresh();
      });

      this.watcher.on('error', () => {
        // Silently handle watch errors (permissions, too many files)
      });
    } catch {
      // Directory not watchable
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingChanges.clear();
  }

  async refreshIncremental(changedFiles: string[]): Promise<RefreshSummary> {
    const summary: RefreshSummary = {
      filesReindexed: 0,
      routesUpdated: false,
      graphRelinked: false,
      infraUpdated: false,
      contractsUpdated: false,
    };

    const classified = new Map<ChangeType, string[]>();
    for (const file of changedFiles) {
      const type = this.classifyChange(file);
      if (!classified.has(type)) classified.set(type, []);
      classified.get(type)!.push(file);
    }

    // Always: re-index changed source files
    const sourceFiles = classified.get('source') || [];
    const routeFiles = classified.get('route') || [];
    const allSourceFiles = [...sourceFiles, ...routeFiles];

    for (const filePath of allSourceFiles) {
      try {
        if (fs.existsSync(filePath)) {
          const indexed = await this.deps.indexer.indexFile(filePath);
          this.deps.metadataStore.upsertFile(indexed);
          this.deps.metadataStore.storeRelationships(indexed.filePath, indexed.imports, indexed.exports);
          summary.filesReindexed++;
        } else {
          this.deps.metadataStore.deleteFile(filePath);
          summary.filesReindexed++;
        }
      } catch {
        // Skip files that fail to index
      }
    }

    // Route files changed: re-scan routes
    if (routeFiles.length > 0) {
      summary.routesUpdated = true;
      // Route cache will be rebuilt on next eos_context call (gist builder re-scans)
    }

    // Package.json changed: re-link graph
    if (classified.has('package')) {
      try {
        const linker = new GraphLinker(this.deps.graphStore, this.deps.repoRegistry, this.deps.eosDir);
        await linker.linkAll();
        summary.graphRelinked = true;
      } catch {
        // Graph linking failed, non-critical
      }
    }

    // Contract files changed: re-discover contracts
    if (classified.has('contract')) {
      try {
        const discovery = new ContractDiscovery(this.deps.rootPath);
        const contracts = await discovery.discoverContracts();
        const repoName = path.basename(this.deps.rootPath);
        for (const contract of contracts) {
          this.deps.graphStore.upsertContract({
            id: `${repoName}/${contract.filePath}`,
            repoName,
            filePath: contract.filePath,
            type: contract.type,
            version: contract.version,
            endpoints: contract.endpoints,
            lastModified: new Date().toISOString(),
          });
        }
        summary.contractsUpdated = true;
      } catch {
        // Contract discovery failed
      }
    }

    // Infra files changed: re-parse infra topology
    if (classified.has('infra')) {
      try {
        const infra = new InfraParser(this.deps.rootPath).parse();
        const repoName = path.basename(this.deps.rootPath);
        for (const node of infra.nodes) {
          this.deps.graphStore.upsertService({
            id: `infra/${node.name}`,
            repoName,
            serviceName: node.name,
            description: `${node.type} (${node.provider || 'local'})`,
            owners: [],
            criticality: 'medium',
            lastDiscovered: new Date().toISOString(),
          });
        }
        for (const conn of infra.connections) {
          const sourceId = `infra/${conn.from}`;
          const targetId = `infra/${conn.to}`;
          const sourceExists = this.deps.graphStore.getService(sourceId);
          const targetExists = this.deps.graphStore.getService(targetId);
          if (sourceExists && targetExists) {
            this.deps.graphStore.addConnection({
              sourceService: sourceId,
              targetService: targetId,
              protocol: conn.type === 'publishes_to' ? 'event' : conn.type === 'reads_from' ? 'database' : 'rest',
              dataFlow: conn.type === 'publishes_to' ? 'publish' : 'request',
              description: conn.detail || `${conn.type} from ${conn.file}`,
              lastVerified: new Date().toISOString(),
            }, 'auto-linker');
          }
        }
        summary.infraUpdated = true;
      } catch {
        // Infra parsing failed
      }
    }

    return summary;
  }

  async refreshFull(): Promise<RefreshSummary> {
    // Re-scan everything
    const allFiles = this.walkSourceFiles(this.deps.rootPath);
    return this.refreshIncremental(allFiles);
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      const changes = Array.from(this.pendingChanges.keys());
      this.pendingChanges.clear();

      if (changes.length > 0) {
        const summary = await this.refreshIncremental(changes);
        if (this.onUpdate) {
          this.onUpdate(summary);
        }
      }
    }, this.DEBOUNCE_MS);
  }

  private classifyChange(filename: string): ChangeType {
    const lower = filename.toLowerCase();
    const base = path.basename(filename);

    if (base === 'package.json') return 'package';
    if (base === 'eos.workspace.yaml') return 'workspace';

    if (CONTRACT_PATTERNS.some((p) => p.test(filename))) return 'contract';
    if (INFRA_PATTERNS.some((p) => p.test(filename))) return 'infra';
    if (ROUTE_PATTERNS.some((p) => p.test(filename))) return 'route';

    return 'source';
  }

  private shouldSkip(filename: string): boolean {
    const parts = filename.split(path.sep);
    for (const part of parts) {
      if (SKIP_DIRS.has(part)) return true;
      if (part.startsWith('.') && part !== '.env') return true;
    }
    const ext = path.extname(filename).toLowerCase();
    return !this.supportedExtensions.has(ext) && !this.isConfigFile(filename);
  }

  private isConfigFile(filename: string): boolean {
    const base = path.basename(filename).toLowerCase();
    return base === 'package.json' || base === 'eos.workspace.yaml' ||
      base.endsWith('.yaml') || base.endsWith('.yml') ||
      base.endsWith('.tf') || base.endsWith('.proto') ||
      base.endsWith('.graphql') || base.endsWith('.gql') ||
      base.startsWith('.env') || base.startsWith('docker-compose');
  }

  private walkSourceFiles(dir: string): string[] {
    const files: string[] = [];
    const walk = (d: string, depth: number) => {
      if (depth > 6) return;
      try {
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
          if (SKIP_DIRS.has(entry.name)) continue;
          if (entry.name.startsWith('.') && entry.name !== '.env') continue;
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full, depth + 1);
          else files.push(full);
        }
      } catch { /* skip unreadable */ }
    };
    walk(dir, 0);
    return files;
  }
}

export interface RefreshSummary {
  filesReindexed: number;
  routesUpdated: boolean;
  graphRelinked: boolean;
  infraUpdated: boolean;
  contractsUpdated: boolean;
}
