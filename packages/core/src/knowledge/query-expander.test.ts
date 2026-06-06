import { describe, it, expect } from 'vitest';
import { expandQuery } from './query-expander';

describe('expandQuery', () => {
  it('always includes the original query', () => {
    const results = expandQuery('auth middleware');
    expect(results[0]).toBe('auth middleware');
  });

  it('expands known synonyms', () => {
    const results = expandQuery('auth endpoint');
    const joined = results.join(' ');
    expect(joined).toMatch(/authentication|login|session/);
  });

  it('returns at most 3 variants', () => {
    const results = expandQuery('database auth config user payment');
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('strips stop words in keyword variant', () => {
    const results = expandQuery('how does the auth work');
    expect(results.some((r) => !r.includes('how') && !r.includes('does') && !r.includes('the'))).toBe(true);
  });

  it('handles single-word queries', () => {
    const results = expandQuery('auth');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toBe('auth');
  });

  it('handles queries with no known synonyms', () => {
    const results = expandQuery('foobarqux');
    expect(results[0]).toBe('foobarqux');
  });
});
