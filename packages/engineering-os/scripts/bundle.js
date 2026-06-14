#!/usr/bin/env node
/**
 * Bundle script for the single 'engineering-os' npm package.
 * Copies built dist/ from sibling packages into a unified structure.
 * Run via `npm run prepublishOnly` before publish.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES = path.resolve(ROOT, '..');
const DIST = path.resolve(ROOT, 'dist');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`ERROR: ${src} not found. Run 'npm run build' from repo root first.`);
    process.exit(1);
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Clean dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

console.log('Bundling engineering-os...');

// Copy shared
copyDir(path.join(PACKAGES, 'shared', 'dist'), path.join(DIST, 'shared'));
console.log('  ✓ shared');

// Copy core
copyDir(path.join(PACKAGES, 'core', 'dist'), path.join(DIST, 'core'));
console.log('  ✓ core');

// Copy cli
copyDir(path.join(PACKAGES, 'cli', 'dist'), path.join(DIST, 'cli'));
console.log('  ✓ cli');

// Copy adapter-cursor
copyDir(path.join(PACKAGES, 'adapter-cursor', 'dist'), path.join(DIST, 'adapter-cursor'));
console.log('  ✓ adapter-cursor');

// Copy adapter-vscode
copyDir(path.join(PACKAGES, 'adapter-vscode', 'dist'), path.join(DIST, 'adapter-vscode'));
console.log('  ✓ adapter-vscode');

// Copy skills from adapter-claude (Claude Code reads these directly)
const skillsSrc = path.join(PACKAGES, 'adapter-claude', 'skills');
const skillsDest = path.join(ROOT, 'skills');
if (fs.existsSync(skillsDest)) {
  fs.rmSync(skillsDest, { recursive: true });
}
copyDir(skillsSrc, skillsDest);
console.log('  ✓ skills (11 Claude Code skills)');

// Copy Codex skills
const codexSkillsSrc = path.join(PACKAGES, 'adapter-codex', 'skills');
const codexSkillsDest = path.join(ROOT, 'skills-codex');
if (fs.existsSync(codexSkillsDest)) {
  fs.rmSync(codexSkillsDest, { recursive: true });
}
copyDir(codexSkillsSrc, codexSkillsDest);
console.log('  ✓ skills-codex (11 Codex skills)');

// Copy .claude-plugin from adapter-claude
const pluginSrc = path.join(PACKAGES, 'adapter-claude', '.claude-plugin');
const pluginDest = path.join(ROOT, '.claude-plugin');
if (fs.existsSync(pluginDest)) {
  fs.rmSync(pluginDest, { recursive: true });
}
copyDir(pluginSrc, pluginDest);
copyFile(
  path.join(PACKAGES, 'adapter-claude', 'plugin.json'),
  path.join(ROOT, 'plugin.json')
);
console.log('  ✓ .claude-plugin + plugin.json');

// Copy check-native script from cli
copyFile(
  path.join(PACKAGES, 'cli', 'scripts', 'check-native.js'),
  path.join(ROOT, 'scripts', 'check-native.js')
);
console.log('  ✓ scripts/check-native.js');

// Rewrite @engineering-os/* imports to relative paths
function rewriteImports(dir, packageDir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteImports(fullPath, packageDir);
    } else if (entry.name.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      let changed = false;

      // Replace require("@engineering-os/shared") and require("@engineering-os/core")
      content = content.replace(
        /require\(["']@engineering-os\/(shared|core)["']\)/g,
        (match, pkg) => {
          changed = true;
          const fromDir = path.dirname(fullPath);
          const toDir = path.join(DIST, pkg);
          let rel = path.relative(fromDir, toDir).replace(/\\/g, '/');
          if (!rel.startsWith('.')) rel = './' + rel;
          return `require("${rel}")`;
        }
      );

      // Also handle subpath imports like require("@engineering-os/core/some/path")
      content = content.replace(
        /require\(["']@engineering-os\/(shared|core)\/([^"']+)["']\)/g,
        (match, pkg, subpath) => {
          changed = true;
          const fromDir = path.dirname(fullPath);
          const toDir = path.join(DIST, pkg, subpath);
          let rel = path.relative(fromDir, toDir).replace(/\\/g, '/');
          if (!rel.startsWith('.')) rel = './' + rel;
          return `require("${rel}")`;
        }
      );

      if (changed) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

console.log('\nRewriting internal package references...');
rewriteImports(path.join(DIST, 'cli'), 'cli');
console.log('  ✓ cli imports rewritten');
rewriteImports(path.join(DIST, 'core'), 'core');
console.log('  ✓ core imports rewritten');
rewriteImports(path.join(DIST, 'shared'), 'shared');
console.log('  ✓ shared imports rewritten');
rewriteImports(path.join(DIST, 'adapter-cursor'), 'adapter-cursor');
console.log('  ✓ adapter-cursor imports rewritten');
rewriteImports(path.join(DIST, 'adapter-vscode'), 'adapter-vscode');
console.log('  ✓ adapter-vscode imports rewritten');

console.log(`\n✨ Bundle complete: ${DIST}`);
