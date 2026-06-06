import * as fs from 'fs';
import * as path from 'path';
import {
  DiscoveredContract,
  DetectedCall,
  ContractEndpoint,
  ContractType,
  ConnectionProtocol,
} from '@engineering-os/shared';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', 'vendor', '__pycache__', '.eos', '.turbo', 'target',
]);

const MAX_FILE_SIZE = 512 * 1024;

export class ContractDiscovery {
  constructor(private rootPath: string) {}

  async discoverContracts(): Promise<DiscoveredContract[]> {
    const contracts: DiscoveredContract[] = [];

    const files = this.walkForContracts(this.rootPath);

    for (const filePath of files) {
      const content = this.readSafe(filePath);
      if (!content) continue;

      const relativePath = path.relative(this.rootPath, filePath);
      const basename = path.basename(filePath).toLowerCase();

      if (this.isOpenApiSpec(basename, content)) {
        const endpoints = this.parseOpenApiEndpoints(content);
        const version = this.extractOpenApiVersion(content);
        contracts.push({ filePath: relativePath, type: 'openapi', endpoints, version });
      } else if (basename.endsWith('.proto')) {
        const endpoints = this.parseProtoEndpoints(content);
        contracts.push({ filePath: relativePath, type: 'grpc', endpoints });
      } else if (this.isGraphqlSchema(basename, content)) {
        const endpoints = this.parseGraphqlEndpoints(content);
        contracts.push({ filePath: relativePath, type: 'graphql', endpoints });
      } else if (this.isEventSchema(basename, relativePath, content)) {
        const endpoints = this.parseEventEndpoints(content, basename);
        contracts.push({ filePath: relativePath, type: 'event-schema', endpoints });
      }
    }

    return contracts;
  }

  async detectOutboundCalls(): Promise<DetectedCall[]> {
    const calls: DetectedCall[] = [];
    const sourceFiles = this.walkForSource(this.rootPath);

    for (const filePath of sourceFiles) {
      const content = this.readSafe(filePath);
      if (!content) continue;

      const relativePath = path.relative(this.rootPath, filePath);
      const lines = content.split('\n');

      calls.push(...this.detectHttpCalls(relativePath, lines));
      calls.push(...this.detectGrpcCalls(relativePath, lines));
      calls.push(...this.detectEventPublishing(relativePath, lines));
      calls.push(...this.detectSharedPackageImports(relativePath, lines));
    }

    return calls;
  }

  // --- OpenAPI ---

  private isOpenApiSpec(basename: string, content: string): boolean {
    const apiFileNames = ['openapi.yaml', 'openapi.yml', 'openapi.json', 'swagger.yaml', 'swagger.yml', 'swagger.json'];
    if (apiFileNames.includes(basename)) return true;
    return content.includes('openapi:') || content.includes('"openapi"') || content.includes('swagger:');
  }

  private parseOpenApiEndpoints(content: string): ContractEndpoint[] {
    const endpoints: ContractEndpoint[] = [];
    const pathRegex = /^\s{0,2}(\/[^\s:]+):\s*$/gm;
    const methodRegex = /^\s+(get|post|put|patch|delete|options|head):\s*$/gm;

    let currentPath: string | null = null;
    const lines = content.split('\n');

    for (const line of lines) {
      const pathMatch = line.match(/^\s{0,2}(\/[^\s:]+):\s*$/);
      if (pathMatch) {
        currentPath = pathMatch[1];
        continue;
      }

      if (currentPath) {
        const methodMatch = line.match(/^\s+(get|post|put|patch|delete|options|head):\s*$/);
        if (methodMatch) {
          endpoints.push({
            method: methodMatch[1].toUpperCase(),
            path: currentPath,
          });
        }

        if (line.match(/^\s{0,2}\S/) && !line.match(/^\s+(get|post|put|patch|delete|options|head|summary|description|parameters|responses|requestBody|tags|operationId)/)) {
          currentPath = null;
        }
      }
    }

    // JSON format fallback
    if (endpoints.length === 0 && content.includes('"paths"')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.paths) {
          for (const [pathStr, methods] of Object.entries(parsed.paths)) {
            for (const method of Object.keys(methods as object)) {
              if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
                endpoints.push({ method: method.toUpperCase(), path: pathStr });
              }
            }
          }
        }
      } catch { /* not valid JSON */ }
    }

    return endpoints;
  }

  private extractOpenApiVersion(content: string): string | undefined {
    const match = content.match(/(?:openapi|swagger):\s*['"]?([0-9.]+)/);
    if (match) return match[1];
    try {
      const parsed = JSON.parse(content);
      return parsed.openapi || parsed.swagger;
    } catch {
      return undefined;
    }
  }

  // --- gRPC/Proto ---

  private parseProtoEndpoints(content: string): ContractEndpoint[] {
    const endpoints: ContractEndpoint[] = [];
    const serviceRegex = /service\s+(\w+)\s*\{([^}]+)\}/g;
    const rpcRegex = /rpc\s+(\w+)\s*\((\w+)\)\s*returns\s*\((\w+)\)/g;

    let serviceMatch: RegExpExecArray | null;
    while ((serviceMatch = serviceRegex.exec(content)) !== null) {
      const serviceName = serviceMatch[1];
      const serviceBody = serviceMatch[2];

      let rpcMatch: RegExpExecArray | null;
      while ((rpcMatch = rpcRegex.exec(serviceBody)) !== null) {
        endpoints.push({
          path: `${serviceName}/${rpcMatch[1]}`,
          name: rpcMatch[1],
          description: `${rpcMatch[2]} -> ${rpcMatch[3]}`,
        });
      }
    }

    return endpoints;
  }

  // --- GraphQL ---

  private isGraphqlSchema(basename: string, content: string): boolean {
    if (basename.endsWith('.graphql') || basename.endsWith('.gql')) return true;
    if (basename === 'schema.graphql' || basename === 'schema.gql') return true;
    return false;
  }

  private parseGraphqlEndpoints(content: string): ContractEndpoint[] {
    const endpoints: ContractEndpoint[] = [];
    const typeRegex = /type\s+(Query|Mutation|Subscription)\s*\{([^}]+)\}/g;

    let typeMatch: RegExpExecArray | null;
    while ((typeMatch = typeRegex.exec(content)) !== null) {
      const typeName = typeMatch[1];
      const body = typeMatch[2];
      const fieldRegex = /(\w+)\s*(?:\([^)]*\))?\s*:/g;

      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = fieldRegex.exec(body)) !== null) {
        endpoints.push({
          method: typeName.toUpperCase(),
          path: fieldMatch[1],
          name: fieldMatch[1],
        });
      }
    }

    return endpoints;
  }

  // --- Event Schemas ---

  private isEventSchema(basename: string, relativePath: string, content: string): boolean {
    if (relativePath.includes('events/') || relativePath.includes('event-schemas/')) {
      if (basename.endsWith('.yaml') || basename.endsWith('.yml') || basename.endsWith('.json')) {
        return content.includes('event') || content.includes('topic') || content.includes('channel');
      }
    }
    if (basename.includes('event') && basename.endsWith('.schema.json')) return true;
    return false;
  }

  private parseEventEndpoints(content: string, basename: string): ContractEndpoint[] {
    const endpoints: ContractEndpoint[] = [];

    const topicRegex = /(?:topic|channel|event(?:Name|Type)?)\s*[:=]\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = topicRegex.exec(content)) !== null) {
      endpoints.push({ path: match[1], name: match[1], method: 'EVENT' });
    }

    if (endpoints.length === 0) {
      const name = basename.replace(/\.(yaml|yml|json|schema)$/g, '');
      endpoints.push({ path: name, name, method: 'EVENT' });
    }

    return endpoints;
  }

  // --- Outbound Call Detection ---

  private detectHttpCalls(filePath: string, lines: string[]): DetectedCall[] {
    const calls: DetectedCall[] = [];
    const urlPatterns = [
      /(?:axios|fetch|got|request|http|ky)\s*\.\s*(?:get|post|put|patch|delete)\s*\(\s*[`'"](https?:\/\/[^'"`\s]+)/,
      /(?:axios|fetch|got|request|http|ky)\s*\(\s*[`'"](https?:\/\/[^'"`\s]+)/,
      /baseURL\s*[:=]\s*[`'"](https?:\/\/[^'"`\s]+)/,
      /(?:BASE_URL|API_URL|SERVICE_URL|ENDPOINT)\s*[:=]\s*[`'"](https?:\/\/[^'"`\s]+)/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of urlPatterns) {
        const match = line.match(pattern);
        if (match) {
          calls.push({
            sourceFile: filePath,
            targetUrl: match[1],
            protocol: 'rest',
            evidence: `Line ${i + 1}: ${line.trim().slice(0, 120)}`,
          });
          break;
        }
      }
    }

    return calls;
  }

  private detectGrpcCalls(filePath: string, lines: string[]): DetectedCall[] {
    const calls: DetectedCall[] = [];
    const grpcPatterns = [
      /new\s+\w+Client\s*\(\s*[`'"]([\w.:]+)['"]/,
      /grpc\.(?:dial|NewClient)\s*\(\s*[`'"]([\w.:]+)['"]/,
      /createChannel\s*\(\s*[`'"]([\w.:]+)['"]/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of grpcPatterns) {
        const match = line.match(pattern);
        if (match) {
          calls.push({
            sourceFile: filePath,
            targetUrl: match[1],
            protocol: 'grpc',
            evidence: `Line ${i + 1}: ${line.trim().slice(0, 120)}`,
          });
          break;
        }
      }
    }

    return calls;
  }

  private detectEventPublishing(filePath: string, lines: string[]): DetectedCall[] {
    const calls: DetectedCall[] = [];
    const eventPatterns = [
      /(?:publish|emit|send|produce|dispatch)\s*\(\s*[`'"]([\w./-]+)['"]/,
      /(?:channel|topic|queue)\s*[:=]\s*[`'"]([\w./-]+)['"]/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of eventPatterns) {
        const match = line.match(pattern);
        if (match) {
          calls.push({
            sourceFile: filePath,
            targetUrl: match[1],
            protocol: 'event',
            evidence: `Line ${i + 1}: ${line.trim().slice(0, 120)}`,
          });
          break;
        }
      }
    }

    return calls;
  }

  private detectSharedPackageImports(filePath: string, lines: string[]): DetectedCall[] {
    const calls: DetectedCall[] = [];
    const importPattern = /(?:from|require\s*\()\s*[`'"]([@\w][\w./-]*)['"]/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(importPattern);
      if (match) {
        const pkg = match[1];
        if (pkg.startsWith('@') && !pkg.startsWith('@types/') && this.isInternalPackage(pkg)) {
          calls.push({
            sourceFile: filePath,
            targetPackage: pkg,
            protocol: 'import',
            evidence: `Line ${i + 1}: ${line.trim().slice(0, 120)}`,
          });
        }
      }
    }

    return calls;
  }

  private isInternalPackage(pkg: string): boolean {
    const externalScopes = ['@types', '@babel', '@jest', '@testing-library', '@eslint',
      '@typescript-eslint', '@modelcontextprotocol', '@vitejs', '@rollup', '@swc',
      '@expo', '@react-native', '@react-navigation', '@react-native-community',
      '@tanstack', '@trpc', '@prisma', '@nestjs', '@angular', '@vue',
      '@emotion', '@mui', '@chakra-ui', '@radix-ui', '@headlessui',
      '@aws-sdk', '@azure', '@google-cloud', '@grpc', '@protobufjs',
      '@hapi', '@fastify', '@koa', '@express', '@storybook',
      '@sentry', '@datadog', '@opentelemetry', '@vercel', '@next',
      '@sveltejs', '@nuxtjs', '@remix-run', '@reduxjs', '@ngrx'];
    const scope = pkg.split('/')[0];
    return !externalScopes.includes(scope);
  }

  // --- File Walking ---

  private walkForContracts(dir: string): string[] {
    const files: string[] = [];
    this.walk(dir, files, (name) => {
      const lower = name.toLowerCase();
      return lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.json') ||
        lower.endsWith('.proto') || lower.endsWith('.graphql') || lower.endsWith('.gql');
    }, 0);
    return files;
  }

  private walkForSource(dir: string): string[] {
    const files: string[] = [];
    this.walk(dir, files, (name) => {
      const lower = name.toLowerCase();
      return lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') ||
        lower.endsWith('.jsx') || lower.endsWith('.go') || lower.endsWith('.py') ||
        lower.endsWith('.java') || lower.endsWith('.rs');
    }, 0);
    return files;
  }

  private walk(dir: string, result: string[], filter: (name: string) => boolean, depth: number): void {
    if (depth > 6) return;

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
        this.walk(fullPath, result, filter, depth + 1);
      } else if (entry.isFile() && filter(entry.name)) {
        result.push(fullPath);
      }
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
