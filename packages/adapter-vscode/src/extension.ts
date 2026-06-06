import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { EosSidebarProvider } from './sidebar-provider';
import { EosConfigGenerator } from './config-generator';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return;

  // Register commands
  registerCommands(context, workspaceRoot);

  // Register sidebar tree providers
  const sidebarProvider = new EosSidebarProvider(workspaceRoot);
  vscode.window.registerTreeDataProvider('eos.services', sidebarProvider);
  vscode.window.registerTreeDataProvider('eos.decisions', sidebarProvider);
  vscode.window.registerTreeDataProvider('eos.workflows', sidebarProvider);

  // Auto-offer MCP configuration if .eos/ exists but no MCP config
  const configGen = new EosConfigGenerator(workspaceRoot);
  configGen.checkAndOffer();
}

export function deactivate(): void {
  // Cleanup if needed
}
