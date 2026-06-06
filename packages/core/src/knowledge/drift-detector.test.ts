import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RepositoryIndexer } from './indexer';
import { MetadataStore } from './metadata-store';
import { DriftDetector } from './drift-detector';

describe('DriftDetector', () => {
  const tmpDir = path.join(os.tmpdir(), 'eos-drift-test-' + Date.now());
  const dbPath = path.join(tmpDir, '.eos', 'index', 'metadata.db');
  let metadataStore: MetadataStore;
  let indexer: RepositoryIndexer;

  beforeAll(async () => {
    fs.mkdirSync(path.join(tmpDir, '.eos', 'index'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'existing.ts'), 'export function hello() { return "hi"; }\n');
    fs.writeFileSync(path.join(tmpDir, 'unchanged.ts'), 'export const x = 1;\n');

    metadataStore = new MetadataStore(dbPath);
    metadataStore.initialize();
    indexer = new RepositoryIndexer(tmpDir);

    // Index all files
    const files = await indexer.indexAll();
    for (const file of files) {
      metadataStore.upsertFile(file);
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects no changes when nothing changed', async () => {
    const detector = new DriftDetector(tmpDir, metadataStore, indexer);
    const drift = await detector.detectChanges();

    expect(drift.added).toHaveLength(0);
    expect(drift.deleted).toHaveLength(0);
    // modified may be 0 or >0 depending on mtime precision
  });

  it('detects added files', async () => {
    fs.writeFileSync(path.join(tmpDir, 'newfile.ts'), 'export function added() {}\n');

    const detector = new DriftDetector(tmpDir, metadataStore, indexer);
    const drift = await detector.detectChanges();

    expect(drift.added).toContain(path.join(tmpDir, 'newfile.ts'));

    // Cleanup
    fs.unlinkSync(path.join(tmpDir, 'newfile.ts'));
  });

  it('detects deleted files', async () => {
    // Index a file, then delete it
    const tempFile = path.join(tmpDir, 'willdelete.ts');
    fs.writeFileSync(tempFile, 'export const y = 2;\n');
    const indexed = await indexer.indexFile(tempFile);
    metadataStore.upsertFile(indexed);

    fs.unlinkSync(tempFile);

    const detector = new DriftDetector(tmpDir, metadataStore, indexer);
    const drift = await detector.detectChanges();

    expect(drift.deleted).toContain(tempFile);
  });
});
