import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createAiContextGenerator } from '../utils/ai-context.js';
import { readConfig, writeConfig } from '../utils/config.js';
import {
  getCodexStatus,
  installCodexSkills,
  writeCodexMcpConfig,
} from '../utils/codex.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CHECK = `${GREEN}✓${RESET}`;

async function ensureEosInitialized(rootPath: string): Promise<void> {
  try {
    await fs.access(path.join(rootPath, '.eos'));
  } catch {
    console.error(`${YELLOW}Error: .eos/ not found. Run \`eos init --codex\` first.${RESET}`);
    process.exit(1);
  }
}

export const codexCommand = new Command('codex')
  .description('Generate and verify Codex-native Engineering OS context')
  .addCommand(
    new Command('generate')
      .description('Regenerate AGENTS.md, .agents/skills/eos-*, and Codex MCP config')
      .option('--no-mcp', 'Skip writing .codex/config.toml MCP config')
      .action(async (options) => {
        const rootPath = process.cwd();
        await ensureEosInitialized(rootPath);

        const generator = await createAiContextGenerator(rootPath);
        await generator.writeCodexAgentsMd(path.join(rootPath, 'AGENTS.md'));
        const installed = await installCodexSkills(rootPath);
        if (options.mcp) {
          await writeCodexMcpConfig(rootPath, true);
        }

        const config = await readConfig(rootPath);
        config.adapters = { ...(config.adapters ?? {}), codex: true };
        await writeConfig(rootPath, config);

        console.log(`\n${BOLD}Codex context generated${RESET}\n`);
        console.log(`${CHECK} AGENTS.md`);
        console.log(`${CHECK} .agents/skills ${DIM}(${installed.length} EOS skills)${RESET}`);
        if (options.mcp) {
          console.log(`${CHECK} .codex/config.toml ${DIM}(MCP config; project must be trusted)${RESET}`);
        }
        console.log('');
      })
  )
  .addCommand(
    new Command('doctor')
      .description('Verify Codex-native Engineering OS setup')
      .action(async () => {
        const rootPath = process.cwd();
        const status = await getCodexStatus(rootPath);

        const agentsOk = status.agentsMd === 'enabled';
        const skillsOk = status.activeSkills > 0;
        const mcpOk = status.mcpConfig === 'enabled';
        const allOk = agentsOk && skillsOk && mcpOk;

        console.log(`\n${BOLD}Codex Integration${RESET}\n`);
        console.log(`  ${DIM}•${RESET} AGENTS.md:       ${agentsOk ? `${GREEN}●${RESET} enabled` : `${RED}●${RESET} missing`}`);
        console.log(`  ${DIM}•${RESET} EOS skills:      ${skillsOk ? `${GREEN}●${RESET} ${status.activeSkills} active` : `${RED}●${RESET} missing`}`);
        if (status.disabledSkills > 0) {
          console.log(`  ${DIM}•${RESET} Disabled skills: ${status.disabledSkills}`);
        }
        console.log(`  ${DIM}•${RESET} MCP config:      ${mcpOk ? `${GREEN}●${RESET} enabled` : status.mcpConfig === 'disabled' ? `${YELLOW}●${RESET} disabled` : `${RED}●${RESET} missing`}`);
        console.log('');

        if (allOk) {
          console.log(`${CHECK} Codex is configured for Engineering OS.${RESET}`);
        } else {
          console.log(`${YELLOW}Run \`eos codex generate\` to repair missing Codex context.${RESET}`);
        }
        console.log(`${DIM}Codex must trust this project before project-local .codex/config.toml is loaded.${RESET}\n`);
      })
  );
