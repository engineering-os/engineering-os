import * as fs from 'fs';
import * as path from 'path';

export class EosConfigGenerator {
  private settingsPath: string;

  constructor(private workspaceRoot: string) {
    this.settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
  }

  async checkAndOffer(): Promise<void> {
    const eosExists = fs.existsSync(path.join(this.workspaceRoot, '.eos'));
    if (!eosExists) return;

    const hasConfig = this.hasMcpConfig();
    if (hasConfig) return;

    // VS Code API would show notification here — in headless mode just generate
    try {
      const vscode = await import('vscode');
      const result = await vscode.window.showInformationMessage(
        'Engineering OS detected. Configure MCP connection?',
        'Yes', 'No'
      );
      if (result === 'Yes') {
        await this.generate();
      }
    } catch {
      // Not in VS Code environment (testing/CLI)
    }
  }

  async generate(): Promise<void> {
    const vscodeDir = path.join(this.workspaceRoot, '.vscode');
    if (!fs.existsSync(vscodeDir)) {
      fs.mkdirSync(vscodeDir, { recursive: true });
    }

    let settings: Record<string, unknown> = {};
    if (fs.existsSync(this.settingsPath)) {
      const content = fs.readFileSync(this.settingsPath, 'utf-8');
      try {
        settings = JSON.parse(content);
      } catch {
        settings = {};
      }
    }

    // Add MCP server configuration
    if (!settings['mcp']) {
      settings['mcp'] = {};
    }
    const mcp = settings['mcp'] as Record<string, unknown>;
    if (!mcp['servers']) {
      mcp['servers'] = {};
    }
    const servers = mcp['servers'] as Record<string, unknown>;
    servers['engineering-os'] = {
      command: 'eos',
      args: ['serve'],
      transport: 'stdio',
    };

    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  private hasMcpConfig(): boolean {
    if (!fs.existsSync(this.settingsPath)) return false;
    try {
      const content = fs.readFileSync(this.settingsPath, 'utf-8');
      return content.includes('engineering-os');
    } catch {
      return false;
    }
  }
}
