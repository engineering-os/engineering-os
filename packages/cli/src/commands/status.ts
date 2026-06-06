import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { readConfig } from '../utils/config.js';

// ANSI color codes
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function countFiles(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).length;
  } catch {
    return 0;
  }
}

async function countFilesRecursive(dirPath: string): Promise<number> {
  let count = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        count++;
      } else if (entry.isDirectory()) {
        count += await countFilesRecursive(path.join(dirPath, entry.name));
      }
    }
  } catch {
    // directory doesn't exist
  }
  return count;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getFileSize(filePath: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    const kb = (stat.size / 1024).toFixed(1);
    return `${kb} KB`;
  } catch {
    return 'N/A';
  }
}

export const statusCommand = new Command('status')
  .description('Show Engineering OS status and statistics')
  .action(async () => {
    const rootPath = process.cwd();
    const eosPath = path.join(rootPath, '.eos');

    // Check if .eos/ exists
    try {
      await fs.access(eosPath);
    } catch {
      console.error(
        `\n${RED}Error: .eos/ directory not found.${RESET}\n` +
        `${DIM}Run \`eos init\` first to initialize Engineering OS in this repository.${RESET}\n`
      );
      process.exit(1);
    }

    console.log(`\n${BOLD}${CYAN}⚡ Engineering OS Status${RESET}\n`);

    // Read config
    try {
      const config = await readConfig(rootPath);
      console.log(`${BOLD}Project:${RESET} ${config.projectName}`);
      console.log(`${DIM}─────────────────────────────────────────${RESET}\n`);
    } catch {
      console.log(`${YELLOW}⚠ Could not read config${RESET}\n`);
    }

    // Index stats
    const metadataDbPath = path.join(eosPath, 'index', 'metadata.db');
    const vectorsPath = path.join(eosPath, 'index', 'vectors.lance');
    const hasMetadataDb = await fileExists(metadataDbPath);
    const hasVectors = await fileExists(vectorsPath);
    const metadataSize = hasMetadataDb ? await getFileSize(metadataDbPath) : 'not created';

    console.log(`${BOLD}Index:${RESET}`);
    console.log(`  ${DIM}•${RESET} Metadata DB:  ${hasMetadataDb ? `${GREEN}●${RESET} ${metadataSize}` : `${YELLOW}○${RESET} not created`}`);
    console.log(`  ${DIM}•${RESET} Vector store: ${hasVectors ? `${GREEN}●${RESET} exists` : `${YELLOW}○${RESET} not created`}`);

    const astFiles = await countFiles(path.join(eosPath, 'index', 'ast'));
    console.log(`  ${DIM}•${RESET} AST cache:    ${astFiles} files`);
    console.log('');

    // Knowledge stats
    const decisionCount = await countFiles(path.join(eosPath, 'knowledge', 'decisions'));
    const serviceCount = await countFiles(path.join(eosPath, 'knowledge', 'architecture', 'services'));
    const patternCount = await countFiles(path.join(eosPath, 'knowledge', 'architecture', 'patterns'));
    const conventionCount = await countFiles(path.join(eosPath, 'knowledge', 'architecture', 'conventions'));

    console.log(`${BOLD}Knowledge:${RESET}`);
    console.log(`  ${DIM}•${RESET} Decisions:    ${decisionCount}`);
    console.log(`  ${DIM}•${RESET} Services:     ${serviceCount}`);
    console.log(`  ${DIM}•${RESET} Patterns:     ${patternCount}`);
    console.log(`  ${DIM}•${RESET} Conventions:  ${conventionCount}`);
    console.log('');

    // Workflow stats
    const activeWorkflows = await countFiles(path.join(eosPath, 'workflows', 'active'));
    const completedWorkflows = await countFiles(path.join(eosPath, 'workflows', 'completed'));

    console.log(`${BOLD}Workflows:${RESET}`);
    console.log(`  ${DIM}•${RESET} Active:       ${activeWorkflows > 0 ? `${GREEN}${activeWorkflows}${RESET}` : '0'}`);
    console.log(`  ${DIM}•${RESET} Completed:    ${completedWorkflows}`);
    console.log('');

    // Features and traces
    const featureCount = await countFilesRecursive(path.join(eosPath, 'features'));
    const traceCount = await countFiles(path.join(eosPath, 'traces'));

    console.log(`${BOLD}Features & Traces:${RESET}`);
    console.log(`  ${DIM}•${RESET} Features:     ${featureCount}`);
    console.log(`  ${DIM}•${RESET} Traces:       ${traceCount}`);
    console.log('');

    // Tool integration status
    console.log(`${BOLD}Tool Integrations:${RESET}`);

    // Claude Code status
    const claudeSettingsPath = path.join(rootPath, '.claude', 'settings.json');
    let claudeStatus = 'not configured';
    let claudeIcon = `${DIM}○${RESET}`;
    try {
      const claudeContent = await fs.readFile(claudeSettingsPath, 'utf-8');
      const claudeSettings = JSON.parse(claudeContent);
      if (claudeSettings.disabledMcpjsonServers?.includes('engineering-os')) {
        claudeStatus = 'disabled';
        claudeIcon = `${RED}●${RESET}`;
      } else {
        claudeStatus = 'enabled';
        claudeIcon = `${GREEN}●${RESET}`;
      }
    } catch {
      // Check if there's a global MCP config referencing EOS
      try {
        const globalSettings = await fs.readFile(path.join(process.env.HOME || '', '.claude', 'settings.json'), 'utf-8');
        if (globalSettings.includes('engineering-os')) {
          claudeStatus = 'enabled (global)';
          claudeIcon = `${GREEN}●${RESET}`;
        }
      } catch {
        // not configured
      }
    }
    console.log(`  ${DIM}•${RESET} Claude Code:  ${claudeIcon} ${claudeStatus}`);

    // Cursor status
    const cursorRulesDir = path.join(rootPath, '.cursor', 'rules');
    let cursorStatus = 'not configured';
    let cursorIcon = `${DIM}○${RESET}`;
    try {
      const cursorFiles = await fs.readdir(cursorRulesDir);
      const activeRules = cursorFiles.filter(f => f.startsWith('eos-') && f.endsWith('.md'));
      const disabledRules = cursorFiles.filter(f => f.startsWith('eos-') && f.endsWith('.md.disabled'));

      if (activeRules.length > 0) {
        cursorStatus = `enabled (${activeRules.length} rules)`;
        cursorIcon = `${GREEN}●${RESET}`;
      } else if (disabledRules.length > 0) {
        cursorStatus = `disabled (${disabledRules.length} rules suspended)`;
        cursorIcon = `${RED}●${RESET}`;
      }
    } catch {
      // not configured
    }
    console.log(`  ${DIM}•${RESET} Cursor:       ${cursorIcon} ${cursorStatus}`);
    console.log('');

    // Overall health
    const isHealthy = hasMetadataDb && decisionCount >= 0;
    const healthIcon = isHealthy ? `${GREEN}●${RESET}` : `${YELLOW}●${RESET}`;
    const healthText = isHealthy ? 'Healthy' : 'Needs attention';
    console.log(`${BOLD}Health:${RESET} ${healthIcon} ${healthText}`);

    // Hint for enable/disable
    if (claudeStatus === 'disabled' || cursorStatus.includes('disabled')) {
      console.log(`\n${DIM}Some tools are disabled. Run \`eos enable\` to restore.${RESET}`);
    }
    console.log('');
  });
