import { describe, it, expect } from 'vitest';
import { SecretsDetector } from './secrets-detector';

describe('SecretsDetector', () => {
  const detector = new SecretsDetector();

  it('detects AWS access keys', () => {
    const lines = ['const key = "AKIAIOSFODNN7EXAMPLE";'];
    const findings = detector.detect('config.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].title).toContain('AWS');
  });

  it('detects GitHub tokens', () => {
    const lines = ['const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";'];
    const findings = detector.detect('auth.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('detects connection strings', () => {
    const lines = ['const db = "postgres://admin:password123@db.example.com:5432/prod";'];
    const findings = detector.detect('db.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('detects generic secret assignments', () => {
    const lines = ['const apiKey = "sk_live_very_secret_value_here";'];
    const findings = detector.detect('config.ts', lines.join('\n'), lines);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('ignores test files', () => {
    const lines = ['const key = "AKIAIOSFODNN7EXAMPLE";'];
    const findings = detector.detect('auth.test.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(0);
  });

  it('ignores commented lines', () => {
    const lines = ['// const key = "AKIAIOSFODNN7EXAMPLE";'];
    const findings = detector.detect('config.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(0);
  });

  it('returns correct structure for findings', () => {
    const lines = ['const secret = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";'];
    const findings = detector.detect('src/config.ts', lines.join('\n'), lines);
    expect(findings[0]).toMatchObject({
      category: 'secret',
      filePath: 'src/config.ts',
      startLine: 1,
      confidence: expect.stringMatching(/high|medium/),
      cweId: expect.any(String),
      remediation: expect.any(String),
    });
  });
});
