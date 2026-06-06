import { ArchitectureStore } from '../architecture/architecture-store';
import { DecisionStore } from '../decisions/decision-store';
import { GraphStore } from '../architecture/graph-store';
import { SkillStore } from '../knowledge/skill-store';

export interface ContextInjectorDeps {
  architectureStore: ArchitectureStore;
  decisionStore: DecisionStore;
  graphStore: GraphStore;
  skillStore?: SkillStore;
  rootPath: string;
}

const TOOLS_NEEDING_CONTEXT = new Set([
  'eos_search',
  'eos_plan',
  'eos_refine',
  'eos_validate',
  'eos_review',
  'eos_security_scan',
  'eos_security_audit',
]);

const MAX_PREAMBLE_TOKENS = 1500;

export class ContextInjector {
  constructor(private deps: ContextInjectorDeps) {}

  async buildPreamble(toolName: string, args: Record<string, unknown>): Promise<string | null> {
    if (!TOOLS_NEEDING_CONTEXT.has(toolName)) return null;

    const sections: string[] = [];
    let tokensUsed = 0;

    // 1. Conventions (always relevant when code decisions are being made)
    const conventions = await this.getConventions();
    if (conventions && this.estimateTokens(conventions) + tokensUsed < MAX_PREAMBLE_TOKENS) {
      sections.push(conventions);
      tokensUsed += this.estimateTokens(conventions);
    }

    // 2. Key architecture context (service map summary)
    const archSummary = this.getArchitectureSummary();
    if (archSummary && this.estimateTokens(archSummary) + tokensUsed < MAX_PREAMBLE_TOKENS) {
      sections.push(archSummary);
      tokensUsed += this.estimateTokens(archSummary);
    }

    // 3. Recent relevant decisions (keyword-match against tool args)
    const taskHint = this.extractTaskHint(args);
    if (taskHint) {
      const decisions = await this.getRelevantDecisions(taskHint);
      if (decisions && this.estimateTokens(decisions) + tokensUsed < MAX_PREAMBLE_TOKENS) {
        sections.push(decisions);
        tokensUsed += this.estimateTokens(decisions);
      }
    }

    // 4. Relevant skills/gotchas from past sessions
    const taskHintForSkills = this.extractTaskHint(args);
    if (taskHintForSkills && this.deps.skillStore) {
      const skills = this.getRelevantSkills(taskHintForSkills);
      if (skills && this.estimateTokens(skills) + tokensUsed < MAX_PREAMBLE_TOKENS) {
        sections.push(skills);
        tokensUsed += this.estimateTokens(skills);
      }
    }

    // 5. Cross-repo warnings (if graph has critical consumers)
    const warnings = this.getCrossRepoWarnings();
    if (warnings && this.estimateTokens(warnings) + tokensUsed < MAX_PREAMBLE_TOKENS) {
      sections.push(warnings);
      tokensUsed += this.estimateTokens(warnings);
    }

    if (sections.length === 0) return null;

    return [
      '---',
      '📋 **EOS Context** (auto-injected from project knowledge)',
      '',
      ...sections,
      '---',
      '',
    ].join('\n');
  }

  private async getConventions(): Promise<string | null> {
    try {
      const conventions = await this.deps.architectureStore.getConventions();
      if (conventions.length === 0) return null;

      const lines = ['**Conventions:**'];
      for (const conv of conventions.slice(0, 5)) {
        lines.push(`- ${conv.name}: ${conv.rule || conv.description}`);
      }
      return lines.join('\n');
    } catch {
      return null;
    }
  }

  private getArchitectureSummary(): string | null {
    try {
      const stats = this.deps.graphStore.getStats();
      if (stats.services === 0) return null;

      const services = this.deps.graphStore.getAllServices();
      const connections = this.deps.graphStore.getAllConnections();

      const lines = ['**Architecture:**'];
      lines.push(`${stats.services} services, ${stats.connections} connections.`);

      // Show top services by connectivity
      const connectionCounts = new Map<string, number>();
      for (const conn of connections) {
        connectionCounts.set(conn.targetService, (connectionCounts.get(conn.targetService) || 0) + 1);
        connectionCounts.set(conn.sourceService, (connectionCounts.get(conn.sourceService) || 0) + 1);
      }

      const topServices = services
        .sort((a, b) => (connectionCounts.get(b.id) || 0) - (connectionCounts.get(a.id) || 0))
        .slice(0, 5);

      for (const svc of topServices) {
        const conns = connectionCounts.get(svc.id) || 0;
        if (conns > 0) {
          lines.push(`- ${svc.serviceName} (${svc.repoName}) [${svc.criticality}] — ${conns} connections`);
        }
      }

      return lines.join('\n');
    } catch {
      return null;
    }
  }

  private async getRelevantDecisions(taskHint: string): Promise<string | null> {
    try {
      const decisions = await this.deps.decisionStore.search(taskHint);
      if (decisions.length === 0) return null;

      const lines = ['**Relevant decisions:**'];
      for (const d of decisions.slice(0, 3)) {
        lines.push(`- [${d.id}] ${d.title}: ${d.decision}`);
        if (d.rationale) lines.push(`  Why: ${d.rationale.slice(0, 100)}`);
      }
      return lines.join('\n');
    } catch {
      return null;
    }
  }

  private getCrossRepoWarnings(): string | null {
    try {
      const connections = this.deps.graphStore.getAllConnections();
      const services = this.deps.graphStore.getAllServices();

      const criticalConsumers = services.filter((s) => s.criticality === 'critical');
      if (criticalConsumers.length === 0) return null;

      const lines = ['**Cross-repo warnings:**'];
      for (const svc of criticalConsumers.slice(0, 3)) {
        const consumers = connections.filter((c) => c.targetService === svc.id);
        if (consumers.length > 0) {
          lines.push(`- ⚠️ ${svc.serviceName} is CRITICAL — ${consumers.length} service(s) depend on it`);
        }
      }

      return lines.length > 1 ? lines.join('\n') : null;
    } catch {
      return null;
    }
  }

  private getRelevantSkills(taskHint: string): string | null {
    if (!this.deps.skillStore) return null;
    try {
      const skills = this.deps.skillStore.getRelevantSkills(taskHint);
      if (skills.length === 0) return null;

      const lines = ['**Learned skills (from past sessions):**'];
      for (const skill of skills.slice(0, 5)) {
        const prefix = skill.type === 'gotcha' ? '⚠️' : skill.type === 'pattern' ? '📋' : '💡';
        lines.push(`- ${prefix} [${skill.type}] ${skill.name}: ${skill.content.slice(0, 150)}`);
      }
      return lines.join('\n');
    } catch {
      return null;
    }
  }

  private extractTaskHint(args: Record<string, unknown>): string | null {
    return (args.query as string) || (args.task as string) || (args.requirement as string) || (args.featureSlug as string) || null;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
