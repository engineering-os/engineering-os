import * as fs from 'fs';
import * as path from 'path';
import { SecurityConvention } from '@engineering-os/shared';
import { safeYamlLoad, safeYamlDump } from '../security';

const DEFAULT_CONVENTIONS: SecurityConvention[] = [
  {
    id: 'SEC-001',
    category: 'input-validation',
    rule: 'Always validate and sanitize user input before use',
    description: 'Never trust user input. Validate type, length, range, and format before passing to any sink.',
    language: 'typescript',
    severity: 'critical',
    examples: [
      {
        bad: "db.query(`SELECT * FROM users WHERE name = '${req.body.name}'`)",
        good: "db.query('SELECT * FROM users WHERE name = ?', [req.body.name])",
      },
    ],
    references: ['CWE-20', 'OWASP A03:2021'],
  },
  {
    id: 'SEC-002',
    category: 'secrets',
    rule: 'All secrets must come from environment variables or a secrets manager',
    description: 'Never hardcode API keys, tokens, passwords, or connection strings in source code.',
    language: 'any',
    severity: 'critical',
    examples: [
      {
        bad: "const apiKey = 'sk_live_abc123...'",
        good: "const apiKey = process.env.API_KEY",
      },
    ],
    references: ['CWE-798', 'OWASP A02:2021'],
  },
  {
    id: 'SEC-003',
    category: 'auth',
    rule: 'All non-public endpoints must have auth middleware',
    description: 'Every route that returns user-specific data or modifies state must verify authentication.',
    language: 'typescript',
    severity: 'high',
    examples: [
      {
        bad: "router.get('/users/:id', getUser)",
        good: "router.get('/users/:id', authMiddleware, getUser)",
      },
    ],
    references: ['CWE-306', 'OWASP A07:2021'],
  },
  {
    id: 'SEC-004',
    category: 'crypto',
    rule: 'Use strong hashing algorithms for passwords',
    description: 'Use bcrypt, scrypt, or argon2 for password hashing. Never use MD5 or SHA1.',
    language: 'any',
    severity: 'high',
    examples: [
      {
        bad: "crypto.createHash('md5').update(password).digest('hex')",
        good: "await bcrypt.hash(password, 12)",
      },
    ],
    references: ['CWE-916', 'OWASP A02:2021'],
  },
  {
    id: 'SEC-005',
    category: 'logging',
    rule: 'Never log sensitive data (PII, secrets, tokens)',
    description: 'Avoid logging email addresses, phone numbers, SSNs, passwords, or auth tokens.',
    language: 'any',
    severity: 'medium',
    examples: [
      {
        bad: "logger.info('User login', { email: user.email, token: user.sessionToken })",
        good: "logger.info('User login', { userId: user.id })",
      },
    ],
    references: ['CWE-532', 'OWASP A09:2021'],
  },
  {
    id: 'SEC-006',
    category: 'config',
    rule: 'Configure CORS with explicit allowed origins',
    description: 'Never use wildcard CORS in production. Specify exact trusted origins.',
    language: 'any',
    severity: 'medium',
    examples: [
      {
        bad: "cors({ origin: '*' })",
        good: "cors({ origin: ['https://app.example.com'] })",
      },
    ],
    references: ['CWE-942', 'OWASP A05:2021'],
  },
];

export class SecurityConventionsStore {
  private conventionsPath: string;

  constructor(knowledgePath: string) {
    this.conventionsPath = path.join(knowledgePath, 'security', 'conventions.yaml');
  }

  async getConventions(options?: { language?: string; category?: string }): Promise<SecurityConvention[]> {
    let conventions = await this.load();

    if (options?.language) {
      conventions = conventions.filter(
        (c) => c.language === options.language || c.language === 'any'
      );
    }
    if (options?.category) {
      conventions = conventions.filter((c) => c.category === options.category);
    }

    return conventions;
  }

  async addConvention(convention: SecurityConvention): Promise<void> {
    const conventions = await this.load();
    const existing = conventions.findIndex((c) => c.id === convention.id);
    if (existing >= 0) {
      conventions[existing] = convention;
    } else {
      conventions.push(convention);
    }
    await this.save(conventions);
  }

  async seed(): Promise<void> {
    if (!fs.existsSync(this.conventionsPath)) {
      const dir = path.dirname(this.conventionsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      await this.save(DEFAULT_CONVENTIONS);
    }
  }

  private async load(): Promise<SecurityConvention[]> {
    if (!fs.existsSync(this.conventionsPath)) {
      return DEFAULT_CONVENTIONS;
    }

    const content = fs.readFileSync(this.conventionsPath, 'utf-8');
    const data = safeYamlLoad(content) as { conventions?: SecurityConvention[] };
    return data?.conventions || DEFAULT_CONVENTIONS;
  }

  private async save(conventions: SecurityConvention[]): Promise<void> {
    const content = safeYamlDump({ conventions });
    fs.writeFileSync(this.conventionsPath, content, 'utf-8');
  }
}
