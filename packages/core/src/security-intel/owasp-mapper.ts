import { SecurityFinding, Severity } from '@engineering-os/shared';

export interface OwaspCategory {
  id: string;
  name: string;
  findings: number;
  status: 'pass' | 'warn' | 'fail';
}

const OWASP_TOP_10: Record<string, string> = {
  'A01:2021': 'Broken Access Control',
  'A02:2021': 'Cryptographic Failures',
  'A03:2021': 'Injection',
  'A04:2021': 'Insecure Design',
  'A05:2021': 'Security Misconfiguration',
  'A06:2021': 'Vulnerable and Outdated Components',
  'A07:2021': 'Identification and Authentication Failures',
  'A08:2021': 'Software and Data Integrity Failures',
  'A09:2021': 'Security Logging and Monitoring Failures',
  'A10:2021': 'Server-Side Request Forgery',
};

const CWE_TO_OWASP: Record<string, string> = {
  'CWE-22': 'A01:2021',
  'CWE-78': 'A03:2021',
  'CWE-79': 'A03:2021',
  'CWE-89': 'A03:2021',
  'CWE-95': 'A03:2021',
  'CWE-295': 'A05:2021',
  'CWE-319': 'A02:2021',
  'CWE-321': 'A02:2021',
  'CWE-328': 'A02:2021',
  'CWE-352': 'A01:2021',
  'CWE-489': 'A05:2021',
  'CWE-798': 'A02:2021',
  'CWE-916': 'A02:2021',
  'CWE-918': 'A10:2021',
  'CWE-942': 'A05:2021',
  'CWE-943': 'A03:2021',
};

export class OwaspMapper {
  mapFindings(findings: SecurityFinding[]): Record<string, { findings: number; status: 'pass' | 'warn' | 'fail' }> {
    const coverage: Record<string, { findings: number; status: 'pass' | 'warn' | 'fail' }> = {};

    for (const [id, name] of Object.entries(OWASP_TOP_10)) {
      coverage[`${id}-${name}`] = { findings: 0, status: 'pass' };
    }

    for (const finding of findings) {
      const owaspId = finding.owaspCategory
        ? finding.owaspCategory.split('-')[0]
        : finding.cweId
          ? CWE_TO_OWASP[finding.cweId]
          : undefined;

      if (owaspId) {
        const key = Object.keys(coverage).find((k) => k.startsWith(owaspId));
        if (key) {
          coverage[key].findings++;
          if (finding.severity === 'critical' || finding.severity === 'high') {
            coverage[key].status = 'fail';
          } else if (coverage[key].status === 'pass') {
            coverage[key].status = 'warn';
          }
        }
      }
    }

    return coverage;
  }

  computeOverallRisk(findings: SecurityFinding[]): Severity {
    if (findings.some((f) => f.severity === 'critical')) return 'critical';
    if (findings.some((f) => f.severity === 'high')) return 'high';
    if (findings.some((f) => f.severity === 'medium')) return 'medium';
    if (findings.some((f) => f.severity === 'low')) return 'low';
    return 'info';
  }
}
