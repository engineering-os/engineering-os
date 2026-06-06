import type Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { IndexedFile, SearchResult } from '@engineering-os/shared';
import { openDatabase } from '../utils/database';

interface FtsRow {
  id: string;
  filePath: string;
  name: string;
  type: string;
  content: string;
  score?: number;
}

export class MetadataStore {
  private db: Database.Database | null = null;

  constructor(private dbPath: string) {}

  initialize(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = openDatabase(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        lastModified TEXT NOT NULL,
        chunkCount INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        filePath TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        startLine INTEGER NOT NULL,
        endLine INTEGER NOT NULL,
        FOREIGN KEY (filePath) REFERENCES files(path) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS relationships (
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'import',
        PRIMARY KEY (source, target, type)
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_filepath ON chunks(filePath);
      CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source);
      CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target);

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        id,
        filePath,
        name,
        type,
        content,
        tokenize='porter unicode61'
      );
    `);
  }

  upsertFile(file: IndexedFile): void {
    const db = this.getDb();

    const upsertFileStmt = db.prepare(`
      INSERT INTO files (path, language, lastModified, chunkCount)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        language = excluded.language,
        lastModified = excluded.lastModified,
        chunkCount = excluded.chunkCount
    `);

    const deleteChunksStmt = db.prepare('DELETE FROM chunks WHERE filePath = ?');
    const deleteFtsStmt = db.prepare('DELETE FROM chunks_fts WHERE filePath = ?');

    const insertChunkStmt = db.prepare(`
      INSERT OR REPLACE INTO chunks (id, filePath, name, type, startLine, endLine)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertFtsStmt = db.prepare(`
      INSERT INTO chunks_fts (id, filePath, name, type, content)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      upsertFileStmt.run(
        file.filePath,
        file.language,
        file.lastModified,
        file.chunks.length
      );

      deleteChunksStmt.run(file.filePath);
      deleteFtsStmt.run(file.filePath);

      for (const chunk of file.chunks) {
        const id = `${chunk.filePath}:${chunk.startLine}:${chunk.endLine}`;
        insertChunkStmt.run(id, chunk.filePath, chunk.name, chunk.type, chunk.startLine, chunk.endLine);
        insertFtsStmt.run(id, chunk.filePath, chunk.name, chunk.type, chunk.content || '');
      }
    });

    transaction();
  }

  deleteFile(filePath: string): void {
    const db = this.getDb();
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM chunks_fts WHERE filePath = ?').run(filePath);
      db.prepare('DELETE FROM chunks WHERE filePath = ?').run(filePath);
      db.prepare('DELETE FROM relationships WHERE source = ?').run(filePath);
      db.prepare('DELETE FROM files WHERE path = ?').run(filePath);
    });
    transaction();
  }

  getFileTimestamp(filePath: string): string | null {
    const db = this.getDb();
    const row = db.prepare('SELECT lastModified FROM files WHERE path = ?').get(filePath) as { lastModified: string } | undefined;
    return row?.lastModified ?? null;
  }

  storeRelationships(filePath: string, imports: string[], exports: string[]): void {
    const db = this.getDb();

    const deleteStmt = db.prepare('DELETE FROM relationships WHERE source = ?');
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO relationships (source, target, type)
      VALUES (?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      deleteStmt.run(filePath);

      for (const imp of imports) {
        insertStmt.run(filePath, imp, 'import');
      }

      for (const exp of exports) {
        insertStmt.run(filePath, exp, 'export');
      }
    });

    transaction();
  }

  findDependents(modulePath: string): string[] {
    const db = this.getDb();
    const stmt = db.prepare(
      'SELECT DISTINCT source FROM relationships WHERE target = ? AND type = ?'
    );
    const rows = stmt.all(modulePath, 'import') as { source: string }[];
    return rows.map((r) => r.source);
  }

  findDependencies(filePath: string): string[] {
    const db = this.getDb();
    const stmt = db.prepare(
      'SELECT DISTINCT target FROM relationships WHERE source = ? AND type = ?'
    );
    const rows = stmt.all(filePath, 'import') as { target: string }[];
    return rows.map((r) => r.target);
  }

  getIndexedFiles(): { filePath: string; language: string; lastModified: string; chunkCount: number }[] {
    const db = this.getDb();
    const stmt = db.prepare('SELECT path as filePath, language, lastModified, chunkCount FROM files');
    return stmt.all() as { filePath: string; language: string; lastModified: string; chunkCount: number }[];
  }

  search(query: string, options?: { limit?: number; scope?: string }): SearchResult[] {
    const db = this.getDb();
    const limit = options?.limit ?? 20;

    let sql = `
      SELECT id, filePath, name, type, content,
             bm25(chunks_fts) as score
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
    `;

    if (options?.scope === 'code') {
      sql += ` AND type IN ('function', 'method', 'class')`;
    }

    sql += ` ORDER BY bm25(chunks_fts) LIMIT ?`;

    try {
      const ftsQuery = query.split(/\s+/).map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
      const rows = db.prepare(sql).all(ftsQuery, limit) as FtsRow[];
      return rows.map((row) => ({
        chunk: {
          filePath: row.filePath,
          startLine: 0,
          endLine: 0,
          content: row.content,
          language: '',
          type: row.type as any,
          name: row.name,
        },
        score: Math.abs(row.score ?? 0),
        metadata: { id: row.id },
      }));
    } catch {
      const rows = db.prepare(
        `SELECT id, filePath, name, type, content FROM chunks_fts WHERE name LIKE ? OR content LIKE ? LIMIT ?`
      ).all(`%${query}%`, `%${query}%`, limit) as FtsRow[];
      return rows.map((row) => ({
        chunk: {
          filePath: row.filePath,
          startLine: 0,
          endLine: 0,
          content: row.content,
          language: '',
          type: row.type as any,
          name: row.name,
        },
        score: 1,
        metadata: { id: row.id },
      }));
    }
  }

  getChunksByFile(filePath: string): { name: string; type: string; startLine: number; endLine: number }[] {
    const db = this.getDb();
    const stmt = db.prepare('SELECT name, type, startLine, endLine FROM chunks WHERE filePath = ?');
    return stmt.all(filePath) as { name: string; type: string; startLine: number; endLine: number }[];
  }

  getStats(): { totalFiles: number; totalChunks: number; totalRelationships: number } {
    const db = this.getDb();

    const filesCount = db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    const chunksCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };
    const relsCount = db.prepare('SELECT COUNT(*) as count FROM relationships').get() as { count: number };

    return {
      totalFiles: filesCount.count,
      totalChunks: chunksCount.count,
      totalRelationships: relsCount.count,
    };
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('MetadataStore not initialized. Call initialize() first.');
    }
    return this.db;
  }
}
