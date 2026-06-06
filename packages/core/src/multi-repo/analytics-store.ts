import type Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { openDatabase } from '../utils/database';

export interface AnalyticsEvent {
  timestamp: string;
  tool: string;
  duration: number;
  success: boolean;
  repoName?: string;
  metadata?: Record<string, unknown>;
  tokensEmitted?: number;
  stage?: string;
  featureSlug?: string;
}

export interface ToolUsageStats {
  tool: string;
  totalCalls: number;
  avgDuration: number;
  successRate: number;
  lastUsed: string;
}

export interface DailyStats {
  date: string;
  totalCalls: number;
  avgDuration: number;
  uniqueTools: number;
}

export class AnalyticsStore {
  private db: Database.Database | null = null;

  constructor(private dbPath: string) {}

  initialize(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = openDatabase(this.dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        tool TEXT NOT NULL,
        duration INTEGER NOT NULL,
        success INTEGER NOT NULL,
        repoName TEXT,
        metadata TEXT,
        tokensEmitted INTEGER DEFAULT 0,
        stage TEXT,
        featureSlug TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_tool ON events(tool);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_feature ON events(featureSlug);
    `);
  }

  record(event: AnalyticsEvent): void {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO events (timestamp, tool, duration, success, repoName, metadata, tokensEmitted, stage, featureSlug)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.timestamp,
      event.tool,
      event.duration,
      event.success ? 1 : 0,
      event.repoName ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.tokensEmitted ?? 0,
      event.stage ?? null,
      event.featureSlug ?? null
    );
  }

  getBudgetUsage(featureSlug: string): { total: number; byStage: Record<string, number> } {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT stage, SUM(tokensEmitted) as total
      FROM events
      WHERE featureSlug = ? AND stage IS NOT NULL
      GROUP BY stage
    `).all(featureSlug) as { stage: string; total: number }[];

    const byStage: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byStage[row.stage] = row.total;
      total += row.total;
    }
    return { total, byStage };
  }

  getToolStats(since?: string): ToolUsageStats[] {
    const db = this.getDb();
    let sql = `
      SELECT
        tool,
        COUNT(*) as totalCalls,
        AVG(duration) as avgDuration,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as successRate,
        MAX(timestamp) as lastUsed
      FROM events
    `;
    if (since) {
      sql += ` WHERE timestamp >= ?`;
    }
    sql += ` GROUP BY tool ORDER BY totalCalls DESC`;

    const rows = since
      ? db.prepare(sql).all(since)
      : db.prepare(sql).all();

    return (rows as any[]).map((r) => ({
      tool: r.tool,
      totalCalls: r.totalCalls,
      avgDuration: Math.round(r.avgDuration),
      successRate: Math.round(r.successRate * 10) / 10,
      lastUsed: r.lastUsed,
    }));
  }

  getDailyStats(days: number = 30): DailyStats[] {
    const db = this.getDb();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare(`
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as totalCalls,
        AVG(duration) as avgDuration,
        COUNT(DISTINCT tool) as uniqueTools
      FROM events
      WHERE timestamp >= ?
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `).all(since);

    return (rows as any[]).map((r) => ({
      date: r.date,
      totalCalls: r.totalCalls,
      avgDuration: Math.round(r.avgDuration),
      uniqueTools: r.uniqueTools,
    }));
  }

  getTotalEvents(): number {
    const db = this.getDb();
    const row = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
    return row.count;
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('AnalyticsStore not initialized. Call initialize() first.');
    }
    return this.db;
  }
}
