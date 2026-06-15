import * as fs from 'fs';
import * as path from 'path';
import { CursorRulesGenerator } from './generator';

export class CursorRulesWatcher {
  private watchers: fs.FSWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 500;

  constructor(
    private generator: CursorRulesGenerator,
    private eosPath: string
  ) {}

  /**
   * Start watching .eos/knowledge/ for changes and auto-regenerate .cursorrules.
   */
  start(): void {
    const knowledgePath = path.join(this.eosPath, 'knowledge');
    const graphPath = path.join(this.eosPath, 'graph', 'service-map.json');
    const workspacePath = path.join(path.dirname(this.eosPath), 'eos.workspace.yaml');

    // Watch the knowledge directory recursively
    try {
      const watcher = fs.watch(knowledgePath, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.yaml') || filename.endsWith('.yml'))) {
          console.log(`[eos-cursor] Detected change: ${filename}`);
          this.scheduleRegenerate();
        }
      });

      watcher.on('error', (err) => {
        console.error('[eos-cursor] Watcher error:', err.message);
      });

      this.watchers.push(watcher);
      console.log(`[eos-cursor] Watching ${knowledgePath} for changes...`);
      this.watchFile(graphPath);
      this.watchFile(workspacePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.error(`[eos-cursor] Knowledge directory not found: ${knowledgePath}`);
        console.error('[eos-cursor] Run "eos init" to set up your project first.');
      } else {
        throw err;
      }
    }
  }

  private watchFile(filePath: string): void {
    try {
      const watcher = fs.watch(filePath, (_eventType, filename) => {
        console.log(`[eos-cursor] Detected change: ${filename || path.basename(filePath)}`);
        this.scheduleRegenerate();
      });
      watcher.on('error', (err) => {
        console.error('[eos-cursor] Watcher error:', err.message);
      });
      this.watchers.push(watcher);
      console.log(`[eos-cursor] Watching ${filePath} for changes...`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Stop watching for changes.
   */
  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    console.log('[eos-cursor] Stopped watching.');
  }

  /**
   * Debounced regeneration to avoid rapid re-writes on bulk changes.
   */
  private scheduleRegenerate(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        await this.generator.write();
        console.log('[eos-cursor] Regenerated .cursorrules');
      } catch (err: any) {
        console.error('[eos-cursor] Failed to regenerate:', err.message);
      }
    }, this.DEBOUNCE_MS);
  }
}
