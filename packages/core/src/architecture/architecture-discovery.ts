import { ServiceModel, Pattern, Convention } from '@engineering-os/shared';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ServiceManifest {
  path: string;
  type: string;
}

interface StructureAnalysis {
  name: string;
  type: string;
  files: string[];
}

export class ArchitectureDiscovery {
  constructor(private rootPath: string) {}

  /**
   * Scan repo and discover services/modules.
   */
  async discoverServices(): Promise<ServiceModel[]> {
    const services: ServiceModel[] = [];

    // Strategy 1: Find sub-packages (package.json, go.mod, etc.)
    const manifests = await this.findServiceManifests();
    for (const manifest of manifests) {
      const serviceDir = path.dirname(manifest.path);
      const serviceName = path.basename(serviceDir);

      let description = '';
      let dependencies: string[] = [];

      if (manifest.type === 'node') {
        try {
          const pkgContent = await fs.readFile(manifest.path, 'utf-8');
          const pkg = JSON.parse(pkgContent);
          description = pkg.description || '';
          dependencies = Object.keys(pkg.dependencies || {});
        } catch {
          // ignore parse errors
        }
      }

      services.push({
        name: serviceName,
        description,
        owners: [],
        publicApis: [],
        dependencies,
        patterns: [],
        criticality: 'medium',
      });
    }

    // Strategy 2: Discover from src/ directory structure (modules, features, screens)
    const srcModules = await this.discoverSrcModules();
    for (const mod of srcModules) {
      if (!services.find(s => s.name === mod.name)) {
        services.push(mod);
      }
    }

    return services;
  }

  private async discoverSrcModules(): Promise<ServiceModel[]> {
    const modules: ServiceModel[] = [];
    const srcPath = path.join(this.rootPath, 'src');

    const moduleContainers = ['modules', 'features', 'screens', 'pages', 'domains', 'apps'];
    const sharedContainers = ['services', 'hooks', 'components', 'stores', 'contexts', 'providers', 'utility', 'utils', 'lib', 'core'];

    for (const container of moduleContainers) {
      const containerPath = path.join(srcPath, container);
      const entries = await this.safeReadDir(containerPath);

      for (const entry of entries) {
        const entryPath = path.join(containerPath, entry);
        const stat = await fs.stat(entryPath).catch(() => null);
        if (!stat || !stat.isDirectory()) continue;

        const files = await this.safeReadDir(entryPath);
        const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

        modules.push({
          name: entry,
          description: `${container.slice(0, -1)} handling ${entry} functionality`,
          owners: [],
          publicApis: this.inferApisFromFiles(files),
          dependencies: [],
          patterns: this.inferPatternsFromFiles(files),
          criticality: this.inferCriticality(entry),
        });
      }
    }

    // Discover shared layers (services, hooks, etc.) as supporting modules
    for (const container of sharedContainers) {
      const containerPath = path.join(srcPath, container);
      const entries = await this.safeReadDir(containerPath);
      if (entries.length === 0) continue;

      const tsFiles = entries.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
      if (tsFiles.length > 0 || entries.some(e => !e.includes('.'))) {
        modules.push({
          name: `shared-${container}`,
          description: `Shared ${container} layer (${entries.length} items)`,
          owners: [],
          publicApis: tsFiles.slice(0, 5).map(f => f.replace(/\.(ts|tsx)$/, '')),
          dependencies: [],
          patterns: [],
          criticality: container === 'services' || container === 'core' ? 'high' : 'medium',
        });
      }
    }

    return modules;
  }

  private inferApisFromFiles(files: string[]): string[] {
    return files
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter(f => !f.includes('.test.') && !f.includes('.spec.') && !f.includes('.interface.'))
      .slice(0, 5)
      .map(f => f.replace(/\.(ts|tsx)$/, ''));
  }

  private inferPatternsFromFiles(files: string[]): string[] {
    const patterns: string[] = [];
    if (files.some(f => f.includes('.store.'))) patterns.push('state-management');
    if (files.some(f => f.startsWith('use') || f.includes('/hooks/'))) patterns.push('custom-hooks');
    if (files.some(f => f.includes('.service.'))) patterns.push('service-layer');
    if (files.some(f => f.includes('.interface.'))) patterns.push('interface-contracts');
    if (files.some(f => f.includes('components'))) patterns.push('component-composition');
    return patterns;
  }

  private inferCriticality(moduleName: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalModules = ['login', 'auth', 'payment', 'checkout', 'security'];
    const highModules = ['home', 'profile', 'settings', 'navigation'];
    const name = moduleName.toLowerCase();
    if (criticalModules.some(c => name.includes(c))) return 'critical';
    if (highModules.some(h => name.includes(h))) return 'high';
    return 'medium';
  }

  /**
   * Discover patterns from code structure.
   */
  async discoverPatterns(): Promise<Pattern[]> {
    const patterns: Pattern[] = [];
    const filePatterns = await this.scanForFilePatterns();

    // Detect controller/service/repository pattern
    if (
      filePatterns.has('controller') &&
      filePatterns.has('service') &&
      filePatterns.has('repository')
    ) {
      patterns.push({
        name: 'layered-architecture',
        description:
          'Controller → Service → Repository layered architecture pattern detected',
        files: [
          ...Array.from(filePatterns.get('controller') || []).slice(0, 3),
        ],
        usage: 'backend',
      });
    }

    // Detect component pattern (React/Vue)
    if (filePatterns.has('component')) {
      patterns.push({
        name: 'component-based',
        description: 'Component-based architecture pattern detected',
        files: [
          ...Array.from(filePatterns.get('component') || []).slice(0, 3),
        ],
        usage: 'frontend',
      });
    }

    // Detect hooks pattern
    if (filePatterns.has('hook')) {
      patterns.push({
        name: 'custom-hooks',
        description: 'Custom hooks pattern for shared logic',
        files: [
          ...Array.from(filePatterns.get('hook') || []).slice(0, 3),
        ],
        usage: 'frontend',
      });
    }

    // Detect middleware pattern
    if (filePatterns.has('middleware')) {
      patterns.push({
        name: 'middleware',
        description: 'Middleware pattern for request processing pipeline',
        files: [
          ...Array.from(filePatterns.get('middleware') || []).slice(0, 3),
        ],
        usage: 'backend',
      });
    }

    // Detect module pattern (NestJS / Angular style)
    if (filePatterns.has('module')) {
      patterns.push({
        name: 'modular-architecture',
        description: 'Module-based architecture (NestJS/Angular style)',
        files: [
          ...Array.from(filePatterns.get('module') || []).slice(0, 3),
        ],
        usage: 'backend',
      });
    }

    // Detect store pattern (Zustand/Redux/MobX)
    if (filePatterns.has('store')) {
      patterns.push({
        name: 'state-stores',
        description: 'State management via store pattern (Zustand/Redux/MobX)',
        files: [
          ...Array.from(filePatterns.get('store') || []).slice(0, 3),
        ],
        usage: 'frontend',
      });
    }

    // Detect service layer pattern
    if (filePatterns.has('service') && !filePatterns.has('controller')) {
      patterns.push({
        name: 'service-layer',
        description: 'Service layer for business logic and API communication',
        files: [
          ...Array.from(filePatterns.get('service') || []).slice(0, 3),
        ],
        usage: 'frontend',
      });
    }

    // Detect interface/contract pattern
    if (filePatterns.has('interface')) {
      patterns.push({
        name: 'interface-contracts',
        description: 'Explicit interface contracts for type safety',
        files: [
          ...Array.from(filePatterns.get('interface') || []).slice(0, 3),
        ],
        usage: 'frontend',
      });
    }

    return patterns;
  }

  /**
   * Infer conventions from existing code.
   */
  async inferConventions(): Promise<Convention[]> {
    const conventions: Convention[] = [];

    // Detect file naming convention
    const namingConvention = await this.detectNamingConvention();
    if (namingConvention) {
      conventions.push({
        name: 'file-naming',
        description: `Files use ${namingConvention} naming convention`,
        rule: namingConvention,
        examples: [],
      } as Convention);
    }

    // Detect test file location
    const testLocation = await this.detectTestLocation();
    if (testLocation) {
      conventions.push({
        name: 'test-location',
        description: `Test files are located ${testLocation}`,
        rule: testLocation,
        examples: [],
      } as Convention);
    }

    // Detect export style
    const exportStyle = await this.detectExportStyle();
    if (exportStyle) {
      conventions.push({
        name: 'export-style',
        description: `Modules use ${exportStyle} exports`,
        rule: exportStyle,
        examples: [],
      } as Convention);
    }

    return conventions;
  }

  /**
   * Detect project type (monorepo, backend, frontend, fullstack).
   */
  async detectProjectType(): Promise<string> {
    const rootFiles = await this.safeReadDir(this.rootPath);

    // Check for monorepo indicators
    const hasWorkspaces =
      rootFiles.includes('lerna.json') ||
      rootFiles.includes('pnpm-workspace.yaml') ||
      rootFiles.includes('nx.json') ||
      rootFiles.includes('turbo.json');

    if (hasWorkspaces || rootFiles.includes('packages')) {
      return 'monorepo';
    }

    // Check for frontend indicators
    const frontendIndicators = [
      'next.config.js',
      'next.config.mjs',
      'vite.config.ts',
      'angular.json',
      'vue.config.js',
      'expo.json',
      'app.json',
    ];
    const hasFrontend = frontendIndicators.some((f) => rootFiles.includes(f));

    // Check for backend indicators
    const backendIndicators = [
      'pom.xml',
      'build.gradle',
      'go.mod',
      'Cargo.toml',
      'requirements.txt',
      'Pipfile',
    ];
    const hasBackend = backendIndicators.some((f) => rootFiles.includes(f));

    // Check package.json for hints
    if (rootFiles.includes('package.json')) {
      try {
        const pkgContent = await fs.readFile(
          path.join(this.rootPath, 'package.json'),
          'utf-8'
        );
        const pkg = JSON.parse(pkgContent);
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        if (allDeps['express'] || allDeps['fastify'] || allDeps['nestjs'] || allDeps['@nestjs/core']) {
          if (hasFrontend) return 'fullstack';
          return 'backend';
        }

        if (allDeps['react'] || allDeps['vue'] || allDeps['@angular/core'] || allDeps['svelte']) {
          if (hasBackend) return 'fullstack';
          return 'frontend';
        }
      } catch {
        // ignore
      }
    }

    if (hasFrontend && hasBackend) return 'fullstack';
    if (hasFrontend) return 'frontend';
    if (hasBackend) return 'backend';

    return 'unknown';
  }

  /**
   * Find package.json / pom.xml / go.mod etc to identify services.
   */
  private async findServiceManifests(): Promise<ServiceManifest[]> {
    const manifests: ServiceManifest[] = [];
    await this.walkForManifests(this.rootPath, manifests, 0);
    return manifests;
  }

  private async walkForManifests(
    dir: string,
    manifests: ServiceManifest[],
    depth: number
  ): Promise<void> {
    if (depth > 4) return; // Don't go too deep

    const entries = await this.safeReadDir(dir);
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'target', 'vendor'];

    for (const entry of entries) {
      if (skipDirs.includes(entry)) continue;

      const fullPath = path.join(dir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat) continue;

      if (stat.isFile()) {
        if (entry === 'package.json' && depth > 0) {
          manifests.push({ path: fullPath, type: 'node' });
        } else if (entry === 'go.mod') {
          manifests.push({ path: fullPath, type: 'go' });
        } else if (entry === 'pom.xml') {
          manifests.push({ path: fullPath, type: 'java' });
        } else if (entry === 'Cargo.toml' && depth > 0) {
          manifests.push({ path: fullPath, type: 'rust' });
        } else if (entry === 'requirements.txt' || entry === 'pyproject.toml') {
          manifests.push({ path: fullPath, type: 'python' });
        }
      } else if (stat.isDirectory()) {
        await this.walkForManifests(fullPath, manifests, depth + 1);
      }
    }
  }

  /**
   * Analyze directory structure for service boundaries.
   */
  private async analyzeStructure(
    dir: string
  ): Promise<StructureAnalysis[]> {
    const results: StructureAnalysis[] = [];
    const entries = await this.safeReadDir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat || !stat.isDirectory()) continue;
      if (['node_modules', '.git', 'dist', 'build'].includes(entry)) continue;

      const subEntries = await this.safeReadDir(fullPath);
      const files = subEntries.filter(
        (f) => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.java') || f.endsWith('.go')
      );

      if (files.length > 0) {
        let type = 'module';
        if (files.some((f) => f.includes('controller'))) type = 'service';
        if (files.some((f) => f.includes('component') || f.includes('Component')))
          type = 'ui-module';

        results.push({ name: entry, type, files });
      }
    }

    return results;
  }

  /**
   * Scan for common file patterns to detect architecture style.
   */
  private async scanForFilePatterns(): Promise<Map<string, Set<string>>> {
    const patterns = new Map<string, Set<string>>();
    await this.walkForPatterns(this.rootPath, patterns, 0);
    return patterns;
  }

  private async walkForPatterns(
    dir: string,
    patterns: Map<string, Set<string>>,
    depth: number
  ): Promise<void> {
    if (depth > 5) return;

    const entries = await this.safeReadDir(dir);
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'target', 'vendor'];

    for (const entry of entries) {
      if (skipDirs.includes(entry)) continue;

      const fullPath = path.join(dir, entry);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat) continue;

      if (stat.isFile()) {
        const lower = entry.toLowerCase();
        const relativePath = path.relative(this.rootPath, fullPath);

        if (lower.includes('.controller.') || lower.includes('controller.')) {
          this.addToPatternSet(patterns, 'controller', relativePath);
        }
        if (lower.includes('.service.') || lower.includes('service.')) {
          this.addToPatternSet(patterns, 'service', relativePath);
        }
        if (lower.includes('.repository.') || lower.includes('repository.') || lower.includes('.repo.')) {
          this.addToPatternSet(patterns, 'repository', relativePath);
        }
        if (lower.includes('.component.') || lower.includes('component.')) {
          this.addToPatternSet(patterns, 'component', relativePath);
        }
        if (lower.startsWith('use') && (lower.endsWith('.ts') || lower.endsWith('.tsx'))) {
          this.addToPatternSet(patterns, 'hook', relativePath);
        }
        if (lower.includes('.middleware.') || lower.includes('middleware.')) {
          this.addToPatternSet(patterns, 'middleware', relativePath);
        }
        if (lower.includes('.module.')) {
          this.addToPatternSet(patterns, 'module', relativePath);
        }
        if (lower.includes('.store.') || lower.includes('store.')) {
          this.addToPatternSet(patterns, 'store', relativePath);
        }
        if (lower.includes('.interface.') || lower.includes('interface.')) {
          this.addToPatternSet(patterns, 'interface', relativePath);
        }
      } else if (stat.isDirectory()) {
        await this.walkForPatterns(fullPath, patterns, depth + 1);
      }
    }
  }

  private addToPatternSet(
    patterns: Map<string, Set<string>>,
    key: string,
    value: string
  ): void {
    if (!patterns.has(key)) {
      patterns.set(key, new Set());
    }
    patterns.get(key)!.add(value);
  }

  /**
   * Detect file naming convention (kebab-case, camelCase, PascalCase).
   */
  private async detectNamingConvention(): Promise<string | null> {
    const srcPath = path.join(this.rootPath, 'src');
    const files = await this.safeReadDir(srcPath);
    if (files.length === 0) return null;

    const tsFiles = files.filter(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')
    );
    if (tsFiles.length === 0) return null;

    let kebabCount = 0;
    let camelCount = 0;
    let pascalCount = 0;

    for (const file of tsFiles) {
      const name = file.replace(/\.(tsx?|jsx?)$/, '');
      if (name.includes('-')) kebabCount++;
      else if (name[0] === name[0].toUpperCase() && name.length > 1) pascalCount++;
      else if (name.includes('.')) continue; // skip dotted names
      else camelCount++;
    }

    const max = Math.max(kebabCount, camelCount, pascalCount);
    if (max === 0) return null;
    if (max === kebabCount) return 'kebab-case';
    if (max === pascalCount) return 'PascalCase';
    return 'camelCase';
  }

  /**
   * Detect where test files live (colocated, __tests__, test/).
   */
  private async detectTestLocation(): Promise<string | null> {
    const rootEntries = await this.safeReadDir(this.rootPath);

    if (rootEntries.includes('__tests__')) return 'in __tests__ directory';
    if (rootEntries.includes('test') || rootEntries.includes('tests'))
      return 'in top-level test directory';

    // Check src for colocated tests
    const srcPath = path.join(this.rootPath, 'src');
    const srcFiles = await this.safeReadDir(srcPath);
    const hasTestFiles = srcFiles.some(
      (f) => f.includes('.test.') || f.includes('.spec.')
    );
    if (hasTestFiles) return 'colocated with source files';

    // Check for __tests__ inside src
    if (srcFiles.includes('__tests__')) return 'in src/__tests__ directory';

    return null;
  }

  /**
   * Detect export style (named, default, barrel).
   */
  private async detectExportStyle(): Promise<string | null> {
    const srcPath = path.join(this.rootPath, 'src');
    const files = await this.safeReadDir(srcPath);

    // Check for barrel files (index.ts that re-exports)
    if (files.includes('index.ts') || files.includes('index.js')) {
      return 'barrel (index re-exports)';
    }

    return null;
  }

  /**
   * Safely read a directory, returning empty array on error.
   */
  private async safeReadDir(dir: string): Promise<string[]> {
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }
}
