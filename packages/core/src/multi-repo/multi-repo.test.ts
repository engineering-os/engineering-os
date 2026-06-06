import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RepoRegistry } from './repo-registry';
import { TeamSync } from './team-sync';
import { AuditReporter } from './audit-reporter';
import { AnalyticsStore } from './analytics-store';

describe('RepoRegistry', () => {
  let tmpDir: string;
  let registry: RepoRegistry;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-multi-'));
    registry = new RepoRegistry(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with no linked repos', async () => {
    const repos = await registry.getLinkedRepos();
    expect(repos).toEqual([]);
  });

  it('links a repo', async () => {
    await registry.linkRepo({
      name: 'backend-api',
      path: '/tmp/repos/backend',
      eosDir: '/tmp/repos/backend/.eos',
      tags: ['backend', 'api'],
    });
    const repos = await registry.getLinkedRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('backend-api');
    expect(repos[0].tags).toEqual(['backend', 'api']);
  });

  it('updates an existing link', async () => {
    await registry.linkRepo({
      name: 'backend-api',
      path: '/tmp/repos/backend-v2',
      eosDir: '/tmp/repos/backend-v2/.eos',
      tags: ['backend'],
    });
    const repos = await registry.getLinkedRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0].path).toBe('/tmp/repos/backend-v2');
  });

  it('unlinks a repo', async () => {
    const removed = await registry.unlinkRepo('backend-api');
    expect(removed).toBe(true);
    const repos = await registry.getLinkedRepos();
    expect(repos).toHaveLength(0);
  });

  it('returns false for unlinking non-existent repo', async () => {
    const removed = await registry.unlinkRepo('nonexistent');
    expect(removed).toBe(false);
  });

  it('validates links (all broken without actual .eos dirs)', async () => {
    await registry.linkRepo({
      name: 'fake-repo',
      path: '/nonexistent/path',
      eosDir: '/nonexistent/path/.eos',
    });
    const { valid, broken } = await registry.validateLinks();
    expect(broken).toHaveLength(1);
    expect(valid).toHaveLength(0);
  });
});

describe('TeamSync', () => {
  let tmpDir: string;
  let sync: TeamSync;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-team-'));
    sync = new TeamSync(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with no manifest', async () => {
    const manifest = await sync.getManifest();
    expect(manifest).toBeNull();
  });

  it('initializes a manifest', async () => {
    const manifest = await sync.initManifest('engineering');
    expect(manifest.team).toBe('engineering');
    expect(manifest.conventions).toEqual([]);
  });

  it('adds a convention', async () => {
    const conv = await sync.addConvention({
      name: 'Use PascalCase for components',
      rule: 'React component files and exports must use PascalCase',
      description: 'Consistency in component naming',
      examples: ['Button.tsx', 'UserProfile.tsx'],
      enforced: true,
    });
    expect(conv.id).toBe('CONV-001');
  });

  it('adds a pattern', async () => {
    const pat = await sync.addPattern({
      name: 'Repository Pattern',
      description: 'Data access through repository classes',
      usage: 'backend',
    });
    expect(pat.id).toBe('PAT-001');
  });

  it('adds a security policy', async () => {
    const pol = await sync.addSecurityPolicy({
      rule: 'All API endpoints must validate input via DTO',
      severity: 'high',
      category: 'input-validation',
      enforced: true,
    });
    expect(pol.id).toBe('SEC-001');
  });

  it('returns enforced conventions', async () => {
    const enforced = await sync.getEnforcedConventions();
    expect(enforced).toHaveLength(1);
    expect(enforced[0].name).toBe('Use PascalCase for components');
  });

  it('syncs from a remote manifest', async () => {
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-remote-'));
    const remoteSync = new TeamSync(remoteDir);
    await remoteSync.initManifest('remote-team');
    // Add two conventions so CONV-002 is new relative to local (which has CONV-001)
    await remoteSync.addConvention({
      name: 'Remote Convention 1',
      rule: 'First remote rule',
      description: 'From remote',
      examples: [],
      enforced: true,
      addedAt: new Date().toISOString(),
    });
    await remoteSync.addConvention({
      name: 'Remote Convention 2',
      rule: 'Second remote rule',
      description: 'From remote',
      examples: [],
      enforced: true,
      addedAt: new Date().toISOString(),
    });

    const result = await sync.syncFrom(remoteDir);
    // CONV-001 already exists locally so it's an update candidate, CONV-002 is new
    expect(result.added).toBeGreaterThanOrEqual(1);

    fs.rmSync(remoteDir, { recursive: true, force: true });
  });
});

describe('AuditReporter', () => {
  let tmpDir: string;
  let reporter: AuditReporter;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-audit-'));
    reporter = new AuditReporter(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates and saves a report', async () => {
    const report = await reporter.generateReport(
      'test-repo',
      {
        scanId: 'scan-1',
        timestamp: new Date().toISOString(),
        duration: 150,
        filesScanned: 10,
        findings: [
          {
            id: 'F-001',
            category: 'secret',
            severity: 'critical',
            title: 'Hardcoded API key',
            description: 'API key in source',
            filePath: '/src/config.ts',
            startLine: 5,
            endLine: 5,
            snippet: 'apiKey = "sk-..."',
            remediation: 'Use environment variables',
            confidence: 'high',
          },
        ],
        summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      },
      { 'A01:2021': { status: 'pass', findings: 0 } },
      0
    );

    expect(report.id).toMatch(/^AUDIT-/);
    expect(report.summary.critical).toBe(1);
  });

  it('lists reports', async () => {
    const reports = await reporter.getReports();
    expect(reports.length).toBeGreaterThanOrEqual(1);
  });

  it('exports as markdown', async () => {
    const reports = await reporter.getReports();
    const md = reporter.exportAsMarkdown(reports[0]);
    expect(md).toContain('# Security Audit Report');
    expect(md).toContain('Hardcoded API key');
  });

  it('exports as JSON', async () => {
    const reports = await reporter.getReports();
    const json = reporter.exportAsJson(reports[0]);
    const parsed = JSON.parse(json);
    expect(parsed.repoName).toBe('test-repo');
  });
});

describe('AnalyticsStore', () => {
  let tmpDir: string;
  let store: AnalyticsStore;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-analytics-'));
    store = new AnalyticsStore(path.join(tmpDir, 'analytics.db'));
    store.initialize();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with zero events', () => {
    expect(store.getTotalEvents()).toBe(0);
  });

  it('records events', () => {
    store.record({
      timestamp: new Date().toISOString(),
      tool: 'eos_search',
      duration: 45,
      success: true,
      repoName: 'test-repo',
    });
    store.record({
      timestamp: new Date().toISOString(),
      tool: 'eos_search',
      duration: 60,
      success: true,
    });
    store.record({
      timestamp: new Date().toISOString(),
      tool: 'eos_index',
      duration: 2000,
      success: false,
    });
    expect(store.getTotalEvents()).toBe(3);
  });

  it('computes tool stats', () => {
    const stats = store.getToolStats();
    expect(stats).toHaveLength(2);
    const searchStats = stats.find((s) => s.tool === 'eos_search');
    expect(searchStats!.totalCalls).toBe(2);
    expect(searchStats!.successRate).toBe(100);
  });

  it('computes daily stats', () => {
    const daily = store.getDailyStats(7);
    expect(daily.length).toBeGreaterThanOrEqual(1);
    expect(daily[0].totalCalls).toBe(3);
  });
});
