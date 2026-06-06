import { Command } from 'commander';
import * as path from 'path';
import { WorkspaceLoader } from '@engineering-os/core';

// ANSI color codes
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CHECK = `${GREEN}✓${RESET}`;

function detectProjectName(rootPath: string): string {
  try {
    const pkg = require(path.join(rootPath, 'package.json'));
    if (pkg.name) return pkg.name;
  } catch {
    // fall through
  }
  return path.basename(rootPath);
}

function detectProjectType(rootPath: string): string | undefined {
  const fs = require('fs');
  if (fs.existsSync(path.join(rootPath, 'pom.xml'))) return 'java';
  if (fs.existsSync(path.join(rootPath, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) return 'rust';
  if (fs.existsSync(path.join(rootPath, 'requirements.txt')) || fs.existsSync(path.join(rootPath, 'pyproject.toml'))) return 'python';
  if (fs.existsSync(path.join(rootPath, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(rootPath, 'package.json'), 'utf-8'));
      if (pkg.workspaces) return 'monorepo';
      if (pkg.dependencies?.['react-native'] || pkg.dependencies?.['expo']) return 'react-native';
      if (pkg.dependencies?.react) return 'react';
      if (pkg.dependencies?.next) return 'nextjs';
    } catch {
      // fall through
    }
    return 'node';
  }
  return undefined;
}

export const workspaceCommand = new Command('workspace')
  .description('Manage workspace configuration (eos.workspace.yaml)');

workspaceCommand
  .command('init')
  .description('Create eos.workspace.yaml with auto-detected project name and type')
  .option('-n, --name <name>', 'Project name (auto-detected if omitted)')
  .option('-t, --type <type>', 'Project type (auto-detected if omitted)')
  .action((options) => {
    const rootPath = process.cwd();
    const loader = new WorkspaceLoader(rootPath);

    if (loader.exists()) {
      console.log(`\n${DIM}eos.workspace.yaml already exists. Use other workspace commands to modify it.${RESET}\n`);
      return;
    }

    const name = options.name || detectProjectName(rootPath);
    const type = options.type || detectProjectType(rootPath);

    const config = loader.init(name, type);

    console.log(`\n${CHECK} Created ${BOLD}eos.workspace.yaml${RESET}`);
    console.log(`  ${DIM}•${RESET} Name: ${BOLD}${config.name}${RESET}`);
    if (config.type) {
      console.log(`  ${DIM}•${RESET} Type: ${config.type}`);
    }
    if (config.org) {
      console.log(`  ${DIM}•${RESET} Org:  ${config.org}`);
    }
    console.log('');
  });

workspaceCommand
  .command('show')
  .description('Print current workspace configuration')
  .action(() => {
    const rootPath = process.cwd();
    const loader = new WorkspaceLoader(rootPath);

    if (!loader.exists()) {
      console.log(`\n${DIM}No eos.workspace.yaml found. Run \`eos workspace init\` to create one.${RESET}\n`);
      process.exit(1);
    }

    const config = loader.load();
    if (!config) {
      console.log(`\n${DIM}Failed to parse eos.workspace.yaml.${RESET}\n`);
      process.exit(1);
    }

    console.log(`\n${BOLD}Workspace: ${config.name}${RESET}`);
    if (config.type) console.log(`  ${DIM}•${RESET} Type: ${config.type}`);
    if (config.org) console.log(`  ${DIM}•${RESET} Org:  ${config.org}`);

    if (config.repos.length > 0) {
      console.log(`\n${BOLD}Linked Repos:${RESET}`);
      for (const repo of config.repos) {
        const roleStr = repo.role ? ` ${DIM}(${repo.role})${RESET}` : '';
        console.log(`  ${DIM}•${RESET} ${repo.name} ${DIM}→${RESET} ${repo.path}${roleStr}`);
      }
    }

    if (config.conventions.length > 0) {
      console.log(`\n${BOLD}Conventions:${RESET}`);
      for (const conv of config.conventions) {
        console.log(`  ${DIM}•${RESET} ${BOLD}${conv.name}${RESET}: ${conv.rule}`);
      }
    }

    if (config.decisions.length > 0) {
      console.log(`\n${BOLD}Decisions:${RESET}`);
      for (const dec of config.decisions) {
        console.log(`  ${DIM}•${RESET} ${BOLD}${dec.title}${RESET}`);
        console.log(`    ${dec.decision}`);
        console.log(`    ${DIM}Rationale: ${dec.rationale}${RESET}`);
      }
    }

    console.log(`\n${BOLD}AI:${RESET}`);
    console.log(`  ${DIM}•${RESET} Tools: ${config.ai.tools.join(', ')}`);
    console.log(`  ${DIM}•${RESET} MCP:   ${config.ai.mcp ? 'enabled' : 'disabled'}`);
    console.log('');
  });

workspaceCommand
  .command('add-convention')
  .description('Add or update a convention')
  .argument('<name>', 'Convention name')
  .argument('<rule>', 'Convention rule')
  .action((name: string, rule: string) => {
    const rootPath = process.cwd();
    const loader = new WorkspaceLoader(rootPath);

    loader.addConvention(name, rule);
    console.log(`\n${CHECK} Convention added: ${BOLD}${name}${RESET}`);
    console.log(`  ${DIM}${rule}${RESET}\n`);
  });

workspaceCommand
  .command('add-decision')
  .description('Add a decision record')
  .argument('<title>', 'Decision title')
  .argument('<decision>', 'The decision made')
  .requiredOption('--rationale <why>', 'Rationale for the decision')
  .action((title: string, decision: string, options: { rationale: string }) => {
    const rootPath = process.cwd();
    const loader = new WorkspaceLoader(rootPath);

    loader.addDecision(title, decision, options.rationale);
    console.log(`\n${CHECK} Decision recorded: ${BOLD}${title}${RESET}`);
    console.log(`  ${DIM}${decision}${RESET}`);
    console.log(`  ${DIM}Rationale: ${options.rationale}${RESET}\n`);
  });

workspaceCommand
  .command('add-repo')
  .description('Add a linked repository')
  .argument('<name>', 'Repository name')
  .argument('<path>', 'Path to the repository')
  .option('--role <role>', 'Role of the repository (e.g., backend, frontend, shared)')
  .action((name: string, repoPath: string, options: { role?: string }) => {
    const rootPath = process.cwd();
    const absolutePath = path.resolve(repoPath);
    const loader = new WorkspaceLoader(rootPath);

    loader.addRepo(name, absolutePath, options.role);
    console.log(`\n${CHECK} Repo linked: ${BOLD}${name}${RESET}`);
    console.log(`  ${DIM}${absolutePath}${RESET}`);
    if (options.role) {
      console.log(`  ${DIM}Role: ${options.role}${RESET}`);
    }
    console.log('');
  });
