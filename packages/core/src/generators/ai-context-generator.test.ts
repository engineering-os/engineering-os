import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AiContextGenerator } from './ai-context-generator';
import { ArchitectureStore } from '../architecture/architecture-store';
import { DecisionStore } from '../decisions/decision-store';

describe('AiContextGenerator Codex output', () => {
  let tmpDir: string;
  let generator: AiContextGenerator;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-ai-context-'));
    const eosDir = path.join(tmpDir, '.eos');
    const architectureStore = new ArchitectureStore(path.join(eosDir, 'knowledge', 'architecture'));
    const decisionStore = new DecisionStore(path.join(eosDir, 'knowledge', 'decisions'));
    const graphStore = {
      getStats: () => ({ services: 0, connections: 0 }),
      getAllConnections: () => [],
      getAllServices: () => [],
    };

    await architectureStore.saveConvention({
      name: 'testing',
      description: 'Test placement',
      rule: 'Co-locate tests with source and use vitest',
      examples: [],
    });
    await architectureStore.savePattern({
      name: 'service layer',
      description: 'Business logic lives in services',
      usage: 'backend',
      files: ['src/user.service.ts'],
    });
    await architectureStore.saveService({
      name: 'api',
      description: 'Main API service',
      owners: ['backend'],
      publicApis: ['GET /users'],
      dependencies: ['shared'],
      patterns: ['service layer'],
      criticality: 'high',
    });
    await decisionStore.save({
      id: 'DEC-001',
      title: 'SQLite storage',
      status: 'accepted',
      context: 'Need embedded persistence',
      options: [],
      decision: 'Use better-sqlite3 for persistence',
      rationale: 'Zero config and fast',
      consequences: [],
      date: '2024-01-01',
      tags: ['storage'],
    });

    generator = new AiContextGenerator({
      architectureStore,
      decisionStore,
      graphStore: graphStore as any,
      rootPath: tmpDir,
      projectName: 'test-project',
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('generates compact Codex AGENTS.md guidance', async () => {
    const content = await generator.generateCodexAgentsMd();

    expect(content).toContain('test-project');
    expect(content).toContain('eos_context');
    expect(content).toContain('eos_impact');
    expect(content).toContain('Codex review guidelines');
    expect(content).toContain('Co-locate tests with source and use vitest');
    expect(content).toContain('Use better-sqlite3 for persistence');
    expect(content).toContain('.agents/skills/eos-*');
    expect(content).not.toContain('.cursor/rules');
  });

  it('preserves user content outside EOS markers', async () => {
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    await fs.writeFile(agentsPath, '# Local Notes\n\nKeep this section.\n', 'utf-8');

    await generator.writeCodexAgentsMd(agentsPath);
    await generator.writeCodexAgentsMd(agentsPath);

    const content = await fs.readFile(agentsPath, 'utf-8');
    expect(content).toContain('# Local Notes');
    expect(content).toContain('Keep this section.');
    expect(content.match(/EOS:START/g)).toHaveLength(1);
    expect(content).toContain('Codex review guidelines');
  });

  it('generates six rich Cursor rule files', async () => {
    const rules = await generator.generateCursorRules();

    expect([...rules.keys()]).toEqual([
      'eos-system.md',
      'eos-conventions.md',
      'eos-patterns.md',
      'eos-architecture.md',
      'eos-decisions.md',
      'eos-service-map.md',
    ]);
    expect(rules.get('eos-system.md')).toContain('| Plan a feature implementation | `eos_plan` | Creating a plan from scratch |');
    expect(rules.get('eos-system.md')).toContain('8. **ALWAYS call `eos_recall_skills`**');
    expect(rules.get('eos-conventions.md')).toContain('Rule: Co-locate tests with source and use vitest');
    expect(rules.get('eos-patterns.md')).toContain('## service layer');
    expect(rules.get('eos-architecture.md')).toContain('### api');
    expect(rules.get('eos-decisions.md')).toContain('Use better-sqlite3 for persistence');
  });

  it('preserves user content outside Cursor rule markers', async () => {
    const rulesDir = path.join(tmpDir, '.cursor', 'rules');
    await fs.mkdir(rulesDir, { recursive: true });
    const systemPath = path.join(rulesDir, 'eos-system.md');
    await fs.writeFile(systemPath, '# Local Cursor Notes\n\nKeep this rule.\n', 'utf-8');

    await generator.writeCursorRules(rulesDir);
    await generator.writeCursorRules(rulesDir);

    const content = await fs.readFile(systemPath, 'utf-8');
    expect(content).toContain('# Local Cursor Notes');
    expect(content).toContain('Keep this rule.');
    expect(content.match(/EOS:START/g)).toHaveLength(1);
    expect(content).toContain('MANDATORY: Use EOS tools');
  });
});
