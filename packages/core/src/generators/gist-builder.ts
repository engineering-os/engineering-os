import * as fs from 'fs';
import * as path from 'path';
import { ArchitectureStore } from '../architecture/architecture-store';
import { DecisionStore } from '../decisions/decision-store';
import { GraphStore } from '../architecture/graph-store';
import { WorkspaceLoader, WorkspaceConfig } from './workspace-loader';
import { RouteScanner, ScannedRoute } from '../knowledge/route-scanner';
import { GraphQLParser, GraphQLSchema, GraphQLOperation } from '../knowledge/graphql-parser';
import { InfraParser, InfraTopology, InfraNode, InfraConnection } from '../knowledge/infra-parser';

export interface GistOptions {
  maxTokens?: number;
  includeRoutes?: boolean;
  includeGraphql?: boolean;
  includeInfra?: boolean;
  includeConventions?: boolean;
  includeDecisions?: boolean;
}

interface KeyDirectory {
  name: string;
  path: string;
  description: string;
}

interface EntryPoint {
  file: string;
  type: string;
}

const DEFAULT_OPTIONS: Required<GistOptions> = {
  maxTokens: 8000,
  includeRoutes: true,
  includeGraphql: true,
  includeInfra: true,
  includeConventions: true,
  includeDecisions: true,
};

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'coverage', 'vendor', '__pycache__', '.eos', '.turbo', 'target',
]);

const APPROX_CHARS_PER_TOKEN = 4;

export class GistBuilder {
  private workspace: WorkspaceConfig | null;

  constructor(private deps: {
    rootPath: string;
    projectName: string;
    architectureStore: ArchitectureStore;
    decisionStore: DecisionStore;
    graphStore: GraphStore;
  }) {
    const loader = new WorkspaceLoader(deps.rootPath);
    this.workspace = loader.load();
  }

  async build(options?: GistOptions): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const maxChars = opts.maxTokens * APPROX_CHARS_PER_TOKEN;

    const sections: string[] = [];

    // 1. Project identity (always included, highest priority)
    sections.push(this.buildIdentitySection());

    // 2. API surface (routes)
    if (opts.includeRoutes) {
      const routeSection = this.buildRouteSection();
      if (routeSection) sections.push(routeSection);
    }

    // 3. GraphQL surface
    if (opts.includeGraphql) {
      const gqlSection = this.buildGraphQLSection();
      if (gqlSection) sections.push(gqlSection);
    }

    // 4. Infrastructure topology
    if (opts.includeInfra) {
      const infraSection = this.buildInfraSection();
      if (infraSection) sections.push(infraSection);
    }

    // 5. Key file locations
    const keyFilesSection = this.buildKeyFilesSection();
    if (keyFilesSection) sections.push(keyFilesSection);

    // 6. Conventions
    if (opts.includeConventions) {
      const convSection = await this.buildConventionsSection();
      if (convSection) sections.push(convSection);
    }

    // 7. Decisions
    if (opts.includeDecisions) {
      const decSection = await this.buildDecisionsSection();
      if (decSection) sections.push(decSection);
    }

    // 8. Cross-repo dependencies
    const crossRepoSection = this.buildCrossRepoSection();
    if (crossRepoSection) sections.push(crossRepoSection);

    // 9. Linked service details (routes, GraphQL from linked repos)
    const linkedSection = this.buildLinkedServicesSection();
    if (linkedSection) sections.push(linkedSection);

    // 10. EOS tool instructions (always included)
    sections.push(this.buildEosToolsSection());

    // Assemble and trim to fit token budget
    return this.assembleWithBudget(sections, maxChars);
  }

  // --- Section Builders ---

  private buildIdentitySection(): string {
    const lines: string[] = [];
    lines.push(`# ${this.deps.projectName}`);
    lines.push('');

    const techStack = this.detectTechStack();
    const projectType = this.workspace?.type || this.inferProjectType();

    const meta: string[] = [];
    if (projectType) meta.push(`**Type:** ${projectType}`);
    if (techStack.length > 0) meta.push(`**Stack:** ${techStack.join(', ')}`);
    if (this.workspace?.org) meta.push(`**Org:** ${this.workspace.org}`);

    if (meta.length > 0) {
      lines.push(meta.join(' | '));
      lines.push('');
    }

    return lines.join('\n');
  }

  private buildRouteSection(): string | null {
    const scanner = new RouteScanner(this.deps.rootPath);
    const routes = scanner.scan();

    if (routes.length === 0) return null;

    const lines: string[] = [];
    lines.push('## API Routes');
    lines.push('');

    // Group routes by base path prefix
    const grouped = this.groupRoutesByPrefix(routes);

    for (const [prefix, groupRoutes] of grouped) {
      if (grouped.size > 1 && prefix) {
        lines.push(`### ${prefix}`);
      }

      // Cap routes per group to avoid blowing budget
      const displayRoutes = groupRoutes.slice(0, 30);
      for (const route of displayRoutes) {
        const handler = route.handler ? ` -> ${route.handler}` : '';
        lines.push(`- \`${route.method} ${route.path}\` — ${route.file}:${route.line}${handler}`);
      }

      if (groupRoutes.length > 30) {
        lines.push(`- ... and ${groupRoutes.length - 30} more routes`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  private buildGraphQLSection(): string | null {
    const parser = new GraphQLParser(this.deps.rootPath);
    const schemas = parser.parse();

    if (schemas.length === 0) return null;

    const lines: string[] = [];
    lines.push('## GraphQL API');
    lines.push('');

    // Collect all operations across schemas
    const allOps: GraphQLOperation[] = [];
    for (const schema of schemas) {
      allOps.push(...schema.operations);
    }

    // Subgraphs
    const subgraphs = schemas.flatMap(s => s.subgraphs);
    if (subgraphs.length > 0) {
      lines.push('**Subgraphs:**');
      for (const sg of subgraphs.slice(0, 10)) {
        lines.push(`- ${sg.name} — ${sg.url}`);
      }
      lines.push('');
    }

    // Operations grouped by type
    const queries = allOps.filter(o => o.type === 'query');
    const mutations = allOps.filter(o => o.type === 'mutation');
    const subscriptions = allOps.filter(o => o.type === 'subscription');

    if (queries.length > 0) {
      lines.push('**Queries:**');
      for (const op of queries.slice(0, 20)) {
        const owner = op.ownerService ? ` [${op.ownerService}]` : '';
        const ret = op.returnType ? `: ${op.returnType}` : '';
        lines.push(`- \`${op.name}${ret}\`${owner} — ${op.file}:${op.line}`);
      }
      if (queries.length > 20) {
        lines.push(`- ... and ${queries.length - 20} more queries`);
      }
      lines.push('');
    }

    if (mutations.length > 0) {
      lines.push('**Mutations:**');
      for (const op of mutations.slice(0, 20)) {
        const owner = op.ownerService ? ` [${op.ownerService}]` : '';
        const ret = op.returnType ? `: ${op.returnType}` : '';
        lines.push(`- \`${op.name}${ret}\`${owner} — ${op.file}:${op.line}`);
      }
      if (mutations.length > 20) {
        lines.push(`- ... and ${mutations.length - 20} more mutations`);
      }
      lines.push('');
    }

    if (subscriptions.length > 0) {
      lines.push('**Subscriptions:**');
      for (const op of subscriptions.slice(0, 10)) {
        const owner = op.ownerService ? ` [${op.ownerService}]` : '';
        lines.push(`- \`${op.name}\`${owner} — ${op.file}:${op.line}`);
      }
      if (subscriptions.length > 10) {
        lines.push(`- ... and ${subscriptions.length - 10} more subscriptions`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private buildInfraSection(): string | null {
    const parser = new InfraParser(this.deps.rootPath);
    const topology = parser.parse();

    if (topology.nodes.length === 0 && topology.connections.length === 0) return null;

    const lines: string[] = [];
    lines.push('## Infrastructure');
    lines.push('');

    // Group nodes by type
    const nodesByType = new Map<string, InfraNode[]>();
    for (const node of topology.nodes) {
      const group = nodesByType.get(node.type) || [];
      group.push(node);
      nodesByType.set(node.type, group);
    }

    const typeLabels: Record<string, string> = {
      'service': 'Services',
      'database': 'Databases',
      'cache': 'Caches',
      'queue': 'Queues/Events',
      'storage': 'Object Storage',
      'ml-pipeline': 'ML Pipelines',
      'function': 'Functions',
      'gateway': 'Gateways',
    };

    for (const [type, nodes] of nodesByType) {
      const label = typeLabels[type] || type;
      lines.push(`**${label}:**`);
      for (const node of nodes.slice(0, 10)) {
        const provider = node.provider ? ` (${node.provider})` : '';
        const port = node.properties['ports'] ? ` :${node.properties['ports']}` : '';
        lines.push(`- ${node.name}${provider}${port} — ${node.file}`);
      }
      if (nodes.length > 10) {
        lines.push(`- ... and ${nodes.length - 10} more`);
      }
      lines.push('');
    }

    // Connections
    if (topology.connections.length > 0) {
      lines.push('**Connections:**');
      const displayed = topology.connections.slice(0, 20);
      for (const conn of displayed) {
        const detail = conn.detail ? ` (${conn.detail})` : '';
        lines.push(`- ${conn.from} -> ${conn.to} [${conn.type}]${detail}`);
      }
      if (topology.connections.length > 20) {
        lines.push(`- ... and ${topology.connections.length - 20} more connections`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private buildKeyFilesSection(): string | null {
    const keyDirs = this.discoverKeyDirectories();
    const entryPoints = this.discoverEntryPoints();

    if (keyDirs.length === 0 && entryPoints.length === 0) return null;

    const lines: string[] = [];
    lines.push('## Key Files & Directories');
    lines.push('');

    if (entryPoints.length > 0) {
      lines.push('**Entry points:**');
      for (const ep of entryPoints) {
        lines.push(`- \`${ep.file}\` — ${ep.type}`);
      }
      lines.push('');
    }

    if (keyDirs.length > 0) {
      lines.push('**Key directories:**');
      for (const dir of keyDirs) {
        lines.push(`- \`${dir.path}/\` — ${dir.description}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async buildConventionsSection(): Promise<string | null> {
    const conventions = await this.getConventions();
    if (conventions.length === 0) return null;

    const lines: string[] = [];
    lines.push('## Conventions');
    lines.push('');

    for (const conv of conventions.slice(0, 10)) {
      lines.push(`- **${conv.name}:** ${conv.rule}`);
    }
    if (conventions.length > 10) {
      lines.push(`- ... and ${conventions.length - 10} more (use \`eos_conventions\` to see all)`);
    }

    lines.push('');
    return lines.join('\n');
  }

  private async buildDecisionsSection(): Promise<string | null> {
    const decisions = await this.getDecisions();
    if (decisions.length === 0) return null;

    const lines: string[] = [];
    lines.push('## Decisions');
    lines.push('');
    lines.push('These are settled decisions. Do not propose alternatives unless explicitly asked.');
    lines.push('');

    for (const d of decisions.slice(0, 7)) {
      const rationale = d.rationale ? ` — ${d.rationale.slice(0, 100)}` : '';
      lines.push(`- **${d.title}:** ${d.decision}${rationale}`);
    }
    if (decisions.length > 7) {
      lines.push(`- ... and ${decisions.length - 7} more (use \`eos_recall_decision\` to search)`);
    }

    lines.push('');
    return lines.join('\n');
  }

  private buildCrossRepoSection(): string | null {
    const lines: string[] = [];
    let hasContent = false;

    // From workspace yaml
    if (this.workspace && this.workspace.repos.length > 0) {
      lines.push('## Cross-Repo Dependencies');
      lines.push('');

      for (const repo of this.workspace.repos) {
        const role = repo.role ? ` (${repo.role})` : '';
        lines.push(`- **${repo.name}**${role} — \`${repo.path}\``);
      }
      hasContent = true;
    }

    // From graph store connections
    try {
      const services = this.deps.graphStore.getAllServices();
      const connections = this.deps.graphStore.getAllConnections();

      if (services.length > 0 && connections.length > 0) {
        const repoNames = new Set(services.map(s => s.repoName));

        if (repoNames.size > 1) {
          if (!hasContent) {
            lines.push('## Cross-Repo Dependencies');
            lines.push('');
          } else {
            lines.push('');
            lines.push('**Service graph connections:**');
          }

          // Show cross-repo connections
          const crossRepoConns = connections.filter(c => {
            const source = services.find(s => s.id === c.sourceService);
            const target = services.find(s => s.id === c.targetService);
            return source && target && source.repoName !== target.repoName;
          });

          for (const conn of crossRepoConns.slice(0, 15)) {
            const source = services.find(s => s.id === conn.sourceService);
            const target = services.find(s => s.id === conn.targetService);
            if (source && target) {
              lines.push(`- ${source.serviceName} (${source.repoName}) -> ${target.serviceName} (${target.repoName}) [${conn.protocol}]`);
            }
          }
          if (crossRepoConns.length > 15) {
            lines.push(`- ... and ${crossRepoConns.length - 15} more cross-repo connections`);
          }
          hasContent = true;
        }
      }
    } catch {
      // Graph store not initialized — skip
    }

    if (!hasContent) return null;

    lines.push('');
    return lines.join('\n');
  }

  private buildLinkedServicesSection(): string | null {
    if (!this.workspace || this.workspace.repos.length === 0) return null;

    const lines: string[] = ['## Linked Services (cross-repo context)', ''];

    for (const repo of this.workspace.repos) {
      const repoPath = path.resolve(this.deps.rootPath, repo.path);
      if (!fs.existsSync(repoPath)) continue;

      const role = repo.role ? ` (${repo.role})` : '';
      lines.push(`### ${repo.name}${role}`);

      // Scan routes from linked repo
      try {
        const scanner = new RouteScanner(repoPath);
        const routes = scanner.scan();
        if (routes.length > 0) {
          lines.push(`**API Routes (${routes.length}):**`);
          for (const route of routes.slice(0, 15)) {
            lines.push(`- \`${route.method} ${route.path}\` — ${route.file}:${route.line}`);
          }
          if (routes.length > 15) lines.push(`- ... and ${routes.length - 15} more`);
          lines.push('');
        }
      } catch { /* skip if scan fails */ }

      // Extract GraphQL subgraphs from linked repo (fast path: read supergraph directly)
      try {
        const supergraphPaths = ['supergraph.graphql', 'src/supergraph.graphql', 'schema/supergraph.graphql'];
        for (const sgPath of supergraphPaths) {
          const fullSgPath = path.join(repoPath, sgPath);
          if (fs.existsSync(fullSgPath)) {
            const content = fs.readFileSync(fullSgPath, 'utf-8');
            const joinGraphRegex = /@join__graph\s*\(\s*name\s*:\s*"([^"]+)"\s*,\s*url\s*:\s*"([^"]+)"\s*\)/g;
            const subgraphs: Array<{name: string; url: string}> = [];
            let match: RegExpExecArray | null;
            while ((match = joinGraphRegex.exec(content)) !== null) {
              subgraphs.push({ name: match[1], url: match[2] });
            }
            if (subgraphs.length > 0) {
              lines.push(`**GraphQL Federation (${subgraphs.length} subgraphs):**`);
              for (const sg of subgraphs) {
                lines.push(`- ${sg.name} → ${sg.url}`);
              }
              lines.push('');
            }
            break;
          }
        }
      } catch { /* skip */ }

      // Show key directories (try src/ first, then root)
      try {
        const srcPath = path.join(repoPath, 'src');
        if (fs.existsSync(srcPath)) {
          const entries = fs.readdirSync(srcPath, { withFileTypes: true });
          const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).slice(0, 8);
          if (dirs.length > 0) {
            lines.push(`**Key dirs:** src/${dirs.join('/, src/')}/`);
            lines.push('');
          }
        } else {
          // Show root-level key files for non-src projects (Python, Go, Lua, etc.)
          const rootEntries = fs.readdirSync(repoPath, { withFileTypes: true });
          const keyFiles = rootEntries
            .filter((e) => e.isFile() && (e.name.endsWith('.py') || e.name.endsWith('.go') || e.name === 'Dockerfile' || e.name.endsWith('.yaml') || e.name.endsWith('.lua')))
            .map((e) => e.name).slice(0, 8);
          const keyDirs = rootEntries
            .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !['node_modules', 'dist', 'build', '__pycache__', 'venv'].includes(e.name))
            .map((e) => e.name).slice(0, 6);
          if (keyFiles.length > 0 || keyDirs.length > 0) {
            const parts: string[] = [];
            if (keyDirs.length > 0) parts.push(`dirs: ${keyDirs.join(', ')}`);
            if (keyFiles.length > 0) parts.push(`files: ${keyFiles.join(', ')}`);
            lines.push(`**Structure:** ${parts.join(' | ')}`);
            lines.push('');
          }
        }
      } catch { /* skip */ }
    }

    return lines.length > 2 ? lines.join('\n') : null;
  }

  private buildEosToolsSection(): string {
    const lines: string[] = [];
    lines.push('## EOS Tools');
    lines.push('');
    lines.push('The following MCP tools are available in this session:');
    lines.push('');
    lines.push('- `eos_search` — search across all indexed repos (faster than grep)');
    lines.push('- `eos_context` — get architecture + decisions relevant to current task');
    lines.push('- `eos_recall_decision` — check if a decision was already made');
    lines.push('- `eos_conventions` — get team coding conventions');
    lines.push('- `eos_dependencies` — check what breaks before changing shared interfaces');
    lines.push('- `eos_patterns` — find existing patterns to follow');
    lines.push('- `eos_architecture` — get full architecture graph for this service');
    lines.push('');
    lines.push('Use these tools proactively — they contain indexed knowledge that is faster and more accurate than file exploration.');
    lines.push('');

    return lines.join('\n');
  }

  // --- Data Fetchers ---

  private async getConventions(): Promise<Array<{ name: string; rule: string }>> {
    if (this.workspace && this.workspace.conventions.length > 0) {
      return this.workspace.conventions;
    }

    try {
      const discovered = await this.deps.architectureStore.getConventions();
      return discovered.map(c => ({ name: c.name, rule: (c as any).rule || (c as any).description || '' }));
    } catch {
      return [];
    }
  }

  private async getDecisions(): Promise<Array<{ title: string; decision: string; rationale?: string }>> {
    if (this.workspace && this.workspace.decisions.length > 0) {
      return this.workspace.decisions;
    }

    try {
      const all = await this.deps.decisionStore.list({ status: 'accepted' });
      return all.slice(0, 10).map(d => ({
        title: d.title,
        decision: d.decision,
        rationale: d.rationale,
      }));
    } catch {
      return [];
    }
  }

  // --- Tech Stack Detection ---

  private detectTechStack(): string[] {
    const stack: string[] = [];
    const rootPath = this.deps.rootPath;

    // package.json
    const pkgJsonPath = path.join(rootPath, 'package.json');
    const pkgContent = this.readSafe(pkgJsonPath);
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (allDeps['next']) stack.push('Next.js');
        else if (allDeps['@nestjs/core']) stack.push('NestJS');
        else if (allDeps['express']) stack.push('Express');
        else if (allDeps['fastify']) stack.push('Fastify');

        if (allDeps['react'] && !allDeps['next']) stack.push('React');
        if (allDeps['react-native']) stack.push('React Native');
        if (allDeps['vue']) stack.push('Vue');
        if (allDeps['svelte'] || allDeps['@sveltejs/kit']) stack.push('Svelte');
        if (allDeps['typescript']) stack.push('TypeScript');
        if (allDeps['prisma'] || allDeps['@prisma/client']) stack.push('Prisma');
        if (allDeps['typeorm']) stack.push('TypeORM');
        if (allDeps['drizzle-orm']) stack.push('Drizzle');
        if (allDeps['graphql'] || allDeps['@apollo/server']) stack.push('GraphQL');
        if (allDeps['tailwindcss']) stack.push('Tailwind');
      } catch {
        stack.push('Node.js');
      }
    }

    // pom.xml / build.gradle
    const pomPath = path.join(rootPath, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      const pomContent = this.readSafe(pomPath);
      if (pomContent) {
        if (pomContent.includes('spring-boot')) stack.push('Spring Boot');
        else stack.push('Java/Maven');
        if (pomContent.includes('kotlin')) stack.push('Kotlin');
      }
    }

    const gradlePath = path.join(rootPath, 'build.gradle');
    const gradleKtsPath = path.join(rootPath, 'build.gradle.kts');
    if (fs.existsSync(gradlePath) || fs.existsSync(gradleKtsPath)) {
      const content = this.readSafe(gradlePath) || this.readSafe(gradleKtsPath);
      if (content) {
        if (content.includes('spring-boot')) stack.push('Spring Boot');
        if (content.includes('org.jetbrains.kotlin')) stack.push('Kotlin');
        if (!stack.includes('Spring Boot') && !stack.includes('Kotlin')) stack.push('Java/Gradle');
      }
    }

    // Go
    const goModPath = path.join(rootPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      stack.push('Go');
    }

    // Python
    const pyProjectPath = path.join(rootPath, 'pyproject.toml');
    const requirementsPath = path.join(rootPath, 'requirements.txt');
    if (fs.existsSync(pyProjectPath) || fs.existsSync(requirementsPath)) {
      const content = this.readSafe(pyProjectPath) || this.readSafe(requirementsPath) || '';
      if (content.includes('django')) stack.push('Django');
      else if (content.includes('fastapi')) stack.push('FastAPI');
      else if (content.includes('flask')) stack.push('Flask');
      else stack.push('Python');
    }

    // Rust
    const cargoPath = path.join(rootPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      stack.push('Rust');
    }

    return stack;
  }

  private inferProjectType(): string {
    const rootPath = this.deps.rootPath;

    if (fs.existsSync(path.join(rootPath, 'app')) && fs.existsSync(path.join(rootPath, 'next.config.js'))) {
      return 'web-app';
    }
    if (fs.existsSync(path.join(rootPath, 'app.json')) || fs.existsSync(path.join(rootPath, 'expo.json'))) {
      return 'mobile-app';
    }

    const pkgContent = this.readSafe(path.join(rootPath, 'package.json'));
    if (pkgContent) {
      if (pkgContent.includes('"main"') && !pkgContent.includes('"react"')) {
        if (pkgContent.includes('"bin"')) return 'cli';
        return 'library';
      }
    }

    if (fs.existsSync(path.join(rootPath, 'docker-compose.yml')) ||
        fs.existsSync(path.join(rootPath, 'docker-compose.yaml'))) {
      return 'backend-service';
    }

    if (fs.existsSync(path.join(rootPath, 'pom.xml')) || fs.existsSync(path.join(rootPath, 'build.gradle'))) {
      return 'backend-service';
    }

    if (fs.existsSync(path.join(rootPath, 'packages')) || fs.existsSync(path.join(rootPath, 'pnpm-workspace.yaml'))) {
      return 'monorepo';
    }

    return 'project';
  }

  // --- Key File Discovery ---

  private discoverKeyDirectories(): KeyDirectory[] {
    const dirs: KeyDirectory[] = [];
    const rootPath = this.deps.rootPath;

    const candidates: Array<{ paths: string[]; description: string }> = [
      { paths: ['src/app', 'app'], description: 'App router / pages' },
      { paths: ['src/pages', 'pages'], description: 'Pages' },
      { paths: ['src/components', 'components'], description: 'UI components' },
      { paths: ['src/lib', 'lib', 'src/utils', 'utils'], description: 'Shared utilities' },
      { paths: ['src/api', 'api', 'src/routes', 'routes'], description: 'API routes/handlers' },
      { paths: ['src/services', 'services'], description: 'Business logic / services' },
      { paths: ['src/models', 'models', 'src/entities', 'entities'], description: 'Data models' },
      { paths: ['src/hooks', 'hooks'], description: 'React hooks' },
      { paths: ['src/stores', 'stores', 'src/store', 'store'], description: 'State management' },
      { paths: ['src/middleware', 'middleware'], description: 'Middleware' },
      { paths: ['prisma'], description: 'Database schema (Prisma)' },
      { paths: ['migrations', 'src/migrations', 'db/migrations'], description: 'DB migrations' },
      { paths: ['k8s', 'deploy', 'kubernetes', 'infra'], description: 'Infrastructure / deploy' },
      { paths: ['tests', '__tests__', 'test', 'spec'], description: 'Tests' },
      { paths: ['packages'], description: 'Monorepo packages' },
      { paths: ['src/config', 'config'], description: 'Configuration' },
      { paths: ['src/controllers', 'controllers'], description: 'Controllers' },
      { paths: ['src/resolvers', 'resolvers'], description: 'GraphQL resolvers' },
      { paths: ['src/domain', 'domain'], description: 'Domain layer' },
      { paths: ['src/infrastructure', 'infrastructure'], description: 'Infrastructure layer' },
    ];

    for (const candidate of candidates) {
      for (const dirPath of candidate.paths) {
        const fullPath = path.join(rootPath, dirPath);
        if (this.dirExists(fullPath)) {
          dirs.push({
            name: path.basename(dirPath),
            path: dirPath,
            description: candidate.description,
          });
          break; // Only take first match per candidate
        }
      }
    }

    return dirs.slice(0, 15);
  }

  private discoverEntryPoints(): EntryPoint[] {
    const entryPoints: EntryPoint[] = [];
    const rootPath = this.deps.rootPath;

    const candidates: Array<{ files: string[]; type: string }> = [
      { files: ['src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx', 'src/app.ts'], type: 'application entry' },
      { files: ['src/server.ts', 'server.ts', 'src/server.js', 'server.js'], type: 'server entry' },
      { files: ['src/main/java'], type: 'Java source root' },
      { files: ['main.go', 'cmd/main.go'], type: 'Go entry' },
      { files: ['src/main.rs', 'main.rs'], type: 'Rust entry' },
      { files: ['app/layout.tsx', 'app/layout.ts', 'src/app/layout.tsx'], type: 'root layout' },
      { files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], type: 'Next.js config' },
      { files: ['vite.config.ts', 'vite.config.js'], type: 'Vite config' },
      { files: ['tailwind.config.ts', 'tailwind.config.js'], type: 'Tailwind config' },
      { files: ['prisma/schema.prisma'], type: 'database schema' },
      { files: ['drizzle.config.ts'], type: 'database config' },
      { files: ['docker-compose.yml', 'docker-compose.yaml'], type: 'Docker Compose' },
      { files: ['Dockerfile'], type: 'Dockerfile' },
      { files: ['eos.workspace.yaml'], type: 'EOS workspace config' },
    ];

    for (const candidate of candidates) {
      for (const file of candidate.files) {
        const fullPath = path.join(rootPath, file);
        if (fs.existsSync(fullPath)) {
          entryPoints.push({ file, type: candidate.type });
          break;
        }
      }
    }

    return entryPoints.slice(0, 12);
  }

  // --- Route Grouping ---

  private groupRoutesByPrefix(routes: ScannedRoute[]): Map<string, ScannedRoute[]> {
    // Deduplicate by method+path+file
    const seen = new Set<string>();
    const deduped = routes.filter((r) => {
      const key = `${r.method}:${r.path}:${r.file}:${r.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length <= 15) {
      return new Map([['', deduped]]);
    }

    const grouped = new Map<string, ScannedRoute[]>();

    for (const route of deduped) {
      const parts = route.path.split('/').filter(Boolean);
      const prefix = parts.length > 1 ? `/${parts[0]}` : '/';
      const group = grouped.get(prefix) || [];
      group.push(route);
      grouped.set(prefix, group);
    }

    // Sort groups by number of routes descending
    const sorted = new Map(
      [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)
    );

    return sorted;
  }

  // --- Budget Management ---

  private assembleWithBudget(sections: string[], maxChars: number): string {
    let result = '';

    for (const section of sections) {
      if (result.length + section.length > maxChars) {
        // Try to fit a truncated version
        const remaining = maxChars - result.length;
        if (remaining > 200) {
          const truncated = this.truncateSection(section, remaining);
          result += truncated;
        }
        break;
      }
      result += section;
    }

    // Always ensure EOS tools section is present
    const eosSection = this.buildEosToolsSection();
    if (!result.includes('## EOS Tools')) {
      const remaining = maxChars - result.length;
      if (remaining > eosSection.length) {
        result += eosSection;
      } else {
        // Replace end with a minimal tools note
        const minimalTools = '\n## EOS Tools\nUse `eos_search`, `eos_context`, `eos_recall_decision`, `eos_conventions`, `eos_dependencies` for indexed knowledge.\n';
        result += minimalTools;
      }
    }

    return result.trim() + '\n';
  }

  private truncateSection(section: string, maxLength: number): string {
    const lines = section.split('\n');
    let result = '';

    for (const line of lines) {
      if (result.length + line.length + 1 > maxLength - 50) {
        result += '\n... (truncated for token budget)\n';
        break;
      }
      result += line + '\n';
    }

    return result;
  }

  // --- Utilities ---

  private readSafe(filePath: string): string | null {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 512 * 1024) return null;
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
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
}
