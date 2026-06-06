import { SecurityFinding, Detector, FindingCategory } from '@engineering-os/shared';

interface XssPattern {
  name: string;
  regex: RegExp;
  severity: 'high' | 'medium';
  cweId: string;
  remediation: string;
}

const XSS_PATTERNS: XssPattern[] = [
  {
    name: 'innerHTML assignment',
    regex: /\.innerHTML\s*=\s*[^'"`\s]/,
    severity: 'high',
    cweId: 'CWE-79',
    remediation: 'Use textContent for plain text, or sanitize HTML with a library like DOMPurify before assigning to innerHTML.',
  },
  {
    name: 'outerHTML assignment',
    regex: /\.outerHTML\s*=\s*(?!['"]<)/,
    severity: 'high',
    cweId: 'CWE-79',
    remediation: 'Avoid assigning dynamic content to outerHTML. Use DOM APIs or sanitize with DOMPurify.',
  },
  {
    name: 'document.write',
    regex: /document\.write(?:ln)?\s*\(/,
    severity: 'high',
    cweId: 'CWE-79',
    remediation: 'Avoid document.write entirely. Use DOM manipulation methods (createElement, appendChild) instead.',
  },
  {
    name: 'eval with dynamic input',
    regex: /\beval\s*\(\s*(?!['"])/,
    severity: 'critical' as any,
    cweId: 'CWE-95',
    remediation: 'Never use eval with dynamic input. Use JSON.parse for data, or a safer alternative like a sandboxed interpreter.',
  },
  {
    name: 'Function constructor',
    regex: /new\s+Function\s*\(\s*(?!['"])/,
    severity: 'high',
    cweId: 'CWE-95',
    remediation: 'Avoid the Function constructor with dynamic input. It is equivalent to eval.',
  },
  {
    name: 'dangerouslySetInnerHTML',
    regex: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/,
    severity: 'medium',
    cweId: 'CWE-79',
    remediation: 'Ensure the HTML passed to dangerouslySetInnerHTML is sanitized (e.g., with DOMPurify). Never pass unsanitized user input.',
  },
  {
    name: 'jQuery html() with variable',
    regex: /\$\([^)]+\)\.html\s*\(\s*(?!['"])/,
    severity: 'high',
    cweId: 'CWE-79',
    remediation: 'Use .text() for plain text content, or sanitize HTML before passing to .html().',
  },
];

export class XssDetector implements Detector {
  category: FindingCategory = 'xss';

  detect(filePath: string, _content: string, lines: string[]): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    let findingIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) {
        continue;
      }

      for (const pattern of XSS_PATTERNS) {
        if (pattern.regex.test(line)) {
          findingIndex++;
          findings.push({
            id: `XSS-${findingIndex}`,
            category: 'xss',
            severity: pattern.severity,
            title: pattern.name,
            description: `Potential cross-site scripting (XSS) vulnerability. Dynamic content may be rendered without proper sanitization.`,
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
