import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PostureScorer } from './posture-scorer';
import { SecurityScanResult, DependencyVulnerability } from '@engineering-os/shared';

describe('PostureScorer', () => {
  let tmpDir: string;
  let scorer: PostureScorer;

  const cleanScan: SecurityScanResult = {
    scanId: 'scan-1',
    timestamp: new Date().toISOString(),
    duration: 100,
    filesScanned: 50,
    findings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  };

  const dirtyScan: SecurityScanResult = {
    scanId: 'scan-2',
    timestamp: new Date().toISOString(),
    duration: 200,
    filesScanned: 50,
    findings: [],
    summary: { critical: 1, high: 2, medium: 3, low: 1, info: 0 },
  };

  const depVulns: DependencyVulnerability[] = [
    { package: 'lodash', version: '4.17.20', severity: 'high', cveId: 'CVE-2021-23337', title: 'Prototype Pollution', advisory: 'https://example.com' },
    { package: 'express', version: '4.17.0', severity: 'medium', cveId: 'CVE-2022-24999', title: 'Open Redirect', advisory: 'https://example.com' },
  ];

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-posture-'));
    scorer = new PostureScorer(path.join(tmpDir, 'analytics.db'));
    scorer.initialize();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scores 100 for a clean project with good conventions', () => {
    const result = scorer.compute(cleanScan, [], 90);
    expect(result.score).toBe(100);
    expect(result.breakdown.scanDeductions).toBe(0);
    expect(result.breakdown.depDeductions).toBe(0);
    expect(result.breakdown.conventionBonus).toBe(10);
  });

  it('deducts for scan findings by severity', () => {
    const result = scorer.compute(dirtyScan, [], 50);
    // 1*20 + 2*10 + 3*5 + 1*2 = 57 deductions, no convention bonus
    expect(result.breakdown.scanDeductions).toBe(57);
    expect(result.score).toBe(43);
  });

  it('deducts for dependency vulnerabilities', () => {
    const result = scorer.compute(cleanScan, depVulns, 50);
    // 1*8 (high) + 1*3 (medium) = 11 deductions
    expect(result.breakdown.depDeductions).toBe(11);
    expect(result.score).toBe(89);
  });

  it('adds convention bonus when compliance >= 80%', () => {
    const result = scorer.compute(cleanScan, [], 80);
    expect(result.breakdown.conventionBonus).toBe(10);
  });

  it('no convention bonus when compliance < 80%', () => {
    const result = scorer.compute(cleanScan, [], 79);
    expect(result.breakdown.conventionBonus).toBe(0);
    expect(result.score).toBe(100); // still 100 because no deductions, capped at 100
  });

  it('never goes below 0', () => {
    const terribleScan: SecurityScanResult = {
      scanId: 'scan-bad',
      timestamp: new Date().toISOString(),
      duration: 100,
      filesScanned: 50,
      findings: [],
      summary: { critical: 10, high: 10, medium: 10, low: 10, info: 0 },
    };
    const result = scorer.compute(terribleScan, depVulns, 0);
    expect(result.score).toBe(0);
  });

  it('records and retrieves trend', () => {
    const trend = scorer.getTrend(30);
    expect(trend).not.toBeNull();
    expect(trend!.history.length).toBeGreaterThan(0);
    expect(trend!.current.score).toBeGreaterThanOrEqual(0);
    expect(['improving', 'declining', 'stable']).toContain(trend!.trend);
  });

  it('includes breakdown details in score', () => {
    const result = scorer.compute(dirtyScan, depVulns, 90);
    expect(result.breakdown.details.length).toBeGreaterThan(0);
    const scanDetails = result.breakdown.details.filter((d) => d.source === 'scan');
    const depDetails = result.breakdown.details.filter((d) => d.source === 'dependency');
    expect(scanDetails.length).toBeGreaterThan(0);
    expect(depDetails.length).toBeGreaterThan(0);
  });
});
