#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 18) {
  process.stderr.write(
    `\x1b[31m[eos] Error: Node.js >= 18 required (you have ${process.version}).\x1b[0m\n` +
    `\x1b[2mInstall Node 18+ via nvm: nvm install 18 && nvm use 18\x1b[0m\n`
  );
  process.exit(1);
}

function handleNativeModuleError(err: Error): void {
  const msg = err.message || '';
  if (msg.includes('NODE_MODULE_VERSION') || msg.includes('was compiled against a different')) {
    const hint =
      `[eos] Native module error: better-sqlite3 was compiled for a different Node.js version.\n` +
      `[eos] You are running Node ${process.version}, but the module was built for another version.\n` +
      `[eos] Fix: Run "npm rebuild better-sqlite3" in the EOS install directory, then retry.\n`;
    process.stderr.write(`\x1b[31m${hint}\x1b[0m`);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  handleNativeModuleError(err);
  process.stderr.write(`\x1b[31m[eos] Fatal: ${err.message}\x1b[0m\n`);
  process.exit(1);
});

import { Command } from 'commander';

function getCliVersion(): string {
  let current = __dirname;
  while (true) {
    const packagePath = path.join(current, 'package.json');
    if (fs.existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        if ((pkg.name === 'engineering-os' || pkg.name === '@engineering-os/cli') && typeof pkg.version === 'string') {
          return pkg.version;
        }
      } catch {
        // Keep walking upward until a valid package boundary is found.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return '0.0.0';
}

const program = new Command();

program
  .name('eos')
  .description('Engineering OS - Engineering Intelligence Platform')
  .version(getCliVersion());

async function main() {
  try {
    const [
      { initCommand },
      { serveCommand },
      { statusCommand },
      { enableCommand, disableCommand },
      { indexCommand },
      { linkCommand, unlinkCommand },
      { marketplaceCommand },
      { refreshCommand },
      { workspaceCommand },
      { codexCommand },
      { cursorCommand },
    ] = await Promise.all([
      import('./commands/init.js'),
      import('./commands/serve.js'),
      import('./commands/status.js'),
      import('./commands/toggle.js'),
      import('./commands/index.js'),
      import('./commands/link.js'),
      import('./commands/marketplace.js'),
      import('./commands/refresh.js'),
      import('./commands/workspace.js'),
      import('./commands/codex.js'),
      import('./commands/cursor.js'),
    ]);

    program.addCommand(initCommand);
    program.addCommand(serveCommand);
    program.addCommand(statusCommand);
    program.addCommand(enableCommand);
    program.addCommand(disableCommand);
    program.addCommand(indexCommand);
    program.addCommand(linkCommand);
    program.addCommand(unlinkCommand);
    program.addCommand(marketplaceCommand);
    program.addCommand(refreshCommand);
    program.addCommand(workspaceCommand);
    program.addCommand(codexCommand);
    program.addCommand(cursorCommand);

    await program.parseAsync();
  } catch (err: any) {
    handleNativeModuleError(err);
    throw err;
  }
}

main();
