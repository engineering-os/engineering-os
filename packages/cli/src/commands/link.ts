import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';

export const linkCommand = new Command('link')
  .description('Link another repository for federated search')
  .argument('<name>', 'Name for the linked repository')
  .argument('<repoPath>', 'Path to the repository')
  .option('--tags <tags...>', 'Tags for filtering')
  .action(async (name: string, repoPath: string, options: { tags?: string[] }) => {
    const absolutePath = path.resolve(repoPath);
    const eosDir = path.join(absolutePath, '.eos');

    if (!fs.existsSync(absolutePath)) {
      process.stderr.write(`Error: Path does not exist: ${absolutePath}\n`);
      process.exit(1);
    }

    const { RepoRegistry } = await import('@engineering-os/core');
    const localEosDir = findEosDir(process.cwd());
    if (!localEosDir) {
      process.stderr.write('Error: No .eos/ directory found. Run `eos init` first.\n');
      process.exit(1);
    }

    const registry = new RepoRegistry(localEosDir);
    await registry.linkRepo({
      name,
      path: absolutePath,
      eosDir,
      lastSynced: new Date().toISOString(),
      tags: options.tags,
    });

    const hasIndex = fs.existsSync(path.join(eosDir, 'index', 'metadata.db'));
    process.stderr.write(`Linked: ${name} → ${absolutePath}\n`);
    if (!hasIndex) {
      process.stderr.write(`  Warning: No .eos/index found. Run \`eos init\` in that repo for federated search.\n`);
    }
  });

export const unlinkCommand = new Command('unlink')
  .description('Remove a linked repository')
  .argument('<name>', 'Name of the linked repository to remove')
  .action(async (name: string) => {
    const { RepoRegistry } = await import('@engineering-os/core');
    const localEosDir = findEosDir(process.cwd());
    if (!localEosDir) {
      process.stderr.write('Error: No .eos/ directory found. Run `eos init` first.\n');
      process.exit(1);
    }

    const registry = new RepoRegistry(localEosDir);
    const removed = await registry.unlinkRepo(name);
    if (removed) {
      process.stderr.write(`Unlinked: ${name}\n`);
    } else {
      process.stderr.write(`Not found: ${name}\n`);
      process.exit(1);
    }
  });

function findEosDir(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, '.eos');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
