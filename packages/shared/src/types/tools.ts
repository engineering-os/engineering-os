import { DecisionOption } from './decisions';

/** Input for eos_search tool */
export interface EosSearchInput {
  query: string;
  scope?: 'code' | 'docs' | 'decisions' | 'all';
  limit?: number;
}

/** Input for eos_context tool */
export interface EosContextInput {
  task: string;
  maxTokens?: number;
}

/** Input for eos_decide tool */
export interface EosDecideInput {
  title: string;
  context: string;
  options: DecisionOption[];
  decision: string;
  rationale: string;
  consequences?: string[];
  tags?: string[];
}

/** Input for eos_architecture tool */
export interface EosArchitectureInput {
  service?: string;
}

/** Input for eos_patterns tool */
export interface EosPatternsInput {
  area?: string;
}

/** Input for eos_refine tool */
export interface EosRefineInput {
  requirement: string;
}

/** Input for eos_plan tool */
export interface EosPlanInput {
  featureSlug: string;
  requirement?: string;
}

/** Input for eos_validate tool */
export interface EosValidateInput {
  featureSlug: string;
  branch?: string;
}

/** Input for eos_index tool */
export interface EosIndexInput {
  paths?: string[];
  force?: boolean;
}

/** Input for eos_status tool */
export interface EosStatusInput {}

/** Input for eos_health tool */
export interface EosHealthInput {}

/** Standard tool result */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
