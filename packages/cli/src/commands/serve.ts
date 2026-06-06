import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EosMcpServer, GlobalRegistry, RepoRegistry } from '@engineering-os/core';

// ANSI color codes
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

async function eosExists(rootPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(rootPath, '.eos'));
    return true;
  } catch {
    return false;
  }
}

async function findEosRoot(startPath: string): Promise<string | null> {
  let current = startPath;
  while (true) {
    if (await eosExists(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export const serveCommand = new Command('serve')
  .description('Start the Engineering OS MCP server')
  .option('-p, --path <path>', 'Project root (must have .eos/). Defaults to nearest .eos/ in parent directories.')
  .option('--global', 'Serve ALL onboarded repos (from ~/.eos/repos.yaml)')
  .action(async (options) => {
    const cwd = process.cwd();
    const startPath = options.path ? path.resolve(options.path) : cwd;
    let rootPath = await findEosRoot(startPath);

    // If no local .eos/ found, fall back to global registry (works from ANY directory)
    if (!rootPath || options.global) {
      try {
        const registry = new GlobalRegistry();
        const { valid } = registry.validate();

        if (valid.length === 0) {
          process.stderr.write(`\n${RED}Error: No repos registered and no .eos/ found.${RESET}\n`);
          process.stderr.write(`${DIM}Run \`eos init\` in your project first.${RESET}\n\n`);
          process.exit(1);
        }

        // Pick the best repo: one whose path is a parent of CWD, or first valid
        const bestMatch = valid.find((r) => cwd.startsWith(r.path)) || valid[0];
        rootPath = bestMatch.path;

        process.stderr.write(`${DIM}Global mode: serving ${valid.length} registered repo(s)${RESET}\n`);
        for (const r of valid) {
          const marker = r.path === rootPath ? ' ← primary' : '';
          process.stderr.write(`${DIM}  • ${r.name} (${r.path})${marker}${RESET}\n`);
        }

        // Auto-link all other repos into the primary so FederatedSearch works
        const eosDir = path.join(rootPath, '.eos');
        const repoRegistry = new RepoRegistry(eosDir);
        for (const repo of valid) {
          if (repo.path === rootPath) continue;
          const repoEosDir = path.join(repo.path, '.eos');
          try {
            await repoRegistry.linkRepo({ name: repo.name, path: repo.path, eosDir: repoEosDir });
          } catch { /* skip if fails */ }
        }
      } catch (err) {
        process.stderr.write(`\n${RED}Error: ${(err as Error).message}${RESET}\n\n`);
        process.exit(1);
      }
    }

    if (!rootPath) {
      process.stderr.write(`\n${RED}Error: .eos/ directory not found.${RESET}\n`);
      process.stderr.write(`${DIM}Run \`eos init\` in your project first.${RESET}\n\n`);
      process.exit(1);
    }

    // All status output goes to stderr — stdout is reserved for MCP JSON-RPC protocol
    process.stderr.write(`\n${BOLD}${CYAN}⚡ Engineering OS${RESET} ${DIM}— Starting MCP server...${RESET}\n\n`);

    let server: EosMcpServer;

    try {
      server = new EosMcpServer(rootPath);
      await server.initialize();
      await server.start();

      process.stderr.write(`${GREEN}●${RESET} Engineering OS MCP server running on stdio\n`);
      process.stderr.write(`${DIM}  Root: ${rootPath}${RESET}\n`);
      process.stderr.write(`${DIM}  Press Ctrl+C to stop${RESET}\n\n`);
    } catch (error) {
      process.stderr.write(`\n${RED}Error: Failed to start MCP server.${RESET}\n`);
      process.stderr.write(`${DIM}${(error as Error).message}${RESET}\n\n`);
      process.exit(1);
    }

    // Graceful shutdown handlers
    const shutdown = async () => {
      process.stderr.write(`\n${DIM}Shutting down...${RESET}\n`);
      try {
        if (server && typeof (server as any).stop === 'function') {
          await (server as any).stop();
        }
      } catch {
        // ignore shutdown errors
      }
      process.stderr.write(`${GREEN}●${RESET} Server stopped.\n\n`);
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
