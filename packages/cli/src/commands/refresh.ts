import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';
import { RepositoryIndexer, MetadataStore, GraphStore, RepoRegistry, EosWatcher } from '@engineering-os/core';
import { readConfig } from '../utils/config.js';
import { createAiContextGenerator } from '../utils/ai-context.js';
import { installCodexSkills, writeCodexMcpConfig } from '../utils/codex.js';

const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const CHECK = `${GREEN}✓${RESET}`;

export const refreshCommand = new Command('refresh')
  .description('Refresh EOS knowledge (re-index changed files, update graph, re-scan routes)')
  .option('--incremental', 'Only refresh files changed since last refresh')
  .option('--since <ref>', 'Refresh files changed since git ref (e.g., HEAD~1)')
  .option('--full', 'Full refresh — re-scan everything')
  .action(async (options) => {
    const rootPath = process.cwd();
    const eosDir = path.join(rootPath, '.eos');

    try {
      await fs.access(eosDir);
    } catch {
      console.log(`${YELLOW}Error: .eos/ not found. Run \`eos init\` first.${RESET}`);
      process.exit(1);
    }

    console.log(`${DIM}Refreshing EOS knowledge...${RESET}`);

    const indexer = new RepositoryIndexer(rootPath);
    const metadataStore = new MetadataStore(path.join(eosDir, 'index', 'metadata.db'));
    metadataStore.initialize();
    const graphStore = new GraphStore(path.join(eosDir, 'graph', 'services.db'));
    graphStore.initialize();
    const repoRegistry = new RepoRegistry(eosDir);

    const watcher = new EosWatcher({
      rootPath,
      eosDir,
      indexer,
      metadataStore,
      graphStore,
      repoRegistry,
    });

    let changedFiles: string[] = [];

    if (options.since) {
      // Get files changed since git ref
      try {
        const gitRef = options.since.replace(/[^a-zA-Z0-9~^._\-\/]/g, '');
        const output = execSync(`git diff --name-only ${gitRef}`, {
          cwd: rootPath,
          encoding: 'utf-8',
        });
        changedFiles = output.trim().split('\n').filter(Boolean).map((f) => path.join(rootPath, f));
      } catch (err) {
        console.log(`${YELLOW}⚠ Failed to get git diff: ${(err as Error).message}${RESET}`);
        process.exit(1);
      }
    } else if (options.incremental) {
      // Get files changed since last refresh timestamp
      const lastRefreshPath = path.join(eosDir, '.last-refresh');
      let since = 0;
      try {
        const stat = await fs.stat(lastRefreshPath);
        since = stat.mtimeMs;
      } catch {
        // No previous refresh — do full
        console.log(`${DIM}No previous refresh found, running full scan...${RESET}`);
      }

      if (since > 0) {
        changedFiles = await findModifiedSince(rootPath, since);
      } else {
        const summary = await watcher.refreshFull();
        await fs.writeFile(lastRefreshPath, new Date().toISOString(), 'utf-8');
        printSummary(summary);
        await regenerateAiContexts(rootPath);
        return;
      }
    } else if (options.full) {
      const summary = await watcher.refreshFull();
      const lastRefreshPath = path.join(eosDir, '.last-refresh');
      await fs.writeFile(lastRefreshPath, new Date().toISOString(), 'utf-8');
      printSummary(summary);
      await regenerateAiContexts(rootPath);
      return;
    } else {
      // Default: full refresh
      const summary = await watcher.refreshFull();
      const lastRefreshPath = path.join(eosDir, '.last-refresh');
      await fs.writeFile(lastRefreshPath, new Date().toISOString(), 'utf-8');
      printSummary(summary);
      await regenerateAiContexts(rootPath);
      return;
    }

    if (changedFiles.length === 0) {
      console.log(`${CHECK} No changes detected`);
      return;
    }

    console.log(`${DIM}Processing ${changedFiles.length} changed file(s)...${RESET}`);
    const summary = await watcher.refreshIncremental(changedFiles);

    const lastRefreshPath = path.join(eosDir, '.last-refresh');
    await fs.writeFile(lastRefreshPath, new Date().toISOString(), 'utf-8');
    printSummary(summary);
    await regenerateAiContexts(rootPath);
  });

function printSummary(summary: { filesReindexed: number; routesUpdated: boolean; graphRelinked: boolean; infraUpdated: boolean; contractsUpdated: boolean }) {
  console.log(`${CHECK} Refresh complete:`);
  if (summary.filesReindexed > 0) console.log(`  ${DIM}•${RESET} ${summary.filesReindexed} files re-indexed`);
  if (summary.routesUpdated) console.log(`  ${DIM}•${RESET} Routes updated`);
  if (summary.graphRelinked) console.log(`  ${DIM}•${RESET} Dependency graph re-linked`);
  if (summary.infraUpdated) console.log(`  ${DIM}•${RESET} Infrastructure topology updated`);
  if (summary.contractsUpdated) console.log(`  ${DIM}•${RESET} API contracts updated`);
}

async function findModifiedSince(rootPath: string, sinceMs: number): Promise<string[]> {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.eos', '.next']);

  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skip.has(entry.name)) continue;
        if (entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          try {
            const stat = await fs.stat(full);
            if (stat.mtimeMs > sinceMs) {
              results.push(full);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  await walk(rootPath);
  return results;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function regenerateAiContexts(rootPath: string): Promise<void> {
  let configAdapters: { claude?: boolean; cursor?: boolean; codex?: boolean } = {};
  try {
    const config = await readConfig(rootPath);
    configAdapters = config.adapters ?? {};
  } catch {
    // adapters are optional; fall back to marker/file detection below
  }

  const shouldRegenerateClaude =
    configAdapters.claude === true || await fileExists(path.join(rootPath, 'CLAUDE.md'));
  const shouldRegenerateCursor =
    configAdapters.cursor === true || await fileExists(path.join(rootPath, '.cursor', 'rules', 'eos-system.md'));
  const shouldRegenerateCodex =
    configAdapters.codex === true || await fileExists(path.join(rootPath, 'AGENTS.md'));

  if (!shouldRegenerateClaude && !shouldRegenerateCursor && !shouldRegenerateCodex) {
    return;
  }

  const generator = await createAiContextGenerator(rootPath);
  console.log(`\n${DIM}Regenerating AI context files...${RESET}`);

  if (shouldRegenerateClaude) {
    await generator.writeClaudeMd(path.join(rootPath, 'CLAUDE.md'));
    console.log(`${CHECK} CLAUDE.md refreshed`);
  }

  if (shouldRegenerateCursor) {
    const written = await generator.writeCursorRules(path.join(rootPath, '.cursor', 'rules'));
    console.log(`${CHECK} .cursor/rules/ refreshed ${DIM}(${written.length} files)${RESET}`);
  }

  if (shouldRegenerateCodex) {
    await generator.writeCodexAgentsMd(path.join(rootPath, 'AGENTS.md'));
    const installed = await installCodexSkills(rootPath);
    await writeCodexMcpConfig(rootPath, true);
    console.log(`${CHECK} Codex context refreshed ${DIM}(AGENTS.md, ${installed.length} skills, MCP config)${RESET}`);
  }
}
