import * as fs from 'fs';
import * as path from 'path';
import {
  GraphConnection,
  DiscoveredContract,
  DetectedCall,
  ContractEndpoint,
  ConnectionProtocol,
  DataFlowType,
  LinkedRepo,
} from '@engineering-os/shared';
import { GraphStore } from './graph-store';
import { ContractDiscovery } from './contract-discovery';
import { RepoRegistry } from '../multi-repo/repo-registry';
import { safeYamlLoad } from '../security';

// ─── Configuration Types ───────────────────────────────────────

export interface GraphLinkerOptions {
  hintsPath?: string;
  autoLinkThreshold?: number;
  suggestThreshold?: number;
  anchorMinimum?: number;
  skipDiscovery?: boolean;
  externalDomains?: string[];
}

export interface GraphHints {
  urlMappings: Array<{ pattern: string; targetRepo: string }>;
  aliases: Record<string, string[]>;
  packageMappings: Record<string, string>;
  pinned: Array<{ source: string; target: string; protocol: ConnectionProtocol }>;
  excluded: Array<{ source: string; target: string }>;
  externalDomains: string[];
  genericTokens: string[];
  ignoredPaths: string[];
}

// ─── Matching Types ────────────────────────────────────────────

export interface MatchSignal {
  targetRepo: string;
  weight: number;
  signalType: SignalType;
  evidence: string;
}

export type SignalType =
  | 'manual-hint'
  | 'endpoint-path-method'
  | 'endpoint-path-only'
  | 'package-exact'
  | 'workspace-dep'
  | 'event-topic-exact'
  | 'event-topic-prefix'
  | 'service-name-token'
  | 'infra-correlation'
  | 'cardinality-bonus';

export interface ScoredEdge {
  sourceRepo: string;
  targetRepo: string;
  protocol: ConnectionProtocol;
  confidence: number;
  anchorWeight: number;
  signals: MatchSignal[];
  ambiguous: boolean;
}

// ─── Report Types ──────────────────────────────────────────────

export interface LinkReport {
  autoLinked: ScoredEdge[];
  suggested: ScoredEdge[];
  skipped: Array<{ call: DetectedCall; reason: string }>;
  discovered: Array<{ name: string; path: string }>;
  broken: LinkedRepo[];
  stats: LinkStats;
}

export interface LinkStats {
  reposScanned: number;
  contractsFound: number;
  outboundCallsDetected: number;
  matchingDurationMs: number;
  totalDurationMs: number;
  runEpoch: number;
}

// ─── Index Types ───────────────────────────────────────────────

interface EndpointIndexEntry {
  repoName: string;
  method?: string;
  normalizedPath: string;
}

interface ServiceTokenEntry {
  repoName: string;
  ambiguous: boolean;
}

interface MatchIndices {
  endpointIndex: Map<string, EndpointIndexEntry[]>;
  packageIndex: Map<string, string>;
  eventIndex: Map<string, string[]>;
  serviceTokenIndex: Map<string, ServiceTokenEntry[]>;
  infraMap: Map<string, string>;
}

// ─── Constants ─────────────────────────────────────────────────

const DEFAULT_GENERIC_TOKENS = new Set([
  'api', 'service', 'svc', 'internal', 'gateway', 'proxy',
  'localhost', 'backend', 'frontend', 'server', 'app',
  'staging', 'production', 'dev', 'test', 'local', 'cluster',
]);

const DEFAULT_EXTERNAL_DOMAINS = [
  'github.com', 'gitlab.com', 'bitbucket.org',
  'googleapis.com', 'amazonaws.com', 'azure.com',
  'stripe.com', 'twilio.com', 'sendgrid.com',
  'datadog.com', 'sentry.io', 'newrelic.com',
  'cloudflare.com', 'fastly.com', 'akamai.com',
  'npmjs.org', 'unpkg.com', 'cdnjs.com',
  'docker.io', 'gcr.io', 'quay.io',
];

const DEFAULT_IGNORED_PATHS = new Set([
  '/health', '/healthz', '/ready', '/readyz',
  '/metrics', '/prometheus', '/ping', '/status',
]);

const TEST_FILE_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\/__tests__\//,
  /\/test\//,
  /\/tests\//,
  /\/__mocks__\//,
  /\/fixtures\//,
];

const VERSION_PREFIX_REGEX = /^\/(?:api\/)?v\d+/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_REGEX = /^\d+$/;
const LONG_ALPHANUM_REGEX = /^[a-zA-Z0-9]{16,}$/;

// ─── Main Class ────────────────────────────────────────────────

export class GraphLinker {
  private autoLinkThreshold: number;
  private suggestThreshold: number;
  private anchorMinimum: number;
  private externalDomains: string[];

  constructor(
    private graphStore: GraphStore,
    private repoRegistry: RepoRegistry,
    private eosDir: string,
    private options?: GraphLinkerOptions
  ) {
    this.autoLinkThreshold = options?.autoLinkThreshold ?? 0.70;
    this.suggestThreshold = options?.suggestThreshold ?? 0.45;
    this.anchorMinimum = options?.anchorMinimum ?? 0.50;
    this.externalDomains = [
      ...DEFAULT_EXTERNAL_DOMAINS,
      ...(options?.externalDomains ?? []),
    ];
  }

  async linkAll(): Promise<LinkReport> {
    const totalStart = Date.now();
    const runEpoch = Date.now();

    const linkedRepos = await this.repoRegistry.getLinkedRepos();
    const { valid, broken } = await this.repoRegistry.validateLinks();

    // Discover siblings
    const discovered = this.options?.skipDiscovery ? [] : this.discoverSiblings(this.eosDir);

    // Auto-discover workspace packages (monorepo support)
    const rootPath = path.dirname(this.eosDir);
    const workspacePackages = this.discoverWorkspacePackages(rootPath);

    // Include root project itself as a scannable entity
    const rootPkgName = this.readPackageName(rootPath);
    const rootRepoName = rootPkgName
      ? rootPkgName.replace(/^@[^/]+\//, '')
      : path.basename(rootPath);

    // Merge: root project + workspace packages + linked repos
    const allRepos: LinkedRepo[] = [
      { name: rootRepoName, path: rootPath, eosDir: this.eosDir },
      ...valid,
      ...workspacePackages.map((wp) => ({
        name: wp.name,
        path: wp.path,
        eosDir: path.join(wp.path, '.eos'),
      })),
    ];

    // Deduplicate (a workspace package might already be explicitly linked)
    const seen = new Set<string>();
    const dedupedRepos = allRepos.filter((r) => {
      if (seen.has(r.name)) return false;
      seen.add(r.name);
      return true;
    });

    // Scan all repos
    const scanResults = await this.scanAllRepos(dedupedRepos);
    let contractsFound = 0;
    let outboundCallsDetected = 0;
    for (const [, data] of scanResults) {
      contractsFound += data.contracts.length;
      outboundCallsDetected += data.calls.length;
    }

    // Build indices
    const indices = this.buildIndices(scanResults);

    // Load hints
    const hints = this.loadHints();

    // Register services in graph
    for (const [repoName, data] of scanResults) {
      this.graphStore.upsertService({
        id: `${repoName}/${data.serviceName}`,
        repoName,
        serviceName: data.serviceName,
        owners: [],
        criticality: 'medium',
        lastDiscovered: new Date().toISOString(),
      });

      // Store contracts
      for (const contract of data.contracts) {
        this.graphStore.upsertContract({
          id: `${repoName}/${contract.filePath}`,
          repoName,
          filePath: contract.filePath,
          type: contract.type,
          version: contract.version,
          endpoints: contract.endpoints,
          lastModified: new Date().toISOString(),
        });
      }
    }

    // Apply pinned edges from hints (source='manual', never cleared by auto-linker)
    for (const pinned of hints.pinned) {
      const sourceServices = this.graphStore.getServicesByRepo(pinned.source);
      const targetServices = this.graphStore.getServicesByRepo(pinned.target);
      if (sourceServices.length > 0 && targetServices.length > 0) {
        this.graphStore.addConnection({
          sourceService: sourceServices[0].id,
          targetService: targetServices[0].id,
          protocol: pinned.protocol,
          dataFlow: this.protocolToDataFlow(pinned.protocol),
          description: 'Pinned via graph-hints.yaml',
          lastVerified: new Date().toISOString(),
        }, 'manual');
      }
    }

    // Run matching pipeline
    const matchStart = Date.now();
    const allSignals: Array<{ sourceRepo: string; call: DetectedCall; signals: MatchSignal[] }> = [];
    const skipped: LinkReport['skipped'] = [];

    for (const [repoName, data] of scanResults) {
      for (const call of data.calls) {
        // Filter stage
        const skipReason = this.shouldSkipCall(call, repoName, hints);
        if (skipReason) {
          skipped.push({ call, reason: skipReason });
          continue;
        }

        const signals = this.matchCall(call, repoName, indices, hints);
        if (signals.length > 0) {
          allSignals.push({ sourceRepo: repoName, call, signals });
        } else {
          skipped.push({ call, reason: 'No matching signals' });
        }
      }
    }

    // Score fusion
    const edges = this.fuseAllSignals(allSignals, scanResults);

    // Ambiguity check and anchor enforcement
    const finalEdges = this.applyAmbiguityCheck(edges);

    // Classify edges
    const autoLinked: ScoredEdge[] = [];
    const suggested: ScoredEdge[] = [];

    for (const edge of finalEdges) {
      if (!edge.ambiguous && edge.confidence >= this.autoLinkThreshold && edge.anchorWeight >= this.anchorMinimum) {
        autoLinked.push(edge);
      } else if (edge.confidence >= this.suggestThreshold) {
        suggested.push(edge);
      }
    }

    // Persist
    this.persistEdges(autoLinked, runEpoch);

    const matchingDurationMs = Date.now() - matchStart;

    return {
      autoLinked,
      suggested,
      skipped,
      discovered,
      broken,
      stats: {
        reposScanned: dedupedRepos.length,
        contractsFound,
        outboundCallsDetected,
        matchingDurationMs,
        totalDurationMs: Date.now() - totalStart,
        runEpoch,
      },
    };
  }

  async linkRepo(repoName: string): Promise<LinkReport> {
    return this.linkAll();
  }

  discoverSiblings(eosDir: string): Array<{ name: string; path: string }> {
    const repoRoot = path.dirname(eosDir);
    const parentDir = path.dirname(repoRoot);
    const discovered: Array<{ name: string; path: string }> = [];

    try {
      const entries = fs.readdirSync(parentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;

        const siblingPath = path.join(parentDir, entry.name);
        if (siblingPath === repoRoot) continue;

        const siblingEos = path.join(siblingPath, '.eos', 'index', 'metadata.db');
        try {
          fs.accessSync(siblingEos);
          discovered.push({ name: entry.name, path: siblingPath });
        } catch {
          // No .eos initialized
        }
      }
    } catch {
      // Parent dir not readable
    }

    return discovered;
  }

  discoverWorkspacePackages(rootPath: string): Array<{ name: string; path: string; packageName: string }> {
    const packages: Array<{ name: string; path: string; packageName: string }> = [];

    // Strategy 1: npm/yarn/pnpm workspaces from package.json
    try {
      const pkgContent = fs.readFileSync(path.join(rootPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent);
      const workspaces: string[] = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : (pkg.workspaces?.packages ?? []);

      for (const pattern of workspaces) {
        packages.push(...this.resolveWorkspaceGlob(rootPath, pattern));
      }
    } catch {
      // No package.json or no workspaces field
    }

    // Strategy 2: pnpm-workspace.yaml fallback
    if (packages.length === 0) {
      try {
        const content = fs.readFileSync(path.join(rootPath, 'pnpm-workspace.yaml'), 'utf-8');
        const match = content.match(/packages:\s*\n((?:\s+-\s+.+\n?)+)/);
        if (match) {
          const patterns = match[1].split('\n')
            .map((l) => l.replace(/^\s*-\s*['"]?/, '').replace(/['"]?\s*$/, ''))
            .filter(Boolean);
          for (const pattern of patterns) {
            packages.push(...this.resolveWorkspaceGlob(rootPath, pattern));
          }
        }
      } catch {
        // No pnpm-workspace.yaml
      }
    }

    return packages;
  }

  private resolveWorkspaceGlob(rootPath: string, pattern: string): Array<{ name: string; path: string; packageName: string }> {
    const results: Array<{ name: string; path: string; packageName: string }> = [];

    // Handle simple globs: "packages/*", "apps/*", "libs/*"
    // Only supports single-level wildcard (most common case)
    if (pattern.endsWith('/*') || pattern.endsWith('\\*')) {
      const baseDir = path.join(rootPath, pattern.slice(0, -2));
      try {
        const entries = fs.readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

          const pkgPath = path.join(baseDir, entry.name);
          const pkgJsonPath = path.join(pkgPath, 'package.json');
          try {
            const pkgContent = fs.readFileSync(pkgJsonPath, 'utf-8');
            const pkg = JSON.parse(pkgContent);
            if (pkg.name) {
              results.push({ name: entry.name, path: pkgPath, packageName: pkg.name });
            }
          } catch {
            // No package.json in this dir, skip
          }
        }
      } catch {
        // Base directory doesn't exist
      }
    } else if (!pattern.includes('*')) {
      // Exact path (e.g., "tools/scripts")
      const pkgPath = path.join(rootPath, pattern);
      try {
        const pkgContent = fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf-8');
        const pkg = JSON.parse(pkgContent);
        if (pkg.name) {
          results.push({ name: path.basename(pkgPath), path: pkgPath, packageName: pkg.name });
        }
      } catch {
        // Not a valid package
      }
    }

    return results;
  }

  // ─── Private: Scanning ─────────────────────────────────────────

  private async scanAllRepos(repos: LinkedRepo[]): Promise<Map<string, { contracts: DiscoveredContract[]; calls: DetectedCall[]; packageName?: string; serviceName: string }>> {
    const results = new Map<string, { contracts: DiscoveredContract[]; calls: DetectedCall[]; packageName?: string; serviceName: string }>();

    for (const repo of repos) {
      const discovery = new ContractDiscovery(repo.path);
      const contracts = await discovery.discoverContracts();
      const calls = await discovery.detectOutboundCalls();
      const packageName = this.readPackageName(repo.path);
      const serviceName = this.deriveServiceName(repo.path, repo.name);

      // Also extract dependencies from package.json manifest as synthetic import calls
      const manifestDeps = this.extractManifestDependencies(repo.path);
      calls.push(...manifestDeps);

      results.set(repo.name, { contracts, calls, packageName, serviceName });
    }

    return results;
  }

  private extractManifestDependencies(repoPath: string): DetectedCall[] {
    const calls: DetectedCall[] = [];
    try {
      const pkgContent = fs.readFileSync(path.join(repoPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgContent);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const [name, version] of Object.entries(allDeps)) {
        if (typeof version !== 'string') continue;
        // Only include scoped packages that look internal (workspace:* or private registry)
        if (!name.startsWith('@')) continue;
        const isWorkspaceDep = version.startsWith('workspace:');
        const isInternalScope = this.isLikelyInternalScope(name, repoPath);
        if (isWorkspaceDep || isInternalScope) {
          calls.push({
            sourceFile: 'package.json',
            targetPackage: name,
            protocol: 'import',
            evidence: isWorkspaceDep
              ? `package.json workspace dependency: ${name}@${version} (ground truth)`
              : `package.json dependency: ${name}@${version}`,
          });
        }
      }
    } catch {
      // No package.json or parse error
    }
    return calls;
  }

  private isLikelyInternalScope(pkg: string, repoPath: string): boolean {
    const scope = pkg.split('/')[0];
    // Check if this scope appears in the repo's own package name
    const ownPkg = this.readPackageName(repoPath);
    if (ownPkg && ownPkg.startsWith(scope + '/')) return true;
    // Check if other scanned repos share this scope
    return false;
  }

  private deriveServiceName(repoPath: string, repoName: string): string {
    const pkgName = this.readPackageName(repoPath);
    if (pkgName) {
      const parts = pkgName.split('/');
      return parts[parts.length - 1];
    }
    return repoName;
  }

  private readPackageName(repoPath: string): string | undefined {
    try {
      const pkgPath = path.join(repoPath, 'package.json');
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return pkg.name;
    } catch {
      return undefined;
    }
  }

  // ─── Private: Index Building ───────────────────────────────────

  private buildIndices(scanResults: Map<string, { contracts: DiscoveredContract[]; calls: DetectedCall[]; packageName?: string; serviceName: string }>): MatchIndices {
    return {
      endpointIndex: this.buildEndpointIndex(scanResults),
      packageIndex: this.buildPackageIndex(scanResults),
      eventIndex: this.buildEventIndex(scanResults),
      serviceTokenIndex: this.buildServiceTokenIndex(scanResults),
      infraMap: new Map(), // TODO: parse docker-compose/k8s manifests
    };
  }

  private buildEndpointIndex(scanResults: Map<string, { contracts: DiscoveredContract[] }>): Map<string, EndpointIndexEntry[]> {
    const index = new Map<string, EndpointIndexEntry[]>();

    for (const [repoName, data] of scanResults) {
      for (const contract of data.contracts) {
        for (const endpoint of contract.endpoints) {
          const normalized = this.normalizePath(endpoint.path);
          if (!index.has(normalized)) index.set(normalized, []);
          index.get(normalized)!.push({
            repoName,
            method: endpoint.method,
            normalizedPath: normalized,
          });
        }
      }
    }

    return index;
  }

  private buildPackageIndex(scanResults: Map<string, { packageName?: string }>): Map<string, string> {
    const index = new Map<string, string>();
    for (const [repoName, data] of scanResults) {
      if (data.packageName) {
        index.set(data.packageName, repoName);
      }
    }
    return index;
  }

  private buildEventIndex(scanResults: Map<string, { contracts: DiscoveredContract[] }>): Map<string, string[]> {
    const index = new Map<string, string[]>();
    for (const [repoName, data] of scanResults) {
      for (const contract of data.contracts) {
        if (contract.type !== 'event-schema') continue;
        for (const endpoint of contract.endpoints) {
          const topic = endpoint.path || endpoint.name || '';
          if (!topic) continue;
          if (!index.has(topic)) index.set(topic, []);
          index.get(topic)!.push(repoName);
        }
      }
    }
    return index;
  }

  private buildServiceTokenIndex(scanResults: Map<string, { serviceName: string }>): Map<string, ServiceTokenEntry[]> {
    const tokenToRepos = new Map<string, string[]>();

    for (const [repoName, data] of scanResults) {
      // Index tokens from both service name and repo name
      const serviceTokens = this.tokenizeServiceName(data.serviceName);
      const repoTokens = this.tokenizeServiceName(repoName);
      const allTokens = new Set([...serviceTokens, ...repoTokens]);

      for (const token of allTokens) {
        if (!tokenToRepos.has(token)) tokenToRepos.set(token, []);
        if (!tokenToRepos.get(token)!.includes(repoName)) {
          tokenToRepos.get(token)!.push(repoName);
        }
      }
    }

    const index = new Map<string, ServiceTokenEntry[]>();
    for (const [token, repos] of tokenToRepos) {
      const ambiguous = repos.length > 1;
      index.set(token, repos.map((repoName) => ({ repoName, ambiguous })));
    }

    return index;
  }

  // ─── Private: Filtering ────────────────────────────────────────

  private shouldSkipCall(call: DetectedCall, sourceRepo: string, hints: GraphHints): string | null {
    // Skip test files
    if (this.isTestFile(call.sourceFile)) return 'Test file';

    // Skip external domains
    if (call.targetUrl) {
      try {
        const url = new URL(call.targetUrl);
        if (this.isExternalDomain(url.hostname)) return `External domain: ${url.hostname}`;
      } catch {
        // Not a valid URL, continue
      }
    }

    // Skip ignored paths
    if (call.targetUrl) {
      try {
        const url = new URL(call.targetUrl);
        if (DEFAULT_IGNORED_PATHS.has(url.pathname)) return `Ignored path: ${url.pathname}`;
      } catch {
        // path extraction failed
      }
    }

    return null;
  }

  // ─── Private: Matching Pipeline ────────────────────────────────

  private matchCall(call: DetectedCall, sourceRepo: string, indices: MatchIndices, hints: GraphHints): MatchSignal[] {
    const signals: MatchSignal[] = [];

    // Stage 2: Manual hints (short-circuit)
    const hintSignal = this.matchManualHints(call, hints);
    if (hintSignal) return [hintSignal];

    // Stage 3: Endpoint path match
    if (call.targetUrl && call.protocol === 'rest') {
      signals.push(...this.matchEndpointPath(call, sourceRepo, indices.endpointIndex));
    }

    // Stage 4: Package name match
    if (call.targetPackage && call.protocol === 'import') {
      signals.push(...this.matchPackageName(call, sourceRepo, indices.packageIndex));
    }

    // Stage 5: Event topic match
    if (call.protocol === 'event') {
      signals.push(...this.matchEventTopic(call, sourceRepo, indices.eventIndex));
    }

    // Stage 6: Service name token match
    if (call.targetUrl) {
      signals.push(...this.matchServiceNameToken(call, sourceRepo, indices.serviceTokenIndex));
    }

    return signals;
  }

  private matchManualHints(call: DetectedCall, hints: GraphHints): MatchSignal | null {
    const target = call.targetUrl || call.targetPackage || '';
    if (!target) return null;

    for (const mapping of hints.urlMappings) {
      if (this.globMatch(target, mapping.pattern)) {
        return {
          targetRepo: mapping.targetRepo,
          weight: 1.0,
          signalType: 'manual-hint',
          evidence: `Hint: ${mapping.pattern} → ${mapping.targetRepo}`,
        };
      }
    }

    // Check package mappings
    if (call.targetPackage && hints.packageMappings[call.targetPackage]) {
      return {
        targetRepo: hints.packageMappings[call.targetPackage],
        weight: 1.0,
        signalType: 'manual-hint',
        evidence: `Package hint: ${call.targetPackage} → ${hints.packageMappings[call.targetPackage]}`,
      };
    }

    return null;
  }

  private matchEndpointPath(call: DetectedCall, sourceRepo: string, endpointIndex: Map<string, EndpointIndexEntry[]>): MatchSignal[] {
    const signals: MatchSignal[] = [];
    if (!call.targetUrl) return signals;

    let urlPath: string;
    try {
      const url = new URL(call.targetUrl);
      urlPath = url.pathname;
    } catch {
      const pathMatch = call.targetUrl.match(/https?:\/\/[^/]+(\/[^\s'"]*)/);
      if (!pathMatch) return signals;
      urlPath = pathMatch[1];
    }

    const normalized = this.normalizePath(urlPath);
    if (!normalized || normalized === '/') return signals;

    const entries = endpointIndex.get(normalized);
    if (!entries) return signals;

    for (const entry of entries) {
      if (entry.repoName === sourceRepo) continue; // Self-reference

      // Try to extract method from evidence
      const method = this.extractMethodFromEvidence(call.evidence);

      if (method && entry.method && method === entry.method) {
        signals.push({
          targetRepo: entry.repoName,
          weight: 0.60,
          signalType: 'endpoint-path-method',
          evidence: `${method} ${urlPath} matches ${entry.repoName} contract`,
        });
      } else {
        signals.push({
          targetRepo: entry.repoName,
          weight: 0.45,
          signalType: 'endpoint-path-only',
          evidence: `Path ${urlPath} matches ${entry.repoName} contract`,
        });
      }
    }

    return signals;
  }

  private matchPackageName(call: DetectedCall, sourceRepo: string, packageIndex: Map<string, string>): MatchSignal[] {
    if (!call.targetPackage) return [];

    const targetRepo = packageIndex.get(call.targetPackage);
    if (!targetRepo || targetRepo === sourceRepo) return [];

    // Workspace dependencies declared in package.json are ground truth
    const isWorkspaceDep = call.evidence.includes('ground truth');
    if (isWorkspaceDep) {
      return [{
        targetRepo,
        weight: 0.85,
        signalType: 'workspace-dep',
        evidence: `Workspace dependency: ${call.targetPackage} → ${targetRepo}`,
      }];
    }

    return [{
      targetRepo,
      weight: 0.65,
      signalType: 'package-exact',
      evidence: `Package ${call.targetPackage} belongs to ${targetRepo}`,
    }];
  }

  private matchEventTopic(call: DetectedCall, sourceRepo: string, eventIndex: Map<string, string[]>): MatchSignal[] {
    const signals: MatchSignal[] = [];
    const topic = call.targetUrl || '';
    if (!topic) return signals;

    // Exact match
    const exactRepos = eventIndex.get(topic);
    if (exactRepos) {
      for (const repo of exactRepos) {
        if (repo === sourceRepo) continue;
        signals.push({
          targetRepo: repo,
          weight: 0.55,
          signalType: 'event-topic-exact',
          evidence: `Topic "${topic}" matches event schema in ${repo}`,
        });
      }
    }

    // Prefix match (split on dots, check if first N segments match)
    if (signals.length === 0) {
      const topicParts = topic.split('.');
      for (const [schemaTopics, repos] of eventIndex) {
        const schemaParts = schemaTopics.split('.');
        if (schemaParts.length >= 2 && topicParts.length >= schemaParts.length) {
          const matches = schemaParts.every((part, i) => topicParts[i] === part);
          if (matches) {
            for (const repo of repos) {
              if (repo === sourceRepo) continue;
              signals.push({
                targetRepo: repo,
                weight: 0.25,
                signalType: 'event-topic-prefix',
                evidence: `Topic "${topic}" prefix-matches "${schemaTopics}" in ${repo}`,
              });
            }
          }
        }
      }
    }

    return signals;
  }

  private matchServiceNameToken(call: DetectedCall, sourceRepo: string, serviceTokenIndex: Map<string, ServiceTokenEntry[]>): MatchSignal[] {
    if (!call.targetUrl) return [];

    const tokens = this.tokenizeHostname(call.targetUrl);
    const signals: MatchSignal[] = [];

    for (const token of tokens) {
      const entries = serviceTokenIndex.get(token);
      if (!entries) continue;

      for (const entry of entries) {
        if (entry.ambiguous) continue; // Skip ambiguous tokens
        if (entry.repoName === sourceRepo) continue;

        signals.push({
          targetRepo: entry.repoName,
          weight: 0.35,
          signalType: 'service-name-token',
          evidence: `Hostname token "${token}" matches service ${entry.repoName}`,
        });
      }
    }

    return signals;
  }

  // ─── Private: Score Fusion ─────────────────────────────────────

  private fuseAllSignals(
    allSignals: Array<{ sourceRepo: string; call: DetectedCall; signals: MatchSignal[] }>,
    scanResults: Map<string, any>
  ): ScoredEdge[] {
    // Group by (sourceRepo, targetRepo, protocol)
    const edgeMap = new Map<string, { sourceRepo: string; targetRepo: string; protocol: ConnectionProtocol; signals: MatchSignal[]; callCount: number }>();

    for (const { sourceRepo, call, signals } of allSignals) {
      for (const signal of signals) {
        const key = `${sourceRepo}|${signal.targetRepo}|${call.protocol}`;
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { sourceRepo, targetRepo: signal.targetRepo, protocol: call.protocol, signals: [], callCount: 0 });
        }
        const entry = edgeMap.get(key)!;
        entry.signals.push(signal);
        entry.callCount++;
      }
    }

    const edges: ScoredEdge[] = [];

    for (const [, entry] of edgeMap) {
      // Sum weights per target (deduplicating by signal type)
      const bestByType = new Map<SignalType, MatchSignal>();
      for (const signal of entry.signals) {
        const existing = bestByType.get(signal.signalType);
        if (!existing || signal.weight > existing.weight) {
          bestByType.set(signal.signalType, signal);
        }
      }

      const dedupedSignals = Array.from(bestByType.values());
      let totalWeight = dedupedSignals.reduce((sum, s) => sum + s.weight, 0);
      const anchorWeight = Math.max(...dedupedSignals.map((s) => s.weight));

      // Cardinality bonus: +0.10 if 3+ distinct calls
      if (entry.callCount >= 3) {
        totalWeight += 0.10;
        dedupedSignals.push({
          targetRepo: entry.targetRepo,
          weight: 0.10,
          signalType: 'cardinality-bonus',
          evidence: `${entry.callCount} distinct calls from ${entry.sourceRepo} to ${entry.targetRepo}`,
        });
      }

      // Apply penalties
      const penalty = this.computePenalties(entry.signals);
      totalWeight -= penalty;

      const confidence = Math.max(0, Math.min(1.0, totalWeight));

      edges.push({
        sourceRepo: entry.sourceRepo,
        targetRepo: entry.targetRepo,
        protocol: entry.protocol,
        confidence,
        anchorWeight,
        signals: dedupedSignals,
        ambiguous: false,
      });
    }

    return edges;
  }

  private applyAmbiguityCheck(edges: ScoredEdge[]): ScoredEdge[] {
    // Ambiguity only applies when edges share the SAME evidence source
    // (i.e., a single call resolved to multiple targets). Distinct calls to
    // distinct targets are NOT ambiguous — they're just multiple dependencies.
    // We detect ambiguity by checking if any signal's evidence text appears
    // in multiple edges targeting different repos.
    const evidenceToTargets = new Map<string, Set<string>>();
    for (const edge of edges) {
      for (const signal of edge.signals) {
        if (!evidenceToTargets.has(signal.evidence)) evidenceToTargets.set(signal.evidence, new Set());
        evidenceToTargets.get(signal.evidence)!.add(edge.targetRepo);
      }
    }

    // Mark edges as ambiguous only if they share evidence that points to 2+ targets
    for (const edge of edges) {
      for (const signal of edge.signals) {
        const targets = evidenceToTargets.get(signal.evidence);
        if (targets && targets.size > 1) {
          edge.ambiguous = true;
          break;
        }
      }
    }

    return edges;
  }

  private computePenalties(signals: MatchSignal[]): number {
    let penalty = 0;
    for (const signal of signals) {
      if (signal.evidence.includes('localhost') || signal.evidence.includes('127.0.0.1')) {
        penalty += 0.10;
        break;
      }
    }
    return penalty;
  }

  // ─── Private: Persistence ──────────────────────────────────────

  private persistEdges(autoLinked: ScoredEdge[], runEpoch: number): void {
    // Only remove previous auto-linker edges — never touch manual or confirmed
    this.graphStore.clearAutoLinkerConnections();

    for (const edge of autoLinked) {
      const sourceServices = this.graphStore.getServicesByRepo(edge.sourceRepo);
      const targetServices = this.graphStore.getServicesByRepo(edge.targetRepo);

      if (sourceServices.length === 0 || targetServices.length === 0) continue;

      this.graphStore.addConnection({
        sourceService: sourceServices[0].id,
        targetService: targetServices[0].id,
        protocol: edge.protocol,
        dataFlow: this.protocolToDataFlow(edge.protocol),
        description: `Auto-linked (confidence: ${edge.confidence.toFixed(2)}, signals: ${edge.signals.map((s) => s.signalType).join(', ')})`,
        lastVerified: new Date().toISOString(),
      }, 'auto-linker');
    }

    // Export service map as JSON for adapters that cannot use SQLite directly
    this.writeServiceMapJson();
  }

  /**
   * Write the service map as a JSON file to .eos/graph/service-map.json.
   * This allows adapters (e.g., Cursor) to read the graph without depending on better-sqlite3.
   */
  private writeServiceMapJson(): void {
    try {
      const json = this.graphStore.exportServiceMapJson();
      const graphDir = path.join(this.eosDir, 'graph');
      if (!fs.existsSync(graphDir)) {
        fs.mkdirSync(graphDir, { recursive: true });
      }
      const outputPath = path.join(graphDir, 'service-map.json');
      fs.writeFileSync(outputPath, JSON.stringify(json, null, 2), 'utf-8');
    } catch {
      // Non-fatal: if export fails, adapters will just not have the service map
    }
  }

  // ─── Private: Hints Loading ────────────────────────────────────

  private loadHints(): GraphHints {
    const defaultHints: GraphHints = {
      urlMappings: [],
      aliases: {},
      packageMappings: {},
      pinned: [],
      excluded: [],
      externalDomains: [],
      genericTokens: [],
      ignoredPaths: [],
    };

    const hintsPath = this.options?.hintsPath || path.join(this.eosDir, 'graph-hints.yaml');
    try {
      const content = fs.readFileSync(hintsPath, 'utf-8');
      const loaded = safeYamlLoad<any>(content);
      if (!loaded) return defaultHints;

      return {
        urlMappings: loaded.urlMappings || [],
        aliases: loaded.aliases || {},
        packageMappings: loaded.packageMappings || {},
        pinned: loaded.pinned || [],
        excluded: loaded.excluded || [],
        externalDomains: loaded.externalDomains || [],
        genericTokens: loaded.genericTokens || [],
        ignoredPaths: loaded.ignoredPaths || [],
      };
    } catch {
      return defaultHints;
    }
  }

  // ─── Private: Utilities ────────────────────────────────────────

  private normalizePath(urlPath: string): string {
    // Strip version prefix
    let stripped = urlPath.replace(VERSION_PREFIX_REGEX, '');
    // Strip trailing slash
    stripped = stripped.replace(/\/+$/, '') || '/';

    // Collapse parameter-like segments
    const segments = stripped.split('/');
    const normalized = segments.map((seg) => {
      if (!seg) return '';
      if (this.isLikelyParam(seg)) return ':param';
      return seg.toLowerCase();
    });

    return normalized.join('/');
  }

  private isLikelyParam(segment: string): boolean {
    return UUID_REGEX.test(segment) || NUMERIC_REGEX.test(segment) || LONG_ALPHANUM_REGEX.test(segment);
  }

  private tokenizeHostname(url: string): string[] {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      const match = url.match(/https?:\/\/([^:/]+)/);
      if (!match) return [];
      hostname = match[1];
    }

    // Take first DNS segment (before first dot)
    const firstSegment = hostname.split('.')[0];
    // Tokenize on hyphens and underscores
    const tokens = firstSegment.split(/[-_]+/);
    // Remove generic tokens
    return tokens.filter((t) => t.length > 1 && !DEFAULT_GENERIC_TOKENS.has(t.toLowerCase()));
  }

  private tokenizeServiceName(name: string): string[] {
    const tokens = name.toLowerCase().split(/[-_./]+/);
    return tokens.filter((t) => t.length > 1 && !DEFAULT_GENERIC_TOKENS.has(t));
  }

  private isExternalDomain(hostname: string): boolean {
    const lower = hostname.toLowerCase();
    return this.externalDomains.some((d) => lower === d || lower.endsWith('.' + d));
  }

  private isTestFile(filePath: string): boolean {
    return TEST_FILE_PATTERNS.some((p) => p.test(filePath));
  }

  private extractMethodFromEvidence(evidence: string): string | null {
    const match = evidence.match(/\.(get|post|put|patch|delete)\s*\(/i);
    if (match) return match[1].toUpperCase();
    return null;
  }

  private globMatch(text: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
    );
    return regex.test(text);
  }

  private protocolToDataFlow(protocol: ConnectionProtocol): DataFlowType {
    switch (protocol) {
      case 'rest': case 'grpc': case 'graphql': return 'request';
      case 'event': return 'publish';
      case 'import': return 'import';
      case 'database': return 'query';
      default: return 'request';
    }
  }
}
