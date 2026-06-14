import { Convention, Pattern, ServiceModel } from '@engineering-os/shared';
import { AiContextGenerator, ArchitectureStore, DecisionStore, GraphStore } from '@engineering-os/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface CursorRulesConfig {
  eosPath: string;
  outputPath: string;
  includeArchitecture: boolean;
  includePatterns: boolean;
  includeConventions: boolean;
  includeDecisions: boolean;
  maxLength?: number;
  /** If true, writes to .cursor/rules/ directory instead of a single file */
  useCursorRulesDir: boolean;
}

interface DecisionRecord {
  title: string;
  decision: string;
  rationale: string;
  status?: string;
  context?: string;
}

export class CursorRulesGenerator {
  private readonly DEFAULT_MAX_LENGTH = 8000;

  constructor(private config: CursorRulesConfig) {}

  /**
   * Generate full .cursorrules content from Engineering OS knowledge.
   */
  async generate(): Promise<string> {
    const sections: string[] = [];
    const maxLength = this.config.maxLength ?? this.DEFAULT_MAX_LENGTH;

    // Load data from .eos/knowledge directories
    const conventions = this.config.includeConventions
      ? await this.loadYamlDir<Convention>(path.join(this.config.eosPath, 'knowledge', 'architecture', 'conventions'))
      : [];

    const patterns = this.config.includePatterns
      ? await this.loadYamlDir<Pattern>(path.join(this.config.eosPath, 'knowledge', 'architecture', 'patterns'))
      : [];

    const services = this.config.includeArchitecture
      ? await this.loadYamlDir<ServiceModel>(path.join(this.config.eosPath, 'knowledge', 'architecture', 'services'))
      : [];

    const decisions = this.config.includeDecisions
      ? await this.loadYamlDir<DecisionRecord>(path.join(this.config.eosPath, 'knowledge', 'decisions'))
      : [];

    // Build sections in priority order (conventions > patterns > architecture > decisions)
    if (conventions.length > 0) {
      sections.push(this.formatConventions(conventions));
    }

    if (patterns.length > 0) {
      sections.push(this.formatPatterns(patterns));
    }

    if (services.length > 0) {
      sections.push(this.formatArchitecture(services));
    }

    if (decisions.length > 0) {
      const activeDecisions = decisions.filter(
        (d) => !d.status || d.status === 'accepted' || d.status === 'active'
      );
      if (activeDecisions.length > 0) {
        sections.push(this.formatDecisions(activeDecisions));
      }
    }

    const content = sections.join('\n\n');
    return this.truncateToLimit(content, maxLength);
  }

  /**
   * Write generated rules to the output location.
   * If useCursorRulesDir is true, writes to .cursor/rules/ as separate files.
   * Otherwise writes a single file at outputPath.
   */
  async write(): Promise<void> {
    if (this.config.useCursorRulesDir) {
      await this.writeToCursorRulesDir();
    } else {
      const content = await this.generate();
      await fs.mkdir(path.dirname(this.config.outputPath), { recursive: true });
      await fs.writeFile(this.config.outputPath, content, 'utf-8');
    }
  }

  /**
   * Write to .cursor/rules/ directory as separate .md files.
   * This coexists safely with other rule files — no overwriting.
   */
  private async writeToCursorRulesDir(): Promise<void> {
    const rulesDir = path.dirname(this.config.outputPath);
    await fs.mkdir(rulesDir, { recursive: true });

    const rootPath = path.dirname(this.config.eosPath);
    const graphStore = new GraphStore(path.join(this.config.eosPath, 'graph', 'services.db'));
    graphStore.initialize();
    const generator = new AiContextGenerator({
      architectureStore: new ArchitectureStore(path.join(this.config.eosPath, 'knowledge', 'architecture')),
      decisionStore: new DecisionStore(path.join(this.config.eosPath, 'knowledge', 'decisions')),
      graphStore,
      rootPath,
      projectName: path.basename(rootPath),
    });
    await generator.writeCursorRules(rulesDir);
  }

  /**
   * Generate eos-service-map.md from the service-map.json exported by the core graph linker.
   * Reads a pre-built JSON file instead of depending on better-sqlite3.
   */
  private async writeServiceMap(rulesDir: string): Promise<void> {
    const serviceMapPath = path.join(this.config.eosPath, 'graph', 'service-map.json');
    let raw: string;
    try {
      raw = await fs.readFile(serviceMapPath, 'utf-8');
    } catch {
      return; // No service map JSON exported yet
    }

    let data: { services: any[]; connections: any[]; contracts: any[] };
    try {
      data = JSON.parse(raw);
    } catch {
      return; // Malformed JSON, skip
    }

    const { services, connections, contracts } = data;

    if (!services || services.length === 0) return;

    const lines: string[] = [
      '# Service Dependency Map',
      '',
      'This project is part of a multi-service architecture. Changes to shared interfaces require coordination.',
      '',
    ];

    // Group services by repo
    const byRepo = new Map<string, any[]>();
    for (const s of services) {
      if (!byRepo.has(s.repoName)) byRepo.set(s.repoName, []);
      byRepo.get(s.repoName)!.push(s);
    }

    lines.push('## Services');
    lines.push('');
    for (const [repo, svcList] of byRepo) {
      lines.push(`### ${repo}`);
      for (const s of svcList) {
        const owners = Array.isArray(s.owners) ? s.owners : [];
        lines.push(`- **${s.serviceName}** [${s.criticality}]${s.description ? ` — ${s.description}` : ''}`);
        if (owners.length > 0) lines.push(`  - Owners: ${owners.join(', ')}`);
      }
      lines.push('');
    }

    if (connections && connections.length > 0) {
      lines.push('## Dependencies');
      lines.push('');
      lines.push('When modifying endpoints or interfaces consumed by other services, maintain backward compatibility.');
      lines.push('');
      for (const c of connections) {
        lines.push(`- ${c.sourceService} → ${c.targetService} via **${c.protocol}**`);
      }
      lines.push('');
    }

    if (contracts && contracts.length > 0) {
      lines.push('## API Contracts');
      lines.push('');
      for (const c of contracts) {
        const endpoints = Array.isArray(c.endpoints) ? c.endpoints : [];
        lines.push(`- **${c.type}**: \`${c.filePath}\` (${c.repoName}) — ${endpoints.length} endpoints`);
      }
      lines.push('');
    }

    // Cross-repo conventions
    const protocols = new Set((connections || []).map((c: any) => c.protocol));
    if (protocols.size > 0) {
      lines.push('## Cross-Service Conventions');
      lines.push('');
      if (protocols.has('rest')) {
        lines.push('- REST endpoint changes must maintain backward compatibility for all consumers');
      }
      if (protocols.has('event')) {
        lines.push('- Event schema changes must be additive only (no breaking changes)');
      }
      if (protocols.has('grpc')) {
        lines.push('- Proto file changes must follow gRPC backward compatibility rules');
      }
      if (protocols.has('import')) {
        lines.push('- Shared package changes affect all importing services — follow semver');
      }
    }

    const content = lines.join('\n');
    await fs.writeFile(path.join(rulesDir, 'eos-service-map.md'), content, 'utf-8');
  }

  /**
   * Format architecture section showing service boundaries and dependencies.
   */
  private formatArchitecture(services: ServiceModel[]): string {
    const lines: string[] = ['# Project Architecture', ''];

    for (const service of services) {
      lines.push(`## ${service.name}`);
      if (service.description) {
        lines.push(service.description);
      }
      lines.push(`- Criticality: ${service.criticality}`);
      if (service.publicApis && service.publicApis.length > 0) {
        lines.push(`- APIs: ${service.publicApis.join(', ')}`);
      }
      if (service.dependencies && service.dependencies.length > 0) {
        lines.push(`- Dependencies: ${service.dependencies.join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format patterns section with descriptions and examples.
   */
  private formatPatterns(patterns: Pattern[]): string {
    const lines: string[] = ['# Coding Patterns', ''];

    for (const pattern of patterns) {
      lines.push(`## ${pattern.name}`);
      if (pattern.description) {
        lines.push(pattern.description);
      }
      if (pattern.usage) {
        lines.push(`Usage: ${pattern.usage}`);
      }
      if (pattern.files && pattern.files.length > 0) {
        lines.push('');
        lines.push('Files:');
        for (const file of pattern.files.slice(0, 5)) {
          lines.push(`  - ${file}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format conventions section with rules and examples.
   */
  private formatConventions(conventions: Convention[]): string {
    const lines: string[] = ['# Conventions', ''];

    for (const convention of conventions) {
      lines.push(`## ${convention.name}`);
      if (convention.description) {
        lines.push(convention.description);
      }
      if (convention.rule) {
        lines.push(`Rule: ${convention.rule}`);
      }
      if (convention.examples && convention.examples.length > 0) {
        lines.push('');
        lines.push('Examples:');
        for (const example of convention.examples.slice(0, 3)) {
          lines.push(`  - ${example}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format decisions section showing key decisions and their rationale.
   */
  private formatDecisions(decisions: DecisionRecord[]): string {
    const lines: string[] = [
      '# Engineering Decisions',
      '',
      'These decisions have been made and should not be re-debated without new information.',
      '',
    ];

    for (const decision of decisions) {
      lines.push(`## ${decision.title}`);
      if (decision.decision) {
        lines.push(`Decision: ${decision.decision}`);
      }
      if (decision.rationale) {
        lines.push(`Rationale: ${decision.rationale}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Truncate content to max length by removing lower-priority sections first.
   * Priority: conventions > patterns > architecture > decisions
   */
  private truncateToLimit(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Parse sections and remove from lowest priority first
    const sectionHeaders = [
      '# Engineering Decisions',
      '# Project Architecture',
      '# Coding Patterns',
      '# Conventions',
    ];

    let result = content;

    // Remove sections from lowest priority until under limit
    for (const header of sectionHeaders) {
      if (result.length <= maxLength) break;

      const headerIndex = result.indexOf(header);
      if (headerIndex === -1) continue;

      // Find the next top-level section header after this one
      let nextSectionIndex = result.length;
      for (const otherHeader of sectionHeaders) {
        if (otherHeader === header) continue;
        const idx = result.indexOf(otherHeader, headerIndex + 1);
        if (idx !== -1 && idx < nextSectionIndex) {
          nextSectionIndex = idx;
        }
      }

      // Remove this section
      result = result.slice(0, headerIndex) + result.slice(nextSectionIndex);
    }

    // If still over limit after removing all optional sections, hard truncate
    if (result.length > maxLength) {
      result = result.slice(0, maxLength - 50) + '\n\n# (truncated due to length limit)';
    }

    return result.trim();
  }

  /**
   * Load all YAML files from a directory into typed objects.
   */
  private async loadYamlDir<T>(dir: string): Promise<T[]> {
    try {
      const files = await fs.readdir(dir);
      const yamlFiles = files.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
      const results: T[] = [];

      for (const file of yamlFiles) {
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          const obj = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as T;
          if (obj) {
            results.push(obj);
          }
        } catch {
          // Skip files that fail to parse
        }
      }

      return results;
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }
}
