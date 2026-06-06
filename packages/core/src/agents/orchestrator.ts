/**
 * Orchestrator: coordinates the multi-agent pipeline.
 *
 * Takes a requirement string, runs through pipeline stages
 * (product refine -> tech refine -> plan), and returns a BuildResult
 * containing the full execution plan.
 *
 * DESIGN: The orchestrator does NOT call an LLM. It PRODUCES structured
 * prompts that the calling layer executes. The first two stages (productRefine
 * and techRefine) generate output analytically from project knowledge. Only
 * implementation stages produce AgentPrompt objects for LLM execution.
 */

import {
  BuildOptions,
  BuildResult,
  ProductSpec,
  TechSpec,
  ExecutionPlan,
  ExecutionStep,
  AgentPrompt,
  SpecialistType,
  AffectedService,
  ReuseOpportunity,
  WorkItem,
} from './types';
import { composePrompt, PromptContext } from './prompt-composer';
import {
  PRODUCT_REFINER,
  TECH_REFINER,
  PLANNER,
  FE_ENGINEER,
  BE_ENGINEER,
  DEVOPS_ENGINEER,
  SECURITY_ENGINEER,
  AI_ENGINEER,
  FULLSTACK_ENGINEER,
  QA_ENGINEER,
  REVIEWER,
  AGENTS_BY_NAME,
} from './definitions';
import { GistBuilder } from '../generators/gist-builder';
import { SkillStore, Skill } from '../knowledge/skill-store';
import { GraphStore } from '../architecture/graph-store';
import { WorkspaceLoader, WorkspaceConfig, WorkspaceRepo } from '../generators/workspace-loader';
import { ArchitectureStore } from '../architecture/architecture-store';
import { DecisionStore } from '../decisions/decision-store';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface OrchestratorDeps {
  rootPath: string;
  eosDir: string;
  graphStore: GraphStore;
  skillStore: SkillStore;
  architectureStore: ArchitectureStore;
  decisionStore: DecisionStore;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class Orchestrator {
  private workspace: WorkspaceConfig | null;

  constructor(private deps: OrchestratorDeps) {
    const loader = new WorkspaceLoader(deps.rootPath);
    this.workspace = loader.load();
  }

  /**
   * Run the full build pipeline for a requirement.
   */
  async build(requirement: string, options?: BuildOptions): Promise<BuildResult> {
    const mode = options?.mode || 'plan-only';
    const projectContext = await this.getProjectContext();
    const skills = this.deps.skillStore.search(requirement);

    // Stage 1: Product Refinement (analytical — generates structured spec from knowledge)
    const productSpec = await this.productRefine(requirement, projectContext, skills);

    // Stage 2: Tech Refinement (analytical — maps to services using graph + architecture)
    const techSpec = await this.techRefine(productSpec, projectContext, skills);

    // Stage 3: Execution Planning (analytical — creates ordered steps from tech spec)
    const plan = await this.plan(techSpec, projectContext);

    const result: BuildResult = { productSpec, techSpec, plan, status: 'planned' };

    if (mode === 'plan-only') return result;

    // For 'implement' and 'full' modes, attach implementation prompts to the plan.
    // The calling system (CLI workflow or MCP tool) will execute these prompts.
    // We do NOT mutate the plan here; prompts are generated on demand via
    // generateImplementationPrompts() and generateReviewPrompt().
    return result;
  }

  /**
   * Generate prompts for each implementation step in the plan.
   * Returned for execution by the calling system (CLI or MCP layer).
   */
  generateImplementationPrompts(plan: ExecutionPlan, projectContext: string): AgentPrompt[] {
    const prompts: AgentPrompt[] = [];

    for (const step of plan.steps) {
      const definition = this.getAgentDefinitionForSpecialist(step.specialist);
      const context: PromptContext = {
        requirement: step.action,
        projectContext,
        relevantSkills: step.pattern ? [step.pattern] : [],
        previousStageOutput: this.formatStepContext(step),
        conventions: this.getConventionsForRepo(step.repo),
        decisions: this.getDecisionsForRepo(step.repo),
      };

      prompts.push(composePrompt(definition, context));
    }

    return prompts;
  }

  /**
   * Generate a review prompt for the completed plan.
   */
  generateReviewPrompt(plan: ExecutionPlan, projectContext: string): AgentPrompt {
    const context: PromptContext = {
      requirement: `Review the implementation of feature: ${plan.feature}`,
      projectContext,
      relevantSkills: [],
      previousStageOutput: JSON.stringify(plan, null, 2),
      conventions: this.workspace?.conventions.map((c) => `${c.name}: ${c.rule}`) ?? [],
      decisions: this.workspace?.decisions.map((d) => `${d.title}: ${d.decision}`) ?? [],
    };

    return composePrompt(REVIEWER, context);
  }

  // ---------------------------------------------------------------------------
  // Stage 1: Product Refinement (analytical)
  // ---------------------------------------------------------------------------

  private async productRefine(
    requirement: string,
    projectContext: string,
    skills: Skill[],
  ): Promise<ProductSpec> {
    const featureName = this.extractFeatureName(requirement);

    // Derive user stories from the requirement text
    const userStories = this.deriveUserStories(requirement);

    // Derive acceptance criteria from user stories
    const acceptanceCriteria = this.deriveAcceptanceCriteria(userStories);

    // Identify risks from skills and workspace context
    const risks = this.identifyProductRisks(requirement, skills);

    // Check for existing partial implementations
    const existingPartial = this.findExistingPartial(requirement, skills);

    // Determine rollout strategy based on risk and scope
    const rollout = this.deriveRolloutStrategy(requirement, risks);

    return {
      feature: featureName,
      problem: this.extractProblem(requirement),
      impact: this.assessImpact(requirement),
      usersAffected: this.identifyAffectedUsers(requirement),
      userStories,
      acceptanceCriteria,
      rollout,
      risks,
      existingPartial: existingPartial || undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Stage 2: Tech Refinement (analytical)
  // ---------------------------------------------------------------------------

  private async techRefine(
    productSpec: ProductSpec,
    projectContext: string,
    skills: Skill[],
  ): Promise<TechSpec> {
    // Identify affected services from the graph store
    const affectedServices = this.identifyAffectedServices(productSpec);

    // Find reuse opportunities from skills and patterns
    const reuseOpportunities = this.findReuseOpportunities(productSpec, skills);

    // Determine what new work is actually needed (not covered by existing code)
    const newWorkNeeded = this.determineNewWork(productSpec, affectedServices, reuseOpportunities);

    // Technical constraints from architecture and decisions
    const technicalConstraints = await this.identifyTechnicalConstraints(productSpec);

    // Identify tech risks
    const risks = this.identifyTechRisks(productSpec, affectedServices, skills);

    // Assess scale concerns if relevant
    const scaleConcerns = this.assessScaleConcerns(productSpec, affectedServices);

    return {
      feature: productSpec.feature,
      affectedServices,
      technicalConstraints,
      reuseOpportunities,
      newWorkNeeded,
      risks,
      scaleConcerns: scaleConcerns || undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Stage 3: Execution Planning (analytical)
  // ---------------------------------------------------------------------------

  private async plan(techSpec: TechSpec, projectContext: string): Promise<ExecutionPlan> {
    const steps: ExecutionStep[] = [];
    let stepCounter = 0;

    // Convert each work item into an execution step
    for (const workItem of techSpec.newWorkNeeded) {
      stepCounter++;
      const specialist = this.selectSpecialist(workItem.repo, workItem.description);
      const pattern = this.findPatternForWork(workItem);

      steps.push({
        id: `step-${stepCounter}`,
        repo: workItem.repo,
        specialist,
        action: workItem.description,
        files: this.categorizeFiles(workItem.files),
        pattern: pattern || undefined,
        dependsOn: this.inferDependencies(steps, workItem),
        risk: this.assessStepRisk(workItem, techSpec.risks),
      });
    }

    // Identify parallelizable groups (steps with no mutual dependencies)
    const parallelizable = this.computeParallelGroups(steps);

    // Estimate duration based on effort and parallelism
    const estimatedDuration = this.estimateDuration(techSpec.newWorkNeeded, parallelizable);

    return {
      feature: techSpec.feature,
      steps,
      parallelizable,
      estimatedDuration,
    };
  }

  // ---------------------------------------------------------------------------
  // Project Context
  // ---------------------------------------------------------------------------

  private async getProjectContext(): Promise<string> {
    const gistBuilder = new GistBuilder({
      rootPath: this.deps.rootPath,
      projectName: this.workspace?.name || 'project',
      architectureStore: this.deps.architectureStore,
      decisionStore: this.deps.decisionStore,
      graphStore: this.deps.graphStore,
    });

    return gistBuilder.build({
      maxTokens: 4000,
      includeRoutes: true,
      includeGraphql: true,
      includeInfra: false,
      includeConventions: true,
      includeDecisions: true,
    });
  }

  // ---------------------------------------------------------------------------
  // Product Refinement Helpers
  // ---------------------------------------------------------------------------

  private extractFeatureName(requirement: string): string {
    // Extract a concise feature name from the first sentence or clause
    const firstSentence = requirement.split(/[.!?\n]/)[0].trim();
    if (firstSentence.length <= 80) return firstSentence;
    return firstSentence.substring(0, 77) + '...';
  }

  private extractProblem(requirement: string): string {
    // Look for problem indicators in the requirement text
    const problemIndicators = ['problem', 'issue', 'pain point', 'currently', 'need', 'lack'];
    const sentences = requirement.split(/[.!?\n]/).map((s) => s.trim()).filter(Boolean);

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (problemIndicators.some((indicator) => lower.includes(indicator))) {
        return sentence;
      }
    }

    // Default: reframe the requirement as a problem statement
    return `Users need: ${this.extractFeatureName(requirement)}`;
  }

  private assessImpact(requirement: string): string {
    const repos = this.workspace?.repos || [];
    const services = this.deps.graphStore.getAllServices();
    const affectedCount = this.countAffectedSystems(requirement, repos, services);

    if (affectedCount >= 3) return 'High impact: affects multiple services and repositories';
    if (affectedCount === 2) return 'Medium impact: spans two system boundaries';
    return 'Low impact: contained within a single service boundary';
  }

  private identifyAffectedUsers(requirement: string): string {
    const lower = requirement.toLowerCase();
    const userTypes: string[] = [];

    if (lower.includes('admin') || lower.includes('ops') || lower.includes('panel')) {
      userTypes.push('internal operators');
    }
    if (lower.includes('user') || lower.includes('player') || lower.includes('athlete')) {
      userTypes.push('end users');
    }
    if (lower.includes('coach') || lower.includes('trainer')) {
      userTypes.push('coaches/trainers');
    }
    if (lower.includes('api') || lower.includes('integration') || lower.includes('webhook')) {
      userTypes.push('API consumers');
    }

    if (userTypes.length === 0) userTypes.push('all users');
    return userTypes.join(', ');
  }

  private deriveUserStories(requirement: string): string[] {
    const stories: string[] = [];
    const sentences = requirement.split(/[.!?\n]/).map((s) => s.trim()).filter(Boolean);

    for (const sentence of sentences) {
      // If already in user story format, keep as-is
      if (sentence.toLowerCase().startsWith('as a')) {
        stories.push(sentence);
        continue;
      }

      // Convert action-oriented sentences to user stories
      const lower = sentence.toLowerCase();
      if (lower.includes('should') || lower.includes('must') || lower.includes('can') ||
          lower.includes('need') || lower.includes('want') || lower.includes('allow')) {
        stories.push(`As a user, I want to ${this.normalizeAction(sentence)}, so that I can accomplish my goal`);
      }
    }

    // Ensure at least one story exists
    if (stories.length === 0) {
      stories.push(`As a user, I want ${this.extractFeatureName(requirement)}, so that my workflow is improved`);
    }

    return stories;
  }

  private deriveAcceptanceCriteria(userStories: string[]): string[] {
    const criteria: string[] = [];

    for (const story of userStories) {
      // Extract the action from each user story and create testable criteria
      const action = story.replace(/^as a \w+,?\s*i want (to )?/i, '').split(',')[0].trim();
      criteria.push(`GIVEN the system is in a valid state, WHEN the user ${action}, THEN the operation completes successfully`);
      criteria.push(`GIVEN invalid input, WHEN the user attempts ${action}, THEN an appropriate error message is displayed`);
    }

    return criteria;
  }

  private identifyProductRisks(requirement: string, skills: Skill[]): string[] {
    const risks: string[] = [];
    const lower = requirement.toLowerCase();

    // Check for common risk patterns
    if (lower.includes('migration') || lower.includes('migrate')) {
      risks.push('Data migration may require downtime or have backward compatibility issues');
    }
    if (lower.includes('auth') || lower.includes('permission') || lower.includes('security')) {
      risks.push('Security-sensitive change requires thorough review and testing');
    }
    if (lower.includes('performance') || lower.includes('scale') || lower.includes('load')) {
      risks.push('Performance-critical change requires load testing before deployment');
    }
    if (lower.includes('payment') || lower.includes('billing') || lower.includes('subscription')) {
      risks.push('Financial system change requires extra validation and audit trail');
    }

    // Add risks from relevant gotcha skills
    const gotchas = skills.filter((s) => s.type === 'gotcha');
    for (const gotcha of gotchas.slice(0, 3)) {
      risks.push(`Known gotcha: ${gotcha.content}`);
    }

    if (risks.length === 0) {
      risks.push('Standard feature development with no exceptional risks identified');
    }

    return risks;
  }

  private findExistingPartial(requirement: string, skills: Skill[]): string | null {
    // Check skills for existing partial implementations
    const connections = skills.filter((s) => s.type === 'connection' || s.type === 'pattern');
    for (const skill of connections) {
      const lower = skill.content.toLowerCase();
      const reqLower = requirement.toLowerCase();
      const keywords = reqLower.split(/\s+/).filter((w) => w.length > 4);
      const matchCount = keywords.filter((kw) => lower.includes(kw)).length;

      if (matchCount >= 2) {
        return `Existing related work found: ${skill.name} - ${skill.content}`;
      }
    }
    return null;
  }

  private deriveRolloutStrategy(
    requirement: string,
    risks: string[],
  ): { strategy: string; stages: string[]; metricsToWatch: string[] } {
    const isHighRisk = risks.length >= 3 || risks.some((r) =>
      r.includes('security') || r.includes('migration') || r.includes('financial')
    );

    if (isHighRisk) {
      return {
        strategy: 'phased-rollout',
        stages: [
          'Internal testing with feature flag disabled for production',
          'Canary release to 5% of users with monitoring',
          'Gradual rollout to 25%, 50%, 100% with automated rollback triggers',
          'Feature flag cleanup and documentation',
        ],
        metricsToWatch: ['error_rate', 'latency_p99', 'user_completion_rate', 'rollback_triggers'],
      };
    }

    return {
      strategy: 'standard-release',
      stages: [
        'Development and unit testing',
        'Integration testing in staging',
        'Production deployment with monitoring',
      ],
      metricsToWatch: ['error_rate', 'latency_p95', 'adoption_rate'],
    };
  }

  // ---------------------------------------------------------------------------
  // Tech Refinement Helpers
  // ---------------------------------------------------------------------------

  private identifyAffectedServices(productSpec: ProductSpec): AffectedService[] {
    const services: AffectedService[] = [];
    const allGraphServices = this.deps.graphStore.getAllServices();
    const repos = this.workspace?.repos || [];
    const featureLower = productSpec.feature.toLowerCase();
    const storiesLower = productSpec.userStories.join(' ').toLowerCase();
    const combined = `${featureLower} ${storiesLower}`;

    for (const graphService of allGraphServices) {
      const serviceNameLower = graphService.serviceName.toLowerCase();
      const descLower = (graphService.description || '').toLowerCase();

      // Check if this service is relevant to the feature
      const isRelevant = combined.includes(serviceNameLower) ||
        serviceNameLower.split('-').some((part) => combined.includes(part) && part.length > 3) ||
        (descLower && combined.split(/\s+/).filter((w) => w.length > 4).some((w) => descLower.includes(w)));

      if (isRelevant) {
        const repo = repos.find((r) => r.name === graphService.repoName);
        services.push({
          name: graphService.serviceName,
          repo: graphService.repoName,
          role: repo?.role || 'service',
          action: this.inferServiceAction(graphService.serviceName, combined),
        });
      }
    }

    // If no services matched from graph, infer from repos
    if (services.length === 0 && repos.length > 0) {
      for (const repo of repos) {
        const repoLower = repo.name.toLowerCase();
        const roleLower = (repo.role || '').toLowerCase();
        if (combined.includes(repoLower) || combined.includes(roleLower)) {
          services.push({
            name: repo.name,
            repo: repo.name,
            role: repo.role || 'service',
            action: 'modify',
          });
        }
      }
    }

    // Fallback: if still empty, mark the first repo as affected
    if (services.length === 0 && repos.length > 0) {
      services.push({
        name: repos[0].name,
        repo: repos[0].name,
        role: repos[0].role || 'service',
        action: 'modify',
      });
    }

    return services;
  }

  private findReuseOpportunities(productSpec: ProductSpec, skills: Skill[]): ReuseOpportunity[] {
    const opportunities: ReuseOpportunity[] = [];

    // Check patterns from skills
    const patterns = skills.filter((s) => s.type === 'pattern' || s.type === 'shortcut');
    for (const pattern of patterns) {
      opportunities.push({
        source: pattern.name,
        description: pattern.content,
        repo: pattern.context || 'unknown',
      });
    }

    // Check conventions from workspace
    const conventions = this.workspace?.conventions || [];
    for (const convention of conventions) {
      const convLower = convention.rule.toLowerCase();
      const featureLower = productSpec.feature.toLowerCase();
      if (featureLower.split(/\s+/).some((w) => convLower.includes(w) && w.length > 4)) {
        opportunities.push({
          source: convention.name,
          description: `Convention: ${convention.rule}`,
          repo: 'workspace',
        });
      }
    }

    return opportunities;
  }

  private determineNewWork(
    productSpec: ProductSpec,
    affectedServices: AffectedService[],
    reuseOpportunities: ReuseOpportunity[],
  ): WorkItem[] {
    const workItems: WorkItem[] = [];

    for (const service of affectedServices) {
      const action = service.action;
      const effort = this.estimateEffort(action, service.role);

      // Generate file paths based on service role and action
      const files = this.inferFilesForWork(service, action);

      workItems.push({
        repo: service.repo,
        description: `${this.capitalizeAction(action)} ${service.name}: implement changes for "${productSpec.feature}"`,
        files,
        effort,
      });
    }

    // If there are acceptance criteria involving testing, add a test work item
    if (productSpec.acceptanceCriteria.length > 0 && workItems.length > 0) {
      const primaryRepo = workItems[0].repo;
      workItems.push({
        repo: primaryRepo,
        description: `Write tests for "${productSpec.feature}" covering acceptance criteria`,
        files: [`src/test/${this.slugify(productSpec.feature)}.test.ts`],
        effort: 'small',
      });
    }

    return workItems;
  }

  private async identifyTechnicalConstraints(productSpec: ProductSpec): Promise<string[]> {
    const constraints: string[] = [];

    // Get decisions that might constrain this work
    const decisions = await this.deps.decisionStore.search(productSpec.feature);
    for (const decision of decisions) {
      constraints.push(`Decision "${decision.title}": ${decision.rationale || decision.context || ''}`);
    }

    // Get conventions from architecture store
    const archConventions = await this.deps.architectureStore.getConventions();
    for (const conv of archConventions) {
      constraints.push(`Convention "${conv.name}": follow established pattern`);
    }

    // Add workspace-level conventions
    const wsConventions = this.workspace?.conventions || [];
    for (const conv of wsConventions) {
      constraints.push(`${conv.name}: ${conv.rule}`);
    }

    if (constraints.length === 0) {
      constraints.push('No specific constraints identified; follow standard project patterns');
    }

    return constraints;
  }

  private identifyTechRisks(
    productSpec: ProductSpec,
    affectedServices: AffectedService[],
    skills: Skill[],
  ): string[] {
    const risks: string[] = [];

    // Cross-service changes are inherently risky
    if (affectedServices.length >= 3) {
      risks.push('High coordination risk: changes span 3+ services requiring synchronized deployment');
    }

    // Check for services with connections that might break
    for (const service of affectedServices) {
      const connectionsFrom = this.deps.graphStore.getConnectionsFrom(service.name);
      const connectionsTo = this.deps.graphStore.getConnectionsTo(service.name);
      const totalConnections = connectionsFrom.length + connectionsTo.length;

      if (totalConnections >= 3) {
        risks.push(`Service "${service.name}" has ${totalConnections} connections that may be affected`);
      }
    }

    // Add risks from gotcha-type skills
    const gotchas = skills.filter((s) => s.type === 'gotcha');
    for (const gotcha of gotchas.slice(0, 2)) {
      risks.push(`Known issue: ${gotcha.content}`);
    }

    if (risks.length === 0) {
      risks.push('Low technical risk: changes are contained within established service boundaries');
    }

    return risks;
  }

  private assessScaleConcerns(
    productSpec: ProductSpec,
    affectedServices: AffectedService[],
  ): string | null {
    const featureLower = productSpec.feature.toLowerCase();
    const scaleKeywords = ['bulk', 'batch', 'all users', 'notification', 'real-time', 'stream', 'webhook', 'queue'];

    const hasScaleConcern = scaleKeywords.some((kw) => featureLower.includes(kw));
    if (!hasScaleConcern) return null;

    const serviceNames = affectedServices.map((s) => s.name).join(', ');
    return `Feature involves potentially high-throughput operations across services: ${serviceNames}. Consider rate limiting, pagination, and async processing.`;
  }

  // ---------------------------------------------------------------------------
  // Planning Helpers
  // ---------------------------------------------------------------------------

  private selectSpecialist(repo: string, action: string): SpecialistType {
    const repoConfig = this.workspace?.repos.find((r) => r.name === repo);
    const role = (repoConfig?.role || '').toLowerCase();
    const actionLower = action.toLowerCase();

    // Role-based selection
    if (role.includes('frontend') || role.includes('mobile') || role.includes('client') || role.includes('ui')) {
      return 'fe-engineer';
    }
    if (role.includes('backend') || role.includes('api') || role.includes('server') || role.includes('service')) {
      return 'be-engineer';
    }
    if (role.includes('infra') || role.includes('devops') || role.includes('deploy') || role.includes('terraform')) {
      return 'devops-engineer';
    }
    if (role.includes('ml') || role.includes('ai') || role.includes('model') || role.includes('pipeline')) {
      return 'ai-engineer';
    }

    // Action-based selection
    if (actionLower.includes('test') || actionLower.includes('spec') || actionLower.includes('qa')) {
      return 'qa-engineer';
    }
    if (actionLower.includes('security') || actionLower.includes('auth') || actionLower.includes('permission')) {
      return 'security-engineer';
    }
    if (actionLower.includes('deploy') || actionLower.includes('ci') || actionLower.includes('pipeline')) {
      return 'devops-engineer';
    }

    // File-type based heuristics from the action
    if (actionLower.includes('component') || actionLower.includes('screen') || actionLower.includes('hook') ||
        actionLower.includes('.tsx') || actionLower.includes('.jsx')) {
      return 'fe-engineer';
    }
    if (actionLower.includes('controller') || actionLower.includes('service') || actionLower.includes('repository') ||
        actionLower.includes('migration') || actionLower.includes('entity')) {
      return 'be-engineer';
    }

    // Default: fullstack for ambiguous work
    return 'fullstack-engineer';
  }

  private findPatternForWork(workItem: WorkItem): string | null {
    const skills = this.deps.skillStore.search(workItem.description);
    const patterns = skills.filter((s) => s.type === 'pattern');
    if (patterns.length > 0) {
      return patterns[0].content;
    }
    return null;
  }

  private categorizeFiles(files: string[]): { create?: string[]; modify?: string[] } {
    const create: string[] = [];
    const modify: string[] = [];

    for (const file of files) {
      // Heuristic: files with "new", "create" indicators or that follow standard new-file patterns
      if (file.includes('migration') || file.includes('new-') || file.includes('create-')) {
        create.push(file);
      } else {
        // Default assumption: modifying existing files
        modify.push(file);
      }
    }

    const result: { create?: string[]; modify?: string[] } = {};
    if (create.length > 0) result.create = create;
    if (modify.length > 0) result.modify = modify;
    return result;
  }

  private inferDependencies(existingSteps: ExecutionStep[], workItem: WorkItem): string[] | undefined {
    const deps: string[] = [];

    for (const step of existingSteps) {
      // Backend steps should complete before frontend steps in the same feature
      if (step.specialist === 'be-engineer' && this.selectSpecialist(workItem.repo, workItem.description) === 'fe-engineer') {
        deps.push(step.id);
      }
      // Infrastructure must come before application code
      if (step.specialist === 'devops-engineer' && step.specialist !== this.selectSpecialist(workItem.repo, workItem.description)) {
        deps.push(step.id);
      }
      // Same-repo steps have implicit ordering (earlier steps first)
      if (step.repo === workItem.repo && step.specialist === this.selectSpecialist(workItem.repo, workItem.description)) {
        deps.push(step.id);
      }
    }

    return deps.length > 0 ? deps : undefined;
  }

  private assessStepRisk(workItem: WorkItem, techRisks: string[]): 'low' | 'medium' | 'high' {
    const descLower = workItem.description.toLowerCase();

    // High risk indicators
    if (descLower.includes('migration') || descLower.includes('security') ||
        descLower.includes('payment') || descLower.includes('breaking')) {
      return 'high';
    }

    // Medium risk if large effort or mentioned in tech risks
    if (workItem.effort === 'large') return 'medium';
    if (techRisks.some((r) => r.toLowerCase().includes(workItem.repo.toLowerCase()))) {
      return 'medium';
    }

    return 'low';
  }

  private computeParallelGroups(steps: ExecutionStep[]): string[][] {
    const groups: string[][] = [];
    const scheduled = new Set<string>();

    while (scheduled.size < steps.length) {
      const currentGroup: string[] = [];

      for (const step of steps) {
        if (scheduled.has(step.id)) continue;

        // A step can run in this group if all its dependencies are already scheduled
        const depsResolved = !step.dependsOn || step.dependsOn.every((dep) => scheduled.has(dep));
        if (depsResolved) {
          currentGroup.push(step.id);
        }
      }

      // Safety: if no progress can be made, break to avoid infinite loop
      if (currentGroup.length === 0) break;

      groups.push(currentGroup);
      for (const id of currentGroup) {
        scheduled.add(id);
      }
    }

    return groups;
  }

  private estimateDuration(workItems: WorkItem[], parallelGroups: string[][]): string {
    const effortHours: Record<string, number> = { small: 2, medium: 8, large: 24 };
    let totalHours = 0;

    for (const item of workItems) {
      totalHours += effortHours[item.effort] || 8;
    }

    // Parallelism reduces wall-clock time
    const parallelFactor = Math.max(1, parallelGroups.length > 0 ? parallelGroups[0].length : 1);
    const wallClockHours = Math.ceil(totalHours / parallelFactor);

    if (wallClockHours <= 4) return '< half day';
    if (wallClockHours <= 8) return '~1 day';
    if (wallClockHours <= 24) return '2-3 days';
    if (wallClockHours <= 40) return '~1 week';
    return `~${Math.ceil(wallClockHours / 40)} weeks`;
  }

  // ---------------------------------------------------------------------------
  // Shared Helpers
  // ---------------------------------------------------------------------------

  private getAgentDefinitionForSpecialist(specialist: SpecialistType) {
    const nameMap: Record<SpecialistType, string> = {
      'fe-engineer': 'FE_ENGINEER',
      'be-engineer': 'BE_ENGINEER',
      'devops-engineer': 'DEVOPS_ENGINEER',
      'security-engineer': 'SECURITY_ENGINEER',
      'ai-engineer': 'AI_ENGINEER',
      'fullstack-engineer': 'FULLSTACK_ENGINEER',
      'qa-engineer': 'QA_ENGINEER',
    };

    const name = nameMap[specialist];
    return AGENTS_BY_NAME[name] || AGENTS_BY_NAME['FULLSTACK_ENGINEER'];
  }

  private formatStepContext(step: ExecutionStep): string {
    const lines: string[] = [];
    lines.push(`Repository: ${step.repo}`);
    lines.push(`Action: ${step.action}`);

    if (step.files.create && step.files.create.length > 0) {
      lines.push(`Files to create: ${step.files.create.join(', ')}`);
    }
    if (step.files.modify && step.files.modify.length > 0) {
      lines.push(`Files to modify: ${step.files.modify.join(', ')}`);
    }
    if (step.pattern) {
      lines.push(`Follow pattern: ${step.pattern}`);
    }
    if (step.dependsOn && step.dependsOn.length > 0) {
      lines.push(`Depends on: ${step.dependsOn.join(', ')}`);
    }

    return lines.join('\n');
  }

  private getConventionsForRepo(repo: string): string[] {
    const conventions = this.workspace?.conventions || [];
    // Return all conventions (they apply workspace-wide)
    return conventions.map((c) => `${c.name}: ${c.rule}`);
  }

  private getDecisionsForRepo(repo: string): string[] {
    const decisions = this.workspace?.decisions || [];
    return decisions.map((d) => `${d.title}: ${d.decision}`);
  }

  private inferServiceAction(serviceName: string, context: string): string {
    const lower = context.toLowerCase();
    if (lower.includes('create') || lower.includes('add') || lower.includes('new')) return 'extend';
    if (lower.includes('fix') || lower.includes('bug') || lower.includes('patch')) return 'patch';
    if (lower.includes('refactor') || lower.includes('improve') || lower.includes('optimize')) return 'refactor';
    if (lower.includes('remove') || lower.includes('delete') || lower.includes('deprecate')) return 'deprecate';
    return 'modify';
  }

  private estimateEffort(action: string, role: string): 'small' | 'medium' | 'large' {
    const actionLower = action.toLowerCase();
    if (actionLower === 'patch' || actionLower === 'deprecate') return 'small';
    if (actionLower === 'extend' || actionLower === 'refactor') return 'medium';
    if (actionLower === 'create' || actionLower === 'redesign') return 'large';
    return 'medium';
  }

  private inferFilesForWork(service: AffectedService, action: string): string[] {
    const files: string[] = [];
    const roleLower = service.role.toLowerCase();

    if (roleLower.includes('frontend') || roleLower.includes('mobile') || roleLower.includes('client')) {
      files.push(`src/features/${this.slugify(service.name)}/index.tsx`);
      files.push(`src/features/${this.slugify(service.name)}/hooks.ts`);
    } else if (roleLower.includes('backend') || roleLower.includes('api') || roleLower.includes('server')) {
      files.push(`src/controllers/${this.slugify(service.name)}.controller.ts`);
      files.push(`src/services/${this.slugify(service.name)}.service.ts`);
    } else {
      files.push(`src/${this.slugify(service.name)}/index.ts`);
    }

    return files;
  }

  private countAffectedSystems(
    requirement: string,
    repos: WorkspaceRepo[],
    services: Array<{ serviceName: string; repoName: string }>,
  ): number {
    const lower = requirement.toLowerCase();
    let count = 0;

    for (const repo of repos) {
      if (lower.includes(repo.name.toLowerCase())) count++;
    }
    for (const service of services) {
      if (lower.includes(service.serviceName.toLowerCase())) count++;
    }

    return Math.max(1, count);
  }

  private normalizeAction(sentence: string): string {
    // Strip leading verbs/modals and normalize for user story format
    return sentence
      .replace(/^(the system |it |we |should |must |can |need to |needs to |want to )/i, '')
      .replace(/^(allow|enable|let|permit)\s+(users?\s+)?(to\s+)?/i, '')
      .toLowerCase()
      .trim();
  }

  private capitalizeAction(action: string): string {
    return action.charAt(0).toUpperCase() + action.slice(1);
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
