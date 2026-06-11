import { ServiceModel, Pattern, Convention } from '@engineering-os/shared';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

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
      } else if (manifest.type === 'flutter') {
        try {
          const pubContent = await fs.readFile(manifest.path, 'utf-8');
          const pub = yaml.load(pubContent) as Record<string, unknown> | undefined;
          description = (pub?.description as string) || '';
          dependencies = Object.keys((pub?.dependencies as Record<string, unknown>) || {});
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

    // Source roots vary by stack: `src/` (JS/TS web) and `lib/` (Dart/Flutter).
    const sourceRoots = await this.getSourceRoots();

    // `lib` is itself a source root for Dart, so it must not double as a shared
    // container there — exclude it from shared scanning when it's the root.
    const moduleContainers = ['modules', 'features', 'screens', 'pages', 'domains', 'apps', 'app'];
    const sharedContainers = ['services', 'hooks', 'components', 'stores', 'contexts', 'providers', 'utility', 'utils', 'lib', 'core', 'shared'];
    const isSourceFile = (f: string) =>
      f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.dart');

    for (const srcPath of sourceRoots) {
      const rootName = path.basename(srcPath);

      for (const container of moduleContainers) {
        const containerPath = path.join(srcPath, container);
        const entries = await this.safeReadDir(containerPath);

        for (const entry of entries) {
          const entryPath = path.join(containerPath, entry);
          const stat = await fs.stat(entryPath).catch(() => null);
          if (!stat || !stat.isDirectory()) continue;
          if (modules.find(m => m.name === entry)) continue;

          const files = await this.safeReadDir(entryPath);

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

      // Discover shared layers (services, hooks, core, etc.) as supporting modules
      for (const container of sharedContainers) {
        if (container === rootName) continue; // `lib` root isn't its own shared layer
        const containerPath = path.join(srcPath, container);
        const entries = await this.safeReadDir(containerPath);
        if (entries.length === 0) continue;
        if (modules.find(m => m.name === `shared-${container}`)) continue;

        const sourceFiles = entries.filter(isSourceFile);
        if (sourceFiles.length > 0 || entries.some(e => !e.includes('.'))) {
          modules.push({
            name: `shared-${container}`,
            description: `Shared ${container} layer (${entries.length} items)`,
            owners: [],
            publicApis: sourceFiles.slice(0, 5).map(f => f.replace(/\.(ts|tsx|dart)$/, '')),
            dependencies: [],
            patterns: [],
            criticality: container === 'services' || container === 'core' ? 'high' : 'medium',
          });
        }
      }
    }

    return modules;
  }

  /**
   * Collect lowercase directory names (depth-limited) under a root.
   */
  private async collectDirNames(root: string): Promise<Set<string>> {
    const names = new Set<string>();
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 5 || names.size >= 500) return;
      const entries = await this.safeReadDir(dir);
      for (const entry of entries) {
        if (entry.includes('.')) continue; // skip files
        const full = path.join(dir, entry);
        const stat = await fs.stat(full).catch(() => null);
        if (!stat?.isDirectory()) continue;
        names.add(entry.toLowerCase());
        await walk(full, depth + 1);
      }
    };
    await walk(root, 0);
    return names;
  }

  /**
   * Return existing source-root directories for the project.
   * `src/` for JS/TS web stacks, `lib/` for Dart/Flutter.
   */
  private async getSourceRoots(): Promise<string[]> {
    const dirExists = async (name: string) => {
      const stat = await fs.stat(path.join(this.rootPath, name)).catch(() => null);
      return stat?.isDirectory() ?? false;
    };

    const roots: string[] = [];
    if (await dirExists('src')) roots.push(path.join(this.rootPath, 'src'));

    // `lib/` is only a source root for Dart/Flutter — gate it so JS/TS projects
    // (where `lib/` is often build output) behave exactly as before.
    if (await dirExists('lib')) {
      const isDart = await fs
        .access(path.join(this.rootPath, 'pubspec.yaml'))
        .then(() => true)
        .catch(() => false);
      if (isDart || roots.length === 0) {
        roots.push(path.join(this.rootPath, 'lib'));
      }
    }

    return roots;
  }

  private inferApisFromFiles(files: string[]): string[] {
    return files
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.dart'))
      .filter(f => !f.includes('.test.') && !f.includes('_test.') && !f.includes('.spec.') && !f.includes('.interface.') && !f.includes('.g.dart') && !f.includes('.freezed.dart'))
      .slice(0, 5)
      .map(f => f.replace(/\.(ts|tsx|dart)$/, ''));
  }

  private inferPatternsFromFiles(files: string[]): string[] {
    const patterns: string[] = [];
    if (files.some(f => f.includes('.store.'))) patterns.push('state-management');
    if (files.some(f => f.startsWith('use') || f.includes('/hooks/'))) patterns.push('custom-hooks');
    if (files.some(f => f.includes('.service.') || f.includes('_service'))) patterns.push('service-layer');
    if (files.some(f => f.includes('.interface.'))) patterns.push('interface-contracts');
    if (files.some(f => f.includes('components'))) patterns.push('component-composition');
    // Dart/Flutter feature-first: domain/data/presentation layers + BLoC/Cubit.
    if (files.some(f => f === 'domain' || f === 'data' || f === 'presentation')) patterns.push('clean-architecture');
    if (files.some(f => f === 'bloc' || f === 'cubit' || f.includes('_bloc') || f.includes('_cubit'))) patterns.push('bloc-state-management');
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

    // Flutter/Dart: detect architecture style, state management, and stack
    // from pubspec dependencies + folder/file naming. Covers the common
    // Flutter approaches (Clean Arch, MVVM, MVC) and state solutions
    // (BLoC, Provider, Riverpod, GetX, MobX, Redux).
    const flutterPatterns = await this.inferFlutterPatterns();
    for (const p of flutterPatterns) {
      if (!patterns.find((x) => x.name === p.name)) patterns.push(p);
    }

    return patterns;
  }

  /**
   * Infer Flutter architecture + stack patterns from pubspec.yaml dependencies
   * and lib/ folder & file naming. Returns [] for non-Flutter projects.
   */
  private async inferFlutterPatterns(): Promise<Pattern[]> {
    const deps = await this.readPubspecDependencies();
    if (deps === null) return []; // not a Flutter/Dart project

    const patterns: Pattern[] = [];
    const add = (name: string, description: string) =>
      patterns.push({ name, description, files: [], usage: 'mobile' });

    const has = (...names: string[]) => names.some((n) => deps.has(n));

    // Source filenames + dir names (top-level and nested) as structural signals.
    const files = await this.collectSourceFiles();
    const libRoot = path.join(this.rootPath, 'lib');
    const topDirs = (await this.safeReadDir(libRoot)).map((d) => d.toLowerCase());
    const allDirs = await this.collectDirNames(libRoot); // nested too (features/auth/domain)
    const fileHas = (re: RegExp) => files.some((f) => re.test(f.toLowerCase()));
    const topDirHas = (...names: string[]) => names.some((n) => topDirs.includes(n));
    const anyDirHas = (...names: string[]) => names.some((n) => allDirs.has(n));

    // --- Architecture style ---
    // Clean layers may be top-level (layer-first) or per-feature (feature-first).
    const hasCleanLayers =
      (anyDirHas('domain') && anyDirHas('data', 'presentation')) ||
      anyDirHas('usecases', 'use_cases') ||
      fileHas(/_usecase\.dart$/);
    const featureFirst = topDirHas('features');
    const layerFirst = topDirHas('domain') && topDirHas('data') && topDirHas('presentation');

    if (featureFirst) add('feature-first', 'Code organized by feature, not by layer');
    if (layerFirst) add('layer-first', 'Code organized into top-level domain/data/presentation layers');
    if (hasCleanLayers) add('clean-architecture', 'Clean Architecture: domain / data / presentation separation with use cases');

    // MVVM: explicit view models, or the Stacked framework.
    if (fileHas(/_view_?model\.dart$/) || anyDirHas('viewmodels', 'view_models') || has('stacked')) {
      add('mvvm', 'MVVM — views backed by view models (Flutter\'s officially recommended UI pattern)');
    }
    // MVC: controllers + views/models split (common with GetX-style apps).
    if (
      (fileHas(/_controller\.dart$/) || anyDirHas('controllers')) &&
      (anyDirHas('views', 'models') || fileHas(/_view\.dart$/))
    ) {
      add('mvc', 'MVC — controllers mediating models and views');
    }

    // --- State management ---
    if (has('flutter_bloc', 'bloc') || fileHas(/_(bloc|cubit)\.dart$/)) {
      add('bloc', 'BLoC / Cubit state management (flutter_bloc)');
    }
    if (has('provider') || fileHas(/_notifier\.dart$/)) {
      add('provider', 'Provider / ChangeNotifier state management');
    }
    if (has('flutter_riverpod', 'riverpod', 'hooks_riverpod', 'state_notifier', 'flutter_state_notifier')) {
      add('riverpod', 'Riverpod state management (2026 de-facto default for new apps)');
    }
    if (has('signals', 'signals_flutter')) {
      add('signals', 'Signals fine-grained reactive state management');
    }
    if (has('get', 'getx')) {
      add('getx', 'GetX state management, routing, and DI');
    }
    if (has('flutter_mobx', 'mobx')) {
      add('mobx', 'MobX observable state management');
    }
    if (has('flutter_redux', 'redux')) {
      add('redux', 'Redux state management');
    }
    if (has('flutter_hooks')) {
      add('hooks', 'flutter_hooks for reusable, composable widget logic');
    }

    // --- Infrastructure / best-practice stack ---
    if (has('get_it', 'injectable', 'kiwi')) {
      add('dependency-injection', 'Service locator / DI (get_it, injectable)');
    }
    if (has('go_router', 'auto_route', 'beamer')) {
      add('declarative-routing', 'Declarative routing (go_router / auto_route)');
    }
    if (has('freezed', 'json_serializable', 'built_value')) {
      add('immutable-models', 'Code-generated immutable data models (freezed / json_serializable)');
    }
    if (has('dio', 'retrofit', 'chopper', 'http')) {
      add('rest-networking', 'REST/HTTP networking layer (dio / retrofit / http)');
    }
    if (Array.from(deps).some((d) => d.startsWith('firebase') || d.startsWith('cloud_firestore'))) {
      add('firebase-backend', 'Firebase backend (auth, firestore, messaging, etc.)');
    }
    if (has('hive', 'isar', 'sqflite', 'drift', 'shared_preferences')) {
      add('local-persistence', 'Local persistence (hive / isar / sqflite / shared_preferences)');
    }

    return patterns;
  }

  /**
   * Read merged dependency names (deps + dev_deps) from pubspec.yaml.
   * Returns null when there is no pubspec.yaml (i.e. not a Dart project).
   */
  private async readPubspecDependencies(): Promise<Set<string> | null> {
    try {
      const content = await fs.readFile(path.join(this.rootPath, 'pubspec.yaml'), 'utf-8');
      const pub = yaml.load(content) as Record<string, unknown> | undefined;
      const deps = {
        ...((pub?.dependencies as Record<string, unknown>) || {}),
        ...((pub?.dev_dependencies as Record<string, unknown>) || {}),
      };
      return new Set(Object.keys(deps).map((d) => d.toLowerCase()));
    } catch {
      return null;
    }
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

    // Dart/Flutter project
    if (rootFiles.includes('pubspec.yaml')) {
      return 'mobile';
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
        } else if (entry === 'pubspec.yaml') {
          manifests.push({ path: fullPath, type: 'flutter' });
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
    const sourceFiles = await this.collectSourceFiles();
    if (sourceFiles.length === 0) return null;

    let kebabCount = 0;
    let camelCount = 0;
    let pascalCount = 0;
    let snakeCount = 0;

    for (const file of sourceFiles) {
      const name = file.replace(/\.(tsx?|jsx?|dart)$/, '').replace(/\.[a-z]+$/, ''); // strip .g/.freezed too
      if (!name) continue;
      if (name.includes('_')) snakeCount++;
      else if (name.includes('-')) kebabCount++;
      else if (name[0] === name[0].toUpperCase() && name.length > 1) pascalCount++;
      else camelCount++;
    }

    const max = Math.max(kebabCount, camelCount, pascalCount, snakeCount);
    if (max === 0) return null;
    if (max === snakeCount) return 'snake_case';
    if (max === kebabCount) return 'kebab-case';
    if (max === pascalCount) return 'PascalCase';
    return 'camelCase';
  }

  /**
   * Collect source filenames (depth-limited) across all source roots.
   */
  private async collectSourceFiles(): Promise<string[]> {
    const roots = await this.getSourceRoots();
    const collected: string[] = [];
    const isSource = (f: string) =>
      /\.(ts|tsx|js|jsx|dart)$/.test(f) && !f.includes('.test.') && !f.includes('_test.') && !f.includes('.spec.');

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 4 || collected.length >= 300) return;
      const entries = await this.safeReadDir(dir);
      for (const entry of entries) {
        if (isSource(entry)) {
          collected.push(entry);
          continue;
        }
        if (!entry.includes('.')) {
          await walk(path.join(dir, entry), depth + 1);
        }
      }
    };

    for (const root of roots) await walk(root, 0);
    return collected;
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
    const srcFiles = await this.safeReadDir(path.join(this.rootPath, 'src'));

    // Check for barrel files (index.ts that re-exports)
    if (srcFiles.includes('index.ts') || srcFiles.includes('index.js')) {
      return 'barrel (index re-exports)';
    }

    // Dart: a top-level library file under lib/ acting as a barrel export.
    const libFiles = await this.safeReadDir(path.join(this.rootPath, 'lib'));
    const projectName = path.basename(this.rootPath).replace(/-/g, '_');
    if (libFiles.includes(`${projectName}.dart`)) {
      return 'barrel (library re-exports)';
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
