import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';

export const marketplaceCommand = new Command('marketplace')
  .description('Browse and install workflow templates')
  .argument('[action]', 'Action: list, get, install', 'list')
  .argument('[name]', 'Template name (for get/install)')
  .option('--category <category>', 'Filter by category')
  .action(async (action: string, name: string | undefined, options: { category?: string }) => {
    const { WorkflowMarketplace } = await import('@engineering-os/core');
    const localEosDir = findEosDir(process.cwd());

    // Use project workflows dir or fall back to built-in
    const workflowsDir = localEosDir
      ? path.join(localEosDir, 'workflows')
      : path.join(__dirname, '../../../../workflows');
    const registryPath = path.join(workflowsDir, 'registry.yaml');

    // Fall back to built-in registry if local doesn't exist
    const builtInDir = path.resolve(__dirname, '../../../../workflows');
    const builtInRegistry = path.join(builtInDir, 'registry.yaml');
    const marketplace = new WorkflowMarketplace(
      fs.existsSync(workflowsDir) ? workflowsDir : builtInDir,
      fs.existsSync(registryPath) ? registryPath : builtInRegistry
    );

    switch (action) {
      case 'list': {
        const templates = await marketplace.listTemplates(options.category);
        if (templates.length === 0) {
          process.stderr.write('No templates found.\n');
          return;
        }
        process.stderr.write('Available workflow templates:\n\n');
        for (const t of templates) {
          process.stderr.write(`  ${t.name.padEnd(20)} ${t.description} [${t.category}] (${t.stages} stages)\n`);
        }
        break;
      }

      case 'get': {
        if (!name) {
          process.stderr.write('Error: template name required. Usage: eos marketplace get <name>\n');
          process.exit(1);
        }
        const yaml = await marketplace.getTemplate(name);
        if (!yaml) {
          process.stderr.write(`Template not found: ${name}\n`);
          process.exit(1);
        }
        process.stdout.write(yaml);
        break;
      }

      case 'install': {
        if (!name) {
          process.stderr.write('Error: template name required. Usage: eos marketplace install <name>\n');
          process.exit(1);
        }
        const content = await marketplace.getTemplate(name);
        if (!content) {
          process.stderr.write(`Template not found: ${name}\n`);
          process.exit(1);
        }
        if (!localEosDir) {
          process.stderr.write('Error: No .eos/ directory found. Run `eos init` first.\n');
          process.exit(1);
        }
        const destDir = path.join(localEosDir, 'workflows');
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(path.join(destDir, `${name}.yaml`), content, 'utf-8');
        process.stderr.write(`Installed: ${name}.yaml → ${destDir}/\n`);
        break;
      }

      default:
        process.stderr.write(`Unknown action: ${action}. Use: list, get, install\n`);
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
