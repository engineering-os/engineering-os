import * as fs from 'fs';
import * as path from 'path';
import { RepositoryIndexer } from './indexer';
import { MetadataStore } from './metadata-store';
import { getSupportedExtensions } from './lang';

export class IndexWatcher {
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFiles = new Set<string>();
  private readonly DEBOUNCE_MS = 1000;
  private supportedExtensions: Set<string>;

  constructor(
    private rootPath: string,
    private indexer: RepositoryIndexer,
    private metadataStore: MetadataStore,
    private onReindex?: (count: number) => void
  ) {
    this.supportedExtensions = new Set(getSupportedExtensions());
  }

  start(): void {
    try {
      this.watcher = fs.watch(this.rootPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const ext = path.extname(filename).toLowerCase();
        if (!this.supportedExtensions.has(ext)) return;

        // Skip non-source directories
        if (filename.includes('node_modules') || filename.includes('.git') ||
            filename.includes('dist') || filename.includes('.eos')) return;

        const fullPath = path.join(this.rootPath, filename);
        this.pendingFiles.add(fullPath);
        this.scheduleReindex();
      });

      this.watcher.on('error', (err) => {
        console.error(`[eos-watch] Watcher error: ${err.message}`);
      });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`Directory not found: ${this.rootPath}. Run "eos init" first.`);
      }
      throw err;
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
    this.pendingFiles.clear();
  }

  private scheduleReindex(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      const files = Array.from(this.pendingFiles);
      this.pendingFiles.clear();

      let reindexed = 0;
      for (const filePath of files) {
        try {
          if (fs.existsSync(filePath)) {
            const indexed = await this.indexer.indexFile(filePath);
            this.metadataStore.upsertFile(indexed);
            this.metadataStore.storeRelationships(indexed.filePath, indexed.imports, indexed.exports);
            reindexed++;
          } else {
            this.metadataStore.deleteFile(filePath);
            reindexed++;
          }
        } catch {
          // Skip files that fail to index
        }
      }

      if (reindexed > 0 && this.onReindex) {
        this.onReindex(reindexed);
      }
    }, this.DEBOUNCE_MS);
  }
}
