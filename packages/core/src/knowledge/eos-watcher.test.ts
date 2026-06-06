import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EosWatcher, EosWatcherDeps } from './eos-watcher';
import { MetadataStore } from './metadata-store';
import { GraphStore } from '../architecture/graph-store';

describe('EosWatcher', () => {
  let tmpDir: string;
  let rootPath: string;
  let eosDir: string;
  let metadataStore: MetadataStore;
  let graphStore: GraphStore;
  let mockIndexer: any;
  let mockRepoRegistry: any;
  let watcher: EosWatcher;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-watcher-test-'));
    rootPath = path.join(tmpDir, 'project');
    eosDir = path.join(tmpDir, '.eos');
    fs.mkdirSync(rootPath, { recursive: true });
    fs.mkdirSync(eosDir, { recursive: true });

    metadataStore = new MetadataStore(path.join(eosDir, 'metadata.db'));
    metadataStore.initialize();

    graphStore = new GraphStore(path.join(eosDir, 'graph.db'));
    graphStore.initialize();

    mockIndexer = {
      indexFile: vi.fn().mockResolvedValue({
        filePath: '',
        language: 'typescript',
        lastModified: new Date().toISOString(),
        chunks: [],
        imports: [],
        exports: [],
      }),
    };

    mockRepoRegistry = {
      getLinkedRepos: vi.fn().mockResolvedValue([]),
      validateLinks: vi.fn().mockResolvedValue({ valid: [], broken: [] }),
    };

    const deps: EosWatcherDeps = {
      rootPath,
      eosDir,
      indexer: mockIndexer,
      metadataStore,
      graphStore,
      repoRegistry: mockRepoRegistry,
    };

    watcher = new EosWatcher(deps);
  });

  afterEach(() => {
    watcher.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('classifyChange', () => {
    it('should classify controller files as route', () => {
      const classify = (watcher as any).classifyChange.bind(watcher);
      expect(classify('src/auth.controller.ts')).toBe('route');
    });

    it('should classify package.json as package', () => {
      const classify = (watcher as any).classifyChange.bind(watcher);
      expect(classify('package.json')).toBe('package');
    });

    it('should classify openapi.yaml as contract', () => {
      const classify = (watcher as any).classifyChange.bind(watcher);
      expect(classify('openapi.yaml')).toBe('contract');
    });

    it('should classify docker-compose.yaml as infra', () => {
      const classify = (watcher as any).classifyChange.bind(watcher);
      expect(classify('docker-compose.yaml')).toBe('infra');
    });

    it('should classify eos.workspace.yaml as workspace', () => {
      const classify = (watcher as any).classifyChange.bind(watcher);
      expect(classify('eos.workspace.yaml')).toBe('workspace');
    });

    it('should classify regular source files as source', () => {
      const classify = (watcher as any).classifyChange.bind(watcher);
      expect(classify('src/utils.ts')).toBe('source');
    });
  });

  describe('refreshIncremental', () => {
    it('should re-index source files via the indexer', async () => {
      const filePath = path.join(rootPath, 'src', 'utils.ts');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'export function helper() {}');

      mockIndexer.indexFile.mockResolvedValue({
        filePath,
        language: 'typescript',
        lastModified: new Date().toISOString(),
        chunks: [],
        imports: [],
        exports: ['helper'],
      });

      const summary = await watcher.refreshIncremental([filePath]);

      expect(summary.filesReindexed).toBe(1);
      expect(mockIndexer.indexFile).toHaveBeenCalledWith(filePath);
    });

    it('should trigger graph relink when package.json changes', async () => {
      const pkgPath = path.join(rootPath, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({ name: 'test', dependencies: {} }));

      const summary = await watcher.refreshIncremental([pkgPath]);

      expect(summary.graphRelinked).toBe(true);
      expect(mockRepoRegistry.getLinkedRepos).toHaveBeenCalled();
    });
  });
});
