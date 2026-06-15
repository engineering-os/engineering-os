import type { EosConfig } from '@engineering-os/shared';

const VALID_PROVIDERS = ['openai', 'cohere', 'ollama', 'custom'] as const;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Configuration must be an object'], warnings: [] };
  }

  const cfg = config as Record<string, unknown>;

  // projectName
  if (!cfg.projectName || typeof cfg.projectName !== 'string') {
    errors.push('projectName is required and must be a non-empty string');
  }

  // embedding
  if (cfg.embedding) {
    if (typeof cfg.embedding !== 'object') {
      errors.push('embedding must be an object');
    } else {
      const emb = cfg.embedding as Record<string, unknown>;

      if (!emb.provider || !VALID_PROVIDERS.includes(emb.provider as any)) {
        errors.push(`embedding.provider must be one of: ${VALID_PROVIDERS.join(', ')}`);
      }

      if (!emb.model || typeof emb.model !== 'string') {
        errors.push('embedding.model is required and must be a non-empty string');
      }

      if (emb.enabled && emb.provider !== 'ollama' && !emb.apiKey) {
        warnings.push(
          `embedding.apiKey is not set for provider "${emb.provider}". ` +
          `Set it in .eos/config.yaml or use the EOS_EMBEDDING_API_KEY environment variable.`
        );
      }
    }
  } else {
    errors.push('embedding configuration is required');
  }

  // budgets
  if (cfg.budgets) {
    if (typeof cfg.budgets !== 'object') {
      errors.push('budgets must be an object');
    } else {
      const budgets = cfg.budgets as Record<string, unknown>;
      const requiredBudgets = ['refinement', 'design', 'planning', 'implementation', 'qa', 'totalFeature'];

      for (const key of requiredBudgets) {
        if (budgets[key] !== undefined) {
          if (typeof budgets[key] !== 'number' || (budgets[key] as number) <= 0) {
            errors.push(`budgets.${key} must be a positive number`);
          }
        }
      }

      // Validate enforcement config
      if (budgets.enforcement) {
        const enf = budgets.enforcement as Record<string, unknown>;
        const validModes = ['hard', 'soft', 'nolimit'];
        if (enf.mode && !validModes.includes(enf.mode as string)) {
          errors.push(`budgets.enforcement.mode must be one of: ${validModes.join(', ')}`);
        }
        if (enf.warnThreshold !== undefined) {
          const threshold = enf.warnThreshold as number;
          if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
            errors.push('budgets.enforcement.warnThreshold must be a number between 0 and 1');
          }
        }
        if (enf.multiRepo) {
          const mr = enf.multiRepo as Record<string, unknown>;
          const validStrategies = ['even', 'fixed'];
          if (mr.strategy && !validStrategies.includes(mr.strategy as string)) {
            errors.push(`budgets.enforcement.multiRepo.strategy must be one of: ${validStrategies.join(', ')}`);
          }
          if (mr.perRepoLimit !== undefined && (typeof mr.perRepoLimit !== 'number' || (mr.perRepoLimit as number) <= 0)) {
            errors.push('budgets.enforcement.multiRepo.perRepoLimit must be a positive number');
          }
        }
      }
    }
  }

  // adapters
  if (cfg.adapters !== undefined) {
    if (typeof cfg.adapters !== 'object' || cfg.adapters === null) {
      errors.push('adapters must be an object');
    } else {
      const adapters = cfg.adapters as Record<string, unknown>;
      for (const key of ['claude', 'cursor', 'codex', 'copilot', 'windsurf']) {
        if (adapters[key] !== undefined && typeof adapters[key] !== 'boolean') {
          errors.push(`adapters.${key} must be a boolean`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
