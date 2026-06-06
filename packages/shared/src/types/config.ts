import { Convention, Pattern } from './architecture';

/** Embedding provider configuration */
export interface EmbeddingConfig {
  provider: 'openai' | 'cohere' | 'ollama' | 'custom';
  model: string;
  apiKey?: string;
  endpoint?: string;
  enabled?: boolean;
}

/** Budget enforcement configuration */
export interface BudgetEnforcementConfig {
  mode: 'hard' | 'soft' | 'nolimit';
  warnThreshold: number;
  multiRepo?: {
    strategy: 'even' | 'fixed';
    perRepoLimit?: number;
  };
}

/** Token budget limits per workflow stage */
export interface TokenBudgets {
  refinement: number;
  design: number;
  planning: number;
  implementation: number;
  qa: number;
  totalFeature: number;
  enforcement?: BudgetEnforcementConfig;
}

/** SSO/SAML configuration for enterprise deployments */
export interface SsoConfig {
  provider: 'saml' | 'oidc' | 'azure-ad' | 'okta' | 'google';
  entityId: string;
  certificate: string;
  metadataUrl?: string;
  ssoUrl?: string;
  sloUrl?: string;
  allowedDomains?: string[];
  defaultRole?: string;
}

/** Project-level EOS configuration */
export interface EosConfig {
  projectName: string;
  embedding: EmbeddingConfig;
  budgets: TokenBudgets;
  conventions?: Convention[];
  patterns?: Pattern[];
  sso?: SsoConfig;
}
