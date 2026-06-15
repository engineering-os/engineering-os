import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export interface CodexStatus {
  agentsMd: 'enabled' | 'missing';
  activeSkills: number;
  disabledSkills: number;
  mcpConfig: 'enabled' | 'disabled' | 'missing';
}

const CODEX_MCP_MARKER_START = '# EOS:START - Engineering OS Codex MCP';
const CODEX_MCP_MARKER_END = '# EOS:END';

function resolveCodexSkillsSource(): string {
  const candidates = [
    path.resolve(__dirname, '../../../adapter-codex/skills'),
    path.resolve(__dirname, '../../skills-codex'),
    path.resolve(__dirname, '../../../skills-codex'),
    path.resolve(process.cwd(), 'packages', 'adapter-codex', 'skills'),
  ];

  const found = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!found) {
    throw new Error(`Codex skill source not found. Checked: ${candidates.join(', ')}`);
  }
  return found;
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function getCodexSkillDirs(projectRoot: string): Promise<{ active: string[]; disabled: string[] }> {
  const skillsDir = path.join(projectRoot, '.agents', 'skills');
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    return {
      active: entries.filter((e) => e.isDirectory() && e.name.startsWith('eos-') && !e.name.endsWith('.disabled')).map((e) => e.name),
      disabled: entries.filter((e) => e.isDirectory() && e.name.startsWith('eos-') && e.name.endsWith('.disabled')).map((e) => e.name),
    };
  } catch {
    return { active: [], disabled: [] };
  }
}

export async function installCodexSkills(projectRoot: string, options: { disabled?: boolean } = {}): Promise<string[]> {
  const source = resolveCodexSkillsSource();
  const skillsDir = path.join(projectRoot, '.agents', 'skills');
  await fs.mkdir(skillsDir, { recursive: true });

  const sourceEntries = await fs.readdir(source, { withFileTypes: true });
  const installed: string[] = [];
  for (const entry of sourceEntries) {
    if (!entry.isDirectory()) continue;
    const activeName = `eos-${entry.name}`;
    const targetName = options.disabled ? `${activeName}.disabled` : activeName;
    const targetPath = path.join(skillsDir, targetName);
    const oppositePath = path.join(skillsDir, options.disabled ? activeName : `${activeName}.disabled`);
    await fs.rm(oppositePath, { recursive: true, force: true });
    await fs.rm(targetPath, { recursive: true, force: true });
    await copyDir(path.join(source, entry.name), targetPath);
    installed.push(targetName);
  }

  await fs.writeFile(path.join(skillsDir, '.eos-managed'), installed.join('\n') + '\n', 'utf-8');
  return installed;
}

function codexMcpBlock(enabled: boolean): string {
  return [
    CODEX_MCP_MARKER_START,
    '[mcp_servers.engineering-os]',
    'command = "eos"',
    'args = ["serve"]',
    `enabled = ${enabled ? 'true' : 'false'}`,
    CODEX_MCP_MARKER_END,
  ].join('\n');
}

export async function writeCodexMcpConfig(projectRoot: string, enabled = true): Promise<void> {
  const configPath = path.join(projectRoot, '.codex', 'config.toml');
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  const block = codexMcpBlock(enabled);
  let existing = '';
  try {
    existing = await fs.readFile(configPath, 'utf-8');
  } catch {
    await fs.writeFile(configPath, block + '\n', 'utf-8');
    return;
  }

  const startIdx = existing.indexOf(CODEX_MCP_MARKER_START);
  const endIdx = existing.indexOf(CODEX_MCP_MARKER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + CODEX_MCP_MARKER_END.length);
    await fs.writeFile(configPath, before + block + after, 'utf-8');
    return;
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  await fs.writeFile(configPath, existing + separator + block + '\n', 'utf-8');
}

export async function setCodexEnabled(projectRoot: string, enabled: boolean): Promise<{ skillsChanged: number; mcpChanged: boolean }> {
  const skillsDir = path.join(projectRoot, '.agents', 'skills');
  const { active, disabled } = await getCodexSkillDirs(projectRoot);
  const sourceNames = enabled ? disabled : active.filter((name) => !name.endsWith('.disabled'));
  let skillsChanged = 0;

  for (const name of sourceNames) {
    const src = path.join(skillsDir, name);
    const destName = enabled ? name.replace(/\.disabled$/, '') : `${name}.disabled`;
    const dest = path.join(skillsDir, destName);
    await fs.rename(src, dest);
    skillsChanged++;
  }

  const hasConfig = await hasCodexMcpConfig(projectRoot);
  if (hasConfig) {
    await writeCodexMcpConfig(projectRoot, enabled);
  }

  return { skillsChanged, mcpChanged: hasConfig };
}

export async function hasCodexMcpConfig(projectRoot: string): Promise<boolean> {
  try {
    const content = await fs.readFile(path.join(projectRoot, '.codex', 'config.toml'), 'utf-8');
    return content.includes(CODEX_MCP_MARKER_START) || content.includes('[mcp_servers.engineering-os]');
  } catch {
    return false;
  }
}

export async function getCodexStatus(projectRoot: string): Promise<CodexStatus> {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  let agentsMd: CodexStatus['agentsMd'] = 'missing';
  try {
    const content = await fs.readFile(agentsPath, 'utf-8');
    if (content.includes('Engineering OS') || content.includes('eos_context')) {
      agentsMd = 'enabled';
    }
  } catch {
    // missing
  }

  const { active, disabled } = await getCodexSkillDirs(projectRoot);
  let mcpConfig: CodexStatus['mcpConfig'] = 'missing';
  try {
    const content = await fs.readFile(path.join(projectRoot, '.codex', 'config.toml'), 'utf-8');
    if (content.includes('[mcp_servers.engineering-os]')) {
      mcpConfig = content.includes('enabled = false') ? 'disabled' : 'enabled';
    }
  } catch {
    // missing
  }

  return {
    agentsMd,
    activeSkills: active.filter((name) => !name.endsWith('.disabled')).length,
    disabledSkills: disabled.length,
    mcpConfig,
  };
}

export function isCodexDisabled(status: CodexStatus): boolean {
  return status.mcpConfig === 'disabled'
    || (status.activeSkills === 0 && status.disabledSkills > 0);
}
