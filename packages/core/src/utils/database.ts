import { execSync } from 'child_process';

let Database: typeof import('better-sqlite3');
let loadAttempted = false;
let loadError: Error | null = null;

function tryLoadDatabase(): typeof import('better-sqlite3') {
  if (loadAttempted && Database) return Database;
  if (loadAttempted && loadError) throw loadError;

  loadAttempted = true;

  try {
    Database = require('better-sqlite3');
    return Database;
  } catch (err: any) {
    if (
      err.message?.includes('NODE_MODULE_VERSION') ||
      err.message?.includes('was compiled against a different Node.js version')
    ) {
      process.stderr.write(
        '\x1b[33m[eos] Native module mismatch detected — rebuilding for Node ' +
        process.version + '...\x1b[0m\n'
      );

      try {
        const modPath = require.resolve('better-sqlite3/package.json');
        const modDir = require('path').dirname(modPath);
        execSync('npm run install', { cwd: modDir, stdio: 'pipe' });
      } catch {
        try {
          execSync('npx --yes prebuild-install || npx --yes node-gyp rebuild --release', {
            cwd: require('path').dirname(require.resolve('better-sqlite3/package.json')),
            stdio: 'pipe',
          });
        } catch {
          loadError = new Error(
            '[eos] Failed to rebuild better-sqlite3 for Node ' + process.version + '.\n' +
            'Fix: Run "npm rebuild better-sqlite3" then try again.'
          );
          throw loadError;
        }
      }

      delete require.cache[require.resolve('better-sqlite3')];
      try {
        Database = require('better-sqlite3');
        process.stderr.write('\x1b[32m[eos] Rebuild successful.\x1b[0m\n');
        return Database;
      } catch (retryErr: any) {
        loadError = new Error(
          '[eos] Failed to load better-sqlite3 after rebuild.\n' +
          'Fix: Run "npm rebuild better-sqlite3" manually.\n' +
          'Original error: ' + retryErr.message
        );
        throw loadError;
      }
    }

    loadError = err;
    throw err;
  }
}

export function openDatabase(filePath: string): import('better-sqlite3').Database {
  const Db = tryLoadDatabase();
  const db = new Db(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 3000');
  return db;
}

export { tryLoadDatabase as getDatabase };
