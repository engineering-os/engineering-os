import { Command } from 'commander';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { createAiContextGenerator } from '../utils/ai-context.js';
import { installCursorSkills } from '../utils/cursor.js';
import { readConfig, writeConfig } from '../utils/config.js';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CHECK = `${GREEN}✓${RESET}`;

async function ensureEosInitialized(rootPath: string): Promise<void> {
  try {
    await fsPromises.access(path.join(rootPath, '.eos'));
  } catch {
    console.error(`${YELLOW}Error: .eos/ not found. Run \`eos init --cursor\` first.${RESET}`);
    process.exit(1);
  }
}

async function generateCursorContext(rootPath: string): Promise<{ rules: string[]; skills: string[] }> {
  const generator = await createAiContextGenerator(rootPath);
  const rules = await generator.writeCursorRules(path.join(rootPath, '.cursor', 'rules'));
  const skills = await installCursorSkills(rootPath);

  const config = await readConfig(rootPath);
  config.adapters = { ...(config.adapters ?? {}), cursor: true };
  await writeConfig(rootPath, config);

  return { rules, skills };
}

function watchPath(targetPath: string, recursive: boolean, onChange: (name: string) => void): fs.FSWatcher | null {
  try {
    const watcher = fs.watch(targetPath, { recursive }, (_eventType, filename) => {
      onChange(filename ? String(filename) : path.basename(targetPath));
    });
    watcher.on('error', (err) => {
      console.error(`[eos cursor] watcher error for ${targetPath}: ${err.message}`);
    });
    return watcher;
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
    return null;
  }
}

export const cursorCommand = new Command('cursor')
  .description('Generate and watch Cursor Engineering OS rules and skills')
  .addCommand(
    new Command('generate')
      .description('Regenerate .cursor/rules/eos-* and .cursor/skills/eos-*')
      .action(async () => {
        const rootPath = process.cwd();
        await ensureEosInitialized(rootPath);
        const { rules, skills } = await generateCursorContext(rootPath);

        console.log(`\n${BOLD}Cursor context generated${RESET}\n`);
        console.log(`${CHECK} .cursor/rules ${DIM}(${rules.length} EOS rules)${RESET}`);
        console.log(`${CHECK} .cursor/skills ${DIM}(${skills.length} EOS skills)${RESET}`);
        console.log('');
      })
  )
  .addCommand(
    new Command('watch')
      .description('Watch EOS knowledge and regenerate Cursor rules/skills on changes')
      .action(async () => {
        const rootPath = process.cwd();
        await ensureEosInitialized(rootPath);
        await generateCursorContext(rootPath);

        const watched = [
          watchPath(path.join(rootPath, '.eos', 'knowledge'), true, scheduleRegenerate),
          watchPath(path.join(rootPath, '.eos', 'graph', 'service-map.json'), false, scheduleRegenerate),
          watchPath(path.join(rootPath, 'eos.workspace.yaml'), false, scheduleRegenerate),
        ].filter(Boolean) as fs.FSWatcher[];

        if (watched.length === 0) {
          console.error(`${YELLOW}No watchable EOS paths found.${RESET}`);
          process.exit(1);
        }

        console.log(`${CHECK} Cursor context generated`);
        console.log(`${DIM}Watching EOS knowledge, service map, and workspace config for Cursor regeneration.${RESET}`);

        let timer: ReturnType<typeof setTimeout> | null = null;
        function scheduleRegenerate(changed: string): void {
          if (timer) clearTimeout(timer);
          timer = setTimeout(async () => {
            try {
              const { rules, skills } = await generateCursorContext(rootPath);
              console.log(`[eos cursor] Regenerated after ${changed} (${rules.length} rules, ${skills.length} skills)`);
            } catch (err: any) {
              console.error(`[eos cursor] Regeneration failed: ${err.message}`);
            }
          }, 500);
        }

        const shutdown = () => {
          for (const watcher of watched) watcher.close();
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      })
  );
