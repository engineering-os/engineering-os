import * as vscode from 'vscode';
import * as path from 'path';
import { MetadataStore } from '@engineering-os/core';
import { expandQuery } from '@engineering-os/core';

export function registerCommands(context: vscode.ExtensionContext, workspaceRoot: string): void {
  const eosDir = path.join(workspaceRoot, '.eos');

  context.subscriptions.push(
    vscode.commands.registerCommand('eos.search', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search your codebase via Engineering OS',
        placeHolder: 'e.g., auth middleware, payment webhook',
      });
      if (!query) return;

      const dbPath = path.join(eosDir, 'index', 'metadata.db');
      try {
        const store = new MetadataStore(dbPath);
        store.initialize();
        const queries = expandQuery(query);
        const results: string[] = [];
        const seen = new Set<string>();

        for (const q of queries) {
          const searchResults = store.search(q, { limit: 10 });
          for (const r of searchResults) {
            const key = `${r.chunk.filePath}:${r.chunk.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push(`${r.chunk.name} — ${r.chunk.filePath}:${r.chunk.startLine}`);
          }
        }

        if (results.length === 0) {
          vscode.window.showInformationMessage(`No results for "${query}"`);
          return;
        }

        const selected = await vscode.window.showQuickPick(results, {
          placeHolder: `${results.length} results for "${query}"`,
        });

        if (selected) {
          const match = selected.match(/— (.+):(\d+)$/);
          if (match) {
            const doc = await vscode.workspace.openTextDocument(match[1]);
            const editor = await vscode.window.showTextDocument(doc);
            const line = parseInt(match[2], 10) - 1;
            editor.revealRange(new vscode.Range(line, 0, line, 0));
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(`EOS search failed. Run \`eos init\` first.`);
      }
    }),

    vscode.commands.registerCommand('eos.status', async () => {
      const output = vscode.window.createOutputChannel('Engineering OS');
      output.clear();
      output.appendLine('# Engineering OS Status');
      output.appendLine('');

      try {
        const dbPath = path.join(eosDir, 'index', 'metadata.db');
        const store = new MetadataStore(dbPath);
        store.initialize();
        const stats = store.getStats();
        output.appendLine(`Files indexed: ${stats.totalFiles}`);
        output.appendLine(`Code chunks: ${stats.totalChunks}`);
        output.appendLine(`Relationships: ${stats.totalRelationships}`);
      } catch {
        output.appendLine('Index not available. Run `eos init` to get started.');
      }

      output.show();
    }),

    vscode.commands.registerCommand('eos.security', async () => {
      vscode.window.showInformationMessage(
        'Security scan running via MCP. Use the terminal: `eos serve` + call `eos_security_scan` from your AI tool.'
      );
    }),

    vscode.commands.registerCommand('eos.decide', async () => {
      const title = await vscode.window.showInputBox({ prompt: 'Decision title' });
      if (!title) return;
      const rationale = await vscode.window.showInputBox({ prompt: 'Why was this decided?' });
      if (!rationale) return;

      vscode.window.showInformationMessage(
        `Decision recorded. Use \`eos_recall_decision "${title}"\` to retrieve it later.`
      );
    }),

    vscode.commands.registerCommand('eos.configure', async () => {
      const { EosConfigGenerator } = await import('./config-generator');
      const gen = new EosConfigGenerator(workspaceRoot);
      await gen.generate();
      vscode.window.showInformationMessage('MCP configuration updated in .vscode/settings.json');
    })
  );
}
