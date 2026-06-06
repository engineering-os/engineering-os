import * as fs from 'fs';
import * as path from 'path';
import { ScannedRoute } from './route-scanner';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', 'vendor', '__pycache__', '.eos', '.turbo', 'target',
]);

const MAX_FILE_SIZE = 512 * 1024;
const MAX_DEPTH = 8;

type KotlinFramework = 'ktor' | 'spring-boot' | 'android-nav';

// --- Framework Detection ---

export function detectKotlinFramework(rootPath: string): KotlinFramework | null {
  const gradleKtsPath = path.join(rootPath, 'build.gradle.kts');
  const gradlePath = path.join(rootPath, 'build.gradle');
  const settingsKtsPath = path.join(rootPath, 'settings.gradle.kts');

  const gradleKtsContent = readSafe(gradleKtsPath);
  const gradleContent = readSafe(gradlePath);
  const settingsContent = readSafe(settingsKtsPath);

  const allGradle = [gradleKtsContent, gradleContent, settingsContent]
    .filter(Boolean)
    .join('\n');

  // Check for Android Navigation (Jetpack Compose Navigation)
  if (isAndroidProject(allGradle, rootPath)) {
    return 'android-nav';
  }

  // Check for Ktor
  if (allGradle.includes('io.ktor')) {
    return 'ktor';
  }

  // Check for Spring Boot (Kotlin)
  if (allGradle.includes('org.springframework.boot') ||
      allGradle.includes('spring-boot-starter')) {
    return 'spring-boot';
  }

  // Also check subproject gradle files for multi-module projects
  const appGradleKts = readSafe(path.join(rootPath, 'app', 'build.gradle.kts'));
  const appGradle = readSafe(path.join(rootPath, 'app', 'build.gradle'));
  const subGradle = [appGradleKts, appGradle].filter(Boolean).join('\n');

  if (subGradle) {
    if (isAndroidProject(subGradle, rootPath)) {
      return 'android-nav';
    }
    if (subGradle.includes('io.ktor')) {
      return 'ktor';
    }
    if (subGradle.includes('org.springframework.boot') ||
        subGradle.includes('spring-boot-starter')) {
      return 'spring-boot';
    }
  }

  return null;
}

function isAndroidProject(gradleContent: string, rootPath: string): boolean {
  if (gradleContent.includes('com.android.application') ||
      gradleContent.includes('com.android.library')) {
    // Confirm it uses Compose Navigation
    if (gradleContent.includes('androidx.navigation') ||
        gradleContent.includes('navigation-compose') ||
        gradleContent.includes('androidx.compose.navigation')) {
      return true;
    }
    // Even without explicit nav dependency in root, check for Android app structure
    const manifestPath = path.join(rootPath, 'app', 'src', 'main', 'AndroidManifest.xml');
    if (fileExists(manifestPath)) {
      return true;
    }
  }
  return false;
}

// --- Ktor Route Scanner ---

export function scanKtorRoutes(rootPath: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const sourceFiles = walkKotlinFiles(rootPath);

  for (const filePath of sourceFiles) {
    const content = readSafe(filePath);
    if (!content) continue;
    if (!isKtorRouteFile(content)) continue;

    const relativePath = path.relative(rootPath, filePath);
    const lines = content.split('\n');
    const prefixStack = extractKtorRoutes(lines, relativePath);
    routes.push(...prefixStack);
  }

  return routes;
}

function isKtorRouteFile(content: string): boolean {
  return content.includes('routing') ||
         content.includes('route(') ||
         content.includes('get(') ||
         content.includes('post(') ||
         content.includes('put(') ||
         content.includes('delete(') ||
         content.includes('patch(');
}

function extractKtorRoutes(lines: string[], file: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const prefixStack: string[] = [];
  const braceStack: number[] = [];
  let braceDepth = 0;

  const httpMethodPattern = /^\s*(get|post|put|delete|patch|head|options)\s*\(\s*["'](\/[^"']*?)["']\s*\)/i;
  const httpMethodNoPathPattern = /^\s*(get|post|put|delete|patch|head|options)\s*\(\s*\)/i;
  const httpMethodBlockPattern = /^\s*(get|post|put|delete|patch|head|options)\s*\(\s*["'](\/[^"']*?)["']\s*\)\s*\{/i;
  const httpMethodNoPathBlockPattern = /^\s*(get|post|put|delete|patch|head|options)\s*\(\s*\)\s*\{/i;
  const routeBlockPattern = /^\s*route\s*\(\s*["'](\/[^"']*?)["']\s*\)\s*\{/;
  const routingBlockPattern = /^\s*routing\s*\{/;
  const routingCallPattern = /^\s*routing\s*\(\s*\)\s*\{/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track braces for prefix stack management
    const openBraces = countChar(line, '{');
    const closeBraces = countChar(line, '}');

    // Check for routing { } block start
    if (routingBlockPattern.test(trimmed) || routingCallPattern.test(trimmed)) {
      braceDepth += openBraces;
      braceStack.push(braceDepth);
      continue;
    }

    // Check for route("/prefix") { } block - adds prefix
    const routeMatch = trimmed.match(routeBlockPattern);
    if (routeMatch) {
      prefixStack.push(routeMatch[1]);
      braceDepth += openBraces;
      braceStack.push(braceDepth);
      continue;
    }

    // Check for HTTP method with path and block: get("/path") { ... }
    const methodBlockMatch = trimmed.match(httpMethodBlockPattern);
    if (methodBlockMatch) {
      const method = methodBlockMatch[1].toUpperCase();
      const routePath = methodBlockMatch[2];
      const fullPath = buildKtorPath(prefixStack, routePath);
      const handler = extractKtorHandler(lines, i);

      routes.push({
        method,
        path: fullPath,
        file,
        line: i + 1,
        handler,
        framework: 'ktor',
      });

      braceDepth += openBraces;
      braceDepth -= closeBraces;
      popExpiredPrefixes(braceStack, prefixStack, braceDepth);
      continue;
    }

    // Check for HTTP method without path: get() { ... } (inherits route prefix)
    const methodNoPathBlockMatch = trimmed.match(httpMethodNoPathBlockPattern);
    if (methodNoPathBlockMatch) {
      const method = methodNoPathBlockMatch[1].toUpperCase();
      const fullPath = buildKtorPath(prefixStack, '');
      const handler = extractKtorHandler(lines, i);

      routes.push({
        method,
        path: fullPath || '/',
        file,
        line: i + 1,
        handler,
        framework: 'ktor',
      });

      braceDepth += openBraces;
      braceDepth -= closeBraces;
      popExpiredPrefixes(braceStack, prefixStack, braceDepth);
      continue;
    }

    // Check for HTTP method with path (single-line, no opening brace on same line)
    const methodMatch = trimmed.match(httpMethodPattern);
    if (methodMatch) {
      const method = methodMatch[1].toUpperCase();
      const routePath = methodMatch[2];
      const fullPath = buildKtorPath(prefixStack, routePath);
      const handler = extractKtorHandler(lines, i);

      routes.push({
        method,
        path: fullPath,
        file,
        line: i + 1,
        handler,
        framework: 'ktor',
      });
    }

    // Check for HTTP method without path (single-line)
    const methodNoPathMatch = trimmed.match(httpMethodNoPathPattern);
    if (methodNoPathMatch && !methodNoPathBlockMatch) {
      const method = methodNoPathMatch[1].toUpperCase();
      const fullPath = buildKtorPath(prefixStack, '');

      routes.push({
        method,
        path: fullPath || '/',
        file,
        line: i + 1,
        framework: 'ktor',
      });
    }

    // Update brace depth
    braceDepth += openBraces;
    braceDepth -= closeBraces;

    // Pop prefixes when their enclosing block closes
    popExpiredPrefixes(braceStack, prefixStack, braceDepth);
  }

  return routes;
}

function buildKtorPath(prefixStack: string[], routePath: string): string {
  const prefix = prefixStack.join('');
  const fullPath = prefix + (routePath || '');
  if (!fullPath) return '/';
  return fullPath.replace(/\/+/g, '/');
}

function popExpiredPrefixes(braceStack: number[], prefixStack: string[], currentDepth: number): void {
  while (braceStack.length > 0 && currentDepth < braceStack[braceStack.length - 1]) {
    braceStack.pop();
    if (prefixStack.length > 0) {
      prefixStack.pop();
    }
  }
}

function extractKtorHandler(lines: string[], routeLine: number): string | undefined {
  // Look for call.respond, call.respondText, etc. in the handler body
  for (let i = routeLine + 1; i < Math.min(routeLine + 10, lines.length); i++) {
    const line = lines[i].trim();
    if (line === '}') break;

    // Look for function calls that indicate the handler action
    const callMatch = line.match(/(?:call\.)?(\w+)\s*\(/);
    if (callMatch && !['if', 'when', 'val', 'var', 'for', 'while'].includes(callMatch[1])) {
      return callMatch[1];
    }
  }
  return undefined;
}

// --- Spring Boot (Kotlin) Route Scanner ---

export function scanSpringBootRoutes(rootPath: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const sourceFiles = walkKotlinFiles(rootPath);

  for (const filePath of sourceFiles) {
    const content = readSafe(filePath);
    if (!content) continue;
    if (!isSpringControllerFile(content)) continue;

    const relativePath = path.relative(rootPath, filePath);
    routes.push(...extractSpringRoutes(content, relativePath));
  }

  return routes;
}

function isSpringControllerFile(content: string): boolean {
  return content.includes('@RestController') ||
         content.includes('@Controller') ||
         content.includes('@RequestMapping') ||
         content.includes('@GetMapping') ||
         content.includes('@PostMapping') ||
         content.includes('@PutMapping') ||
         content.includes('@DeleteMapping') ||
         content.includes('@PatchMapping');
}

function extractSpringRoutes(content: string, file: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const lines = content.split('\n');

  let classPrefix = '';

  const requestMappingClassPattern = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?(?:\[?\s*)?["'](\/[^"']*?)["']/;
  const requestMappingArrayPattern = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?\[\s*["'](\/[^"']*?)["']/;
  const requestMappingSimplePattern = /@RequestMapping\s*\(\s*["'](\/[^"']*?)["']\s*\)/;

  // Method-level mapping annotations
  const getMappingPattern = /@GetMapping\s*(?:\(\s*(?:value\s*=\s*)?(?:\[?\s*)?["'](\/[^"']*?)["'])?/;
  const postMappingPattern = /@PostMapping\s*(?:\(\s*(?:value\s*=\s*)?(?:\[?\s*)?["'](\/[^"']*?)["'])?/;
  const putMappingPattern = /@PutMapping\s*(?:\(\s*(?:value\s*=\s*)?(?:\[?\s*)?["'](\/[^"']*?)["'])?/;
  const deleteMappingPattern = /@DeleteMapping\s*(?:\(\s*(?:value\s*=\s*)?(?:\[?\s*)?["'](\/[^"']*?)["'])?/;
  const patchMappingPattern = /@PatchMapping\s*(?:\(\s*(?:value\s*=\s*)?(?:\[?\s*)?["'](\/[^"']*?)["'])?/;

  // @RequestMapping with method attribute for method-level
  const requestMappingMethodPattern = /@RequestMapping\s*\(\s*(?:.*?value\s*=\s*(?:\[?\s*)?["'](\/[^"']*?)["'])?(?:.*?method\s*=\s*\[?\s*RequestMethod\.(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD))?/;

  // Check for class-level @RequestMapping before any method-level annotations
  const classAnnotationLine = findClassAnnotationLine(lines);
  if (classAnnotationLine >= 0) {
    const annotationBlock = extractAnnotationBlock(lines, classAnnotationLine);
    const prefixMatch = annotationBlock.match(requestMappingClassPattern) ||
                        annotationBlock.match(requestMappingArrayPattern) ||
                        annotationBlock.match(requestMappingSimplePattern);
    if (prefixMatch) {
      classPrefix = normalizePath(prefixMatch[1]);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip class-level RequestMapping (already processed)
    if (i === classAnnotationLine) continue;

    let method: string | null = null;
    let routePath = '';

    // @GetMapping
    const getMatch = trimmed.match(getMappingPattern);
    if (getMatch) {
      method = 'GET';
      routePath = getMatch[1] || '';
    }

    // @PostMapping
    if (!method) {
      const postMatch = trimmed.match(postMappingPattern);
      if (postMatch) {
        method = 'POST';
        routePath = postMatch[1] || '';
      }
    }

    // @PutMapping
    if (!method) {
      const putMatch = trimmed.match(putMappingPattern);
      if (putMatch) {
        method = 'PUT';
        routePath = putMatch[1] || '';
      }
    }

    // @DeleteMapping
    if (!method) {
      const deleteMatch = trimmed.match(deleteMappingPattern);
      if (deleteMatch) {
        method = 'DELETE';
        routePath = deleteMatch[1] || '';
      }
    }

    // @PatchMapping
    if (!method) {
      const patchMatch = trimmed.match(patchMappingPattern);
      if (patchMatch) {
        method = 'PATCH';
        routePath = patchMatch[1] || '';
      }
    }

    // @RequestMapping with method (method-level)
    if (!method && trimmed.includes('@RequestMapping') && i !== classAnnotationLine) {
      const annotationBlock = extractAnnotationBlock(lines, i);
      const rmMatch = annotationBlock.match(requestMappingMethodPattern);
      if (rmMatch) {
        routePath = rmMatch[1] || '';
        method = rmMatch[2] || 'GET';
      }
    }

    if (method) {
      const normalizedRoute = routePath ? normalizePath(routePath) : '';
      const fullPath = joinPaths(classPrefix, normalizedRoute);
      const handler = extractSpringHandler(lines, i);

      routes.push({
        method,
        path: fullPath || '/',
        file,
        line: i + 1,
        handler,
        framework: 'spring-boot',
      });
    }
  }

  return routes;
}

function findClassAnnotationLine(lines: string[]): number {
  // Find @RequestMapping that appears before a class declaration
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.includes('@RequestMapping')) {
      // Check if there's a class declaration within the next few lines
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (lines[j].match(/^\s*(?:@\w+.*\s+)*(?:open\s+|abstract\s+|data\s+)?class\s+/)) {
          return i;
        }
      }
      // Also check if this line itself has a class marker nearby
      if (i > 0 && lines[i - 1].trim().includes('@RestController') ||
          lines[i - 1].trim().includes('@Controller')) {
        return i;
      }
    }
  }
  return -1;
}

function extractSpringHandler(lines: string[], annotationLine: number): string | undefined {
  for (let i = annotationLine + 1; i < Math.min(annotationLine + 5, lines.length); i++) {
    const line = lines[i].trim();
    // Skip other annotations
    if (line.startsWith('@')) continue;
    // Match Kotlin function declaration
    const match = line.match(/(?:suspend\s+)?fun\s+(\w+)\s*\(/);
    if (match) {
      return match[1];
    }
    // Match Java method declaration
    const javaMatch = line.match(/(?:public|private|protected)?\s*(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/);
    if (javaMatch) {
      return javaMatch[1];
    }
  }
  return undefined;
}

// --- Android Navigation Route Scanner ---

export function scanAndroidNavRoutes(rootPath: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const sourceFiles = walkKotlinFiles(rootPath);

  for (const filePath of sourceFiles) {
    const content = readSafe(filePath);
    if (!content) continue;
    if (!isNavFile(content)) continue;

    const relativePath = path.relative(rootPath, filePath);
    routes.push(...extractAndroidNavRoutes(content, relativePath));
  }

  return routes;
}

function isNavFile(content: string): boolean {
  return content.includes('NavHost') ||
         content.includes('composable(') ||
         content.includes('navigation(') ||
         content.includes('NavGraph');
}

function extractAndroidNavRoutes(content: string, file: string): ScannedRoute[] {
  const routes: ScannedRoute[] = [];
  const lines = content.split('\n');

  const prefixStack: string[] = [];
  const braceStack: number[] = [];
  let braceDepth = 0;

  // composable("route") { ... }
  const composablePattern = /composable\s*\(\s*(?:route\s*=\s*)?["']([^"']+)["']/;
  // composable(route = SomeRoute::class) -- type-safe navigation
  const composableTypePattern = /composable\s*<\s*(\w+)\s*>/;

  // navigation(startDestination = "...", route = "...") { ... }
  const navigationBlockPattern = /navigation\s*\(\s*(?:[^)]*?route\s*=\s*["']([^"']+)["']|[^)]*?startDestination\s*=\s*["']([^"']+)["'])/;

  // NavHost(navController, startDestination = "...")
  const navHostPattern = /NavHost\s*\([^)]*startDestination\s*=\s*["']([^"']+)["']/;

  // dialog("route") { ... }
  const dialogPattern = /dialog\s*\(\s*(?:route\s*=\s*)?["']([^"']+)["']/;

  // bottomSheet("route") { ... } (Accompanist)
  const bottomSheetPattern = /bottomSheet\s*\(\s*(?:route\s*=\s*)?["']([^"']+)["']/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const openBraces = countChar(line, '{');
    const closeBraces = countChar(line, '}');

    // NavHost - record start destination
    const navHostMatch = trimmed.match(navHostPattern);
    if (navHostMatch) {
      // NavHost itself is not a route, but marks the graph entry point
      braceDepth += openBraces;
      braceDepth -= closeBraces;
      continue;
    }

    // navigation() { } block - nested graph with route prefix
    const navBlockMatch = trimmed.match(navigationBlockPattern);
    if (navBlockMatch) {
      const routeValue = navBlockMatch[1] || ''; // route parameter
      if (routeValue) {
        prefixStack.push(routeValue);
        braceDepth += openBraces;
        braceStack.push(braceDepth);
        continue;
      }
    }

    // composable("route") { ... }
    const composableMatch = trimmed.match(composablePattern);
    if (composableMatch) {
      const route = composableMatch[1];
      const fullRoute = buildNavRoute(prefixStack, route);
      const handler = extractComposableHandler(lines, i);

      routes.push({
        method: 'SCREEN',
        path: fullRoute,
        file,
        line: i + 1,
        handler,
        framework: 'android-nav',
      });

      braceDepth += openBraces;
      braceDepth -= closeBraces;
      popExpiredPrefixes(braceStack, prefixStack, braceDepth);
      continue;
    }

    // composable<TypeSafeRoute> { ... }
    const composableTypeMatch = trimmed.match(composableTypePattern);
    if (composableTypeMatch) {
      const routeType = composableTypeMatch[1];
      const handler = extractComposableHandler(lines, i);

      routes.push({
        method: 'SCREEN',
        path: routeType,
        file,
        line: i + 1,
        handler,
        framework: 'android-nav',
      });

      braceDepth += openBraces;
      braceDepth -= closeBraces;
      popExpiredPrefixes(braceStack, prefixStack, braceDepth);
      continue;
    }

    // dialog("route") { ... }
    const dialogMatch = trimmed.match(dialogPattern);
    if (dialogMatch) {
      const route = dialogMatch[1];
      const fullRoute = buildNavRoute(prefixStack, route);
      const handler = extractComposableHandler(lines, i);

      routes.push({
        method: 'DIALOG',
        path: fullRoute,
        file,
        line: i + 1,
        handler,
        framework: 'android-nav',
      });

      braceDepth += openBraces;
      braceDepth -= closeBraces;
      popExpiredPrefixes(braceStack, prefixStack, braceDepth);
      continue;
    }

    // bottomSheet("route") { ... }
    const bottomSheetMatch = trimmed.match(bottomSheetPattern);
    if (bottomSheetMatch) {
      const route = bottomSheetMatch[1];
      const fullRoute = buildNavRoute(prefixStack, route);
      const handler = extractComposableHandler(lines, i);

      routes.push({
        method: 'BOTTOM_SHEET',
        path: fullRoute,
        file,
        line: i + 1,
        handler,
        framework: 'android-nav',
      });

      braceDepth += openBraces;
      braceDepth -= closeBraces;
      popExpiredPrefixes(braceStack, prefixStack, braceDepth);
      continue;
    }

    // Update brace depth
    braceDepth += openBraces;
    braceDepth -= closeBraces;
    popExpiredPrefixes(braceStack, prefixStack, braceDepth);
  }

  return routes;
}

function buildNavRoute(prefixStack: string[], route: string): string {
  if (prefixStack.length === 0) return route;
  return prefixStack.join('/') + '/' + route;
}

function extractComposableHandler(lines: string[], routeLine: number): string | undefined {
  // Look for composable function calls inside the block: HomeScreen(), ProfileScreen()
  for (let i = routeLine; i < Math.min(routeLine + 5, lines.length); i++) {
    const line = lines[i].trim();
    // Match PascalCase composable invocations
    const match = line.match(/([A-Z]\w+Screen|[A-Z]\w+Page|[A-Z]\w+View|[A-Z]\w+Dialog|[A-Z]\w+Sheet|[A-Z]\w+Content)\s*\(/);
    if (match) {
      return match[1];
    }
    // Broader match for any PascalCase function call that looks like a composable
    const broadMatch = line.match(/\{\s*(?:.*->)?\s*([A-Z]\w+)\s*\(/);
    if (broadMatch && i > routeLine) {
      return broadMatch[1];
    }
  }
  return undefined;
}

// --- Shared Utilities ---

function countChar(str: string, ch: string): number {
  let count = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const prev = i > 0 ? str[i - 1] : '';

    if (!inString && (c === '"' || c === '\'')) {
      inString = true;
      stringChar = c;
    } else if (inString && c === stringChar && prev !== '\\') {
      inString = false;
    } else if (!inString && c === ch) {
      count++;
    }
  }

  return count;
}

function normalizePath(p: string): string {
  if (!p) return '';
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  return p.replace(/\/+/g, '/').replace(/\/$/, '');
}

function joinPaths(prefix: string, suffix: string): string {
  if (!prefix && !suffix) return '/';
  if (!prefix) return suffix || '/';
  if (!suffix) return prefix;

  const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const normalizedSuffix = suffix.startsWith('/') ? suffix : '/' + suffix;

  return normalizedPrefix + normalizedSuffix;
}

function extractAnnotationBlock(lines: string[], startIndex: number): string {
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

function walkKotlinFiles(rootPath: string): string[] {
  const files: string[] = [];
  walkRecursive(rootPath, files, (name) => {
    const lower = name.toLowerCase();
    return lower.endsWith('.kt') || lower.endsWith('.kts') || lower.endsWith('.java');
  }, 0);
  return files;
}

function walkRecursive(dir: string, result: string[], filter: (name: string) => boolean, depth: number): void {
  if (depth > MAX_DEPTH) return;

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
      walkRecursive(fullPath, result, filter, depth + 1);
    } else if (entry.isFile() && filter(entry.name)) {
      const lower = entry.name.toLowerCase();
      if (lower.includes('.test.') || lower.includes('.spec.') ||
          lower.includes('test') && lower.endsWith('.kt') && !lower.includes('controller') && !lower.includes('route')) {
        continue;
      }
      result.push(fullPath);
    }
  }
}

function readSafe(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function fileExists(filePath: string): boolean {
  try {
    fs.statSync(filePath);
    return true;
  } catch {
    return false;
  }
}
