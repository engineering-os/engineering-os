/**
 * Multi-agent pipeline types for Engineering OS.
 *
 * Defines the structured contracts between pipeline stages:
 *   Requirement -> ProductRefiner -> TechRefiner -> Planner -> Specialists -> Review
 */

// ---------------------------------------------------------------------------
// Build pipeline options
// ---------------------------------------------------------------------------

export interface BuildOptions {
  mode: 'plan-only' | 'implement' | 'full';
  repos?: string[];
  interactive?: boolean;
  skipTests?: boolean;
  skipReview?: boolean;
  skipDeploy?: boolean;
}

// ---------------------------------------------------------------------------
// Product Refiner output
// ---------------------------------------------------------------------------

export interface ProductSpec {
  feature: string;
  problem: string;
  impact: string;
  usersAffected: string;
  userStories: string[];
  acceptanceCriteria: string[];
  rollout: { strategy: string; stages: string[]; metricsToWatch: string[] };
  risks: string[];
  existingPartial?: string;
}

// ---------------------------------------------------------------------------
// Tech Refiner output
// ---------------------------------------------------------------------------

export interface TechSpec {
  feature: string;
  affectedServices: AffectedService[];
  technicalConstraints: string[];
  reuseOpportunities: ReuseOpportunity[];
  newWorkNeeded: WorkItem[];
  risks: string[];
  scaleConcerns?: string;
}

export interface AffectedService {
  name: string;
  repo: string;
  role: string;
  action: string;
}

export interface ReuseOpportunity {
  source: string;
  description: string;
  repo: string;
}

export interface WorkItem {
  repo: string;
  description: string;
  files: string[];
  effort: 'small' | 'medium' | 'large';
}

// ---------------------------------------------------------------------------
// Planner output
// ---------------------------------------------------------------------------

export interface ExecutionPlan {
  feature: string;
  steps: ExecutionStep[];
  parallelizable: string[][];
  estimatedDuration: string;
}

export interface ExecutionStep {
  id: string;
  repo: string;
  specialist: SpecialistType;
  action: string;
  files: { create?: string[]; modify?: string[] };
  pattern?: string;
  dependsOn?: string[];
  risk: 'low' | 'medium' | 'high';
}

export type SpecialistType =
  | 'fe-engineer'
  | 'be-engineer'
  | 'devops-engineer'
  | 'security-engineer'
  | 'ai-engineer'
  | 'fullstack-engineer'
  | 'qa-engineer';

// ---------------------------------------------------------------------------
// Agent definition interface
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  name: string;
  role: string;
  expertise: string[];
  systemPrompt: string;
  constraints: string[];
}

// ---------------------------------------------------------------------------
// Agent prompt (what the orchestrator produces for execution)
// ---------------------------------------------------------------------------

export interface AgentPrompt {
  agentName: string;
  systemPrompt: string;
  userPrompt: string;
  expectedOutputDescription: string;
}

// ---------------------------------------------------------------------------
// Final build result
// ---------------------------------------------------------------------------

export interface BuildResult {
  productSpec: ProductSpec;
  techSpec: TechSpec;
  plan: ExecutionPlan;
  status: 'planned' | 'implemented' | 'tested' | 'reviewed' | 'deployed';
}
