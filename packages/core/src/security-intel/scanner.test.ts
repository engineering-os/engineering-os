import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SecurityScanner } from './scanner';

describe('SecurityScanner', () => {
  const tmpDir = path.join(os.tmpdir(), 'eos-scanner-test-' + Date.now());

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'vulnerable.ts'),
      [
        'const key = "AKIAIOSFODNN7EXAMPLE";',
        'const result = db.query(`SELECT * FROM users WHERE id = ${id}`);',
        'element.innerHTML = userInput;',
        'const hash = crypto.createHash(\'md5\').update(password).digest(\'hex\');',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(tmpDir, 'safe.ts'),
      [
        'const key = process.env.AWS_KEY;',
        'const result = db.query("SELECT * FROM users WHERE id = ?", [id]);',
        'element.textContent = userInput;',
      ].join('\n')
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scans files and finds vulnerabilities', async () => {
    const scanner = new SecurityScanner(tmpDir);
    const result = await scanner.scan();

    expect(result.filesScanned).toBe(2);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.summary.critical).toBeGreaterThan(0);
  });

  it('filters by category', async () => {
    const scanner = new SecurityScanner(tmpDir);
    const result = await scanner.scan({ categories: ['secret'] });

    expect(result.findings.every((f) => f.category === 'secret')).toBe(true);
  });

  it('filters by minimum severity', async () => {
    const scanner = new SecurityScanner(tmpDir);
    const result = await scanner.scan({ minSeverity: 'high' });

    expect(result.findings.every((f) => f.severity === 'critical' || f.severity === 'high')).toBe(true);
  });

  it('filters by specific paths', async () => {
    const scanner = new SecurityScanner(tmpDir);
    const result = await scanner.scan({ paths: ['safe.ts'] });

    expect(result.filesScanned).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('returns sorted findings (most severe first)', async () => {
    const scanner = new SecurityScanner(tmpDir);
    const result = await scanner.scan();

    const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
    for (let i = 1; i < result.findings.length; i++) {
      const prev = severityOrder.indexOf(result.findings[i - 1].severity);
      const curr = severityOrder.indexOf(result.findings[i].severity);
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  it('completes in under 1 second for small directories', async () => {
    const scanner = new SecurityScanner(tmpDir);
    const result = await scanner.scan();
    expect(result.duration).toBeLessThan(1000);
  });
});
