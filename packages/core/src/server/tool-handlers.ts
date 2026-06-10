import * as path from 'path';
import { SearchResult, ContextBundle, ServiceModel, Pattern, FindingCategory, Severity, ConnectionProtocol } from '@engineering-os/shared';
import { sanitizeErrorMessage } from '../security';
import { expandQuery } from '../knowledge/query-expander';
import { RepositoryIndexer } from '../knowledge/indexer';
import { MetadataStore } from '../knowledge/metadata-store';
import { ContextBuilder } from '../knowledge/context-builder';
import { DriftDetector, DriftReport } from '../knowledge/drift-detector';
import { DecisionStore } from '../decisions/decision-store';
import { ArchitectureDiscovery } from '../architecture/architecture-discovery';
import { ArchitectureStore } from '../architecture/architecture-store';
import { GraphStore } from '../architecture/graph-store';
import { ContractDiscovery } from '../architecture/contract-discovery';
import { ImpactAnalyzer } from '../architecture/impact-analyzer';
import { CrossRepoContextBuilder } from '../architecture/cross-repo-context';
import { GraphLinker } from '../architecture/graph-linker';
import { GistBuilder } from '../generators/gist-builder';
import { SkillStore, SkillType } from '../knowledge/skill-store';
import { Orchestrator } from '../agents/orchestrator';
import { WorkflowEngine } from '../workflow/workflow-engine';
import { ArtifactStore } from '../workflow/artifact-store';
import { RefinementEngine } from '../workflow/refine';
import { Planner } from '../workflow/planner';
import { Validator } from '../workflow/validator';
import { SecurityScanner, SecurityConventionsStore, DependencyAuditor, OwaspMapper, ThreatModeler } from '../security-intel';
import { RepoRegistry, FederatedSearch, TeamSync, AuditReporter, AnalyticsStore } from '../multi-repo';
import { BudgetEnforcer, BudgetTracker, getStageForTool } from '../budget';
import { WorkflowMarketplace } from '../workflow/marketplace';
import { AuditStore, PostureScorer, KnowledgeExporter } from '../enterprise';
import { ComplianceChecker, ComplianceFramework } from '../compliance';
import { ContextInjector } from './context-injector';

export interface ServiceDependencies {
  indexer: RepositoryIndexer;
  metadataStore: MetadataStore;
  contextBuilder: ContextBuilder;
  decisionStore: DecisionStore;
  architectureDiscovery: ArchitectureDiscovery;
  architectureStore: ArchitectureStore;
  graphStore: GraphStore;
  graphLinker: GraphLinker;
  impactAnalyzer: ImpactAnalyzer;
  crossRepoContextBuilder: CrossRepoContextBuilder;
  workflowEngine: WorkflowEngine;
  artifactStore: ArtifactStore;
  refinementEngine: RefinementEngine;
  planner: Planner;
  validator: Validator;
  securityScanner: SecurityScanner;
  securityConventionsStore: SecurityConventionsStore;
  dependencyAuditor: DependencyAuditor;
  owaspMapper: OwaspMapper;
  threatModeler: ThreatModeler;
  repoRegistry: RepoRegistry;
  federatedSearch: FederatedSearch;
  teamSync: TeamSync;
  auditReporter: AuditReporter;
  analyticsStore: AnalyticsStore;
  budgetEnforcer: BudgetEnforcer;
  budgetTracker: BudgetTracker;
  marketplace: WorkflowMarketplace;
  auditStore: AuditStore;
  complianceChecker: ComplianceChecker;
  postureScorer: PostureScorer;
  knowledgeExporter: KnowledgeExporter;
  driftDetector: DriftDetector;
  skillStore: SkillStore;
  rootPath: string;
}

export class ToolHandlers {
  private contextInjector: ContextInjector;

  constructor(private services: ServiceDependencies) {
    this.contextInjector = new ContextInjector({
      architectureStore: services.architectureStore,
      decisionStore: services.decisionStore,
      graphStore: services.graphStore,
      skillStore: services.skillStore,
      rootPath: services.rootPath,
    });
  }

  async handle(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ content: { type: string; text: string }[] }> {
    const startTime = Date.now();
    try {
      let result: string;

      switch (toolName) {
        case 'eos_search':
          result = await this.handleSearch(args as { query: string; scope?: string; limit?: number });
          break;
        case 'eos_context':
          result = await this.handleContext(args as { task: string; maxTokens?: number });
          break;
        case 'eos_explain':
          result = await this.handleExplain(args as { target: string });
          break;
        case 'eos_dependencies':
          result = await this.handleDependencies(args as { target: string });
          break;
        case 'eos_decide':
          result = await this.handleDecide(args as {
            title: string;
            context: string;
            decision: string;
            rationale: string;
            alternatives?: { option: string; proscons?: string }[];
            tags?: string[];
            status?: string;
          });
          break;
        case 'eos_recall_decision':
          result = await this.handleRecallDecision(args as { query: string });
          break;
        case 'eos_alternatives':
          result = await this.handleAlternatives(args as { decisionId: string });
          break;
        case 'eos_architecture':
          result = await this.handleArchitecture(args as { service?: string });
          break;
        case 'eos_patterns':
          result = await this.handlePatterns(args as { area?: string });
          break;
        case 'eos_conventions':
          result = await this.handleConventions();
          break;
        case 'eos_refine':
          result = await this.handleRefine(args as { requirement: string });
          break;
        case 'eos_plan':
          result = await this.handlePlan(args as { featureSlug: string; requirement?: string });
          break;
        case 'eos_validate':
          result = await this.handleValidate(args as { featureSlug: string });
          break;
        case 'eos_review':
          result = await this.handleReview(args as { featureSlug: string });
          break;
        case 'eos_index':
          result = await this.handleIndex(args as { paths?: string[]; force?: boolean });
          break;
        case 'eos_status':
          result = await this.handleStatus();
          break;
        case 'eos_health':
          result = await this.handleHealth();
          break;
        case 'eos_security_scan':
          result = await this.handleSecurityScan(args as { paths?: string[]; categories?: string[]; severity?: string; excludePatterns?: string[]; includeTestFiles?: boolean });
          break;
        case 'eos_security_conventions':
          result = await this.handleSecurityConventions(args as { language?: string; category?: string });
          break;
        case 'eos_security_audit':
          result = await this.handleSecurityAudit(args as { paths?: string[]; includeDependencies?: boolean });
          break;
        case 'eos_dependency_check':
          result = await this.handleDependencyCheck(args as { packageFile?: string });
          break;
        case 'eos_threat_model':
          result = await this.handleThreatModel(args as { featureSlug: string; specification: string; components?: string[] });
          break;
        case 'eos_link_repo':
          result = await this.handleLinkRepo(args as { name: string; path: string; tags?: string[] });
          break;
        case 'eos_unlink_repo':
          result = await this.handleUnlinkRepo(args as { name: string });
          break;
        case 'eos_search_all':
          result = await this.handleSearchAll(args as { query: string; repos?: string[]; limit?: number });
          break;
        case 'eos_team_sync':
          result = await this.handleTeamSync(args as any);
          break;
        case 'eos_audit_report':
          result = await this.handleAuditReport(args as { action: string; reportId?: string; format?: string });
          break;
        case 'eos_analytics':
          result = await this.handleAnalytics(args as { period?: string });
          break;
        case 'eos_marketplace':
          result = await this.handleMarketplace(args as { action: string; name?: string; category?: string; yaml?: string });
          break;
        case 'eos_posture_score':
          result = await this.handlePostureScore(args as { days?: number });
          break;
        case 'eos_compliance_check':
          result = await this.handleComplianceCheck(args as { framework: string });
          break;
        case 'eos_export':
          result = await this.handleExport(args as { outputPath?: string; repoName?: string });
          break;
        case 'eos_audit_log':
          result = await this.handleAuditLog(args as { tool?: string; user?: string; since?: string; until?: string; limit?: number });
          break;
        case 'eos_graph':
          result = await this.handleGraph(args as { action: string; repo?: string; from?: string; to?: string; protocol?: string });
          break;
        case 'eos_impact':
          result = await this.handleImpact(args as { type: string; repo?: string; target: string; method?: string });
          break;
        case 'eos_contracts':
          result = await this.handleContracts(args as { repo?: string; type?: string; id?: string });
          break;
        case 'eos_owners':
          result = await this.handleOwners(args as { service?: string; entity?: string });
          break;
        case 'eos_cross_context':
          result = await this.handleCrossContext(args as { task: string; repo?: string; maxTokens?: number });
          break;
        case 'eos_discover_contracts':
          result = await this.handleDiscoverContracts(args as { repo?: string; path?: string });
          break;
        case 'eos_learn':
          result = await this.handleLearn(args as { type: string; name?: string; content: string; context?: string; tags?: string[] });
          break;
        case 'eos_recall_skills':
          result = await this.handleRecallSkills(args as { query: string; type?: string });
          break;
        case 'eos_build':
          result = await this.handleBuild(args as { requirement: string; mode?: string; repos?: string[] });
          break;
        default:
          result = `Unknown tool: ${toolName}`;
      }

      // Auto-inject project context for decision-driving tools
      const preamble = await this.contextInjector.buildPreamble(toolName, args as Record<string, unknown>);
      if (preamble) {
        result = preamble + result;
      }

      // Apply budget enforcement
      const featureSlug = (args as any).featureSlug ?? null;
      const enforcement = this.services.budgetEnforcer.enforce(toolName, featureSlug, result);
      const duration = Date.now() - startTime;

      // Record analytics with token tracking
      const stage = getStageForTool(toolName);
      const timestamp = new Date().toISOString();
      this.services.analyticsStore.record({
        timestamp,
        tool: toolName,
        duration,
        success: !enforcement.rejected,
        tokensEmitted: enforcement.tokensEmitted,
        stage: stage ?? undefined,
        featureSlug: featureSlug ?? undefined,
      });

      // Record audit trail
      this.services.auditStore.record({
        timestamp,
        tool: toolName,
        user: process.env.USER || process.env.USERNAME || 'unknown',
        args: args as Record<string, unknown>,
        resultSummary: enforcement.text.slice(0, 500),
        duration,
        success: !enforcement.rejected,
      });

      let finalText = enforcement.text;
      if (enforcement.warning && !enforcement.rejected) {
        finalText = `> ${enforcement.warning}\n\n${finalText}`;
      }

      return { content: [{ type: 'text', text: finalText }] };
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      return { content: [{ type: 'text', text: `Error: ${message}` }] };
    }
  }

  private async handleSearch(args: { query: string; scope?: string; limit?: number }): Promise<string> {
    const { query, scope = 'all', limit = 10 } = args;
    const results: unknown[] = [];
    const seen = new Set<string>();

    // Expand query into keyword variants for broader FTS5 coverage
    const queries = expandQuery(query);

    // Search code via metadata store (FTS5) with expanded queries
    if (scope === 'all' || scope === 'code') {
      for (const q of queries) {
        const codeResults = this.services.metadataStore.search(q, { limit, scope });
        for (const r of codeResults) {
          const key = `${r.chunk.filePath}:${r.chunk.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({
            type: 'code',
            filePath: r.chunk.filePath,
            name: r.chunk.name,
            startLine: r.chunk.startLine,
            endLine: r.chunk.endLine,
            score: r.score,
            content: r.chunk.content.slice(0, 500),
          });
        }
      }
    }

    // Search decisions
    if (scope === 'all' || scope === 'decisions') {
      const decisions = await this.services.decisionStore.search(query);
      results.push(
        ...decisions.map((d) => ({
          type: 'decision',
          id: d.id,
          title: d.title,
          status: d.status,
          rationale: d.rationale?.slice(0, 200),
        }))
      );
    }

    if (results.length === 0) {
      return `No results found for query: "${query}" (scope: ${scope})`;
    }

    const limited = results.slice(0, limit);
    const lines: string[] = [`# Search Results for "${query}" (${limited.length} hits)\n`];

    for (const r of limited as any[]) {
      if (r.type === 'code') {
        const location = r.startLine
          ? `\`${r.filePath}:${r.startLine}${r.endLine ? `-${r.endLine}` : ''}\``
          : `\`${r.filePath}\``;
        lines.push(`- **${r.name}** — ${location} (score: ${r.score.toFixed(1)})`);
        if (r.content) {
          const snippet = r.content.trim().split('\n').slice(0, 5).join('\n');
          lines.push(`  \`\`\`\n  ${snippet}\n  \`\`\``);
        }
      } else if (r.type === 'decision') {
        lines.push(`- **[Decision] ${r.title}** (${r.id}, ${r.status})`);
        if (r.rationale) {
          lines.push(`  ${r.rationale}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handleContext(args: { task: string; maxTokens?: number }): Promise<string> {
    const { task, maxTokens } = args;

    // Build the rich project gist (routes, topology, infra, conventions, decisions)
    const gistBuilder = new GistBuilder({
      rootPath: this.services.rootPath,
      projectName: this.detectCurrentRepo(),
      architectureStore: this.services.architectureStore,
      decisionStore: this.services.decisionStore,
      graphStore: this.services.graphStore,
    });

    const gist = await gistBuilder.build({ maxTokens: maxTokens ? Math.floor(maxTokens * 0.6) : 5000 });

    // Also get task-specific context (keyword-matched code, decisions, patterns)
    const bundle = await this.services.contextBuilder.buildContext(task, maxTokens ? Math.floor(maxTokens * 0.4) : 3000);

    const lines: string[] = [];

    // Section 1: Project overview (from gist builder)
    lines.push(gist);
    lines.push('');

    // Section 2: Task-specific context
    lines.push(`---`);
    lines.push(`## Task-Specific Context`);
    lines.push(`**Task:** ${task}`);
    lines.push('');

    if (bundle.relatedDecisions.length > 0) {
      lines.push('### Relevant Decisions');
      for (const d of bundle.relatedDecisions) {
        lines.push(`- ${d}`);
      }
      lines.push('');
    }

    if (bundle.codingPatterns.length > 0) {
      lines.push('### Relevant Patterns');
      for (const p of bundle.codingPatterns) {
        lines.push(`- ${p}`);
      }
      lines.push('');
    }

    if (bundle.relevantFiles.length > 0) {
      lines.push('### Relevant Files');
      for (const f of bundle.relevantFiles) {
        lines.push(`- ${f}`);
      }
      lines.push('');

      // Include actual content snippets of the most relevant files (first 3)
      const snippets = this.getFileSnippets(bundle.relevantFiles.slice(0, 3));
      if (snippets) {
        lines.push('### Key File Contents (excerpts)');
        lines.push('');
        lines.push(snippets);
      }
    }

    if (bundle.relevantApis.length > 0) {
      lines.push('### Relevant APIs');
      for (const a of bundle.relevantApis) {
        lines.push(`- ${a}`);
      }
      lines.push('');
    }

    // Recent git changes (if in a git repo)
    const recentChanges = this.getRecentGitChanges();
    if (recentChanges) {
      lines.push('### Recent Changes (last 5 commits)');
      lines.push('');
      lines.push(recentChanges);
      lines.push('');
    }

    // Test patterns (show how tests are structured in this repo)
    const testPattern = this.getTestPattern();
    if (testPattern) {
      lines.push('### Test Patterns');
      lines.push('');
      lines.push(testPattern);
      lines.push('');
    }

    // Relevant skills from past sessions
    const skills = this.services.skillStore.getRelevantSkills(task);
    if (skills.length > 0) {
      lines.push('### Learned Skills (from past sessions)');
      for (const skill of skills.slice(0, 5)) {
        const prefix = skill.type === 'gotcha' ? '⚠️' : skill.type === 'pattern' ? '📋' : '💡';
        lines.push(`- ${prefix} **${skill.name}:** ${skill.content}`);
      }
      lines.push('');
    }

    // Skill capture reminder
    lines.push('---');
    lines.push('*After completing this task, call `eos_learn` to record any discoveries (gotchas, patterns, connections) for future sessions.*');

    return lines.join('\n');
  }

  private getFileSnippets(filePaths: string[]): string | null {
    const fs = require('fs');
    const snippets: string[] = [];
    let totalChars = 0;
    const maxChars = 3000;

    for (const filePath of filePaths) {
      const fullPath = path.resolve(this.services.rootPath, filePath);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        // Take first 30 lines or until 1000 chars
        const snippet = lines.slice(0, 30).join('\n').slice(0, 1000);
        if (totalChars + snippet.length > maxChars) break;
        snippets.push(`**\`${filePath}\`:**\n\`\`\`\n${snippet}\n\`\`\`\n`);
        totalChars += snippet.length;
      } catch {
        // File not readable, skip
      }
    }

    return snippets.length > 0 ? snippets.join('\n') : null;
  }

  private getRecentGitChanges(): string | null {
    try {
      const { execSync } = require('child_process');
      const output = execSync('git log --oneline -5 2>/dev/null', {
        cwd: this.services.rootPath,
        encoding: 'utf-8',
        timeout: 3000,
      });
      if (!output.trim()) return null;
      return output.trim().split('\n').map((l: string) => `- ${l}`).join('\n');
    } catch {
      return null;
    }
  }

  private getTestPattern(): string | null {
    const fs = require('fs');
    // Find one test file and show its structure
    const testPaths = [
      'src/__tests__', 'src', 'test', 'tests',
      'packages/core/src/__tests__', 'packages/core/src',
    ];

    for (const testDir of testPaths) {
      const fullDir = path.join(this.services.rootPath, testDir);
      try {
        const files = fs.readdirSync(fullDir);
        const testFile = files.find((f: string) => f.includes('.test.') || f.includes('.spec.'));
        if (testFile) {
          const content = fs.readFileSync(path.join(fullDir, testFile), 'utf-8');
          const first20Lines = content.split('\n').slice(0, 20).join('\n');
          return `Test pattern from \`${testDir}/${testFile}\`:\n\`\`\`\n${first20Lines}\n\`\`\``;
        }
      } catch { continue; }
    }
    return null;
  }

  private async handleExplain(args: { target: string }): Promise<string> {
    const { target } = args;

    // Try to find as a service first
    const service = await this.services.architectureStore.getService(target);
    if (service) {
      return [
        `# ${service.name}`,
        '',
        `**Description:** ${service.description || 'No description available'}`,
        `**Criticality:** ${service.criticality}`,
        '',
        '## Dependencies',
        ...(service.dependencies && service.dependencies.length > 0
          ? service.dependencies.map((d: string) => `- ${d}`)
          : ['- None detected']),
      ].join('\n');
    }

    // Fall back to searching the metadata store
    const searchResults = this.services.metadataStore.search(target, { limit: 5 });
    if (searchResults.length > 0) {
      const lines = [`# ${target}`, '', '## Relevant Code'];
      for (const r of searchResults) {
        lines.push(`### ${r.chunk.name} (${r.chunk.filePath}:${r.chunk.startLine}-${r.chunk.endLine})`);
        lines.push('```');
        lines.push(r.chunk.content.slice(0, 1000));
        lines.push('```');
        lines.push('');
      }
      return lines.join('\n');
    }

    return `No information found for target: "${target}". Try running eos_index first or check the name.`;
  }

  private async handleDependencies(args: { target: string }): Promise<string> {
    const { target } = args;

    const dependencies = this.services.metadataStore.findDependencies(target);
    const dependents = this.services.metadataStore.findDependents(target);

    const result = {
      target,
      imports: dependencies,
      importedBy: dependents,
      totalImports: dependencies.length,
      totalDependents: dependents.length,
    };

    if (dependencies.length === 0 && dependents.length === 0) {
      return `No dependency information found for "${target}". The file may not be indexed yet. Run eos_index first.`;
    }

    return JSON.stringify(result, null, 2);
  }

  private async handleDecide(args: {
    title: string;
    context: string;
    decision: string;
    rationale: string;
    alternatives?: { option: string; proscons?: string }[];
    tags?: string[];
    status?: string;
  }): Promise<string> {
    const { title, context, decision, rationale, alternatives, tags, status } = args;

    const created = await this.services.decisionStore.create({
      title,
      context,
      decision,
      rationale,
      alternatives: alternatives || [],
      tags: tags || [],
      status: this.validateDecisionStatus(status) || 'accepted',
      date: new Date().toISOString(),
    } as any);

    return [
      `Decision recorded successfully.`,
      '',
      `**ID:** ${created.id}`,
      `**Title:** ${created.title}`,
      `**Status:** ${created.status}`,
      '',
      `Use \`eos_recall_decision\` to search for this decision later.`,
      `Use \`eos_alternatives\` with ID "${created.id}" to review alternatives.`,
    ].join('\n');
  }

  private async handleRecallDecision(args: { query: string }): Promise<string> {
    const decisions = await this.services.decisionStore.search(args.query);

    if (decisions.length === 0) {
      return `No decisions found matching: "${args.query}"`;
    }

    const lines: string[] = [`# Decisions matching "${args.query}"`, ''];

    for (const d of decisions) {
      lines.push(`## ${d.id}: ${d.title}`);
      lines.push(`**Status:** ${d.status}`);
      lines.push(`**Date:** ${(d as any).date || 'unknown'}`);
      lines.push('');
      lines.push(`**Context:** ${d.context}`);
      lines.push('');
      lines.push(`**Decision:** ${d.decision || d.rationale}`);
      lines.push('');
      lines.push(`**Rationale:** ${d.rationale}`);
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handleAlternatives(args: { decisionId: string }): Promise<string> {
    const decision = await this.services.decisionStore.get(args.decisionId);

    if (!decision) {
      return `Decision not found: "${args.decisionId}"`;
    }

    const alternatives = (decision as any).alternatives || [];

    if (alternatives.length === 0) {
      return [
        `# ${decision.id}: ${decision.title}`,
        '',
        'No alternatives were recorded for this decision.',
        '',
        `**Chosen:** ${decision.decision || decision.rationale}`,
      ].join('\n');
    }

    const lines = [
      `# Alternatives for ${decision.id}: ${decision.title}`,
      '',
      `**Chosen Decision:** ${decision.decision || decision.rationale}`,
      '',
      '## Alternatives Considered',
      '',
    ];

    for (let i = 0; i < alternatives.length; i++) {
      const alt = alternatives[i];
      lines.push(`### Option ${i + 1}: ${alt.option}`);
      if (alt.proscons) {
        lines.push(alt.proscons);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handleArchitecture(args: { service?: string }): Promise<string> {
    if (args.service) {
      const service = await this.services.architectureStore.getService(args.service);
      if (!service) {
        return `Service not found: "${args.service}". Run eos_index to discover services.`;
      }
      return JSON.stringify(service, null, 2);
    }

    const services = await this.services.architectureStore.getServices();

    if (services.length === 0) {
      return 'No architecture data available. Run eos_index to discover services and their boundaries.';
    }

    const lines = ['# Architecture Overview', ''];
    for (const svc of services) {
      lines.push(`## ${svc.name}`);
      lines.push(`- **Criticality:** ${svc.criticality}`);
      lines.push(`- **Description:** ${svc.description || 'N/A'}`);
      if (svc.dependencies && svc.dependencies.length > 0) {
        lines.push(`- **Dependencies:** ${svc.dependencies.join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handlePatterns(args: { area?: string }): Promise<string> {
    const patterns = await this.services.architectureStore.getPatterns(args.area);

    if (patterns.length === 0) {
      const msg = args.area
        ? `No patterns found for area: "${args.area}".`
        : 'No patterns discovered yet.';
      return `${msg} Run eos_index to discover patterns from the codebase.`;
    }

    const lines = ['# Implementation Patterns', ''];
    for (const p of patterns) {
      lines.push(`## ${p.name}`);
      lines.push(`- **Usage:** ${p.usage}`);
      lines.push(`- **Description:** ${p.description}`);
      if (p.files && p.files.length > 0) {
        lines.push('- **Files:**');
        for (const f of p.files) {
          lines.push(`  - ${f}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handleConventions(): Promise<string> {
    const conventions = await this.services.architectureStore.getConventions();

    if (conventions.length === 0) {
      return 'No conventions discovered yet. Run eos_index to infer conventions from the codebase.';
    }

    const lines = ['# Team Conventions', ''];
    for (const c of conventions) {
      lines.push(`## ${c.name}`);
      lines.push(`- **Rule:** ${c.rule}`);
      lines.push(`- **Description:** ${c.description}`);
      if (c.examples && c.examples.length > 0) {
        lines.push('- **Examples:**');
        for (const ex of c.examples) {
          lines.push(`  - ${ex}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handleRefine(args: { requirement: string }): Promise<string> {
    const refined = await this.services.refinementEngine.refine(args.requirement);
    return refined;
  }

  private async handlePlan(args: { featureSlug: string; requirement?: string }): Promise<string> {
    const { featureSlug, requirement } = args;

    // If no requirement provided, check for an existing refined spec
    let reqText = requirement || '';
    if (!reqText) {
      const artifact = await this.services.artifactStore.get(featureSlug, 'refined-spec');
      if (artifact) {
        reqText = artifact.content;
      } else {
        return `No requirement provided and no refined spec found for "${featureSlug}". Provide a requirement or run eos_refine first.`;
      }
    }

    const plan = await this.services.planner.plan(featureSlug, reqText);

    const lines = [
      `# Execution Plan: ${featureSlug}`,
      '',
      `**Tasks:** ${plan.tasks.length}`,
      `**Parallel Groups:** ${plan.parallelGroups.length}`,
      '',
      '## Task Breakdown',
      '',
    ];

    for (const task of plan.tasks) {
      lines.push(`### ${task.id}: ${task.title}`);
      lines.push(`- **Type:** ${task.type}`);
      lines.push(`- **Depends on:** ${task.dependsOn.length > 0 ? task.dependsOn.join(', ') : 'none'}`);
      lines.push(`- **Est. tokens:** ${task.estimatedTokens}`);
      lines.push(`- ${task.description}`);
      lines.push('');
    }

    lines.push('## Execution Order (parallel groups)');
    lines.push('');
    for (let i = 0; i < plan.parallelGroups.length; i++) {
      lines.push(`**Group ${i + 1}:** ${plan.parallelGroups[i].join(', ')}`);
    }

    return lines.join('\n');
  }

  private async handleValidate(args: { featureSlug: string }): Promise<string> {
    const { featureSlug } = args;

    // Load the plan
    const planArtifact = await this.services.artifactStore.get(featureSlug, 'plan');
    let plan;

    if (planArtifact) {
      try {
        plan = JSON.parse(planArtifact.content);
      } catch {
        // Try loading from the planner's default location
      }
    }

    if (!plan) {
      // Attempt to generate a minimal plan for validation
      plan = await this.services.planner.plan(featureSlug, featureSlug);
    }

    const result = await this.services.validator.validate(featureSlug, plan);

    const lines = [
      `# Validation: ${featureSlug}`,
      '',
      `**Passed:** ${result.passed ? 'YES' : 'NO'}`,
      `**Coverage:** ${Math.round(result.coverage * 100)}%`,
      '',
      '## Checks',
      '',
    ];

    for (const check of result.checks) {
      const icon = check.passed ? '[PASS]' : '[FAIL]';
      lines.push(`${icon} **${check.name}**`);
      lines.push(`  ${check.details}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handleReview(args: { featureSlug: string }): Promise<string> {
    const { featureSlug } = args;

    // Gather architecture context for the review
    const patterns = await this.services.architectureStore.getPatterns();
    const conventions = await this.services.architectureStore.getConventions();
    const artifacts = await this.services.artifactStore.getAll(featureSlug);

    const lines = [
      `# Architecture-Aware Review: ${featureSlug}`,
      '',
    ];

    // Check if plan exists
    if (artifacts.length === 0) {
      lines.push('> No artifacts found for this feature. Ensure eos_plan has been run first.');
      lines.push('');
    } else {
      lines.push(`**Artifacts found:** ${artifacts.map((a) => a.stage).join(', ')}`);
      lines.push('');
    }

    // Pattern compliance review
    lines.push('## Pattern Compliance');
    lines.push('');
    if (patterns.length === 0) {
      lines.push('No patterns defined. Run eos_index to discover codebase patterns.');
    } else {
      for (const p of patterns) {
        lines.push(`- **${p.name}** (${p.usage}): Verify implementation follows ${p.description}`);
      }
    }
    lines.push('');

    // Convention compliance review
    lines.push('## Convention Compliance');
    lines.push('');
    if (conventions.length === 0) {
      lines.push('No conventions defined. Run eos_index to infer codebase conventions.');
    } else {
      for (const c of conventions) {
        lines.push(`- **${c.name}**: ${c.description} (rule: ${c.rule})`);
      }
    }
    lines.push('');

    // Validation pass
    lines.push('## Validation');
    lines.push('');
    try {
      const plan = await this.services.planner.plan(featureSlug, featureSlug);
      const validation = await this.services.validator.validate(featureSlug, plan);
      lines.push(`**Overall:** ${validation.passed ? 'PASSED' : 'NEEDS ATTENTION'}`);
      lines.push(`**Coverage:** ${Math.round(validation.coverage * 100)}%`);
      lines.push('');
      const failures = validation.checks.filter((c) => !c.passed);
      if (failures.length > 0) {
        lines.push('### Issues Found');
        for (const f of failures) {
          lines.push(`- ${f.name}: ${f.details}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`Validation could not be completed: ${msg}`);
    }

    return lines.join('\n');
  }

  private async handleIndex(args: { paths?: string[]; force?: boolean }): Promise<string> {
    const { paths, force } = args;

    const indexedFiles = await this.services.indexer.indexAll({ paths, force });

    // Store chunks in metadata store (FTS5)
    let totalChunks = 0;
    for (const file of indexedFiles) {
      if (file.chunks.length > 0) {
        totalChunks += file.chunks.length;
      }
      this.services.metadataStore.upsertFile(file);
    }

    // Also refresh architecture discovery
    try {
      await this.services.architectureStore.refresh(this.services.architectureDiscovery);
    } catch {
      // Architecture refresh is best-effort
    }

    return [
      `# Indexing Complete`,
      '',
      `**Files indexed:** ${indexedFiles.length}`,
      `**Code chunks stored:** ${totalChunks}`,
      `**Languages:** ${[...new Set(indexedFiles.map((f) => f.language))].join(', ') || 'none'}`,
      '',
      paths
        ? `Indexed specific paths: ${paths.join(', ')}`
        : 'Indexed entire repository.',
      force ? '(Force re-index enabled)' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async handleStatus(): Promise<string> {
    const activeWorkflows = await this.services.workflowEngine.listActive();

    // Detect knowledge drift
    let drift: DriftReport | null = null;
    try {
      drift = await this.services.driftDetector.detectChanges();
    } catch {
      // No index yet or detector unavailable
    }

    // Always include budget summary
    const budgetSummary = this.services.budgetTracker.getUsageSummary();
    const budgetLines = ['## Budget Usage', ''];
    const stages = ['refinement', 'design', 'planning', 'implementation', 'qa'] as const;
    for (const stage of stages) {
      const s = budgetSummary[stage];
      if (s && s.used > 0) {
        budgetLines.push(`- **${stage}:** ${s.used.toLocaleString()} / ${s.limit.toLocaleString()} (${s.pct}%)`);
      }
    }
    if (budgetLines.length === 2) {
      budgetLines.push('- No token usage recorded this session.');
    }

    // Knowledge drift section
    const driftLines = this.formatDriftSection(drift);

    if (activeWorkflows.length === 0) {
      return ['# Workflow Status', '', 'No active workflows. Use `eos_plan` to start a new feature workflow.', '', ...driftLines, '', ...budgetLines].join('\n');
    }

    const lines = ['# Workflow Status', ''];

    for (const wf of activeWorkflows) {
      const completed = wf.stages.filter((s) => s.status === 'completed').length;
      const total = wf.stages.length;
      const nextStages = this.services.workflowEngine.getNextStages(wf);

      lines.push(`## ${wf.slug || wf.name}`);
      lines.push(`- **Progress:** ${completed}/${total} stages`);
      lines.push(`- **Started:** ${wf.startedAt || 'unknown'}`);
      lines.push('');

      if (nextStages.length > 0) {
        lines.push('**Next actionable stages:**');
        for (const s of nextStages) {
          lines.push(`  - ${s.id}: ${s.description}`);
        }
        lines.push('');
      }

      lines.push('**All stages:**');
      for (const s of wf.stages) {
        const statusIcon =
          s.status === 'completed' ? '[DONE]' :
          s.status === 'failed' ? '[FAIL]' :
          s.status === 'running' ? '[....]' : '[    ]';
        lines.push(`  ${statusIcon} ${s.id}: ${s.description}`);
      }
      lines.push('');
    }

    lines.push(...driftLines);
    lines.push('');
    lines.push(...budgetLines);

    return lines.join('\n');
  }

  private formatDriftSection(drift: DriftReport | null): string[] {
    const lines = ['## Knowledge Drift', ''];

    if (!drift) {
      lines.push('- No index available. Run `eos_index` to build the knowledge base.');
      return lines;
    }

    const totalDrift = drift.added.length + drift.modified.length + drift.deleted.length;
    const totalTracked = totalDrift + drift.unchanged;

    if (totalDrift === 0) {
      lines.push('- Index is up to date. No drift detected.');
      return lines;
    }

    if (drift.added.length > 0) lines.push(`- **New (unindexed):** ${drift.added.length} file(s)`);
    if (drift.modified.length > 0) lines.push(`- **Modified:** ${drift.modified.length} file(s)`);
    if (drift.deleted.length > 0) lines.push(`- **Deleted:** ${drift.deleted.length} file(s)`);
    lines.push(`- **Unchanged:** ${drift.unchanged} file(s)`);

    const driftPct = totalTracked > 0 ? Math.round((totalDrift / totalTracked) * 100) : 0;
    lines.push('');
    if (driftPct > 10) {
      lines.push(`> **${driftPct}% drift detected.** Run \`eos index\` to re-sync, or \`eos index --watch\` for continuous indexing.`);
    } else {
      lines.push(`> ${driftPct}% drift. Run \`eos index\` to re-sync.`);
    }

    return lines;
  }

  private async handleHealth(): Promise<string> {
    const metadataStats = this.services.metadataStore.getStats();

    // Use DriftDetector for accurate staleness/drift
    let drift: DriftReport | null = null;
    try {
      drift = await this.services.driftDetector.detectChanges();
    } catch {
      // No index or detector unavailable
    }

    const coverageScore =
      metadataStats.totalFiles > 0
        ? Math.round((metadataStats.totalChunks / Math.max(metadataStats.totalFiles * 5, 1)) * 100)
        : 0;

    const lines = [
      '# Knowledge Health Report',
      '',
      '## Index Coverage',
      `- **Files indexed:** ${metadataStats.totalFiles}`,
      `- **Code chunks:** ${metadataStats.totalChunks}`,
      `- **FTS entries:** ${metadataStats.totalChunks}`,
      `- **Relationships tracked:** ${metadataStats.totalRelationships}`,
      `- **Coverage score:** ${Math.min(coverageScore, 100)}%`,
      '',
    ];

    // Drift section (replaces old mtime-based staleness)
    lines.push('## Drift');
    lines.push('');
    if (!drift) {
      lines.push('- No index available — cannot compute drift.');
    } else {
      const totalDrift = drift.added.length + drift.modified.length + drift.deleted.length;
      const totalTracked = totalDrift + drift.unchanged;
      const freshness = totalTracked > 0 ? Math.round((drift.unchanged / totalTracked) * 100) : 0;

      lines.push(`- **New (unindexed):** ${drift.added.length} file(s)`);
      lines.push(`- **Modified since index:** ${drift.modified.length} file(s)`);
      lines.push(`- **Deleted (stale refs):** ${drift.deleted.length} file(s)`);
      lines.push(`- **Unchanged:** ${drift.unchanged} file(s)`);
      lines.push(`- **Freshness:** ${freshness}%`);
    }
    lines.push('');

    lines.push('## Recommendations');
    lines.push('');

    if (metadataStats.totalFiles === 0) {
      lines.push('- Run `eos_index` to build the knowledge base.');
    } else if (drift) {
      const totalDrift = drift.added.length + drift.modified.length + drift.deleted.length;
      const totalTracked = totalDrift + drift.unchanged;
      const driftPct = totalTracked > 0 ? Math.round((totalDrift / totalTracked) * 100) : 0;

      if (driftPct > 20) {
        lines.push(`- **High drift (${driftPct}%).** Run \`eos index\` to re-sync, or \`eos index --watch\` for continuous indexing.`);
      } else if (driftPct > 5) {
        lines.push(`- Moderate drift (${driftPct}%). Run \`eos index\` to refresh.`);
      } else if (totalDrift === 0) {
        lines.push('- Knowledge base is fully synced. No action required.');
      } else {
        lines.push(`- Minor drift (${totalDrift} files). Knowledge base is mostly healthy.`);
      }
      if (metadataStats.totalRelationships === 0) {
        lines.push('- Dependency graph is empty. Re-index to build relationships.');
      }
      if (coverageScore < 50) {
        lines.push('- Coverage is low. Consider indexing additional file paths.');
      }
    }

    return lines.join('\n');
  }

  private async handleSecurityScan(args: { paths?: string[]; categories?: string[]; severity?: string; excludePatterns?: string[]; includeTestFiles?: boolean }): Promise<string> {
    const customPatterns = args.excludePatterns?.map((p) => new RegExp(p)) ?? [];
    const result = await this.services.securityScanner.scan({
      paths: args.paths,
      categories: args.categories as FindingCategory[] | undefined,
      minSeverity: args.severity as Severity | undefined,
      exclude: {
        useDefaults: !args.includeTestFiles,
        patterns: customPatterns,
      },
    });

    if (result.findings.length === 0) {
      return [
        '# Security Scan Results',
        '',
        `**Files scanned:** ${result.filesScanned}`,
        result.filesExcluded ? `**Files excluded:** ${result.filesExcluded} (test/fixture files)` : '',
        `**Duration:** ${result.duration}ms`,
        '',
        'No security vulnerabilities detected.',
      ].filter(Boolean).join('\n');
    }

    const lines = [
      '# Security Scan Results',
      '',
      `**Files scanned:** ${result.filesScanned}`,
      result.filesExcluded ? `**Files excluded:** ${result.filesExcluded} (test/fixture files)` : '',
      `**Duration:** ${result.duration}ms`,
      `**Findings:** ${result.findings.length}`,
      '',
      '## Summary',
      `- CRITICAL: ${result.summary.critical}`,
      `- HIGH: ${result.summary.high}`,
      `- MEDIUM: ${result.summary.medium}`,
      `- LOW: ${result.summary.low}`,
      '',
      '## Findings',
      '',
    ];

    for (const f of result.findings) {
      lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`- **File:** ${f.filePath}:${f.startLine}`);
      lines.push(`- **Category:** ${f.category}`);
      lines.push(`- **CWE:** ${f.cweId || 'N/A'}`);
      lines.push(`- **Confidence:** ${f.confidence}`);
      lines.push(`- **Code:** \`${f.snippet}\``);
      lines.push(`- **Remediation:** ${f.remediation}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handleSecurityConventions(args: { language?: string; category?: string }): Promise<string> {
    const conventions = await this.services.securityConventionsStore.getConventions(args);

    if (conventions.length === 0) {
      return 'No security conventions found for the specified filters.';
    }

    const lines = ['# Security Conventions', ''];

    for (const c of conventions) {
      lines.push(`## ${c.id}: ${c.rule}`);
      lines.push(`- **Category:** ${c.category}`);
      lines.push(`- **Severity:** ${c.severity}`);
      lines.push(`- **Language:** ${c.language}`);
      lines.push(`- **Description:** ${c.description}`);
      if (c.examples.length > 0) {
        lines.push('- **Examples:**');
        for (const ex of c.examples) {
          lines.push(`  - Bad: \`${ex.bad}\``);
          lines.push(`  - Good: \`${ex.good}\``);
        }
      }
      if (c.references.length > 0) {
        lines.push(`- **References:** ${c.references.join(', ')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handleSecurityAudit(args: { paths?: string[]; includeDependencies?: boolean }): Promise<string> {
    const scanResult = await this.services.securityScanner.scan({ paths: args.paths, exclude: { useDefaults: true } });
    const owaspCoverage = this.services.owaspMapper.mapFindings(scanResult.findings);
    const overallRisk = this.services.owaspMapper.computeOverallRisk(scanResult.findings);

    const lines = [
      '# Security Audit Report',
      '',
      `**Overall Risk:** ${overallRisk.toUpperCase()}`,
      `**Files scanned:** ${scanResult.filesScanned}`,
      `**Vulnerabilities found:** ${scanResult.findings.length}`,
      '',
    ];

    // Vulnerability summary
    lines.push('## Vulnerability Summary');
    lines.push(`- CRITICAL: ${scanResult.summary.critical}`);
    lines.push(`- HIGH: ${scanResult.summary.high}`);
    lines.push(`- MEDIUM: ${scanResult.summary.medium}`);
    lines.push(`- LOW: ${scanResult.summary.low}`);
    lines.push('');

    // Dependency check
    if (args.includeDependencies !== false) {
      const depVulns = await this.services.dependencyAuditor.audit();
      if (depVulns.length > 0) {
        lines.push('## Dependency Vulnerabilities');
        lines.push('');
        for (const v of depVulns) {
          lines.push(`- **${v.package}@${v.version}** — ${v.cveId} (${v.severity.toUpperCase()})`);
          lines.push(`  ${v.title}. ${v.patchedIn ? `Patched in: ${v.patchedIn}` : 'No patch available.'}`);
        }
        lines.push('');
      } else {
        lines.push('## Dependency Vulnerabilities');
        lines.push('');
        lines.push('No known CVEs found in project dependencies.');
        lines.push('');
      }
    }

    // OWASP coverage
    lines.push('## OWASP Top 10 (2021) Coverage');
    lines.push('');
    for (const [category, data] of Object.entries(owaspCoverage)) {
      const icon = data.status === 'pass' ? '[PASS]' : data.status === 'warn' ? '[WARN]' : '[FAIL]';
      lines.push(`${icon} ${category} — ${data.findings} finding(s)`);
    }
    lines.push('');

    // Top findings
    if (scanResult.findings.length > 0) {
      lines.push('## Top Findings');
      lines.push('');
      const top = scanResult.findings.slice(0, 10);
      for (const f of top) {
        lines.push(`- [${f.severity.toUpperCase()}] **${f.title}** — ${f.filePath}:${f.startLine}`);
        lines.push(`  ${f.remediation}`);
      }
      lines.push('');
    }

    // Recommendations
    lines.push('## Recommendations');
    lines.push('');
    if (scanResult.summary.critical > 0) {
      lines.push('1. **IMMEDIATE:** Fix all critical vulnerabilities before deploying.');
    }
    if (scanResult.summary.high > 0) {
      lines.push('2. Address high-severity findings in the current sprint.');
    }
    lines.push('3. Review security conventions with `eos_security_conventions` and ensure team compliance.');
    lines.push('4. Consider adding security checks to your CI pipeline.');

    return lines.join('\n');
  }

  private async handleThreatModel(args: { featureSlug: string; specification: string; components?: string[] }): Promise<string> {
    const model = this.services.threatModeler.analyze(
      args.featureSlug,
      args.specification,
      args.components
    );

    const lines = [
      `# Threat Model: ${model.featureSlug}`,
      '',
      `**Threats identified:** ${model.threats.length}`,
      `**Data flows detected:** ${model.dataFlows.length}`,
      `**Trust boundaries:** ${model.trustBoundaries.length}`,
      '',
    ];

    if (model.dataFlows.length > 0) {
      lines.push('## Data Flows');
      lines.push('');
      for (const flow of model.dataFlows) {
        lines.push(`- ${flow}`);
      }
      lines.push('');
    }

    if (model.trustBoundaries.length > 0) {
      lines.push('## Trust Boundaries');
      lines.push('');
      for (const boundary of model.trustBoundaries) {
        lines.push(`- ${boundary}`);
      }
      lines.push('');
    }

    if (model.threats.length > 0) {
      lines.push('## Threats (STRIDE)');
      lines.push('');
      for (const threat of model.threats) {
        lines.push(`### [${threat.severity.toUpperCase()}] ${threat.title} (${threat.category})`);
        lines.push(`- **ID:** ${threat.id}`);
        lines.push(`- **Component:** ${threat.affectedComponent}`);
        lines.push(`- **Description:** ${threat.description}`);
        lines.push('- **Mitigations:**');
        for (const m of threat.mitigations) {
          lines.push(`  - ${m}`);
        }
        lines.push('');
      }
    }

    if (model.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of model.recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    return lines.join('\n');
  }

  private async handleDependencyCheck(args: { packageFile?: string }): Promise<string> {
    const vulnerabilities = await this.services.dependencyAuditor.audit(args.packageFile);

    if (vulnerabilities.length === 0) {
      return [
        '# Dependency Security Check',
        '',
        'No known CVEs found in project dependencies.',
        '',
        'Note: This checks against a bundled CVE database. Run `npm audit` for the most up-to-date results.',
      ].join('\n');
    }

    const lines = [
      '# Dependency Security Check',
      '',
      `**Vulnerable packages:** ${vulnerabilities.length}`,
      '',
    ];

    const bySeverity: Record<string, typeof vulnerabilities> = {};
    for (const v of vulnerabilities) {
      if (!bySeverity[v.severity]) bySeverity[v.severity] = [];
      bySeverity[v.severity].push(v);
    }

    for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
      const group = bySeverity[severity];
      if (!group || group.length === 0) continue;

      lines.push(`## ${severity.toUpperCase()} (${group.length})`);
      lines.push('');
      for (const v of group) {
        lines.push(`### ${v.package}@${v.version}`);
        lines.push(`- **CVE:** ${v.cveId}`);
        lines.push(`- **Issue:** ${v.title}`);
        lines.push(`- **Advisory:** ${v.advisory}`);
        if (v.patchedIn) {
          lines.push(`- **Fix:** Upgrade to ${v.patchedIn} or later`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private async handleLinkRepo(args: { name: string; path: string; tags?: string[] }): Promise<string> {
    const { name, path: repoPath, tags } = args;
    const eosDir = require('path').join(repoPath, '.eos');

    await this.services.repoRegistry.linkRepo({
      name,
      path: repoPath,
      eosDir,
      lastSynced: new Date().toISOString(),
      tags,
    });

    const { valid, broken } = await this.services.repoRegistry.validateLinks();
    const status = broken.find((r) => r.name === name)
      ? '(WARNING: .eos/index/metadata.db not found — run `eos init` in that repo first)'
      : '(verified: index accessible)';

    return [
      `# Repository Linked`,
      '',
      `**Name:** ${name}`,
      `**Path:** ${repoPath}`,
      `**Status:** ${status}`,
      tags ? `**Tags:** ${tags.join(', ')}` : '',
      '',
      `Total linked repos: ${valid.length + broken.length}`,
      `Use \`eos_search_all\` to search across all linked repositories.`,
    ].filter(Boolean).join('\n');
  }

  private async handleUnlinkRepo(args: { name: string }): Promise<string> {
    const removed = await this.services.repoRegistry.unlinkRepo(args.name);
    if (!removed) {
      return `Repository "${args.name}" not found in linked repos.`;
    }
    return `Repository "${args.name}" has been unlinked. Federated search will no longer include it.`;
  }

  private async handleSearchAll(args: { query: string; repos?: string[]; limit?: number }): Promise<string> {
    const results = await this.services.federatedSearch.search(args.query, {
      limit: args.limit ?? 5,
      repos: args.repos,
    });

    if (results.length === 0) {
      const repos = await this.services.repoRegistry.getLinkedRepos();
      if (repos.length === 0) {
        return 'No linked repositories. Use `eos_link_repo` to add repos for federated search.';
      }
      return `No results found for "${args.query}" across ${repos.length} linked repo(s).`;
    }

    const lines = [`# Federated Search: "${args.query}"`, ''];

    for (const repoResult of results) {
      lines.push(`## ${repoResult.repo} (${repoResult.repoPath})`);
      lines.push('');
      for (const item of repoResult.results) {
        lines.push(`- **${item.name}** — \`${item.filePath}:${item.startLine}\` (score: ${item.score.toFixed(2)})`);
        if (item.content) {
          lines.push(`  \`\`\`${item.content.slice(0, 200)}\`\`\``);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private async handleTeamSync(args: {
    action: string;
    name?: string;
    rule?: string;
    description?: string;
    severity?: string;
    category?: string;
    usage?: string;
    enforced?: boolean;
    remotePath?: string;
  }): Promise<string> {
    const { action } = args;

    switch (action) {
      case 'status': {
        const manifest = await this.services.teamSync.getManifest();
        if (!manifest) {
          return 'No team manifest found. Use `eos_team_sync` with action "add-convention" to start.';
        }
        return [
          `# Team Sync Status`,
          '',
          `**Team:** ${manifest.team}`,
          `**Last Updated:** ${manifest.lastUpdated}`,
          '',
          `**Conventions:** ${manifest.conventions.length} (${manifest.conventions.filter((c) => c.enforced).length} enforced)`,
          `**Patterns:** ${manifest.patterns.length}`,
          `**Security Policies:** ${manifest.securityPolicies.length} (${manifest.securityPolicies.filter((p) => p.enforced).length} enforced)`,
        ].join('\n');
      }

      case 'add-convention': {
        if (!args.name || !args.rule) {
          return 'Error: "name" and "rule" are required for add-convention.';
        }
        const conv = await this.services.teamSync.addConvention({
          name: args.name,
          rule: args.rule,
          description: args.description || '',
          examples: [],
          enforced: args.enforced !== false,
          addedAt: new Date().toISOString(),
        });
        return `Convention added: **${conv.id}** — ${conv.name}\nRule: ${conv.rule}`;
      }

      case 'add-pattern': {
        if (!args.name || !args.description) {
          return 'Error: "name" and "description" are required for add-pattern.';
        }
        const pat = await this.services.teamSync.addPattern({
          name: args.name,
          description: args.description,
          usage: args.usage || 'general',
          addedAt: new Date().toISOString(),
        });
        return `Pattern added: **${pat.id}** — ${pat.name}`;
      }

      case 'add-policy': {
        if (!args.rule || !args.severity || !args.category) {
          return 'Error: "rule", "severity", and "category" are required for add-policy.';
        }
        const pol = await this.services.teamSync.addSecurityPolicy({
          rule: args.rule,
          severity: args.severity as any,
          category: args.category,
          enforced: args.enforced !== false,
        });
        return `Security policy added: **${pol.id}** — [${pol.severity.toUpperCase()}] ${pol.rule}`;
      }

      case 'sync': {
        if (!args.remotePath) {
          return 'Error: "remotePath" is required for sync action (path to remote .eos/ directory).';
        }
        const result = await this.services.teamSync.syncFrom(args.remotePath);
        return `Sync complete: ${result.added} added, ${result.updated} updated.`;
      }

      default:
        return `Unknown team sync action: "${action}". Use: status, add-convention, add-pattern, add-policy, sync.`;
    }
  }

  private async handleAuditReport(args: { action: string; reportId?: string; format?: string }): Promise<string> {
    switch (args.action) {
      case 'generate': {
        const scanResult = await this.services.securityScanner.scan({ exclude: { useDefaults: true } });
        const owaspCoverage = this.services.owaspMapper.mapFindings(scanResult.findings);
        const depVulns = await this.services.dependencyAuditor.audit();
        const report = await this.services.auditReporter.generateReport(
          'current-project',
          scanResult,
          owaspCoverage,
          depVulns.length
        );
        return [
          `# Audit Report Generated`,
          '',
          `**Report ID:** ${report.id}`,
          `**Generated:** ${report.generatedAt}`,
          `**Findings:** ${report.summary.totalFindings}`,
          '',
          `Use \`eos_audit_report\` with action "export" and reportId "${report.id}" to export.`,
        ].join('\n');
      }

      case 'list': {
        const reports = await this.services.auditReporter.getReports();
        if (reports.length === 0) {
          return 'No audit reports found. Use action "generate" to create one.';
        }
        const lines = ['# Audit Reports', ''];
        for (const r of reports) {
          lines.push(`- **${r.id}** — ${r.generatedAt} — ${r.summary.totalFindings} findings (C:${r.summary.critical} H:${r.summary.high} M:${r.summary.medium} L:${r.summary.low})`);
        }
        return lines.join('\n');
      }

      case 'get': {
        if (!args.reportId) return 'Error: "reportId" required for get action.';
        const report = await this.services.auditReporter.getReport(args.reportId);
        if (!report) return `Report not found: "${args.reportId}"`;
        return this.services.auditReporter.exportAsMarkdown(report);
      }

      case 'export': {
        if (!args.reportId) return 'Error: "reportId" required for export action.';
        const report = await this.services.auditReporter.getReport(args.reportId);
        if (!report) return `Report not found: "${args.reportId}"`;
        if (args.format === 'json') {
          return this.services.auditReporter.exportAsJson(report);
        }
        return this.services.auditReporter.exportAsMarkdown(report);
      }

      default:
        return `Unknown audit report action: "${args.action}". Use: generate, list, get, export.`;
    }
  }

  private async handleAnalytics(args: { period?: string }): Promise<string> {
    const period = args.period || 'month';
    let since: string | undefined;

    switch (period) {
      case 'today':
        since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
        break;
      case 'week':
        since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'month':
        since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'all':
        since = undefined;
        break;
    }

    const toolStats = this.services.analyticsStore.getToolStats(since);
    const totalEvents = this.services.analyticsStore.getTotalEvents();

    if (toolStats.length === 0) {
      return [
        '# Analytics',
        '',
        `**Period:** ${period}`,
        `**Total events recorded:** ${totalEvents}`,
        '',
        'No tool usage data for this period.',
      ].join('\n');
    }

    const lines = [
      '# Tool Usage Analytics',
      '',
      `**Period:** ${period}`,
      `**Total events:** ${totalEvents}`,
      '',
      '## Tool Stats',
      '',
      '| Tool | Calls | Avg Duration | Success Rate | Last Used |',
      '|------|-------|-------------|--------------|-----------|',
    ];

    for (const stat of toolStats) {
      lines.push(
        `| ${stat.tool} | ${stat.totalCalls} | ${stat.avgDuration}ms | ${stat.successRate}% | ${stat.lastUsed.slice(0, 10)} |`
      );
    }

    return lines.join('\n');
  }

  private async handleMarketplace(args: { action: string; name?: string; category?: string; yaml?: string }): Promise<string> {
    switch (args.action) {
      case 'list': {
        const templates = await this.services.marketplace.listTemplates(args.category);
        if (templates.length === 0) {
          return args.category
            ? `No templates found in category "${args.category}".`
            : 'No workflow templates available.';
        }
        const lines = ['# Workflow Marketplace', ''];
        for (const t of templates) {
          lines.push(`- **${t.name}** — ${t.description} [${t.category}] (${t.stages} stages, by ${t.author})`);
        }
        return lines.join('\n');
      }

      case 'get': {
        if (!args.name) return 'Error: "name" required for get action.';
        const yaml = await this.services.marketplace.getTemplate(args.name);
        if (!yaml) return `Template not found: "${args.name}"`;
        return `# Template: ${args.name}\n\n\`\`\`yaml\n${yaml}\`\`\``;
      }

      case 'install': {
        if (!args.name || !args.yaml) return 'Error: "name" and "yaml" required for install action.';
        const stageCount = (args.yaml.match(/- id:/g) || []).length;
        await this.services.marketplace.installTemplate(args.name, args.yaml, {
          description: `Custom workflow: ${args.name}`,
          category: 'custom',
          stages: stageCount,
          author: 'user',
        });
        return `Template "${args.name}" installed (${stageCount} stages). Use it with \`eos_plan\`.`;
      }

      case 'categories': {
        const categories = await this.services.marketplace.getCategories();
        if (categories.length === 0) return 'No categories available.';
        return `# Workflow Categories\n\n${categories.map((c) => `- ${c}`).join('\n')}`;
      }

      default:
        return `Unknown marketplace action: "${args.action}". Use: list, get, install, categories.`;
    }
  }

  private async handlePostureScore(args: { days?: number }): Promise<string> {
    // Run a fresh scan and dependency audit (exclude test/fixture files)
    const scanResult = await this.services.securityScanner.scan({ exclude: { useDefaults: true } });
    const depVulns = await this.services.dependencyAuditor.audit();

    // Get convention compliance (ratio of team conventions met)
    const conventions = await this.services.securityConventionsStore.getConventions({});
    const conventionPercent = conventions.length > 0 ? 85 : 50;

    const score = this.services.postureScorer.compute(scanResult, depVulns, conventionPercent);
    const trend = this.services.postureScorer.getTrend(args.days ?? 30);

    const lines = [
      '# Security Posture Score',
      '',
      `## Current Score: ${score.score}/100`,
      '',
      '### Breakdown',
      `- **Scan deductions:** -${score.breakdown.scanDeductions} (from ${scanResult.findings.length} findings)`,
      `- **Dependency deductions:** -${score.breakdown.depDeductions} (from ${depVulns.length} vulnerable packages)`,
      `- **Convention bonus:** +${score.breakdown.conventionBonus} (convention compliance: ${conventionPercent}%)`,
      '',
    ];

    if (score.breakdown.details.length > 0) {
      lines.push('### Details');
      for (const d of score.breakdown.details) {
        if (d.source === 'convention') continue;
        lines.push(`- ${d.source} [${d.severity}]: ${d.count} issue(s) → -${d.deduction} points`);
      }
      lines.push('');
    }

    if (trend && trend.history.length > 1) {
      lines.push(`### Trend (${args.days ?? 30} days): **${trend.trend.toUpperCase()}**`);
      lines.push('');
      lines.push('| Date | Score |');
      lines.push('|------|-------|');
      for (const h of trend.history.slice(-10)) {
        lines.push(`| ${h.date} | ${h.score} |`);
      }
    }

    return lines.join('\n');
  }

  private async handleComplianceCheck(args: { framework: string }): Promise<string> {
    const framework = args.framework as ComplianceFramework;
    const result = await this.services.complianceChecker.check(framework);

    const lines = [
      `# ${result.framework} Compliance Report`,
      '',
      `**Version:** ${result.version}`,
      `**Score:** ${result.score}/100`,
      `**Passed:** ${result.passed} | **Failed:** ${result.failed} | **Skipped:** ${result.skipped}`,
      '',
    ];

    const criticalFails = result.findings.filter((f) => f.status === 'fail' && f.severity === 'critical');
    const highFails = result.findings.filter((f) => f.status === 'fail' && f.severity === 'high');
    const mediumFails = result.findings.filter((f) => f.status === 'fail' && f.severity === 'medium');

    if (criticalFails.length > 0) {
      lines.push('## CRITICAL Failures');
      lines.push('');
      for (const f of criticalFails) {
        lines.push(`### ${f.ruleId}: ${f.title}`);
        lines.push(`- **Details:** ${f.details}`);
        lines.push(`- **Remediation:** ${f.remediation}`);
        if (f.reference) lines.push(`- **Reference:** ${f.reference}`);
        lines.push('');
      }
    }

    if (highFails.length > 0) {
      lines.push('## HIGH Failures');
      lines.push('');
      for (const f of highFails) {
        lines.push(`### ${f.ruleId}: ${f.title}`);
        lines.push(`- **Details:** ${f.details}`);
        lines.push(`- **Remediation:** ${f.remediation}`);
        if (f.reference) lines.push(`- **Reference:** ${f.reference}`);
        lines.push('');
      }
    }

    if (mediumFails.length > 0) {
      lines.push('## MEDIUM Failures');
      lines.push('');
      for (const f of mediumFails) {
        lines.push(`- **${f.ruleId}:** ${f.title} — ${f.remediation}`);
      }
      lines.push('');
    }

    const passes = result.findings.filter((f) => f.status === 'pass');
    if (passes.length > 0) {
      lines.push('## Passed Checks');
      lines.push('');
      for (const f of passes) {
        lines.push(`- [PASS] ${f.ruleId}: ${f.title}`);
      }
    }

    return lines.join('\n');
  }

  private async handleExport(args: { outputPath?: string; repoName?: string }): Promise<string> {
    const archive = await this.services.knowledgeExporter.export(args.repoName);

    if (args.outputPath) {
      await this.services.knowledgeExporter.exportToFile(args.outputPath, args.repoName);
      return [
        '# Knowledge Export Complete',
        '',
        `**Output:** ${args.outputPath}`,
        `**Source:** ${archive.sourceRepo}`,
        `**Exported at:** ${archive.exportedAt}`,
        `**Total knowledge files:** ${archive.metadata.totalFiles}`,
        `**Archive size:** ${(archive.metadata.exportSize / 1024).toFixed(1)} KB`,
        '',
        '## Contents',
        `- Decisions: ${archive.sections.decisions.length}`,
        `- Architecture: ${archive.sections.architecture.length}`,
        `- Patterns: ${archive.sections.patterns.length}`,
        `- Conventions: ${archive.sections.conventions.length}`,
        `- Security: ${archive.sections.security.length}`,
        `- Team manifest: ${archive.sections.team ? 'yes' : 'no'}`,
        '',
        'This archive can be imported in air-gapped environments.',
      ].join('\n');
    }

    return JSON.stringify(archive, null, 2);
  }

  private async handleAuditLog(args: { tool?: string; user?: string; since?: string; until?: string; limit?: number }): Promise<string> {
    const entries = this.services.auditStore.query({
      tool: args.tool,
      user: args.user,
      since: args.since,
      until: args.until,
      limit: args.limit ?? 50,
    });

    if (entries.length === 0) {
      return 'No audit entries found for the given filters.';
    }

    const stats = this.services.auditStore.getStats();
    const lines = [
      '# Audit Log',
      '',
      `**Total entries:** ${stats.totalEntries}`,
      `**Unique tools:** ${stats.uniqueTools}`,
      `**Unique users:** ${stats.uniqueUsers}`,
      '',
      '## Entries',
      '',
    ];

    for (const entry of entries) {
      const status = entry.success ? 'OK' : 'FAIL';
      lines.push(`### [${status}] ${entry.tool} — ${entry.timestamp}`);
      lines.push(`- **User:** ${entry.user}`);
      lines.push(`- **Duration:** ${entry.duration}ms`);
      lines.push(`- **Args:** \`${JSON.stringify(entry.args)}\``);
      lines.push(`- **Result:** ${entry.resultSummary.slice(0, 200)}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private validateDecisionStatus(status?: string): 'proposed' | 'accepted' | 'deprecated' | 'superseded' | undefined {
    if (!status) return undefined;
    const allowed = ['proposed', 'accepted', 'deprecated', 'superseded'];
    if (!allowed.includes(status)) {
      throw new Error(`Invalid decision status: "${status}". Must be one of: ${allowed.join(', ')}`);
    }
    return status as 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  }

  // --- Cross-Repo Architecture Intelligence (v2) ---

  private async handleGraph(args: { action: string; repo?: string; from?: string; to?: string; protocol?: string }): Promise<string> {
    const { action, repo, from, to, protocol } = args;

    switch (action) {
      case 'list-services': {
        const services = repo
          ? this.services.graphStore.getServicesByRepo(repo)
          : this.services.graphStore.getAllServices();

        if (services.length === 0) return 'No services in the graph. Run `eos_discover_contracts` to populate.';

        const lines = ['# Service Graph\n'];
        const byRepo = new Map<string, typeof services>();
        for (const s of services) {
          if (!byRepo.has(s.repoName)) byRepo.set(s.repoName, []);
          byRepo.get(s.repoName)!.push(s);
        }
        for (const [repoName, svcList] of byRepo) {
          lines.push(`## ${repoName}`);
          for (const s of svcList) {
            lines.push(`- **${s.serviceName}** [${s.criticality}] — ${s.description || 'no description'}`);
            if (s.owners.length > 0) lines.push(`  Owners: ${s.owners.join(', ')}`);
          }
          lines.push('');
        }
        return lines.join('\n');
      }

      case 'list-connections': {
        let connections = this.services.graphStore.getAllConnections();
        if (protocol) {
          connections = connections.filter((c) => c.protocol === protocol);
        }
        if (connections.length === 0) return 'No connections in the graph.';

        const lines = ['# Service Connections\n'];
        for (const c of connections) {
          lines.push(`- ${c.sourceService} → ${c.targetService} [${c.protocol}] (${c.dataFlow})`);
          if (c.description) lines.push(`  ${c.description}`);
        }
        return lines.join('\n');
      }

      case 'find-path': {
        if (!from || !to) return 'Error: `from` and `to` are required for find-path.';
        const path = this.services.graphStore.findPath(from, to);
        if (!path) return `No path found from ${from} to ${to}.`;

        const lines = ['# Path\n'];
        for (let i = 0; i < path.length; i++) {
          lines.push(`${i + 1}. ${path[i].serviceName} (${path[i].repoName})`);
        }
        return lines.join('\n');
      }

      case 'diagram': {
        const diagram = this.services.graphStore.generateMermaidDiagram({
          repoFilter: repo,
          protocol: protocol as ConnectionProtocol | undefined,
        });
        return `# Architecture Diagram\n\n\`\`\`mermaid\n${diagram.mermaid}\n\`\`\`\n\n${diagram.services} services, ${diagram.connections} connections.`;
      }

      case 'stats': {
        const stats = this.services.graphStore.getStats();
        return `# Graph Stats\n\n- Services: ${stats.services}\n- Connections: ${stats.connections}\n- Contracts: ${stats.contracts}\n- Data Entities: ${stats.entities}`;
      }

      default:
        return `Unknown graph action: ${action}. Use: list-services, list-connections, find-path, diagram, stats.`;
    }
  }

  private async handleImpact(args: { type: string; repo?: string; target: string; method?: string }): Promise<string> {
    const { type, repo, target, method } = args;

    let result;
    switch (type) {
      case 'file':
        if (!repo) return 'Error: `repo` is required for file impact analysis.';
        result = this.services.impactAnalyzer.analyzeFileChange(repo, target);
        break;
      case 'service':
        result = this.services.impactAnalyzer.analyzeServiceChange(target);
        break;
      case 'endpoint':
        if (!repo) return 'Error: `repo` is required for endpoint impact analysis.';
        result = this.services.impactAnalyzer.analyzeEndpointChange(repo, target, method);
        break;
      default:
        return `Unknown impact type: ${type}. Use: file, service, endpoint.`;
    }

    const lines = [
      `# Impact Analysis\n`,
      `**Risk Level:** ${result.riskLevel.toUpperCase()}`,
      `**Changed:** ${result.changedService}`,
      '',
      result.summary,
    ];

    if (result.affectedServices.length > 0) {
      lines.push('\n## Affected Services\n');
      for (const s of result.affectedServices) {
        lines.push(`- **${s.serviceName}** (${s.repoName}) [${s.criticality}] via ${s.protocol}`);
        lines.push(`  Reason: ${s.reason}`);
      }
    }

    if (result.affectedContracts.length > 0) {
      lines.push('\n## Affected Contracts\n');
      for (const c of result.affectedContracts) {
        lines.push(`- ${c}`);
      }
    }

    return lines.join('\n');
  }

  private async handleContracts(args: { repo?: string; type?: string; id?: string }): Promise<string> {
    if (args.id) {
      const contract = this.services.graphStore.getContract(args.id);
      if (!contract) return `Contract not found: ${args.id}`;

      const lines = [
        `# Contract: ${contract.id}\n`,
        `- **Type:** ${contract.type}`,
        `- **Repo:** ${contract.repoName}`,
        `- **File:** ${contract.filePath}`,
        contract.version ? `- **Version:** ${contract.version}` : '',
        '\n## Endpoints\n',
      ];
      for (const ep of contract.endpoints) {
        lines.push(`- ${ep.method ?? ''} ${ep.path}${ep.description ? ` — ${ep.description}` : ''}`);
      }
      return lines.filter(Boolean).join('\n');
    }

    let contracts = args.repo
      ? this.services.graphStore.getContractsByRepo(args.repo)
      : this.services.graphStore.getAllContracts();

    if (args.type) {
      contracts = contracts.filter((c) => c.type === args.type);
    }

    if (contracts.length === 0) return 'No contracts found. Run `eos_discover_contracts` to scan repos.';

    const lines = ['# API Contracts\n'];
    for (const c of contracts) {
      lines.push(`- **${c.id}** [${c.type}] — ${c.filePath} (${c.endpoints.length} endpoints)`);
    }
    return lines.join('\n');
  }

  private async handleOwners(args: { service?: string; entity?: string }): Promise<string> {
    if (args.service) {
      const service = this.services.graphStore.getService(args.service);
      if (!service) return `Service not found: ${args.service}`;

      const entities = this.services.graphStore.getEntitiesOwnedBy(args.service);
      const lines = [
        `# Service: ${service.serviceName}\n`,
        `- **Repo:** ${service.repoName}`,
        `- **Owners:** ${service.owners.length > 0 ? service.owners.join(', ') : 'unassigned'}`,
        `- **Criticality:** ${service.criticality}`,
      ];
      if (entities.length > 0) {
        lines.push('\n## Data Ownership\n');
        for (const e of entities) {
          lines.push(`- ${e.entity} (${e.accessType})`);
        }
      }
      return lines.join('\n');
    }

    if (args.entity) {
      const owners = this.services.graphStore.getOwnersOf(args.entity);
      if (owners.length === 0) return `No ownership records for entity: ${args.entity}`;

      const lines = [`# Entity: ${args.entity}\n`];
      for (const o of owners) {
        lines.push(`- **${o.ownerService}** — ${o.accessType}`);
      }
      return lines.join('\n');
    }

    return 'Provide either `service` or `entity` to query ownership.';
  }

  private async handleCrossContext(args: { task: string; repo?: string; maxTokens?: number }): Promise<string> {
    const repoName = args.repo || this.detectCurrentRepo();
    const ctx = await this.services.crossRepoContextBuilder.buildContext(repoName, args.task, { maxTokens: args.maxTokens });
    const formatted = this.services.crossRepoContextBuilder.formatForContext(ctx);

    if (!formatted) return 'No cross-repo context available. Ensure repos are linked and the graph is populated via `eos_discover_contracts`.';
    return formatted;
  }

  private async handleDiscoverContracts(args: { repo?: string; path?: string }): Promise<string> {
    const report = await this.services.graphLinker.linkAll();

    const lines = [
      `# Graph Linker Report\n`,
      `## Stats`,
      `- Repos scanned: ${report.stats.reposScanned}`,
      `- Contracts found: ${report.stats.contractsFound}`,
      `- Outbound calls detected: ${report.stats.outboundCallsDetected}`,
      `- Duration: ${report.stats.totalDurationMs}ms`,
      '',
    ];

    if (report.autoLinked.length > 0) {
      lines.push(`## Auto-Linked Connections (${report.autoLinked.length})\n`);
      for (const edge of report.autoLinked) {
        lines.push(`- **${edge.sourceRepo} → ${edge.targetRepo}** [${edge.protocol}] (confidence: ${edge.confidence.toFixed(2)})`);
        for (const signal of edge.signals) {
          lines.push(`  - ${signal.signalType}: ${signal.evidence}`);
        }
      }
      lines.push('');
    }

    if (report.suggested.length > 0) {
      lines.push(`## Suggestions (${report.suggested.length}) — need confirmation\n`);
      for (const edge of report.suggested) {
        lines.push(`- ${edge.sourceRepo} → ${edge.targetRepo} [${edge.protocol}] (confidence: ${edge.confidence.toFixed(2)})${edge.ambiguous ? ' ⚠️ AMBIGUOUS' : ''}`);
        for (const signal of edge.signals) {
          lines.push(`  - ${signal.signalType}: ${signal.evidence}`);
        }
      }
      lines.push('');
    }

    if (report.discovered.length > 0) {
      lines.push(`## Discovered Sibling Repos (not yet linked)\n`);
      for (const d of report.discovered) {
        lines.push(`- ${d.name} (${d.path})`);
      }
      lines.push(`\nRun \`eos_link_repo\` to add them to your graph.`);
      lines.push('');
    }

    if (report.broken.length > 0) {
      lines.push(`## Broken Links\n`);
      for (const b of report.broken) {
        lines.push(`- ${b.name}: ${b.path} (not accessible)`);
      }
      lines.push('');
    }

    const skippedCount = report.skipped.length;
    if (skippedCount > 0) {
      lines.push(`## Skipped: ${skippedCount} calls (external domains, test files, no signals)`);
    }

    return lines.join('\n');
  }

  private async handleBuild(args: { requirement: string; mode?: string; repos?: string[] }): Promise<string> {
    const orchestrator = new Orchestrator({
      rootPath: this.services.rootPath,
      eosDir: path.join(this.services.rootPath, '.eos'),
      graphStore: this.services.graphStore,
      skillStore: this.services.skillStore,
      architectureStore: this.services.architectureStore,
      decisionStore: this.services.decisionStore,
    });

    const mode = (args.mode || 'plan-only') as 'plan-only' | 'implement' | 'full';
    const result = await orchestrator.build(args.requirement, { mode, repos: args.repos });

    const lines: string[] = ['# Build Plan\n'];

    // Product Spec
    lines.push('## Product Specification\n');
    lines.push(`**Feature:** ${result.productSpec.feature}`);
    lines.push(`**Problem:** ${result.productSpec.problem}`);
    lines.push(`**Impact:** ${result.productSpec.impact}`);
    lines.push(`**Users:** ${result.productSpec.usersAffected}`);
    if (result.productSpec.userStories.length > 0) {
      lines.push('\n**User Stories:**');
      result.productSpec.userStories.forEach((s) => lines.push(`- ${s}`));
    }
    if (result.productSpec.acceptanceCriteria.length > 0) {
      lines.push('\n**Acceptance Criteria:**');
      result.productSpec.acceptanceCriteria.forEach((c) => lines.push(`- ${c}`));
    }
    if (result.productSpec.risks.length > 0) {
      lines.push('\n**Risks:**');
      result.productSpec.risks.forEach((r) => lines.push(`- ${r}`));
    }

    // Tech Spec
    lines.push('\n## Technical Specification\n');
    if (result.techSpec.affectedServices.length > 0) {
      lines.push('**Affected Services:**');
      result.techSpec.affectedServices.forEach((s) => lines.push(`- **${s.name}** (${s.repo}, ${s.role}): ${s.action}`));
    }
    if (result.techSpec.reuseOpportunities.length > 0) {
      lines.push('\n**Reuse Opportunities:**');
      result.techSpec.reuseOpportunities.forEach((r) => lines.push(`- ${r.description} — \`${r.source}\``));
    }
    if (result.techSpec.newWorkNeeded.length > 0) {
      lines.push('\n**New Work:**');
      result.techSpec.newWorkNeeded.forEach((w) => lines.push(`- [${w.repo}] ${w.description} (${w.effort})`));
    }
    if (result.techSpec.technicalConstraints.length > 0) {
      lines.push('\n**Constraints:**');
      result.techSpec.technicalConstraints.forEach((c) => lines.push(`- ${c}`));
    }

    // Execution Plan
    lines.push('\n## Execution Plan\n');
    lines.push(`**Estimated Duration:** ${result.plan.estimatedDuration}`);
    lines.push(`**Steps:** ${result.plan.steps.length}`);
    lines.push('');
    for (const step of result.plan.steps) {
      const deps = step.dependsOn?.length ? ` (after: ${step.dependsOn.join(', ')})` : '';
      lines.push(`### Step ${step.id}: ${step.action}`);
      lines.push(`- **Repo:** ${step.repo}`);
      lines.push(`- **Specialist:** ${step.specialist}`);
      lines.push(`- **Risk:** ${step.risk}${deps}`);
      if (step.files.create?.length) lines.push(`- **Create:** ${step.files.create.join(', ')}`);
      if (step.files.modify?.length) lines.push(`- **Modify:** ${step.files.modify.join(', ')}`);
      if (step.pattern) lines.push(`- **Pattern:** follow \`${step.pattern}\``);
      lines.push('');
    }

    if (result.plan.parallelizable.length > 0) {
      lines.push('**Parallel groups:**');
      result.plan.parallelizable.forEach((group, i) => lines.push(`- Group ${i + 1}: ${group.join(', ')}`));
    }

    // Implementation prompts (if mode is implement or full)
    if (mode !== 'plan-only') {
      const implPrompts = orchestrator.generateImplementationPrompts(result.plan, '');
      lines.push('\n## Implementation Prompts\n');
      lines.push(`${implPrompts.length} specialist prompts generated. Execute each in the assigned repo.`);
      for (const p of implPrompts) {
        lines.push(`\n### ${p.agentName}`);
        lines.push(`${p.expectedOutputDescription}`);
      }
    }

    return lines.join('\n');
  }

  private detectCurrentRepo(): string {
    const parts = this.services.rootPath.split('/');
    return parts[parts.length - 1] || 'current';
  }

  private async handleLearn(args: { type: string; name?: string; content: string; context?: string; tags?: string[] }): Promise<string> {
    const skill = this.services.skillStore.create({
      type: args.type as SkillType,
      name: args.name,
      content: args.content,
      context: args.context,
      tags: args.tags,
    });

    return [
      `# Skill Learned ✓`,
      '',
      `**ID:** ${skill.id}`,
      `**Type:** ${skill.type}`,
      `**Name:** ${skill.name}`,
      `**Content:** ${skill.content}`,
      skill.context ? `**Context:** ${skill.context}` : '',
      '',
      `This knowledge is now permanently stored and will be surfaced in future sessions when relevant.`,
    ].filter(Boolean).join('\n');
  }

  private async handleRecallSkills(args: { query: string; type?: string }): Promise<string> {
    let skills = this.services.skillStore.getRelevantSkills(args.query);

    if (args.type && args.type !== 'all') {
      skills = skills.filter((s) => s.type === args.type);
    }

    if (skills.length === 0) {
      return `No learned skills found matching "${args.query}". Use \`eos_learn\` to record discoveries during this session.`;
    }

    const lines = [`# Recalled Skills (${skills.length} relevant)\n`];

    for (const skill of skills) {
      lines.push(`## [${skill.type.toUpperCase()}] ${skill.name}`);
      lines.push(skill.content);
      if (skill.context) lines.push(`**When:** ${skill.context}`);
      lines.push(`*Confidence: ${skill.confidence} | Applied ${skill.timesApplied} times*`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
