import { SecurityFinding, Detector, FindingCategory } from '@engineering-os/shared';

interface ConfigPattern {
  name: string;
  regex: RegExp;
  severity: 'high' | 'medium';
  cweId: string;
  remediation: string;
}

const CONFIG_PATTERNS: ConfigPattern[] = [
  {
    name: 'CORS wildcard origin',
    regex: /(?:cors|origin)\s*[:=]\s*['"]?\*/,
    severity: 'medium',
    cweId: 'CWE-942',
    remediation: 'Restrict CORS origins to specific trusted domains instead of using a wildcard.',
  },
  {
    name: 'CORS credentials with wildcard',
    regex: /credentials\s*:\s*true.*origin\s*[:=]\s*['"]?\*|origin\s*[:=]\s*['"]?\*.*credentials\s*:\s*true/,
    severity: 'high',
    cweId: 'CWE-942',
    remediation: 'Never combine credentials: true with a wildcard origin. Specify explicit allowed origins.',
  },
  {
    name: 'Debug mode in production config',
    regex: /(?:debug|DEBUG)\s*[:=]\s*(?:true|1|['"]true['"])/,
    severity: 'medium',
    cweId: 'CWE-489',
    remediation: 'Ensure debug mode is disabled in production configurations. Use environment-specific configs.',
  },
  {
    name: 'Weak hash algorithm (MD5)',
    regex: /(?:createHash|crypto\.hash)\s*\(\s*['"]md5['"]/i,
    severity: 'high',
    cweId: 'CWE-328',
    remediation: 'Use SHA-256 or stronger for hashing. MD5 is cryptographically broken.',
  },
  {
    name: 'Weak hash for passwords (SHA1/MD5)',
    regex: /(?:password|passwd).*(?:md5|sha1)|(?:md5|sha1).*(?:password|passwd)/i,
    severity: 'high',
    cweId: 'CWE-916',
    remediation: 'Use bcrypt, scrypt, or argon2 for password hashing. Never use MD5 or SHA1 for passwords.',
  },
  {
    name: 'Disabled TLS verification',
    regex: /(?:rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED)\s*[:=]\s*(?:false|0|['"]0['"])/,
    severity: 'high',
    cweId: 'CWE-295',
    remediation: 'Never disable TLS certificate verification in production. Fix the certificate chain instead.',
  },
  {
    name: 'Hardcoded HTTP (not HTTPS)',
    regex: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"]+['"]/,
    severity: 'medium',
    cweId: 'CWE-319',
    remediation: 'Use HTTPS for all non-local connections to prevent man-in-the-middle attacks.',
  },
  {
    name: 'Disabled CSRF protection',
    regex: /csrf\s*[:=]\s*(?:false|disabled)|(?:disable|skip).*csrf/i,
    severity: 'high',
    cweId: 'CWE-352',
    remediation: 'Enable CSRF protection for all state-changing operations. Use anti-CSRF tokens.',
  },
];

export class ConfigDetector implements Detector {
  category: FindingCategory = 'insecure-config';

  detect(filePath: string, _content: string, lines: string[]): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    let findingIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('#')) {
        continue;
      }

      for (const pattern of CONFIG_PATTERNS) {
        if (pattern.regex.test(line)) {
          findingIndex++;
          findings.push({
            id: `CFG-${findingIndex}`,
            category: 'insecure-config',
            severity: pattern.severity,
            title: pattern.name,
            description: `Insecure configuration detected: ${pattern.name.toLowerCase()}.`,
            filePath,
            startLine: i + 1,
            endLine: i + 1,
            snippet: line.trim().slice(0, 120),
            remediation: pattern.remediation,
            cweId: pattern.cweId,
            owaspCategory: 'A05:2021-Security Misconfiguration',
            confidence: 'high',
          });
          break;
        }
      }
    }

    return findings;
  }
}
