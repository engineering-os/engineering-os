import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export interface CursorStatus {
  activeRules: number;
  disabledRules: number;
  activeSkills: number;
  disabledSkills: number;
}

function resolveCursorSkillsSource(): string {
  const candidates = [
    path.resolve(__dirname, '../../../adapter-cursor/skills'),
    path.resolve(__dirname, '../../skills-cursor'),
    path.resolve(__dirname, '../../../skills-cursor'),
    path.resolve(process.cwd(), 'packages', 'adapter-cursor', 'skills'),
  ];

  const found = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!found) {
    throw new Error(`Cursor skill source not found. Checked: ${candidates.join(', ')}`);
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

export async function installCursorSkills(projectRoot: string): Promise<string[]> {
  const source = resolveCursorSkillsSource();
  const skillsDir = path.join(projectRoot, '.cursor', 'skills');
  await fs.mkdir(skillsDir, { recursive: true });

  const sourceEntries = await fs.readdir(source, { withFileTypes: true });
  const installed: string[] = [];
  for (const entry of sourceEntries) {
    if (!entry.isDirectory()) continue;
    const targetName = `eos-${entry.name}`;
    const targetPath = path.join(skillsDir, targetName);
    await fs.rm(targetPath, { recursive: true, force: true });
    await copyDir(path.join(source, entry.name), targetPath);
    installed.push(targetName);
  }

  await fs.writeFile(path.join(skillsDir, '.eos-managed'), installed.join('\n') + '\n', 'utf-8');
  return installed;
}

export async function getCursorRuleFiles(projectRoot: string): Promise<{ active: string[]; disabled: string[] }> {
  const rulesDir = path.join(projectRoot, '.cursor', 'rules');
  try {
    const files = await fs.readdir(rulesDir);
    return {
      active: files.filter((f) => f.startsWith('eos-') && f.endsWith('.md')),
      disabled: files.filter((f) => f.startsWith('eos-') && f.endsWith('.md.disabled')),
    };
  } catch {
    return { active: [], disabled: [] };
  }
}

async function getCursorSkillDirs(projectRoot: string): Promise<{ active: string[]; disabled: string[] }> {
  const skillsDir = path.join(projectRoot, '.cursor', 'skills');
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

export async function setCursorEnabled(projectRoot: string, enabled: boolean): Promise<{ rulesChanged: number; skillsChanged: number }> {
  const rulesDir = path.join(projectRoot, '.cursor', 'rules');
  const skillsDir = path.join(projectRoot, '.cursor', 'skills');
  const rules = await getCursorRuleFiles(projectRoot);
  const skills = await getCursorSkillDirs(projectRoot);

  const ruleSources = enabled ? rules.disabled : rules.active;
  let rulesChanged = 0;
  for (const file of ruleSources) {
    const src = path.join(rulesDir, file);
    const dest = path.join(rulesDir, enabled ? file.replace(/\.disabled$/, '') : `${file}.disabled`);
    await fs.rename(src, dest);
    rulesChanged++;
  }

  const skillSources = enabled ? skills.disabled : skills.active;
  let skillsChanged = 0;
  for (const dir of skillSources) {
    const src = path.join(skillsDir, dir);
    const dest = path.join(skillsDir, enabled ? dir.replace(/\.disabled$/, '') : `${dir}.disabled`);
    await fs.rename(src, dest);
    skillsChanged++;
  }

  return { rulesChanged, skillsChanged };
}

export async function getCursorStatus(projectRoot: string): Promise<CursorStatus> {
  const rules = await getCursorRuleFiles(projectRoot);
  const skills = await getCursorSkillDirs(projectRoot);
  return {
    activeRules: rules.active.length,
    disabledRules: rules.disabled.length,
    activeSkills: skills.active.length,
    disabledSkills: skills.disabled.length,
  };
}
