import * as fs from 'fs/promises';
import { MetadataStore } from './metadata-store';
import { RepositoryIndexer } from './indexer';

export interface DriftReport {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: number;
}

export class DriftDetector {
  constructor(
    private rootPath: string,
    private metadataStore: MetadataStore,
    private indexer: RepositoryIndexer
  ) {}

  async detectChanges(): Promise<DriftReport> {
    const indexedFiles = this.metadataStore.getIndexedFiles();
    const indexedMap = new Map(indexedFiles.map((f) => [f.filePath, f.lastModified]));

    const currentFiles = await this.indexer.walkDirectory(this.rootPath);
    const currentSet = new Set(currentFiles);

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    let unchanged = 0;

    // Find added and modified
    for (const filePath of currentFiles) {
      const storedTime = indexedMap.get(filePath);
      if (!storedTime) {
        added.push(filePath);
      } else {
        try {
          const stat = await fs.stat(filePath);
          const currentMtime = stat.mtime.toISOString();
          if (currentMtime !== storedTime) {
            modified.push(filePath);
          } else {
            unchanged++;
          }
        } catch {
          // File not accessible, skip
          unchanged++;
        }
      }
    }

    // Find deleted
    for (const [filePath] of indexedMap) {
      if (!currentSet.has(filePath)) {
        deleted.push(filePath);
      }
    }

    return { added, modified, deleted, unchanged };
  }
}
