import { SecurityFinding, Detector, FindingCategory } from '@engineering-os/shared';
import { isHighEntropy } from '../entropy';

interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high' | 'medium';
  cweId: string;
  confidence: 'high' | 'medium';
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'AWS Access Key',
    regex: /AKIA[0-9A-Z]{16}/,
    severity: 'critical',
    cweId: 'CWE-798',
    confidence: 'high',
  },
  {
    name: 'GitHub Token',
    regex: /gh[ps]_[A-Za-z0-9_]{36,}/,
    severity: 'critical',
    cweId: 'CWE-798',
    confidence: 'high',
  },
  {
    name: 'Private Key',
    regex: /-----BEGIN (?:RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/,
    severity: 'critical',
    cweId: 'CWE-321',
    confidence: 'high',
  },
  {
    name: 'JWT Token',
    regex: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/,
    severity: 'high',
    cweId: 'CWE-798',
    confidence: 'high',
  },
  {
    name: 'Connection String',
    regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/,
    severity: 'critical',
    cweId: 'CWE-798',
    confidence: 'high',
  },
  {
    name: 'Generic Secret Assignment',
    regex: /(?:password|secret|apiKey|api_key|token|private_key)\s*[:=]\s*['"][^'"$\s]{8,}['"]/i,
    severity: 'high',
    cweId: 'CWE-798',
    confidence: 'medium',
  },
  {
    name: 'Slack Token',
    regex: /xox[baprs]-[0-9a-zA-Z-]{10,}/,
    severity: 'critical',
    cweId: 'CWE-798',
    confidence: 'high',
  },
  {
    name: 'Stripe Key',
    regex: /(?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{24,}/,
    severity: 'critical',
    cweId: 'CWE-798',
    confidence: 'high',
  },
];

const IGNORE_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /__tests__\//,
  /fixtures?\//,
  /mock/i,
  /example/i,
];

export class SecretsDetector implements Detector {
  category: FindingCategory = 'secret';

  detect(filePath: string, content: string, lines: string[]): SecurityFinding[] {
    if (IGNORE_PATTERNS.some((p) => p.test(filePath))) {
      return [];
    }

    const findings: SecurityFinding[] = [];
    let findingIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#') || line.trimStart().startsWith('*')) {
        continue;
      }

      for (const pattern of SECRET_PATTERNS) {
        const match = pattern.regex.exec(line);
        if (match) {
          findingIndex++;
          findings.push({
            id: `SEC-${findingIndex}`,
            category: 'secret',
            severity: pattern.severity,
            title: `Hardcoded ${pattern.name}`,
            description: `Detected a hardcoded ${pattern.name.toLowerCase()} that should be stored in environment variables or a secrets manager.`,
            filePath,
            startLine: i + 1,
            endLine: i + 1,
            snippet: line.trim().slice(0, 120),
            remediation: `Move this ${pattern.name.toLowerCase()} to an environment variable or secrets manager. Never commit secrets to source control.`,
            cweId: pattern.cweId,
            owaspCategory: 'A02:2021-Cryptographic Failures',
            confidence: pattern.confidence,
          });
          break;
        }
      }

      // High-entropy string detection (only for assignment-like patterns)
      const assignMatch = /(?:=|:)\s*['"]([A-Za-z0-9+/=_-]{20,})['"]/.exec(line);
      if (assignMatch && !findings.some((f) => f.startLine === i + 1)) {
        const candidate = assignMatch[1];
        if (isHighEntropy(candidate)) {
          findingIndex++;
          findings.push({
            id: `SEC-${findingIndex}`,
            category: 'secret',
            severity: 'medium',
            title: 'High-entropy string (potential secret)',
            description: 'A high-entropy string was detected in an assignment. This may be a secret, API key, or encoded credential.',
            filePath,
            startLine: i + 1,
            endLine: i + 1,
            snippet: line.trim().slice(0, 120),
            remediation: 'If this is a secret, move it to an environment variable. If it is a non-sensitive constant (e.g., a hash or UUID), consider adding a comment explaining its purpose.',
            cweId: 'CWE-798',
            owaspCategory: 'A02:2021-Cryptographic Failures',
            confidence: 'low',
          });
        }
      }
    }

    return findings;
  }
}
