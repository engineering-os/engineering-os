import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class EosSidebarProvider implements vscode.TreeDataProvider<EosTreeItem> {
  constructor(private workspaceRoot: string) {}

  getTreeItem(element: EosTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: EosTreeItem): Promise<EosTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    return [];
  }

  private getRootItems(): EosTreeItem[] {
    const eosDir = path.join(this.workspaceRoot, '.eos');
    if (!fs.existsSync(eosDir)) {
      return [new EosTreeItem('Run `eos init` to get started', vscode.TreeItemCollapsibleState.None)];
    }

    const items: EosTreeItem[] = [];

    // Check services
    const servicesDir = path.join(eosDir, 'knowledge', 'architecture', 'services');
    if (fs.existsSync(servicesDir)) {
      const files = fs.readdirSync(servicesDir).filter((f) => f.endsWith('.yaml'));
      for (const file of files) {
        const name = file.replace('.yaml', '');
        items.push(new EosTreeItem(name, vscode.TreeItemCollapsibleState.None, 'service'));
      }
    }

    // Check decisions
    const decisionsDir = path.join(eosDir, 'knowledge', 'decisions');
    if (fs.existsSync(decisionsDir)) {
      const files = fs.readdirSync(decisionsDir).filter((f) => f.endsWith('.yaml'));
      for (const file of files) {
        const name = file.replace('.yaml', '');
        items.push(new EosTreeItem(name, vscode.TreeItemCollapsibleState.None, 'decision'));
      }
    }

    if (items.length === 0) {
      items.push(new EosTreeItem('No knowledge indexed yet', vscode.TreeItemCollapsibleState.None));
    }

    return items;
  }
}

class EosTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType?: string
  ) {
    super(label, collapsibleState);
    if (itemType === 'service') {
      this.iconPath = new vscode.ThemeIcon('server');
    } else if (itemType === 'decision') {
      this.iconPath = new vscode.ThemeIcon('note');
    }
  }
}
