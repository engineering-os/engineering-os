import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', 'vendor', '__pycache__', '.eos', '.turbo', 'target',
]);

const MAX_FILE_SIZE = 512 * 1024;

export interface ScannedRoute {
  method: string;
  path: string;
  file: string;
  line: number;
  handler?: string;
  framework: string;
}

type Framework = 'express' | 'nestjs' | 'fastify' | 'nextjs' | 'vertx';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

export class RouteScanner {
  constructor(private rootPath: string) {}

  scan(): ScannedRoute[] {
    const framework = this.detectFramework();
    if (!framework) {
      return this.scanAllFrameworks();
    }
    return this.scanForFramework(framework);
  }

  detectFramework(): Framework | null {
    const packageJsonPath = path.join(this.rootPath, 'package.json');
    const content = this.readSafe(packageJsonPath);

    if (content) {
      if (content.includes('"@nestjs/core"') || content.includes('"@nestjs/common"')) {
        return 'nestjs';
      }
      if (content.includes('"next"') && this.hasAppRouter()) {
        return 'nextjs';
      }
      if (content.includes('"fastify"')) {
        return 'fastify';
      }
      if (content.includes('"express"')) {
        return 'express';
      }
    }

    const pomPath = path.join(this.rootPath, 'pom.xml');
    const gradlePath = path.join(this.rootPath, 'build.gradle');
    const pomContent = this.readSafe(pomPath);
    const gradleContent = this.readSafe(gradlePath);

    if ((pomContent && pomContent.includes('io.vertx')) ||
        (gradleContent && gradleContent.includes('io.vertx'))) {
      return 'vertx';
    }

    return null;
  }

  private scanAllFrameworks(): ScannedRoute[] {
    const routes: ScannedRoute[] = [];
    const sourceFiles = this.walkSourceFiles(this.rootPath);

    for (const filePath of sourceFiles) {
      const content = this.readSafe(filePath);
      if (!content) continue;

      const relativePath = path.relative(this.rootPath, filePath);

      routes.push(...this.scanExpressRoutes(content, relativePath));
      routes.push(...this.scanNestJSRoutes(content, relativePath));
      routes.push(...this.scanFastifyRoutes(content, relativePath));
      routes.push(...this.scanVertxRoutes(content, relativePath));
    }

    routes.push(...this.scanNextJSRoutes());

    return routes;
  }

  private scanForFramework(framework: Framework): ScannedRoute[] {
    if (framework === 'nextjs') {
      const routes = this.scanNextJSRoutes();
      const sourceFiles = this.walkSourceFiles(this.rootPath);
      for (const filePath of sourceFiles) {
        const content = this.readSafe(filePath);
        if (!content) continue;
        const relativePath = path.relative(this.rootPath, filePath);
        routes.push(...this.scanExpressRoutes(content, relativePath));
      }
      return routes;
    }

    const sourceFiles = this.walkSourceFiles(this.rootPath);
    const routes: ScannedRoute[] = [];

    for (const filePath of sourceFiles) {
      const content = this.readSafe(filePath);
      if (!content) continue;

      const relativePath = path.relative(this.rootPath, filePath);

      switch (framework) {
        case 'express':
          routes.push(...this.scanExpressRoutes(content, relativePath));
          break;
        case 'nestjs':
          routes.push(...this.scanNestJSRoutes(content, relativePath));
          break;
        case 'fastify':
          routes.push(...this.scanFastifyRoutes(content, relativePath));
          break;
        case 'vertx':
          routes.push(...this.scanVertxRoutes(content, relativePath));
          break;
      }
    }

    return routes;
  }

  // --- Express.js ---

  private scanExpressRoutes(content: string, file: string): ScannedRoute[] {
    const routes: ScannedRoute[] = [];
    const lines = content.split('\n');

    // Pattern: app.get('/path', handler) or router.get('/path', handler)
    const methodPattern = /(?:app|router)\s*\.\s*(get|post|put|delete|patch|options|head)\s*\(\s*['"`](\/[^'"`]*?)['"`]/;

    // Pattern: router.route('/path').get(...).post(...)
    const routeChainPattern = /(?:app|router)\s*\.\s*route\s*\(\s*['"`](\/[^'"`]*?)['"`]\s*\)/;
    const chainedMethodPattern = /\.\s*(get|post|put|delete|patch|options|head)\s*\(/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const methodMatch = line.match(methodPattern);
      if (methodMatch) {
        const handler = this.extractExpressHandler(line);
        routes.push({
          method: methodMatch[1].toUpperCase(),
          path: methodMatch[2],
          file,
          line: i + 1,
          handler,
          framework: 'express',
        });
        continue;
      }

      const routeMatch = line.match(routeChainPattern);
      if (routeMatch) {
        const routePath = routeMatch[1];
        const fullChain = this.getChainedLine(lines, i);
        let chainMatch: RegExpExecArray | null;
        chainedMethodPattern.lastIndex = 0;
        while ((chainMatch = chainedMethodPattern.exec(fullChain)) !== null) {
          routes.push({
            method: chainMatch[1].toUpperCase(),
            path: routePath,
            file,
            line: i + 1,
            framework: 'express',
          });
        }
      }
    }

    return routes;
  }

  private extractExpressHandler(line: string): string | undefined {
    // Try to extract named handler: app.get('/path', handlerName)
    const match = line.match(/,\s*(\w+)\s*[,)]/);
    if (match && !['req', 'res', 'next', 'async', 'function'].includes(match[1])) {
      return match[1];
    }
    return undefined;
  }

  private getChainedLine(lines: string[], startIndex: number): string {
    let result = lines[startIndex];
    for (let i = startIndex + 1; i < Math.min(startIndex + 5, lines.length); i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('.') || trimmed.startsWith(')')) {
        result += ' ' + trimmed;
      } else {
        break;
      }
    }
    return result;
  }

  // --- NestJS ---

  private scanNestJSRoutes(content: string, file: string): ScannedRoute[] {
    const routes: ScannedRoute[] = [];

    if (!content.includes('@Controller') && !content.includes('@Get') &&
        !content.includes('@Post') && !content.includes('@Put') &&
        !content.includes('@Delete') && !content.includes('@Patch')) {
      return routes;
    }

    const lines = content.split('\n');
    let controllerPrefix = '';

    const controllerPattern = /@Controller\s*\(\s*['"`]([^'"`]*)['"`]\s*\)/;
    const controllerNoArgPattern = /@Controller\s*\(\s*\)/;
    const methodDecoratorPattern = /@(Get|Post|Put|Delete|Patch|Options|Head)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const ctrlMatch = line.match(controllerPattern);
      if (ctrlMatch) {
        controllerPrefix = this.normalizePath(ctrlMatch[1]);
        continue;
      }

      if (line.match(controllerNoArgPattern)) {
        controllerPrefix = '';
        continue;
      }

      const methodMatch = line.match(methodDecoratorPattern);
      if (methodMatch) {
        const method = methodMatch[1].toUpperCase();
        const methodPath = methodMatch[2] ? this.normalizePath(methodMatch[2]) : '';
        const fullPath = this.joinPaths(controllerPrefix, methodPath);
        const handler = this.extractNestHandler(lines, i);

        routes.push({
          method,
          path: fullPath || '/',
          file,
          line: i + 1,
          handler,
          framework: 'nestjs',
        });
      }
    }

    return routes;
  }

  private extractNestHandler(lines: string[], decoratorLine: number): string | undefined {
    for (let i = decoratorLine + 1; i < Math.min(decoratorLine + 5, lines.length); i++) {
      const match = lines[i].match(/(?:async\s+)?(\w+)\s*\(/);
      if (match && !match[1].startsWith('@')) {
        return match[1];
      }
    }
    return undefined;
  }

  // --- Fastify ---

  private scanFastifyRoutes(content: string, file: string): ScannedRoute[] {
    const routes: ScannedRoute[] = [];
    const lines = content.split('\n');

    // Pattern: fastify.get('/path', ...) or server.get('/path', ...)
    const methodPattern = /(?:fastify|server|app|instance)\s*\.\s*(get|post|put|delete|patch|options|head)\s*\(\s*['"`](\/[^'"`]*?)['"`]/;

    // Pattern: fastify.route({ method: 'GET', url: '/path' })
    const routeObjPattern = /(?:fastify|server|app|instance)\s*\.\s*route\s*\(/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const methodMatch = line.match(methodPattern);
      if (methodMatch) {
        routes.push({
          method: methodMatch[1].toUpperCase(),
          path: methodMatch[2],
          file,
          line: i + 1,
          framework: 'fastify',
        });
        continue;
      }

      if (routeObjPattern.test(line)) {
        const block = this.extractBlock(lines, i);
        const methodExtract = block.match(/method\s*:\s*['"`](GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)['"`]/i);
        const urlExtract = block.match(/url\s*:\s*['"`](\/[^'"`]*?)['"`]/);

        if (methodExtract && urlExtract) {
          routes.push({
            method: methodExtract[1].toUpperCase(),
            path: urlExtract[1],
            file,
            line: i + 1,
            framework: 'fastify',
          });
        }
      }
    }

    return routes;
  }

  private extractBlock(lines: string[], startIndex: number): string {
    let result = '';
    let braceCount = 0;
    let started = false;

    for (let i = startIndex; i < Math.min(startIndex + 20, lines.length); i++) {
      const line = lines[i];
      result += line + '\n';

      for (const ch of line) {
        if (ch === '{' || ch === '(') {
          braceCount++;
          started = true;
        } else if (ch === '}' || ch === ')') {
          braceCount--;
        }
      }

      if (started && braceCount <= 0) break;
    }

    return result;
  }

  // --- Next.js App Router ---

  private scanNextJSRoutes(): ScannedRoute[] {
    const routes: ScannedRoute[] = [];

    const appDir = this.findAppDir();
    if (!appDir) return routes;

    const apiDir = path.join(appDir, 'api');
    if (!this.dirExists(apiDir)) return routes;

    const routeFiles = this.walkRouteFiles(apiDir);

    for (const filePath of routeFiles) {
      const content = this.readSafe(filePath);
      if (!content) continue;

      const relativePath = path.relative(this.rootPath, filePath);
      const routePath = this.filePathToRoutePath(filePath, appDir);

      const exportedMethods = this.extractNextJSExports(content);

      for (const method of exportedMethods) {
        const lineNum = this.findExportLine(content, method);
        routes.push({
          method: method.toUpperCase(),
          path: routePath,
          file: relativePath,
          line: lineNum,
          handler: method.toUpperCase(),
          framework: 'nextjs',
        });
      }
    }

    return routes;
  }

  private findAppDir(): string | null {
    const candidates = [
      path.join(this.rootPath, 'app'),
      path.join(this.rootPath, 'src', 'app'),
    ];

    for (const candidate of candidates) {
      if (this.dirExists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private hasAppRouter(): boolean {
    return this.findAppDir() !== null;
  }

  private walkRouteFiles(dir: string): string[] {
    const files: string[] = [];
    this.walkRecursive(dir, files, (name) => {
      return name === 'route.ts' || name === 'route.js' ||
             name === 'route.tsx' || name === 'route.jsx';
    }, 0);
    return files;
  }

  private filePathToRoutePath(filePath: string, appDir: string): string {
    const relative = path.relative(appDir, path.dirname(filePath));
    const segments = relative.split(path.sep).filter(Boolean);

    const routeSegments = segments.map(segment => {
      // [param] -> :param
      if (segment.startsWith('[') && segment.endsWith(']')) {
        const inner = segment.slice(1, -1);
        // [...param] -> *param (catch-all)
        if (inner.startsWith('...')) {
          return '*' + inner.slice(3);
        }
        return ':' + inner;
      }
      // (group) segments are removed from the path
      if (segment.startsWith('(') && segment.endsWith(')')) {
        return null;
      }
      return segment;
    }).filter((s): s is string => s !== null);

    return '/' + routeSegments.join('/');
  }

  private extractNextJSExports(content: string): string[] {
    const methods: string[] = [];
    const exportPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)/g;
    const exportConstPattern = /export\s+const\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s*=/g;

    let match: RegExpExecArray | null;
    while ((match = exportPattern.exec(content)) !== null) {
      methods.push(match[1]);
    }
    while ((match = exportConstPattern.exec(content)) !== null) {
      methods.push(match[1]);
    }

    return methods;
  }

  private findExportLine(content: string, method: string): number {
    const lines = content.split('\n');
    const pattern = new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${method}`);
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        return i + 1;
      }
    }
    return 1;
  }

  // --- Vert.x (Java) ---

  private scanVertxRoutes(content: string, file: string): ScannedRoute[] {
    const routes: ScannedRoute[] = [];

    if (!file.endsWith('.java') && !file.endsWith('.kt')) return routes;

    const lines = content.split('\n');

    // Pattern: router.get("/path").handler(...) or router.route("/path").method(HttpMethod.GET)
    const routerMethodPattern = /router\s*\.\s*(get|post|put|delete|patch)\s*\(\s*["'](\/[^"']*?)["']\s*\)/i;

    // Pattern: router.route("/path").method(HttpMethod.GET)
    const routeWithMethodPattern = /router\s*\.\s*route\s*\(\s*["'](\/[^"']*?)["']\s*\)/;
    const httpMethodPattern = /\.method\s*\(\s*HttpMethod\s*\.\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s*\)/;

    // Pattern: @Route(path = "/path", methods = Route.HttpMethod.GET)
    const routeAnnotationPattern = /@Route\s*\(/;
    const routePathAttr = /path\s*=\s*["'](\/[^"']*?)["']/;
    const routeMethodAttr = /methods?\s*=\s*(?:Route\.HttpMethod\.|HttpMethod\.)(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // router.get("/path")
      const methodMatch = line.match(routerMethodPattern);
      if (methodMatch) {
        const handler = this.extractVertxHandler(line);
        routes.push({
          method: methodMatch[1].toUpperCase(),
          path: methodMatch[2],
          file,
          line: i + 1,
          handler,
          framework: 'vertx',
        });
        continue;
      }

      // router.route("/path").method(HttpMethod.GET)
      const routeMatch = line.match(routeWithMethodPattern);
      if (routeMatch) {
        const fullLine = this.getChainedLine(lines, i);
        const httpMatch = fullLine.match(httpMethodPattern);
        if (httpMatch) {
          routes.push({
            method: httpMatch[1].toUpperCase(),
            path: routeMatch[1],
            file,
            line: i + 1,
            framework: 'vertx',
          });
        }
        continue;
      }

      // @Route annotation
      if (routeAnnotationPattern.test(line)) {
        const annotationBlock = this.extractAnnotationBlock(lines, i);
        const pathMatch = annotationBlock.match(routePathAttr);
        const methodAttrMatch = annotationBlock.match(routeMethodAttr);

        if (pathMatch) {
          const method = methodAttrMatch ? methodAttrMatch[1].toUpperCase() : 'GET';
          const handler = this.extractVertxAnnotatedHandler(lines, i);
          routes.push({
            method,
            path: pathMatch[1],
            file,
            line: i + 1,
            handler,
            framework: 'vertx',
          });
        }
      }
    }

    return routes;
  }

  private extractVertxHandler(line: string): string | undefined {
    const match = line.match(/\.handler\s*\(\s*(?:this::)?(\w+)/);
    if (match) return match[1];
    return undefined;
  }

  private extractVertxAnnotatedHandler(lines: string[], annotationLine: number): string | undefined {
    for (let i = annotationLine + 1; i < Math.min(annotationLine + 5, lines.length); i++) {
      const match = lines[i].match(/(?:public|private|protected)?\s*(?:void|Uni|Multi|CompletionStage|Future)?\s*<?.*>?\s*(\w+)\s*\(/);
      if (match) return match[1];
    }
    return undefined;
  }

  private extractAnnotationBlock(lines: string[], startIndex: number): string {
    let result = '';
    let parenCount = 0;
    let started = false;

    for (let i = startIndex; i < Math.min(startIndex + 10, lines.length); i++) {
      const line = lines[i];
      result += line + ' ';

      for (const ch of line) {
        if (ch === '(') {
          parenCount++;
          started = true;
        } else if (ch === ')') {
          parenCount--;
        }
      }

      if (started && parenCount <= 0) break;
    }

    return result;
  }

  // --- Path Utilities ---

  private normalizePath(p: string): string {
    if (!p) return '';
    if (!p.startsWith('/')) {
      p = '/' + p;
    }
    // Convert :param style (already fine) and preserve it
    return p.replace(/\/+/g, '/').replace(/\/$/, '');
  }

  private joinPaths(prefix: string, suffix: string): string {
    if (!prefix && !suffix) return '/';
    if (!prefix) return suffix || '/';
    if (!suffix) return prefix;

    const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
    const normalizedSuffix = suffix.startsWith('/') ? suffix : '/' + suffix;

    return normalizedPrefix + normalizedSuffix;
  }

  // --- File System Utilities ---

  private walkSourceFiles(dir: string): string[] {
    const files: string[] = [];
    this.walkRecursive(dir, files, (name) => {
      const lower = name.toLowerCase();
      return lower.endsWith('.ts') || lower.endsWith('.tsx') ||
             lower.endsWith('.js') || lower.endsWith('.jsx') ||
             lower.endsWith('.java') || lower.endsWith('.kt');
    }, 0);
    return files;
  }

  private walkRecursive(dir: string, result: string[], filter: (name: string) => boolean, depth: number): void {
    if (depth > 8) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.walkRecursive(fullPath, result, filter, depth + 1);
      } else if (entry.isFile() && filter(entry.name)) {
        // Skip test files and scanner/parser source files
        const lower = entry.name.toLowerCase();
        if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('scanner') || lower.includes('parser')) continue;
        result.push(fullPath);
      }
    }
  }

  private dirExists(dirPath: string): boolean {
    try {
      const stat = fs.statSync(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private readSafe(filePath: string): string | null {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) return null;
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }
}
