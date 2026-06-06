import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecutionPlan, TaskNode } from './planner';

export interface ValidationResult {
  passed: boolean;
  checks: { name: string; passed: boolean; details: string }[];
  coverage: number;
}

export class Validator {
  constructor(private rootPath: string) {}

  /**
   * Validate implementation against the execution plan.
   */
  async validate(featureSlug: string, plan: ExecutionPlan): Promise<ValidationResult> {
    const checks: { name: string; passed: boolean; details: string }[] = [];

    // Check file existence
    const fileChecks = await this.checkFileExistence(plan.tasks);
    checks.push(...fileChecks);

    // Check tests exist
    const testCheck = await this.checkTestsExist(plan.tasks);
    checks.push(testCheck);

    // Check plan.json exists
    const planPath = path.join(this.rootPath, '.eos', 'features', featureSlug, 'plan.json');
    try {
      await fs.access(planPath);
      checks.push({ name: 'Plan file exists', passed: true, details: `Found at ${planPath}` });
    } catch {
      checks.push({ name: 'Plan file exists', passed: false, details: `Missing: ${planPath}` });
    }

    const passedCount = checks.filter((c) => c.passed).length;
    const coverage = checks.length > 0 ? passedCount / checks.length : 0;

    return {
      passed: checks.every((c) => c.passed),
      checks,
      coverage: Math.round(coverage * 100) / 100,
    };
  }

  /**
   * Check if expected implementation files exist based on task types.
   */
  private async checkFileExistence(tasks: TaskNode[]): Promise<{ name: string; passed: boolean; details: string }[]> {
    const checks: { name: string; passed: boolean; details: string }[] = [];

    // Look for common file patterns based on task types
    const patterns: { type: string; dirs: string[]; extensions: string[] }[] = [
      { type: 'backend', dirs: ['src', 'lib', 'server', 'api'], extensions: ['.ts', '.js', '.java', '.py'] },
      { type: 'frontend', dirs: ['src', 'app', 'components', 'pages'], extensions: ['.tsx', '.jsx', '.vue', '.svelte'] },
      { type: 'test', dirs: ['test', 'tests', '__tests__', 'spec'], extensions: ['.test.ts', '.spec.ts', '.test.js', '.spec.js'] },
    ];

    for (const task of tasks) {
      if (task.type === 'infra') continue; // Skip infra checks for now

      const matchingPatterns = patterns.filter(
        (p) => p.type === task.type || (task.type === 'fullstack' && ['backend', 'frontend'].includes(p.type))
      );

      let found = false;
      for (const pattern of matchingPatterns) {
        for (const dir of pattern.dirs) {
          const dirPath = path.join(this.rootPath, dir);
          try {
            await fs.access(dirPath);
            found = true;
            break;
          } catch {
            // Directory doesn't exist
          }
        }
        if (found) break;
      }

      checks.push({
        name: `Source directory exists for task: ${task.title}`,
        passed: found,
        details: found
          ? `Found source directory for ${task.type} task`
          : `No matching source directory found for ${task.type} task (expected one of: ${matchingPatterns.flatMap((p) => p.dirs).join(', ')})`,
      });
    }

    return checks;
  }

  /**
   * Check if test files exist for implementation tasks.
   */
  private async checkTestsExist(tasks: TaskNode[]): Promise<{ name: string; passed: boolean; details: string }> {
    const testDirs = ['test', 'tests', '__tests__', 'spec', 'src/__tests__'];
    let testDirFound = false;
    let testFilesFound = 0;

    for (const dir of testDirs) {
      const dirPath = path.join(this.rootPath, dir);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          testDirFound = true;
          const files = await this.findFilesRecursive(dirPath, /\.(test|spec)\.(ts|js|tsx|jsx)$/);
          testFilesFound += files.length;
        }
      } catch {
        // Directory doesn't exist
      }
    }

    // Also check for test files alongside source (co-located tests)
    try {
      const srcPath = path.join(this.rootPath, 'src');
      const colocatedTests = await this.findFilesRecursive(srcPath, /\.(test|spec)\.(ts|js|tsx|jsx)$/);
      testFilesFound += colocatedTests.length;
      if (colocatedTests.length > 0) testDirFound = true;
    } catch {
      // src doesn't exist
    }

    const hasTestableTasks = tasks.some((t) => t.type !== 'infra' && t.type !== 'test');

    if (!hasTestableTasks) {
      return { name: 'Tests exist', passed: true, details: 'No testable tasks in plan' };
    }

    return {
      name: 'Tests exist',
      passed: testDirFound && testFilesFound > 0,
      details: testDirFound
        ? `Found ${testFilesFound} test file(s)`
        : 'No test directory or test files found',
    };
  }

  /**
   * Recursively find files matching a pattern.
   */
  private async findFilesRecursive(dir: string, pattern: RegExp): Promise<string[]> {
    const results: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subResults = await this.findFilesRecursive(fullPath, pattern);
          results.push(...subResults);
        } else if (entry.isFile() && pattern.test(entry.name)) {
          results.push(fullPath);
        }
      }
    } catch {
      // Permission denied or other error
    }

    return results;
  }
}
