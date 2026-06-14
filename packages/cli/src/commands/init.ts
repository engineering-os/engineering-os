import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RepositoryIndexer, ArchitectureDiscovery, ArchitectureStore, MetadataStore, GraphStore, GraphLinker, ContractDiscovery, RepoRegistry, AiContextGenerator, WorkspaceLoader, GlobalRegistry } from '@engineering-os/core';
import { DecisionStore } from '@engineering-os/core';
import { getDefaultConfig, readConfig, writeConfig } from '../utils/config.js';
import { installCodexSkills, writeCodexMcpConfig } from '../utils/codex.js';

// ANSI color codes
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CHECK = `${GREEN}✓${RESET}`;

const EOS_DIRECTORIES = [
  '.eos/index',
  '.eos/index/ast',
  '.eos/knowledge/decisions',
  '.eos/knowledge/architecture/services',
  '.eos/knowledge/architecture/patterns',
  '.eos/knowledge/architecture/conventions',
  '.eos/workflows/active',
  '.eos/workflows/completed',
  '.eos/features',
  '.eos/traces',
  '.eos/graph',
];

async function detectProjectName(rootPath: string): Promise<string> {
  try {
    const pkgPath = path.join(rootPath, 'package.json');
    const content = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    if (pkg.name) {
      return pkg.name;
    }
  } catch {
    // fall through to directory name
  }
  return path.basename(rootPath);
}

async function ensureGitignore(rootPath: string): Promise<void> {
  const gitignorePath = path.join(rootPath, '.gitignore');
  const entry = '.eos/';

  try {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (content.includes(entry)) {
      return; // already present
    }
    const newContent = content.endsWith('\n')
      ? `${content}${entry}\n`
      : `${content}\n${entry}\n`;
    await fs.writeFile(gitignorePath, newContent, 'utf-8');
  } catch {
    // .gitignore doesn't exist, create it
    await fs.writeFile(gitignorePath, `${entry}\n`, 'utf-8');
  }
}

export const initCommand = new Command('init')
  .description('Initialize Engineering OS in the current repository')
  .option('-f, --force', 'Force re-initialization even if .eos/ exists')
  .option('--claude', 'Generate CLAUDE.md context file')
  .option('--cursor', 'Generate .cursor/rules/eos-*.md files')
  .option('--codex', 'Generate Codex AGENTS.md, .agents/skills/eos-*, and .codex/config.toml')
  .option('--copilot', 'Generate .github/copilot-instructions.md')
  .option('--windsurf', 'Generate .windsurfrules file')
  .option('--all', 'Generate context files for all AI tools')
  .action(async (options) => {
    const rootPath = process.cwd();

    console.log(`\n${BOLD}${CYAN}⚡ Engineering OS${RESET} ${DIM}— Initializing...${RESET}\n`);

    // Create directory structure
    console.log(`${DIM}Creating .eos/ directory structure...${RESET}`);
    for (const dir of EOS_DIRECTORIES) {
      const fullPath = path.join(rootPath, dir);
      await fs.mkdir(fullPath, { recursive: true });
    }
    console.log(`${CHECK} Directory structure created`);

    // Detect project name and write config
    const projectName = await detectProjectName(rootPath);
    const configPath = path.join(rootPath, '.eos', 'config.yaml');

    let configExists = false;
    try {
      await fs.access(configPath);
      configExists = true;
    } catch {
      // doesn't exist
    }

    if (!configExists || options.force) {
      const config = getDefaultConfig(projectName);
      await writeConfig(rootPath, config);
      console.log(`${CHECK} Configuration written ${DIM}(.eos/config.yaml)${RESET}`);
    } else {
      console.log(`${CHECK} Configuration exists ${DIM}(skipped, use --force to overwrite)${RESET}`);
    }

    // Update .gitignore
    await ensureGitignore(rootPath);
    console.log(`${CHECK} .gitignore updated`);

    // Create .mcp.json for Claude Code auto-discovery
    const mcpJsonPath = path.join(rootPath, '.mcp.json');
    try {
      await fs.access(mcpJsonPath);
    } catch {
      const mcpConfig = {
        mcpServers: {
          'engineering-os': {
            command: 'eos',
            args: ['serve'],
          },
        },
      };
      await fs.writeFile(mcpJsonPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf-8');
      console.log(`${CHECK} .mcp.json created ${DIM}(Claude Code auto-connects)${RESET}`);
    }

    // Run repository indexing + persist to stores
    console.log(`\n${DIM}Indexing repository...${RESET}`);
    let filesIndexed = 0;
    let chunksStored = 0;
    try {
      const indexer = new RepositoryIndexer(rootPath);
      const indexedFiles = await indexer.indexAll();
      filesIndexed = indexedFiles?.length ?? 0;

      // Persist to MetadataStore (SQLite + FTS5 full-text search)
      const metadataDbPath = path.join(rootPath, '.eos', 'index', 'metadata.db');
      const metadataStore = new MetadataStore(metadataDbPath);
      metadataStore.initialize();
      for (const file of indexedFiles) {
        metadataStore.upsertFile(file);
        metadataStore.storeRelationships(file.filePath, file.imports, file.exports);
        chunksStored += file.chunks.length;
      }

      console.log(`${CHECK} Repository indexed ${DIM}(${filesIndexed} files, ${chunksStored} chunks)${RESET}`);
    } catch (error) {
      console.log(`${YELLOW}⚠ Repository indexing failed: ${(error as Error).message}${RESET}`);
    }

    // Run architecture discovery
    console.log(`${DIM}Discovering architecture...${RESET}`);
    let servicesFound = 0;
    let patternsDetected = 0;
    let conventionsInferred = 0;
    try {
      const discovery = new ArchitectureDiscovery(rootPath);
      const archStore = new ArchitectureStore(path.join(rootPath, '.eos', 'knowledge', 'architecture'));
      const services = await discovery.discoverServices();
      const patterns = await discovery.discoverPatterns();
      const conventions = await discovery.inferConventions();
      for (const svc of services) { await archStore.saveService(svc); }
      for (const pat of patterns) { await archStore.savePattern(pat); }
      for (const conv of conventions) { await archStore.saveConvention(conv); }
      servicesFound = services?.length ?? 0;
      patternsDetected = patterns?.length ?? 0;
      conventionsInferred = conventions?.length ?? 0;
      console.log(`${CHECK} Architecture discovered`);
    } catch (error) {
      console.log(`${YELLOW}⚠ Architecture discovery failed: ${(error as Error).message}${RESET}`);
    }

    // Run contract discovery + graph linking (with monorepo workspace auto-discovery)
    console.log(`${DIM}Building service dependency graph...${RESET}`);
    let contractsFound = 0;
    let connectionsLinked = 0;
    let suggestions = 0;
    let workspacePackagesFound = 0;
    let siblingsFound: Array<{ name: string; path: string }> = [];
    try {
      const eosDir = path.join(rootPath, '.eos');
      const graphStore = new GraphStore(path.join(eosDir, 'graph', 'services.db'));
      graphStore.initialize();
      const repoRegistry = new RepoRegistry(eosDir);

      // Auto-link repos declared in eos.workspace.yaml
      const wsLoader = new WorkspaceLoader(rootPath);
      const wsConfig = wsLoader.load();
      if (wsConfig && wsConfig.repos.length > 0) {
        let linked = 0;
        for (const repo of wsConfig.repos) {
          const absPath = path.resolve(rootPath, repo.path);
          try {
            await fs.access(absPath);
            await repoRegistry.linkRepo({ name: repo.name, path: absPath, eosDir: path.join(absPath, '.eos') });
            linked++;
          } catch { /* path doesn't exist, skip */ }
        }
        if (linked > 0) {
          console.log(`${CHECK} Linked ${linked} repo(s) from workspace config`);
        }
      }

      const graphLinker = new GraphLinker(graphStore, repoRegistry, eosDir);

      // Discover sibling repos
      siblingsFound = graphLinker.discoverSiblings(eosDir);

      // Discover workspace packages (monorepo auto-linking)
      const workspacePackages = graphLinker.discoverWorkspacePackages(rootPath);
      workspacePackagesFound = workspacePackages.length;

      if (workspacePackages.length > 0) {
        console.log(`${CHECK} Found ${workspacePackages.length} workspace packages ${DIM}(auto-linking)${RESET}`);
      }

      // Run the full linker (handles workspace packages + linked repos)
      const report = await graphLinker.linkAll();
      contractsFound = report.stats.contractsFound;
      connectionsLinked = report.autoLinked.length;
      suggestions = report.suggested.length;

      console.log(`${CHECK} Graph built ${DIM}(${report.stats.outboundCallsDetected} calls, ${contractsFound} contracts)${RESET}`);
      if (connectionsLinked > 0 || suggestions > 0) {
        console.log(`${CHECK} ${connectionsLinked} connection(s) auto-linked, ${suggestions} suggestion(s)`);
      }

      // Show the dependency diagram if connections exist
      if (connectionsLinked > 0) {
        const diagram = graphStore.generateMermaidDiagram();
        console.log(`\n${BOLD}Dependency Graph:${RESET}`);
        console.log(`${DIM}${diagram.mermaid}${RESET}`);
      }
    } catch (error) {
      console.log(`${YELLOW}⚠ Graph building failed: ${(error as Error).message}${RESET}`);
    }

    // Print summary
    console.log(`\n${BOLD}${GREEN}✨ Engineering OS initialized!${RESET}\n`);
    console.log(`${BOLD}Summary:${RESET}`);
    console.log(`  ${DIM}•${RESET} Project:       ${BOLD}${projectName}${RESET}`);
    console.log(`  ${DIM}•${RESET} Files indexed:  ${filesIndexed}`);
    console.log(`  ${DIM}•${RESET} Services:      ${servicesFound}`);
    console.log(`  ${DIM}•${RESET} Patterns:      ${patternsDetected}`);
    if (workspacePackagesFound > 0) {
      console.log(`  ${DIM}•${RESET} Packages:      ${workspacePackagesFound} (monorepo)`);
    }
    if (contractsFound > 0) {
      console.log(`  ${DIM}•${RESET} Contracts:     ${contractsFound}`);
    }
    if (connectionsLinked > 0) {
      console.log(`  ${DIM}•${RESET} Connections:   ${connectionsLinked} auto-linked, ${suggestions} suggested`);
    }

    if (siblingsFound.length > 0) {
      console.log(`\n${BOLD}Discovered sibling repos:${RESET}`);
      for (const s of siblingsFound) {
        console.log(`  ${DIM}•${RESET} ${s.name} ${DIM}(${s.path})${RESET}`);
      }
      console.log(`\n${DIM}Run \`eos link <name> <path>\` to add them to your graph.${RESET}`);
    }

    // Generate AI tool context files
    const generateClaude = options.claude || options.all;
    const generateCursor = options.cursor || options.all;
    const generateCodex = options.codex || options.all;
    const generateCopilot = options.copilot || options.all;
    const generateWindsurf = options.windsurf || options.all;

    if (generateClaude || generateCursor || generateCodex || generateCopilot || generateWindsurf) {
      console.log(`\n${DIM}Generating AI context files...${RESET}`);
      try {
        const config = await readConfig(rootPath);
        config.adapters = {
          ...(config.adapters ?? {}),
          ...(generateClaude ? { claude: true } : {}),
          ...(generateCursor ? { cursor: true } : {}),
          ...(generateCodex ? { codex: true } : {}),
          ...(generateCopilot ? { copilot: true } : {}),
          ...(generateWindsurf ? { windsurf: true } : {}),
        };
        await writeConfig(rootPath, config);

        const eosDir = path.join(rootPath, '.eos');
        const graphStore = new GraphStore(path.join(eosDir, 'graph', 'services.db'));
        graphStore.initialize();
        const archStore = new ArchitectureStore(path.join(eosDir, 'knowledge', 'architecture'));
        const decisionStore = new DecisionStore(path.join(eosDir, 'knowledge', 'decisions'));

        const generator = new AiContextGenerator({
          architectureStore: archStore,
          decisionStore,
          graphStore,
          rootPath,
          projectName,
        });

        if (generateClaude) {
          await generator.writeClaudeMd(path.join(rootPath, 'CLAUDE.md'));
          console.log(`${CHECK} CLAUDE.md generated ${DIM}(steering file — full context served via eos_context tool)${RESET}`);
        }

        if (generateCursor) {
          const cursorDir = path.join(rootPath, '.cursor', 'rules');
          const written = await generator.writeCursorRules(cursorDir);
          console.log(`${CHECK} .cursor/rules/ generated ${DIM}(${written.join(', ')})${RESET}`);
        }

        if (generateCodex) {
          await generator.writeCodexAgentsMd(path.join(rootPath, 'AGENTS.md'));
          const installed = await installCodexSkills(rootPath);
          await writeCodexMcpConfig(rootPath, true);
          console.log(`${CHECK} AGENTS.md generated ${DIM}(Codex repo instructions)${RESET}`);
          console.log(`${CHECK} .agents/skills/ generated ${DIM}(${installed.length} EOS Codex skills)${RESET}`);
          console.log(`${CHECK} .codex/config.toml generated ${DIM}(Codex MCP config; project must be trusted)${RESET}`);
        }

        if (generateCopilot) {
          await generator.writeCopilotInstructions(path.join(rootPath, '.github', 'copilot-instructions.md'));
          console.log(`${CHECK} .github/copilot-instructions.md generated`);
        }

        if (generateWindsurf) {
          await generator.writeWindsurfRules(path.join(rootPath, '.windsurfrules'));
          console.log(`${CHECK} .windsurfrules generated`);
        }
      } catch (error) {
        console.log(`${YELLOW}⚠ AI context generation failed: ${(error as Error).message}${RESET}`);
      }
    }

    // Register in global registry (so eos serve --global can find all repos)
    try {
      const globalRegistry = new GlobalRegistry();
      globalRegistry.register(projectName, rootPath);
    } catch {
      // Non-critical — global registry may not be writable
    }

    console.log(`\n${DIM}Run \`eos serve\` to start the MCP server.${RESET}\n`);
  });
