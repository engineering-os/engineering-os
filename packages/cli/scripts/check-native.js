#!/usr/bin/env node
'use strict';

const major = parseInt(process.versions.node.split('.')[0], 10);

if (major < 18) {
  console.error(
    '\x1b[31m[eos] Node.js >= 18 is required. You are running Node ' +
    process.version + '.\x1b[0m'
  );
  process.exit(1);
}

try {
  require('better-sqlite3');
} catch (err) {
  if (err.message && err.message.includes('NODE_MODULE_VERSION')) {
    console.log('\x1b[33m[eos] Rebuilding native modules for Node ' + process.version + '...\x1b[0m');
    const { execSync } = require('child_process');
    try {
      execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
      console.log('\x1b[32m[eos] Native modules rebuilt successfully.\x1b[0m');
    } catch {
      console.error(
        '\x1b[31m[eos] Failed to rebuild native modules. Run manually:\x1b[0m\n' +
        '  npm rebuild better-sqlite3'
      );
    }
  }
}
