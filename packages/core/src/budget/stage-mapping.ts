import { TokenBudgets } from '@engineering-os/shared';

type BudgetStage = 'refinement' | 'design' | 'planning' | 'implementation' | 'qa';

export const TOOL_STAGE_MAP: Record<string, BudgetStage> = {
  eos_refine: 'refinement',
  eos_explain: 'design',
  eos_architecture: 'design',
  eos_patterns: 'design',
  eos_conventions: 'design',
  eos_plan: 'planning',
  eos_context: 'implementation',
  eos_search: 'implementation',
  eos_search_all: 'implementation',
  eos_dependencies: 'implementation',
  eos_validate: 'qa',
  eos_review: 'qa',
  eos_security_scan: 'qa',
  eos_security_audit: 'qa',
  eos_threat_model: 'qa',
  eos_dependency_check: 'qa',
};

export function getStageForTool(toolName: string): BudgetStage | null {
  return TOOL_STAGE_MAP[toolName] ?? null;
}

export function getStageBudget(budgets: TokenBudgets, stage: BudgetStage): number {
  return budgets[stage];
}
