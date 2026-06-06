import { describe, it, expect } from 'vitest';
import { ConfigDetector } from './config-detector';

describe('ConfigDetector', () => {
  const detector = new ConfigDetector();

  it('detects CORS wildcard', () => {
    const lines = ["cors({ origin: '*' })"];
    const findings = detector.detect('server.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('detects disabled TLS verification', () => {
    const lines = ['rejectUnauthorized: false'];
    const findings = detector.detect('https.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
  });

  it('detects weak MD5 hash', () => {
    const lines = ["const hash = crypto.createHash('md5').update(data).digest('hex');"];
    const findings = detector.detect('crypto.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].cweId).toBe('CWE-328');
  });

  it('detects disabled CSRF', () => {
    const lines = ['csrf: false'];
    const findings = detector.detect('config.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
  });

  it('detects plain HTTP URLs (non-localhost)', () => {
    const lines = ['const api = "http://api.production.com/v1";'];
    const findings = detector.detect('config.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
  });

  it('does not flag localhost HTTP', () => {
    const lines = ['const api = "http://localhost:3000/api";'];
    const findings = detector.detect('config.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(0);
  });
});
