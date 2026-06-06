import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export type ComplianceFramework = 'soc2' | 'hipaa' | 'pci-dss';

export interface ComplianceRule {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  check: ComplianceCheck;
  remediation: string;
  trustCriteria?: string;
  regulation?: string;
  requirement?: string;
}

export type ComplianceCheck =
  | { type: 'pattern-match'; filePattern: string; pattern: string }
  | { type: 'pattern-absent'; filePattern: string; pattern: string; exemptPattern?: string }
  | { type: 'pattern-match-any'; filePattern: string; patterns: string[] }
  | { type: 'file-check'; filePath?: string; filePattern?: string; exists: boolean; contentPattern?: string; minMatches?: number };

export interface ComplianceResult {
  framework: string;
  version: string;
  timestamp: string;
  rootPath: string;
  totalRules: number;
  passed: number;
  failed: number;
  skipped: number;
  score: number;
  findings: ComplianceFinding[];
}

export interface ComplianceFinding {
  ruleId: string;
  title: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'pass' | 'fail' | 'skip';
  details: string;
  remediation: string;
  reference?: string;
}

interface FrameworkDefinition {
  name: string;
  version: string;
  description: string;
  rules: any[];
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '.nyc_output', 'vendor', '__pycache__',
  '.eos', '.turbo',
]);

export class ComplianceChecker {
  private frameworksDir: string;

  constructor(private rootPath: string, frameworksDir?: string) {
    this.frameworksDir = frameworksDir || path.join(__dirname, 'frameworks');
  }

  getAvailableFrameworks(): ComplianceFramework[] {
    try {
      const files = fs.readdirSync(this.frameworksDir);
      return files
        .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
        .map((f) => path.basename(f, path.extname(f)) as ComplianceFramework);
    } catch {
      return [];
    }
  }

  async check(framework: ComplianceFramework): Promise<ComplianceResult> {
    const definition = this.loadFramework(framework);
    if (!definition) {
      return {
        framework,
        version: 'unknown',
        timestamp: new Date().toISOString(),
        rootPath: this.rootPath,
        totalRules: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        score: 0,
        findings: [{ ruleId: 'LOAD_ERROR', title: 'Framework not found', category: 'system', severity: 'critical', status: 'skip', details: `Framework "${framework}" could not be loaded.`, remediation: 'Ensure the framework YAML file exists.' }],
      };
    }

    const findings: ComplianceFinding[] = [];

    for (const rawRule of definition.rules) {
      const rule = rawRule as ComplianceRule;
      const finding = this.evaluateRule(rule);
      findings.push(finding);
    }

    const passed = findings.filter((f) => f.status === 'pass').length;
    const failed = findings.filter((f) => f.status === 'fail').length;
    const skipped = findings.filter((f) => f.status === 'skip').length;
    const total = findings.length;
    const score = total > 0 ? Math.round((passed / (total - skipped || 1)) * 100) : 0;

    return {
      framework: definition.name,
      version: definition.version,
      timestamp: new Date().toISOString(),
      rootPath: this.rootPath,
      totalRules: total,
      passed,
      failed,
      skipped,
      score,
      findings,
    };
  }

  private loadFramework(framework: ComplianceFramework): FrameworkDefinition | null {
    const filePath = path.join(this.frameworksDir, `${framework}.yaml`);
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return yaml.load(content) as FrameworkDefinition;
    } catch {
      return null;
    }
  }

  private evaluateRule(rule: ComplianceRule): ComplianceFinding {
    const reference = rule.trustCriteria || rule.regulation || rule.requirement;
    const baseFinding: Omit<ComplianceFinding, 'status' | 'details'> = {
      ruleId: rule.id,
      title: rule.title,
      category: rule.category,
      severity: rule.severity,
      remediation: rule.remediation,
      reference,
    };

    try {
      switch (rule.check.type) {
        case 'pattern-match':
          return this.checkPatternMatch(rule.check, baseFinding);
        case 'pattern-absent':
          return this.checkPatternAbsent(rule.check, baseFinding);
        case 'pattern-match-any':
          return this.checkPatternMatchAny(rule.check, baseFinding);
        case 'file-check':
          return this.checkFileExists(rule.check, baseFinding);
        default:
          return { ...baseFinding, status: 'skip', details: 'Unknown check type' };
      }
    } catch {
      return { ...baseFinding, status: 'skip', details: 'Error evaluating rule' };
    }
  }

  private checkPatternMatch(
    check: { type: 'pattern-match'; filePattern: string; pattern: string },
    base: Omit<ComplianceFinding, 'status' | 'details'>
  ): ComplianceFinding {
    const files = this.findFiles(check.filePattern);
    const regex = new RegExp(check.pattern, 'i');
    const matches: string[] = [];

    for (const file of files) {
      const content = this.readSafe(file);
      if (content && regex.test(content)) {
        matches.push(path.relative(this.rootPath, file));
      }
    }

    if (matches.length > 0) {
      return { ...base, status: 'fail', details: `Pattern found in: ${matches.slice(0, 5).join(', ')}${matches.length > 5 ? ` (+${matches.length - 5} more)` : ''}` };
    }
    return { ...base, status: 'pass', details: 'No violations detected' };
  }

  private checkPatternAbsent(
    check: { type: 'pattern-absent'; filePattern: string; pattern: string; exemptPattern?: string },
    base: Omit<ComplianceFinding, 'status' | 'details'>
  ): ComplianceFinding {
    const files = this.findFiles(check.filePattern);
    if (files.length === 0) {
      return { ...base, status: 'skip', details: 'No matching files found' };
    }

    const regex = new RegExp(check.pattern, 'i');
    const exemptRegex = check.exemptPattern ? new RegExp(check.exemptPattern, 'i') : null;
    const violations: string[] = [];

    for (const file of files) {
      const content = this.readSafe(file);
      if (!content) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i]) && (!exemptRegex || !exemptRegex.test(content))) {
          violations.push(`${path.relative(this.rootPath, file)}:${i + 1}`);
          break;
        }
      }
    }

    if (violations.length > 0) {
      return { ...base, status: 'fail', details: `Missing controls in: ${violations.slice(0, 5).join(', ')}${violations.length > 5 ? ` (+${violations.length - 5} more)` : ''}` };
    }
    return { ...base, status: 'pass', details: 'Controls present in all relevant files' };
  }

  private checkPatternMatchAny(
    check: { type: 'pattern-match-any'; filePattern: string; patterns: string[] },
    base: Omit<ComplianceFinding, 'status' | 'details'>
  ): ComplianceFinding {
    const files = this.findFiles(check.filePattern);
    if (files.length === 0) {
      return { ...base, status: 'skip', details: 'No matching files found' };
    }

    for (const file of files) {
      const content = this.readSafe(file);
      if (!content) continue;
      for (const pattern of check.patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(content)) {
          return { ...base, status: 'pass', details: `Control detected in ${path.relative(this.rootPath, file)}` };
        }
      }
    }

    return { ...base, status: 'fail', details: 'Required pattern not found in any scanned file' };
  }

  private checkFileExists(
    check: { type: 'file-check'; filePath?: string; filePattern?: string; exists: boolean; contentPattern?: string; minMatches?: number },
    base: Omit<ComplianceFinding, 'status' | 'details'>
  ): ComplianceFinding {
    if (check.filePath) {
      const paths = check.filePath.split(',').map((p) => p.trim());
      for (const p of paths) {
        const resolved = this.resolveGlob(p);
        if (resolved.length > 0) {
          if (check.contentPattern) {
            const regex = new RegExp(check.contentPattern, 'i');
            let matchCount = 0;
            for (const file of resolved) {
              const content = this.readSafe(file);
              if (content && regex.test(content)) matchCount++;
            }
            if (matchCount >= (check.minMatches || 1)) {
              return { ...base, status: 'pass', details: `Found in ${resolved[0]}` };
            }
          } else {
            return { ...base, status: check.exists ? 'pass' : 'fail', details: `File found: ${path.relative(this.rootPath, resolved[0])}` };
          }
        }
      }
      return { ...base, status: check.exists ? 'fail' : 'pass', details: `Required file(s) not found: ${check.filePath}` };
    }

    if (check.filePattern && check.contentPattern) {
      const files = this.findFiles(check.filePattern);
      const regex = new RegExp(check.contentPattern, 'i');
      let matchCount = 0;
      for (const file of files) {
        const content = this.readSafe(file);
        if (content && regex.test(content)) matchCount++;
      }
      const needed = check.minMatches || 1;
      if (matchCount >= needed) {
        return { ...base, status: 'pass', details: `Pattern found in ${matchCount} file(s)` };
      }
      return { ...base, status: 'fail', details: `Pattern found in ${matchCount} file(s), need at least ${needed}` };
    }

    return { ...base, status: 'skip', details: 'Incomplete file-check configuration' };
  }

  private findFiles(filePattern: string): string[] {
    const extensions = filePattern.split(',').map((p) => p.trim().replace('*', ''));
    const files: string[] = [];
    this.walkDir(this.rootPath, files, extensions);
    return files;
  }

  private walkDir(dir: string, files: string[], extensions: string[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, files, extensions);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.some((e) => ext === e || entry.name.endsWith(e.replace('.', '')))) {
          files.push(fullPath);
        }
      }
    }
  }

  private resolveGlob(pattern: string): string[] {
    if (pattern.includes('*')) {
      const parts = pattern.split('*');
      const dir = path.join(this.rootPath, parts[0]);
      if (!fs.existsSync(dir)) return [];
      try {
        const dirPath = path.dirname(path.join(this.rootPath, pattern));
        if (!fs.existsSync(dirPath)) return [];
        const entries = fs.readdirSync(dirPath);
        const suffix = parts[parts.length - 1];
        return entries
          .filter((e) => e.endsWith(suffix))
          .map((e) => path.join(dirPath, e));
      } catch {
        return [];
      }
    }
    const resolved = path.join(this.rootPath, pattern);
    return fs.existsSync(resolved) ? [resolved] : [];
  }

  private readSafe(filePath: string): string | null {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 1024 * 1024) return null;
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
