import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ComplianceChecker } from './compliance-checker';

describe('ComplianceChecker', () => {
  let tmpDir: string;
  let checker: ComplianceChecker;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-compliance-'));

    // Create sample project files for testing
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });

    // File with hardcoded secret (violates soc2-no-hardcoded-creds)
    fs.writeFileSync(path.join(tmpDir, 'src', 'config.ts'), `
      const dbPassword = "supersecret123";
      export const config = { db: { password: dbPassword } };
    `);

    // Controller without auth (violates soc2-auth-required)
    fs.writeFileSync(path.join(tmpDir, 'src', 'users.controller.ts'), `
      import { Router } from 'express';
      const router = Router();
      router.get('/users', (req, res) => {
        const data = req.body;
        res.json(data);
      });
    `);

    // File with HTTP URL (violates soc2-encryption-in-transit)
    fs.writeFileSync(path.join(tmpDir, 'src', 'api.ts'), `
      const endpoint = "http://external-api.com/data";
      fetch(endpoint).then(r => r.json());
    `);

    // Add a CI config (passes soc2-ci-config)
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'name: CI\non: push\njobs: test');

    // Add SECURITY.md (passes pci-security-policy)
    fs.writeFileSync(path.join(tmpDir, 'SECURITY.md'), '# Security Policy\nReport vulnerabilities to security@example.com');

    // Add package-lock.json (passes soc2-dependency-pinning)
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');

    const frameworksDir = path.join(__dirname, 'frameworks');
    checker = new ComplianceChecker(tmpDir, frameworksDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists available frameworks', () => {
    const frameworks = checker.getAvailableFrameworks();
    expect(frameworks).toContain('soc2');
    expect(frameworks).toContain('hipaa');
    expect(frameworks).toContain('pci-dss');
  });

  it('runs SOC2 compliance check', async () => {
    const result = await checker.check('soc2');
    expect(result.framework).toBe('SOC2');
    expect(result.totalRules).toBeGreaterThan(0);
    expect(result.findings.length).toBe(result.totalRules);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('detects hardcoded credentials', async () => {
    const result = await checker.check('soc2');
    const credFinding = result.findings.find((f) => f.ruleId === 'soc2-no-hardcoded-creds');
    expect(credFinding).toBeDefined();
    expect(credFinding!.status).toBe('fail');
    expect(credFinding!.severity).toBe('critical');
  });

  it('detects HTTP URLs', async () => {
    const result = await checker.check('soc2');
    const httpFinding = result.findings.find((f) => f.ruleId === 'soc2-encryption-in-transit');
    expect(httpFinding).toBeDefined();
    expect(httpFinding!.status).toBe('fail');
  });

  it('passes when CI config exists', async () => {
    const result = await checker.check('soc2');
    const ciFinding = result.findings.find((f) => f.ruleId === 'soc2-ci-config');
    expect(ciFinding).toBeDefined();
    expect(ciFinding!.status).toBe('pass');
  });

  it('passes when lock file exists', async () => {
    const result = await checker.check('soc2');
    const depFinding = result.findings.find((f) => f.ruleId === 'soc2-dependency-pinning');
    expect(depFinding).toBeDefined();
    expect(depFinding!.status).toBe('pass');
  });

  it('runs HIPAA compliance check', async () => {
    const result = await checker.check('hipaa');
    expect(result.framework).toBe('HIPAA');
    expect(result.totalRules).toBeGreaterThan(0);
  });

  it('runs PCI-DSS compliance check', async () => {
    const result = await checker.check('pci-dss');
    expect(result.framework).toBe('PCI-DSS');
    expect(result.totalRules).toBeGreaterThan(0);
  });

  it('detects PCI-DSS default credentials violation', async () => {
    // The config.ts file has password = "supersecret123" which triggers pci-no-default-creds
    const result = await checker.check('pci-dss');
    const findings = result.findings.filter((f) => f.status === 'fail');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('handles unknown framework gracefully', async () => {
    const result = await checker.check('unknown-framework' as any);
    expect(result.totalRules).toBe(0);
    expect(result.findings[0].ruleId).toBe('LOAD_ERROR');
  });

  it('returns score as percentage', async () => {
    const result = await checker.check('soc2');
    expect(typeof result.score).toBe('number');
    expect(result.passed + result.failed + result.skipped).toBe(result.totalRules);
  });

  it('includes remediation guidance in findings', async () => {
    const result = await checker.check('soc2');
    const failedFindings = result.findings.filter((f) => f.status === 'fail');
    for (const finding of failedFindings) {
      expect(finding.remediation).toBeTruthy();
      expect(finding.remediation.length).toBeGreaterThan(10);
    }
  });
});
