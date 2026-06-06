import type Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { openDatabase } from '../utils/database';
import { SecurityScanResult, DependencyVulnerability, Severity } from '@engineering-os/shared';

export interface PostureScore {
  score: number;
  timestamp: string;
  breakdown: {
    scanDeductions: number;
    depDeductions: number;
    conventionBonus: number;
    details: PostureDetail[];
  };
}

export interface PostureDetail {
  source: 'scan' | 'dependency' | 'convention';
  severity: Severity;
  count: number;
  deduction: number;
}

export interface PostureTrend {
  current: PostureScore;
  history: { date: string; score: number }[];
  trend: 'improving' | 'declining' | 'stable';
}

const SCAN_WEIGHTS: Record<Severity, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
  info: 0,
};

const DEP_WEIGHTS: Record<Severity, number> = {
  critical: 15,
  high: 8,
  medium: 3,
  low: 1,
  info: 0,
};

export class PostureScorer {
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
      CREATE TABLE IF NOT EXISTS posture_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        score INTEGER NOT NULL,
        scanDeductions INTEGER NOT NULL,
        depDeductions INTEGER NOT NULL,
        conventionBonus INTEGER NOT NULL,
        details TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_posture_timestamp ON posture_scores(timestamp);
    `);
  }

  compute(
    scanResult: SecurityScanResult,
    depVulns: DependencyVulnerability[],
    conventionCompliancePercent: number
  ): PostureScore {
    const details: PostureDetail[] = [];
    let scanDeductions = 0;
    let depDeductions = 0;

    // Compute scan deductions
    for (const severity of Object.keys(SCAN_WEIGHTS) as Severity[]) {
      const count = scanResult.summary[severity] || 0;
      if (count > 0) {
        const deduction = count * SCAN_WEIGHTS[severity];
        scanDeductions += deduction;
        details.push({ source: 'scan', severity, count, deduction });
      }
    }

    // Compute dependency deductions
    const depBySeverity: Record<string, number> = {};
    for (const vuln of depVulns) {
      depBySeverity[vuln.severity] = (depBySeverity[vuln.severity] || 0) + 1;
    }
    for (const severity of Object.keys(DEP_WEIGHTS) as Severity[]) {
      const count = depBySeverity[severity] || 0;
      if (count > 0) {
        const deduction = count * DEP_WEIGHTS[severity];
        depDeductions += deduction;
        details.push({ source: 'dependency', severity, count, deduction });
      }
    }

    // Convention compliance bonus
    const conventionBonus = conventionCompliancePercent >= 80 ? 10 : 0;
    if (conventionBonus > 0) {
      details.push({ source: 'convention', severity: 'info', count: 1, deduction: -conventionBonus });
    }

    const rawScore = 100 - scanDeductions - depDeductions + conventionBonus;
    const score = Math.max(0, Math.min(100, rawScore));

    const postureScore: PostureScore = {
      score,
      timestamp: new Date().toISOString(),
      breakdown: { scanDeductions, depDeductions, conventionBonus, details },
    };

    this.recordScore(postureScore);
    return postureScore;
  }

  getTrend(days: number = 30): PostureTrend | null {
    const db = this.getDb();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const rows = db.prepare(`
      SELECT DATE(timestamp) as date, AVG(score) as score
      FROM posture_scores
      WHERE timestamp >= ?
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `).all(since) as { date: string; score: number }[];

    const latest = db.prepare(`
      SELECT * FROM posture_scores ORDER BY timestamp DESC LIMIT 1
    `).get() as any;

    if (!latest) return null;

    const current: PostureScore = {
      score: latest.score,
      timestamp: latest.timestamp,
      breakdown: JSON.parse(latest.details),
    };

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (rows.length >= 2) {
      const first = rows[0].score;
      const last = rows[rows.length - 1].score;
      const diff = last - first;
      if (diff > 5) trend = 'improving';
      else if (diff < -5) trend = 'declining';
    }

    return {
      current,
      history: rows.map((r) => ({ date: r.date, score: Math.round(r.score) })),
      trend,
    };
  }

  private recordScore(score: PostureScore): void {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO posture_scores (timestamp, score, scanDeductions, depDeductions, conventionBonus, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      score.timestamp,
      score.score,
      score.breakdown.scanDeductions,
      score.breakdown.depDeductions,
      score.breakdown.conventionBonus,
      JSON.stringify(score.breakdown)
    );
  }

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('PostureScorer not initialized. Call initialize() first.');
    }
    return this.db;
  }
}
