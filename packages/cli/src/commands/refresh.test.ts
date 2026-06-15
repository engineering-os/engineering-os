import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { regenerateAiContexts } from './refresh';
import { writeCodexMcpConfig } from '../utils/codex';

describe('regenerateAiContexts', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-refresh-'));
    await fs.mkdir(path.join(tmpDir, '.eos', 'graph'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.eos', 'knowledge', 'architecture'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.eos', 'knowledge', 'decisions'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.eos', 'config.yaml'),
      [
        'projectName: refresh-test',
        'embedding:',
        '  provider: openai',
        '  model: text-embedding-3-small',
        'budgets:',
        '  refinement: 50000',
        '  design: 80000',
        '  planning: 40000',
        '  implementation: 200000',
        '  qa: 100000',
        '  totalFeature: 1000000',
        'adapters:',
        '  cursor: true',
        '  codex: true',
        '',
      ].join('\n'),
      'utf-8'
    );

    await fs.mkdir(path.join(tmpDir, '.cursor', 'rules'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.cursor', 'rules', 'eos-system.md.disabled'),
      '# Engineering OS — Use EOS MCP tools for all tasks\n\n- `eos_context`\n',
      'utf-8'
    );
    await fs.mkdir(path.join(tmpDir, '.cursor', 'skills', 'eos-context.disabled'), { recursive: true });

    await writeCodexMcpConfig(tmpDir, false);
    await fs.mkdir(path.join(tmpDir, '.agents', 'skills', 'eos-context.disabled'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('preserves disabled Cursor and Codex state while refreshing generated artifacts', async () => {
    await regenerateAiContexts(tmpDir);

    await expect(fs.access(path.join(tmpDir, '.cursor', 'rules', 'eos-system.md'))).rejects.toThrow();
    await expect(fs.access(path.join(tmpDir, '.cursor', 'skills', 'eos-context'))).rejects.toThrow();
    await fs.access(path.join(tmpDir, '.cursor', 'rules', 'eos-system.md.disabled'));
    await fs.access(path.join(tmpDir, '.cursor', 'skills', 'eos-context.disabled'));

    await fs.access(path.join(tmpDir, 'AGENTS.md'));
    await expect(fs.access(path.join(tmpDir, '.agents', 'skills', 'eos-context'))).rejects.toThrow();
    await fs.access(path.join(tmpDir, '.agents', 'skills', 'eos-context.disabled'));
    const codexConfig = await fs.readFile(path.join(tmpDir, '.codex', 'config.toml'), 'utf-8');
    expect(codexConfig).toContain('enabled = false');
  });
});
