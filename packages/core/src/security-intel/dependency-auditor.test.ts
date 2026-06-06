import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DependencyAuditor } from './dependency-auditor';

describe('DependencyAuditor', () => {
  const tmpDir = path.join(os.tmpdir(), 'eos-dep-audit-test-' + Date.now());

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects vulnerable lodash version', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { lodash: '^4.17.19' },
      })
    );

    const auditor = new DependencyAuditor(tmpDir);
    const vulns = await auditor.audit();

    expect(vulns.length).toBeGreaterThan(0);
    expect(vulns.some((v) => v.package === 'lodash' && v.cveId === 'CVE-2021-23337')).toBe(true);
  });

  it('does not flag patched versions', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { lodash: '^4.17.21' },
      })
    );

    const auditor = new DependencyAuditor(tmpDir);
    const vulns = await auditor.audit();

    expect(vulns.filter((v) => v.package === 'lodash')).toHaveLength(0);
  });

  it('returns empty for missing package.json', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });

    const auditor = new DependencyAuditor(emptyDir);
    const vulns = await auditor.audit();

    expect(vulns).toHaveLength(0);
  });

  it('checks devDependencies too', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        devDependencies: { minimist: '1.2.5' },
      })
    );

    const auditor = new DependencyAuditor(tmpDir);
    const vulns = await auditor.audit();

    expect(vulns.some((v) => v.package === 'minimist')).toBe(true);
  });

  it('includes patchedIn info', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { axios: '1.5.0' },
      })
    );

    const auditor = new DependencyAuditor(tmpDir);
    const vulns = await auditor.audit();

    const axiosVuln = vulns.find((v) => v.package === 'axios');
    expect(axiosVuln).toBeDefined();
    expect(axiosVuln!.patchedIn).toBe('1.6.0');
  });
});
