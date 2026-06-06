#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { CursorRulesGenerator, CursorRulesConfig } from './generator';
import { CursorRulesWatcher } from './watcher';

const program = new Command();

program
  .name('eos-cursor')
  .description('Generate .cursorrules from Engineering OS knowledge')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate Cursor rules from .eos/ knowledge')
  .option('-p, --path <path>', 'Path to project root', process.cwd())
  .option('-o, --output <path>', 'Custom output path')
  .option('--legacy', 'Write a single .cursorrules file instead of .cursor/rules/ directory')
  .option('--no-architecture', 'Exclude architecture section')
  .option('--no-patterns', 'Exclude patterns section')
  .option('--no-conventions', 'Exclude conventions section')
  .option('--no-decisions', 'Exclude decisions section')
  .option('--max-length <chars>', 'Maximum content length', '8000')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);
    const eosPath = path.join(projectRoot, '.eos');
    const useCursorRulesDir = !options.legacy;

    const outputPath = options.output
      ? path.resolve(options.output)
      : useCursorRulesDir
        ? path.join(projectRoot, '.cursor', 'rules', 'eos-architecture.md')
        : path.join(projectRoot, '.cursorrules');

    const config: CursorRulesConfig = {
      eosPath,
      outputPath,
      includeArchitecture: options.architecture !== false,
      includePatterns: options.patterns !== false,
      includeConventions: options.conventions !== false,
      includeDecisions: options.decisions !== false,
      maxLength: parseInt(options.maxLength, 10),
      useCursorRulesDir,
    };

    const generator = new CursorRulesGenerator(config);

    try {
      await generator.write();
      if (useCursorRulesDir) {
        const rulesDir = path.join(projectRoot, '.cursor', 'rules');
        console.log(`[eos-cursor] Generated rules in ${rulesDir}/`);
        console.log(`[eos-cursor]   eos-conventions.md`);
        console.log(`[eos-cursor]   eos-patterns.md`);
        console.log(`[eos-cursor]   eos-architecture.md`);
        console.log(`[eos-cursor]   eos-decisions.md`);
        console.log(`[eos-cursor] Your existing .cursorrules and other rule files are untouched.`);
      } else {
        console.log(`[eos-cursor] Generated .cursorrules at ${outputPath}`);
      }
    } catch (err: any) {
      console.error(`[eos-cursor] Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch .eos/knowledge/ and auto-regenerate Cursor rules on changes')
  .option('-p, --path <path>', 'Path to project root', process.cwd())
  .option('-o, --output <path>', 'Custom output path')
  .option('--legacy', 'Write a single .cursorrules file instead of .cursor/rules/ directory')
  .option('--max-length <chars>', 'Maximum content length', '8000')
  .action(async (options) => {
    const projectRoot = path.resolve(options.path);
    const eosPath = path.join(projectRoot, '.eos');
    const useCursorRulesDir = !options.legacy;

    const outputPath = options.output
      ? path.resolve(options.output)
      : useCursorRulesDir
        ? path.join(projectRoot, '.cursor', 'rules', 'eos-architecture.md')
        : path.join(projectRoot, '.cursorrules');

    const config: CursorRulesConfig = {
      eosPath,
      outputPath,
      includeArchitecture: true,
      includePatterns: true,
      includeConventions: true,
      includeDecisions: true,
      maxLength: parseInt(options.maxLength, 10),
      useCursorRulesDir,
    };

    const generator = new CursorRulesGenerator(config);
    const watcher = new CursorRulesWatcher(generator, eosPath);

    // Generate once on start
    try {
      await generator.write();
      if (useCursorRulesDir) {
        console.log(`[eos-cursor] Initial rules generated in .cursor/rules/`);
      } else {
        console.log(`[eos-cursor] Initial .cursorrules generated at ${outputPath}`);
      }
    } catch (err: any) {
      console.error(`[eos-cursor] Warning: initial generation failed: ${err.message}`);
    }

    // Start watching
    watcher.start();

    // Handle graceful shutdown
    const shutdown = () => {
      watcher.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

program.parse();
