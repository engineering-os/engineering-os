import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { setCodexEnabled } from '../utils/codex.js';
import { setCursorEnabled } from '../utils/cursor.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CHECK = `${GREEN}✓${RESET}`;

interface ClaudeSettings {
  mcpServers?: Record<string, unknown>;
  disabledMcpjsonServers?: string[];
  [key: string]: unknown;
}

/**
 * Find the .claude/settings.json for the current project.
 * Claude Code stores project settings at .claude/settings.json in the project root.
 */
function getClaudeSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'settings.json');
}

/**
 * Read Claude Code project settings. Returns empty object if not found.
 */
async function readClaudeSettings(settingsPath: string): Promise<ClaudeSettings> {
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write Claude Code project settings.
 */
async function writeClaudeSettings(settingsPath: string, settings: ClaudeSettings): Promise<void> {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

/**
 * Check if EOS is disabled in Claude Code settings.
 */
function isDisabledInClaude(settings: ClaudeSettings): boolean {
  return settings.disabledMcpjsonServers?.includes('engineering-os') ?? false;
}

// ─────────────────────────────────────────────────
// DISABLE COMMAND
// ─────────────────────────────────────────────────

export const disableCommand = new Command('disable')
  .description('Disable Engineering OS for connected AI tools (non-destructive, re-enable anytime)')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('--claude-only', 'Only disable for Claude Code')
  .option('--cursor-only', 'Only disable for Cursor')
  .option('--codex-only', 'Only disable for Codex')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);
    const disableClaude = !options.cursorOnly && !options.codexOnly;
    const disableCursor = !options.claudeOnly && !options.codexOnly;
    const disableCodex = !options.claudeOnly && !options.cursorOnly;

    console.log(`\n${BOLD}Disabling Engineering OS${RESET}\n`);

    // Disable for Claude Code
    if (disableClaude) {
      const settingsPath = getClaudeSettingsPath(projectRoot);
      const settings = await readClaudeSettings(settingsPath);

      if (!settings.disabledMcpjsonServers) {
        settings.disabledMcpjsonServers = [];
      }

      if (!settings.disabledMcpjsonServers.includes('engineering-os')) {
        settings.disabledMcpjsonServers.push('engineering-os');
        await writeClaudeSettings(settingsPath, settings);
        console.log(`${CHECK} Claude Code: disabled ${DIM}(added to disabledMcpjsonServers)${RESET}`);
      } else {
        console.log(`${DIM}  Claude Code: already disabled${RESET}`);
      }
    }

    // Disable for Cursor
    if (disableCursor) {
      const result = await setCursorEnabled(projectRoot, false);
      if (result.rulesChanged > 0 || result.skillsChanged > 0) {
        console.log(`${CHECK} Cursor: disabled ${DIM}(${result.rulesChanged} rules, ${result.skillsChanged} skill dirs suspended)${RESET}`);
      } else {
        console.log(`${DIM}  Cursor: no active EOS rules or skills found${RESET}`);
      }
    }

    // Disable for Codex
    if (disableCodex) {
      const result = await setCodexEnabled(projectRoot, false);
      if (result.skillsChanged > 0 || result.mcpChanged) {
        console.log(`${CHECK} Codex: disabled ${DIM}(${result.skillsChanged} skill dirs suspended${result.mcpChanged ? ', MCP config disabled' : ''})${RESET}`);
      } else {
        console.log(`${DIM}  Codex: no active EOS skills or MCP config found${RESET}`);
      }
    }

    console.log(`\n${DIM}Re-enable anytime with: ${RESET}${BOLD}eos enable${RESET}\n`);
  });

// ─────────────────────────────────────────────────
// ENABLE COMMAND
// ─────────────────────────────────────────────────

export const enableCommand = new Command('enable')
  .description('Re-enable Engineering OS for connected AI tools')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('--claude-only', 'Only enable for Claude Code')
  .option('--cursor-only', 'Only enable for Cursor')
  .option('--codex-only', 'Only enable for Codex')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);
    const enableClaude = !options.cursorOnly && !options.codexOnly;
    const enableCursor = !options.claudeOnly && !options.codexOnly;
    const enableCodex = !options.claudeOnly && !options.cursorOnly;

    console.log(`\n${BOLD}Enabling Engineering OS${RESET}\n`);

    // Enable for Claude Code
    if (enableClaude) {
      const settingsPath = getClaudeSettingsPath(projectRoot);
      const settings = await readClaudeSettings(settingsPath);

      if (settings.disabledMcpjsonServers?.includes('engineering-os')) {
        settings.disabledMcpjsonServers = settings.disabledMcpjsonServers.filter(
          (s) => s !== 'engineering-os'
        );
        if (settings.disabledMcpjsonServers.length === 0) {
          delete settings.disabledMcpjsonServers;
        }
        await writeClaudeSettings(settingsPath, settings);
        console.log(`${CHECK} Claude Code: enabled ${DIM}(removed from disabledMcpjsonServers)${RESET}`);
      } else {
        console.log(`${CHECK} Claude Code: already enabled`);
      }
    }

    // Enable for Cursor
    if (enableCursor) {
      const result = await setCursorEnabled(projectRoot, true);
      if (result.rulesChanged > 0 || result.skillsChanged > 0) {
        console.log(`${CHECK} Cursor: enabled ${DIM}(${result.rulesChanged} rules, ${result.skillsChanged} skill dirs restored)${RESET}`);
      } else {
        console.log(`${DIM}  Cursor: no disabled EOS rules or skills to restore${RESET}`);
      }
    }

    // Enable for Codex
    if (enableCodex) {
      const result = await setCodexEnabled(projectRoot, true);
      if (result.skillsChanged > 0 || result.mcpChanged) {
        console.log(`${CHECK} Codex: enabled ${DIM}(${result.skillsChanged} skill dirs restored${result.mcpChanged ? ', MCP config enabled' : ''})${RESET}`);
      } else {
        console.log(`${DIM}  Codex: no disabled EOS skills or MCP config found${RESET}`);
      }
    }

    console.log(`\n${DIM}EOS is now active. Your AI tools will receive engineering context.${RESET}\n`);
  });
