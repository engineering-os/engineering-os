import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DecisionStore } from '../decisions/decision-store';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Decision Store', () => {
  let tmpDir: string;
  let store: DecisionStore;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-decisions-'));
    store = new DecisionStore(tmpDir);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should save and retrieve a decision', async () => {
    await store.save({
      id: 'DEC-001',
      title: 'Use Redis for Rate Limiting',
      status: 'accepted',
      context: 'Need distributed throttling across instances',
      options: [
        { name: 'in-memory', pros: ['Simple'], cons: ['Single instance only'] },
        { name: 'redis', pros: ['Distributed', 'Fast'], cons: ['Extra infra'] },
      ],
      decision: 'redis',
      rationale: 'Supports multi-instance deployment',
      consequences: ['Additional Redis dependency'],
      date: '2024-01-15',
      tags: ['infrastructure', 'rate-limiting'],
    });

    const retrieved = await store.get('DEC-001');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Use Redis for Rate Limiting');
    expect(retrieved!.decision).toBe('redis');
  });

  it('should return null for non-existent decision', async () => {
    const result = await store.get('DEC-999');
    expect(result).toBeNull();
  });

  it('should search decisions by title keyword', async () => {
    const results = await store.search('rate limiting');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('DEC-001');
  });

  it('should search decisions by context keyword', async () => {
    const results = await store.search('distributed throttling');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('DEC-001');
  });

  it('should search decisions by rationale keyword', async () => {
    const results = await store.search('multi-instance');
    expect(results.length).toBe(1);
  });

  it('should return empty for unmatched search', async () => {
    const results = await store.search('blockchain');
    expect(results.length).toBe(0);
  });

  it('should list with status filter', async () => {
    await store.save({
      id: 'DEC-002',
      title: 'Use PostgreSQL for primary data',
      status: 'proposed',
      context: 'Need relational storage',
      options: [],
      decision: 'postgres',
      rationale: 'Best relational DB for our use case',
      consequences: [],
      date: '2024-02-01',
      tags: ['database'],
    });

    const accepted = await store.list({ status: 'accepted' });
    expect(accepted.length).toBe(1);
    expect(accepted[0].id).toBe('DEC-001');

    const proposed = await store.list({ status: 'proposed' });
    expect(proposed.length).toBe(1);
    expect(proposed[0].id).toBe('DEC-002');
  });

  it('should list with tag filter', async () => {
    const results = await store.list({ tag: 'infrastructure' });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('DEC-001');
  });

  it('should list all decisions without filter', async () => {
    const all = await store.list();
    expect(all.length).toBe(2);
  });

  it('should update decision status', async () => {
    await store.updateStatus('DEC-001', 'deprecated');
    const updated = await store.get('DEC-001');
    expect(updated!.status).toBe('deprecated');
  });

  it('should update status with supersededBy reference', async () => {
    await store.updateStatus('DEC-001', 'superseded', 'DEC-003');
    const updated = await store.get('DEC-001');
    expect(updated!.status).toBe('superseded');
    expect(updated!.supersededBy).toBe('DEC-003');
  });

  it('should create a decision with auto-generated ID', async () => {
    const created = await store.create({
      title: 'Use GraphQL for API layer',
      status: 'accepted',
      context: 'Need flexible querying',
      options: [],
      decision: 'graphql',
      rationale: 'Frontend flexibility',
      consequences: ['Schema maintenance'],
      date: '2024-03-01',
      tags: ['api'],
    });

    expect(created.id).toMatch(/^DEC-\d{3}$/);
    const retrieved = await store.get(created.id);
    expect(retrieved!.title).toBe('Use GraphQL for API layer');
  });

  it('should throw when updating non-existent decision', async () => {
    await expect(store.updateStatus('DEC-999', 'deprecated')).rejects.toThrow(
      'Decision DEC-999 not found'
    );
  });
});
