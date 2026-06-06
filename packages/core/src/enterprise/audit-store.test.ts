import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuditStore } from './audit-store';

describe('AuditStore', () => {
  let tmpDir: string;
  let store: AuditStore;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-audit-'));
    store = new AuditStore(path.join(tmpDir, 'traces', 'audit.db'));
    store.initialize();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records and queries audit entries', () => {
    store.record({
      timestamp: '2026-05-31T10:00:00.000Z',
      tool: 'eos_search',
      user: 'developer@example.com',
      args: { query: 'auth middleware' },
      resultSummary: '3 results found',
      duration: 45,
      success: true,
    });

    const entries = store.query();
    expect(entries).toHaveLength(1);
    expect(entries[0].tool).toBe('eos_search');
    expect(entries[0].user).toBe('developer@example.com');
    expect(entries[0].args).toEqual({ query: 'auth middleware' });
    expect(entries[0].success).toBe(true);
  });

  it('filters by tool', () => {
    store.record({
      timestamp: '2026-05-31T10:01:00.000Z',
      tool: 'eos_decide',
      user: 'developer@example.com',
      args: { title: 'Use Redis' },
      resultSummary: 'Decision recorded',
      duration: 12,
      success: true,
    });

    const results = store.query({ tool: 'eos_decide' });
    expect(results).toHaveLength(1);
    expect(results[0].tool).toBe('eos_decide');
  });

  it('filters by user', () => {
    store.record({
      timestamp: '2026-05-31T10:02:00.000Z',
      tool: 'eos_index',
      user: 'admin@example.com',
      args: { force: true },
      resultSummary: '1000 files indexed',
      duration: 3200,
      success: true,
    });

    const results = store.query({ user: 'admin@example.com' });
    expect(results).toHaveLength(1);
    expect(results[0].user).toBe('admin@example.com');
  });

  it('filters by time range', () => {
    const results = store.query({
      since: '2026-05-31T10:00:30.000Z',
      until: '2026-05-31T10:01:30.000Z',
    });
    expect(results).toHaveLength(1);
    expect(results[0].tool).toBe('eos_decide');
  });

  it('filters by success status', () => {
    store.record({
      timestamp: '2026-05-31T10:03:00.000Z',
      tool: 'eos_search',
      user: 'developer@example.com',
      args: { query: '' },
      resultSummary: 'Error: empty query',
      duration: 2,
      success: false,
    });

    const failures = store.query({ success: false });
    expect(failures).toHaveLength(1);
    expect(failures[0].success).toBe(false);
  });

  it('respects limit and offset', () => {
    const all = store.query({ limit: 100 });
    expect(all.length).toBeGreaterThan(2);

    const page1 = store.query({ limit: 2, offset: 0 });
    expect(page1).toHaveLength(2);

    const page2 = store.query({ limit: 2, offset: 2 });
    expect(page2.length).toBeGreaterThan(0);
    expect(page2[0].id).not.toBe(page1[0].id);
  });

  it('returns stats', () => {
    const stats = store.getStats();
    expect(stats.totalEntries).toBe(4);
    expect(stats.uniqueTools).toBeGreaterThanOrEqual(2);
    expect(stats.uniqueUsers).toBe(2);
  });

  it('truncates long result summaries', () => {
    const longResult = 'x'.repeat(5000);
    store.record({
      timestamp: '2026-05-31T10:04:00.000Z',
      tool: 'eos_context',
      user: 'developer@example.com',
      args: { task: 'test' },
      resultSummary: longResult,
      duration: 100,
      success: true,
    });

    const entries = store.query({ tool: 'eos_context' });
    expect(entries[0].resultSummary.length).toBeLessThanOrEqual(2000);
  });
});
