declare module 'vscode' {
  export namespace window {
    export function showInputBox(options?: { prompt?: string; placeHolder?: string }): Thenable<string | undefined>;
    export function showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined>;
    export function showErrorMessage(message: string): Thenable<string | undefined>;
    export function showQuickPick(items: string[], options?: { placeHolder?: string }): Thenable<string | undefined>;
    export function createOutputChannel(name: string): OutputChannel;
    export function registerTreeDataProvider(viewId: string, provider: TreeDataProvider<any>): Disposable;
    export function showTextDocument(document: TextDocument): Thenable<TextEditor>;
  }

  export namespace workspace {
    export const workspaceFolders: WorkspaceFolder[] | undefined;
    export function openTextDocument(path: string): Thenable<TextDocument>;
  }

  export namespace commands {
    export function registerCommand(command: string, callback: (...args: any[]) => any): Disposable;
  }

  export interface WorkspaceFolder {
    uri: { fsPath: string };
  }

  export interface ExtensionContext {
    subscriptions: Disposable[];
  }

  export interface Disposable {
    dispose(): void;
  }

  export interface OutputChannel {
    clear(): void;
    appendLine(value: string): void;
    show(): void;
  }

  export interface TextDocument {}

  export interface TextEditor {
    revealRange(range: Range): void;
  }

  export class Range {
    constructor(startLine: number, startChar: number, endLine: number, endChar: number);
  }

  export class TreeItem {
    label: string;
    collapsibleState: TreeItemCollapsibleState;
    iconPath?: ThemeIcon;
    constructor(label: string, collapsibleState: TreeItemCollapsibleState);
  }

  export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
  }

  export class ThemeIcon {
    constructor(id: string);
  }

  export interface TreeDataProvider<T> {
    getTreeItem(element: T): TreeItem;
    getChildren(element?: T): Thenable<T[]> | T[];
  }

  export type Thenable<T> = Promise<T>;
}
