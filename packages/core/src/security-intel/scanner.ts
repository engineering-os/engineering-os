import * as fs from 'fs';
import * as path from 'path';
import { SecurityFinding, SecurityScanResult, FindingCategory, Severity, Detector } from '@engineering-os/shared';
import { SecretsDetector, InjectionDetector, XssDetector, ConfigDetector } from './detectors';

const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rb', '.rs',
  '.yaml', '.yml', '.json', '.toml',
  '.env', '.cfg', '.ini', '.conf',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', '.nyc_output', 'vendor', '__pycache__',
  '.eos', '.turbo',
]);

const DEFAULT_EXCLUDE_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\/__tests__\//,
  /\/__fixtures__\//,
  /\/fixtures\//,
  /conventions-store\.[tj]s$/,
];

const INLINE_IGNORE_COMMENT = 'security-scan-ignore';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export interface ScanExcludeConfig {
  patterns?: RegExp[];
  useDefaults?: boolean;
  disableInlineIgnore?: boolean;
}

export class SecurityScanner {
  private rootPath: string;
  private detectors: Detector[];

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.detectors = [
      new SecretsDetector(),
      new InjectionDetector(),
      new XssDetector(),
      new ConfigDetector(),
    ];
  }

  async scan(options?: {
    paths?: string[];
    categories?: FindingCategory[];
    minSeverity?: Severity;
    excludeTestFiles?: boolean;
    excludeExampleStrings?: boolean;
    exclude?: ScanExcludeConfig;
  }): Promise<SecurityScanResult> {
    const start = Date.now();
    const scanId = `scan-${Date.now()}`;

    const excludeConfig = options?.exclude ?? {};
    const useDefaults = excludeConfig.useDefaults !== false;
    const excludePatterns = [
      ...(useDefaults ? DEFAULT_EXCLUDE_PATTERNS : []),
      ...(excludeConfig.patterns ?? []),
    ];
    const enableInlineIgnore = !excludeConfig.disableInlineIgnore;
    const excludeExamples = options?.excludeExampleStrings ?? true;

    let files = this.collectFiles(options?.paths);
    const totalFilesBeforeExclude = files.length;
    files = files.filter((f) => !this.isExcluded(f, excludePatterns));
    const excludedFileCount = totalFilesBeforeExclude - files.length;

    const activeDetectors = options?.categories
      ? this.detectors.filter((d) => options.categories!.includes(d.category))
      : this.detectors;

    const allFindings: SecurityFinding[] = [];

    for (const filePath of files) {
      const content = this.readFileSafe(filePath);
      if (!content) continue;

      const lines = content.split('\n');
      const relativePath = path.relative(this.rootPath, filePath);

      for (const detector of activeDetectors) {
        let findings = detector.detect(relativePath, content, lines);
        if (excludeExamples) {
          findings = findings.filter((f) => !this.isExampleString(lines, f.startLine));
        }
        if (enableInlineIgnore) {
          findings = findings.filter((f) => !this.hasInlineIgnore(lines, f.startLine));
        }
        allFindings.push(...findings);
      }
    }

    let filteredFindings = allFindings;
    if (options?.minSeverity) {
      const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
      const minIndex = severityOrder.indexOf(options.minSeverity);
      filteredFindings = allFindings.filter(
        (f) => severityOrder.indexOf(f.severity) <= minIndex
      );
    }

    // Deduplicate by file+line+category
    const deduped = this.deduplicate(filteredFindings);

    const summary: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const f of deduped) {
      summary[f.severity]++;
    }

    return {
      scanId,
      timestamp: new Date().toISOString(),
      duration: Date.now() - start,
      filesScanned: files.length,
      filesExcluded: excludedFileCount,
      findings: deduped,
      summary,
    };
  }

  private collectFiles(paths?: string[]): string[] {
    const files: string[] = [];
    const roots = paths
      ? paths.map((p) => path.resolve(this.rootPath, p))
      : [this.rootPath];

    for (const root of roots) {
      if (!fs.existsSync(root)) continue;

      const stat = fs.statSync(root);
      if (stat.isFile()) {
        if (this.isScannable(root)) {
          files.push(root);
        }
      } else if (stat.isDirectory()) {
        this.walkDir(root, files);
      }
    }

    return files;
  }

  private walkDir(dir: string, files: string[]): void {
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
        this.walkDir(fullPath, files);
      } else if (entry.isFile() && this.isScannable(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  private isScannable(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);
    return SCANNABLE_EXTENSIONS.has(ext) || basename === '.env';
  }

  private readFileSafe(filePath: string): string | null {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) return null;
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  private isExcluded(filePath: string, patterns: RegExp[]): boolean {
    const relative = path.relative(this.rootPath, filePath);
    return patterns.some((pattern) => pattern.test(relative) || pattern.test(filePath));
  }

  private hasInlineIgnore(lines: string[], lineNumber: number): boolean {
    const line = lines[lineNumber - 1];
    if (line && line.includes(INLINE_IGNORE_COMMENT)) return true;
    const prevLine = lines[lineNumber - 2];
    if (prevLine && prevLine.trim().startsWith('//') && prevLine.includes(INLINE_IGNORE_COMMENT)) return true;
    return false;
  }

  private isExampleString(lines: string[], lineNumber: number): boolean {
    const line = lines[lineNumber - 1];
    if (!line) return false;
    const trimmed = line.trim();
    if (trimmed.startsWith('bad:') || trimmed.startsWith('good:')) return true;
    for (let i = lineNumber - 2; i >= Math.max(0, lineNumber - 5); i--) {
      const ctx = lines[i]?.trim();
      if (ctx === 'examples: [' || ctx === 'examples:' || ctx?.startsWith('bad:') || ctx?.startsWith('good:')) {
        return true;
      }
    }
    return false;
  }

  private deduplicate(findings: SecurityFinding[]): SecurityFinding[] {
    const seen = new Set<string>();
    const result: SecurityFinding[] = [];

    for (const f of findings) {
      const key = `${f.filePath}:${f.startLine}:${f.category}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(f);
      }
    }

    return result.sort((a, b) => {
      const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    });
  }
}
