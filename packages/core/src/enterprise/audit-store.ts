import type Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { openDatabase } from '../utils/database';

export interface AuditEntry {
  id: number;
  timestamp: string;
  tool: string;
  user: string;
  args: Record<string, unknown>;
  resultSummary: string;
  duration: number;
  success: boolean;
}

export interface AuditQueryOptions {
  tool?: string;
  user?: string;
  since?: string;
  until?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

export class AuditStore {
  private db: Database.Database | null = null;

  constructor(private dbPath: string) {}

  initialize(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = openDatabase(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        tool TEXT NOT NULL,
        user TEXT NOT NULL,
        args TEXT NOT NULL,
        resultSummary TEXT NOT NULL,
        duration INTEGER NOT NULL,
        success INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_log(tool);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user);
    `);
  }

  record(entry: Omit<AuditEntry, 'id'>): void {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO audit_log (timestamp, tool, user, args, resultSummary, duration, success)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.timestamp,
      entry.tool,
      entry.user,
      JSON.stringify(entry.args),
      entry.resultSummary.slice(0, 2000),
      entry.duration,
      entry.success ? 1 : 0
    );
  }

  query(options: AuditQueryOptions = {}): AuditEntry[] {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.tool) {
      conditions.push('tool = ?');
      params.push(options.tool);
    }
    if (options.user) {
      conditions.push('user = ?');
      params.push(options.user);
    }
    if (options.since) {
      conditions.push('timestamp >= ?');
      params.push(options.since);
    }
    if (options.until) {
      conditions.push('timestamp <= ?');
      params.push(options.until);
    }
    if (options.success !== undefined) {
      conditions.push('success = ?');
      params.push(options.success ? 1 : 0);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const sql = `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      tool: r.tool,
      user: r.user,
      args: JSON.parse(r.args),
      resultSummary: r.resultSummary,
      duration: r.duration,
      success: r.success === 1,
    }));
  }

  getStats(): { totalEntries: number; uniqueTools: number; uniqueUsers: number } {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT
        COUNT(*) as totalEntries,
        COUNT(DISTINCT tool) as uniqueTools,
        COUNT(DISTINCT user) as uniqueUsers
      FROM audit_log
    `).get() as any;
    return {
      totalEntries: row.totalEntries,
      uniqueTools: row.uniqueTools,
      uniqueUsers: row.uniqueUsers,
    };
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('AuditStore not initialized. Call initialize() first.');
    }
    return this.db;
  }
}
