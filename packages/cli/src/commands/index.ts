import { Command } from 'commander';
import * as path from 'path';
import { RepositoryIndexer, MetadataStore, DriftDetector, IndexWatcher } from '@engineering-os/core';

const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CHECK = `${GREEN}✓${RESET}`;

export const indexCommand = new Command('index')
  .description('Index or re-index the repository')
  .option('--watch', 'Continuously watch for file changes and re-index')
  .option('--force', 'Force full re-index (ignore timestamps)')
  .option('--paths <paths...>', 'Specific paths to index')
  .action(async (options) => {
    const rootPath = process.cwd();
    const eosDir = path.join(rootPath, '.eos');
    const metadataDbPath = path.join(eosDir, 'index', 'metadata.db');

    const indexer = new RepositoryIndexer(rootPath);
    const metadataStore = new MetadataStore(metadataDbPath);
    metadataStore.initialize();

    if (options.paths) {
      // Index specific paths
      console.log(`${DIM}Indexing specified paths...${RESET}`);
      const files = await indexer.indexAll({ paths: options.paths, force: true });
      let chunks = 0;
      for (const file of files) {
        metadataStore.upsertFile(file);
        metadataStore.storeRelationships(file.filePath, file.imports, file.exports);
        chunks += file.chunks.length;
      }
      console.log(`${CHECK} Indexed ${files.length} files (${chunks} chunks)`);
      return;
    }

    if (options.force) {
      // Full re-index
      console.log(`${DIM}Full re-index...${RESET}`);
      const files = await indexer.indexAll({ force: true });
      let chunks = 0;
      for (const file of files) {
        metadataStore.upsertFile(file);
        metadataStore.storeRelationships(file.filePath, file.imports, file.exports);
        chunks += file.chunks.length;
      }
      console.log(`${CHECK} Indexed ${files.length} files (${chunks} chunks)`);
    } else {
      // Incremental index (drift detection)
      console.log(`${DIM}Detecting changes...${RESET}`);
      const detector = new DriftDetector(rootPath, metadataStore, indexer);
      const drift = await detector.detectChanges();

      const toIndex = [...drift.added, ...drift.modified];
      if (toIndex.length === 0 && drift.deleted.length === 0) {
        console.log(`${CHECK} Index is up to date (${drift.unchanged} files unchanged)`);
      } else {
        if (toIndex.length > 0) {
          const files = await indexer.indexAll({ paths: toIndex, force: true });
          let chunks = 0;
          for (const file of files) {
            metadataStore.upsertFile(file);
            metadataStore.storeRelationships(file.filePath, file.imports, file.exports);
            chunks += file.chunks.length;
          }
          console.log(`${CHECK} Indexed ${files.length} files (${drift.added.length} new, ${drift.modified.length} modified)`);
        }

        for (const deleted of drift.deleted) {
          metadataStore.deleteFile(deleted);
        }
        if (drift.deleted.length > 0) {
          console.log(`${CHECK} Removed ${drift.deleted.length} deleted files from index`);
        }
      }
    }

    if (options.watch) {
      console.log(`\n${CYAN}${BOLD}Watching for changes...${RESET} ${DIM}(Ctrl+C to stop)${RESET}\n`);

      const watcher = new IndexWatcher(rootPath, indexer, metadataStore, (count) => {
        console.log(`${CHECK} Re-indexed ${count} file(s)`);
      });

      watcher.start();

      process.on('SIGINT', () => {
        watcher.stop();
        console.log(`\n${DIM}Stopped watching.${RESET}`);
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    }
  });
