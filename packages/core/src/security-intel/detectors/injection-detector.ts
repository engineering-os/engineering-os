import { SecurityFinding, Detector, FindingCategory } from '@engineering-os/shared';

interface InjectionPattern {
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high';
  type: string;
  cweId: string;
  remediation: string;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    name: 'SQL Injection (template literal)',
    regex: /(?:query|execute|raw)\s*\(\s*`[^`]*\$\{/,
    severity: 'critical',
    type: 'sql',
    cweId: 'CWE-89',
    remediation: 'Use parameterized queries or prepared statements. Replace template literal interpolation with query parameters (e.g., ? placeholders).',
  },
  {
    name: 'SQL Injection (string concatenation)',
    regex: /(?:query|execute|raw)\s*\([^)]*['"]\s*\+|\+\s*['"][^)]*(?:query|execute|raw)/,
    severity: 'critical',
    type: 'sql',
    cweId: 'CWE-89',
    remediation: 'Use parameterized queries. Never concatenate user input into SQL strings.',
  },
  {
    name: 'Command Injection (exec)',
    regex: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*(?:`[^`]*\$\{|[^,)]*\+)/,
    severity: 'critical',
    type: 'command',
    cweId: 'CWE-78',
    remediation: 'Use execFile/execFileSync with an argument array instead of a shell string. Validate and sanitize all input passed to shell commands.',
  },
  {
    name: 'Command Injection (child_process template)',
    regex: /child_process.*(?:exec|spawn)\s*\(\s*`/,
    severity: 'critical',
    type: 'command',
    cweId: 'CWE-78',
    remediation: 'Avoid passing template literals to shell commands. Use execFile with explicit argument arrays.',
  },
  {
    name: 'Path Traversal (unvalidated path join)',
    regex: /path\.(?:join|resolve)\s*\([^)]*(?:req\.|params\.|query\.|body\.)/,
    severity: 'high',
    type: 'path-traversal',
    cweId: 'CWE-22',
    remediation: 'Validate that the resolved path stays within the expected base directory. Use path.resolve and check that it starts with the allowed prefix.',
  },
  {
    name: 'Path Traversal (fs with user input)',
    regex: /fs\.\w+(?:Sync)?\s*\([^)]*(?:req\.|params\.|query\.|body\.)/,
    severity: 'high',
    type: 'path-traversal',
    cweId: 'CWE-22',
    remediation: 'Never pass user-controlled input directly to filesystem operations. Validate and sanitize the path, ensuring it resolves within the expected directory.',
  },
  {
    name: 'NoSQL Injection ($where)',
    regex: /\$where\s*:\s*(?:req\.|params\.|query\.|body\.|`|\+)/,
    severity: 'critical',
    type: 'nosql',
    cweId: 'CWE-943',
    remediation: 'Avoid using $where with user input. Use standard MongoDB query operators instead.',
  },
  {
    name: 'SSRF (unvalidated URL)',
    regex: /(?:fetch|axios|request|got|http\.get)\s*\(\s*(?:req\.|params\.|query\.|body\.)/,
    severity: 'high',
    type: 'ssrf',
    cweId: 'CWE-918',
    remediation: 'Validate and allowlist URLs before making server-side requests. Block access to internal/private IP ranges.',
  },
];

export class InjectionDetector implements Detector {
  category: FindingCategory = 'injection';

  detect(filePath: string, _content: string, lines: string[]): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    let findingIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) {
        continue;
      }

      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.regex.test(line)) {
          findingIndex++;
          findings.push({
            id: `INJ-${findingIndex}`,
            category: pattern.type === 'path-traversal' ? 'path-traversal' : 'injection',
            severity: pattern.severity,
            title: pattern.name,
            description: `Potential ${pattern.type} injection detected. User-controlled input may flow into a dangerous sink without proper sanitization.`,
            filePath,
            startLine: i + 1,
            endLine: i + 1,
            snippet: line.trim().slice(0, 120),
            remediation: pattern.remediation,
            cweId: pattern.cweId,
            owaspCategory: 'A03:2021-Injection',
            confidence: 'high',
          });
          break;
        }
      }
    }

    return findings;
  }
}
