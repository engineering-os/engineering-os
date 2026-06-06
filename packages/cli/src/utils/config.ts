import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { EosConfig, EmbeddingConfig, TokenBudgets } from '@engineering-os/shared';
import { validateConfig } from './config-validator.js';

const CONFIG_FILENAME = 'config.yaml';

export function getDefaultConfig(projectName: string): EosConfig {
  const embedding: EmbeddingConfig = {
    provider: 'openai',
    model: 'text-embedding-3-small',
  };

  const budgets: TokenBudgets = {
    refinement: 50000,
    design: 80000,
    planning: 40000,
    implementation: 200000,
    qa: 100000,
    totalFeature: 1000000,
  };

  return {
    projectName,
    embedding,
    budgets,
  } as EosConfig;
}

export async function readConfig(rootPath: string): Promise<EosConfig> {
  const configPath = path.join(rootPath, '.eos', CONFIG_FILENAME);

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as EosConfig;

    const validation = validateConfig(config);
    if (!validation.valid) {
      throw new Error(
        `Invalid EOS config at ${configPath}:\n  ${validation.errors.join('\n  ')}`
      );
    }

    return config;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid EOS config')) {
      throw error;
    }
    throw new Error(
      `Failed to read EOS config at ${configPath}. Have you run \`eos init\`?`
    );
  }
}

export async function writeConfig(rootPath: string, config: EosConfig): Promise<void> {
  const configPath = path.join(rootPath, '.eos', CONFIG_FILENAME);
  const content = yaml.dump(config, {
    schema: yaml.JSON_SCHEMA,
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });
  await fs.writeFile(configPath, content, 'utf-8');
}
