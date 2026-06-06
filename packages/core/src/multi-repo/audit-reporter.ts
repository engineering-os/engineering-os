import { AuditReport, AuditReportFinding, SecurityFinding, SecurityScanResult } from '@engineering-os/shared';
import * as fs from 'fs/promises';
import * as path from 'path';

export class AuditReporter {
  constructor(private eosDir: string) {}

  async generateReport(
    repoName: string,
    scanResult: SecurityScanResult,
    owaspCoverage: Record<string, { status: string; findings: number }>,
    dependencyVulnCount: number
  ): Promise<AuditReport> {
    const report: AuditReport = {
      id: `AUDIT-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      repoName,
      summary: {
        totalFindings: scanResult.findings.length,
        critical: scanResult.summary.critical,
        high: scanResult.summary.high,
        medium: scanResult.summary.medium,
        low: scanResult.summary.low,
        dependencyVulnerabilities: dependencyVulnCount,
        owaspCoverage: Object.fromEntries(
          Object.entries(owaspCoverage).map(([k, v]) => [k, v.status])
        ),
      },
      findings: scanResult.findings.map((f) => this.mapFinding(f)),
      recommendations: this.generateRecommendations(scanResult),
    };

    await this.saveReport(report);
    return report;
  }

  async getReports(): Promise<AuditReport[]> {
    const dir = path.join(this.eosDir, 'knowledge', 'security', 'audit-history');
    try {
      const files = await fs.readdir(dir);
      const reports: AuditReport[] = [];
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        reports.push(JSON.parse(content));
      }
      return reports.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async getReport(id: string): Promise<AuditReport | null> {
    const dir = path.join(this.eosDir, 'knowledge', 'security', 'audit-history');
    const filePath = path.join(dir, `${id}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  exportAsJson(report: AuditReport): string {
    return JSON.stringify(report, null, 2);
  }

  exportAsMarkdown(report: AuditReport): string {
    const lines = [
      `# Security Audit Report`,
      '',
      `**Repository:** ${report.repoName}`,
      `**Generated:** ${report.generatedAt}`,
      `**Report ID:** ${report.id}`,
      '',
      '## Summary',
      '',
      `| Severity | Count |`,
      `|----------|-------|`,
      `| Critical | ${report.summary.critical} |`,
      `| High | ${report.summary.high} |`,
      `| Medium | ${report.summary.medium} |`,
      `| Low | ${report.summary.low} |`,
      `| **Total** | **${report.summary.totalFindings}** |`,
      '',
      `**Dependency Vulnerabilities:** ${report.summary.dependencyVulnerabilities}`,
      '',
      '## OWASP Top 10 Coverage',
      '',
      '| Category | Status |',
      '|----------|--------|',
    ];

    for (const [category, status] of Object.entries(report.summary.owaspCoverage)) {
      const icon = status === 'pass' ? 'PASS' : status === 'warn' ? 'WARN' : 'FAIL';
      lines.push(`| ${category} | ${icon} |`);
    }

    lines.push('');
    lines.push('## Findings');
    lines.push('');

    for (const f of report.findings) {
      lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push('');
      lines.push(`- **File:** \`${f.filePath}:${f.line}\``);
      lines.push(`- **Category:** ${f.category}`);
      if (f.cweId) lines.push(`- **CWE:** ${f.cweId}`);
      lines.push(`- **Remediation:** ${f.remediation}`);
      lines.push(`- **Code:** \`${f.snippet}\``);
      lines.push('');
    }

    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    return lines.join('\n');
  }

  private mapFinding(f: SecurityFinding): AuditReportFinding {
    return {
      severity: f.severity,
      title: f.title,
      filePath: f.filePath,
      line: f.startLine,
      category: f.category,
      cweId: f.cweId,
      remediation: f.remediation,
      snippet: f.snippet,
    };
  }

  private generateRecommendations(result: SecurityScanResult): string[] {
    const recs: string[] = [];
    if (result.summary.critical > 0) {
      recs.push('IMMEDIATE: Fix all critical vulnerabilities before deploying to production.');
    }
    if (result.summary.high > 0) {
      recs.push('Address high-severity findings in the current sprint.');
    }
    if (result.summary.medium > 0) {
      recs.push('Plan remediation for medium-severity findings within 30 days.');
    }
    recs.push('Add security scanning to CI/CD pipeline for continuous monitoring.');
    recs.push('Review and update security conventions with `eos_security_conventions`.');
    return recs;
  }

  private async saveReport(report: AuditReport): Promise<void> {
    const dir = path.join(this.eosDir, 'knowledge', 'security', 'audit-history');
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${report.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
  }
}
