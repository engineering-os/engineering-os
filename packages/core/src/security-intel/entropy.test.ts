import { describe, it, expect } from 'vitest';
import { shannonEntropy, isHighEntropy } from './entropy';

describe('shannonEntropy', () => {
  it('returns 0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('returns 0 for single repeated character', () => {
    expect(shannonEntropy('aaaaaaa')).toBe(0);
  });

  it('returns 1 for two equally distributed characters', () => {
    expect(shannonEntropy('ab')).toBeCloseTo(1, 5);
  });

  it('returns high entropy for random-looking strings', () => {
    const entropy = shannonEntropy('aB3$xZ9!qW2@mK7#');
    expect(entropy).toBeGreaterThan(3.5);
  });

  it('returns low entropy for repetitive strings', () => {
    const entropy = shannonEntropy('aaabbbccc');
    expect(entropy).toBeLessThan(2);
  });
});

describe('isHighEntropy', () => {
  it('returns false for short strings', () => {
    expect(isHighEntropy('abc123')).toBe(false);
  });

  it('returns false for long but repetitive strings', () => {
    expect(isHighEntropy('aaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
  });

  it('returns true for API-key-like strings', () => {
    expect(isHighEntropy('xk_test_R4nD0mH1gHEnTr0pYsTr1nG')).toBe(true);
  });

  it('respects custom threshold', () => {
    const str = 'abcdefghijklmnopqrst';
    expect(isHighEntropy(str, 6.0)).toBe(false);
    expect(isHighEntropy(str, 3.0)).toBe(true);
  });
});
