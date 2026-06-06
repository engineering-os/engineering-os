import { describe, it, expect } from 'vitest';
import { InjectionDetector } from './injection-detector';

describe('InjectionDetector', () => {
  const detector = new InjectionDetector();

  it('detects SQL injection via template literals', () => {
    const lines = ['const result = db.query(`SELECT * FROM users WHERE id = ${userId}`);'];
    const findings = detector.detect('user-service.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].cweId).toBe('CWE-89');
  });

  it('detects SQL injection via string concatenation', () => {
    const lines = ['const result = db.query("SELECT * FROM users WHERE name = \'" + name + "\'");'];
    const findings = detector.detect('query.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('detects command injection', () => {
    const lines = ['const out = exec(`ls ${req.body.dir}`);'];
    const findings = detector.detect('file-service.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].cweId).toBe('CWE-78');
  });

  it('detects path traversal with user input', () => {
    const lines = ['const file = path.join(baseDir, req.params.filename);'];
    const findings = detector.detect('download.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('path-traversal');
  });

  it('detects SSRF with user input', () => {
    const lines = ['const response = await fetch(req.body.url);'];
    const findings = detector.detect('proxy.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(1);
    expect(findings[0].cweId).toBe('CWE-918');
  });

  it('ignores commented lines', () => {
    const lines = ['// const result = db.query(`SELECT * FROM users WHERE id = ${userId}`);'];
    const findings = detector.detect('user-service.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(0);
  });

  it('does not flag parameterized queries', () => {
    const lines = ['const result = db.query("SELECT * FROM users WHERE id = ?", [userId]);'];
    const findings = detector.detect('user-service.ts', lines.join('\n'), lines);
    expect(findings).toHaveLength(0);
  });
});
