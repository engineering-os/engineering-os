import * as fs from 'fs/promises';
import * as path from 'path';
import { EosConfig, TokenBudgets, BudgetEnforcementConfig } from '@engineering-os/shared';
import { safeYamlLoad } from '../security';

const DEFAULT_BUDGETS: TokenBudgets = {
  refinement: 50000,
  design: 80000,
  planning: 40000,
  implementation: 200000,
  qa: 100000,
  totalFeature: 1000000,
};

const DEFAULT_ENFORCEMENT: BudgetEnforcementConfig = {
  mode: 'soft',
  warnThreshold: 0.8,
};

export async function loadConfig(rootPath: string): Promise<EosConfig> {
  const configPath = path.join(rootPath, '.eos', 'config.yaml');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const raw = safeYamlLoad<Partial<EosConfig>>(content);

    if (!raw) {
      return buildDefault(rootPath);
    }

    const budgets: TokenBudgets = {
      ...DEFAULT_BUDGETS,
      ...(raw.budgets ?? {}),
      enforcement: {
        ...DEFAULT_ENFORCEMENT,
        ...(raw.budgets?.enforcement ?? {}),
      },
    };

    return {
      projectName: raw.projectName ?? path.basename(rootPath),
      embedding: raw.embedding ?? { provider: 'openai', model: 'text-embedding-3-small' },
      budgets,
      adapters: raw.adapters,
    };
  } catch {
    return buildDefault(rootPath);
  }
}

function buildDefault(rootPath: string): EosConfig {
  return {
    projectName: path.basename(rootPath),
    embedding: { provider: 'openai', model: 'text-embedding-3-small' },
    budgets: { ...DEFAULT_BUDGETS, enforcement: { ...DEFAULT_ENFORCEMENT } },
    adapters: {},
  };
}
