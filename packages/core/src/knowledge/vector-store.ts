import type Database from 'better-sqlite3';

export class VectorStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_embeddings (
        id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL
      );
    `);
  }

  storeEmbedding(id: string, embedding: number[]): void {
    const buffer = Buffer.from(new Float32Array(embedding).buffer);
    this.db.prepare(
      'INSERT OR REPLACE INTO chunk_embeddings (id, embedding) VALUES (?, ?)'
    ).run(id, buffer);
  }

  storeEmbeddings(entries: { id: string; embedding: number[] }[]): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO chunk_embeddings (id, embedding) VALUES (?, ?)'
    );
    const transaction = this.db.transaction(() => {
      for (const entry of entries) {
        const buffer = Buffer.from(new Float32Array(entry.embedding).buffer);
        stmt.run(entry.id, buffer);
      }
    });
    transaction();
  }

  getEmbedding(id: string): number[] | null {
    const row = this.db.prepare('SELECT embedding FROM chunk_embeddings WHERE id = ?').get(id) as { embedding: Buffer } | undefined;
    if (!row) return null;
    return Array.from(new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4));
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  rerankBySimilarity(ids: string[], queryEmbedding: number[], topK: number = 20): { id: string; score: number }[] {
    const scored: { id: string; score: number }[] = [];

    for (const id of ids) {
      const embedding = this.getEmbedding(id);
      if (embedding) {
        scored.push({ id, score: this.cosineSimilarity(queryEmbedding, embedding) });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  deleteByFile(filePath: string): void {
    this.db.prepare("DELETE FROM chunk_embeddings WHERE id LIKE ?").run(`${filePath}:%`);
  }

  getCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM chunk_embeddings').get() as { count: number };
    return row.count;
  }
}
