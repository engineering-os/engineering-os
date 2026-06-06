import * as fs from 'fs';
import * as path from 'path';
import { safeYamlLoad, safeYamlDump } from '../security';

export interface WorkspaceConfig {
  name: string;
  type?: string;
  org?: string;
  repos: WorkspaceRepo[];
  conventions: WorkspaceConvention[];
  decisions: WorkspaceDecision[];
  ai: {
    tools: string[];
    mcp: boolean;
  };
}

export interface WorkspaceRepo {
  name: string;
  path: string;
  role?: string;
}

export interface WorkspaceConvention {
  name: string;
  rule: string;
}

export interface WorkspaceDecision {
  title: string;
  decision: string;
  rationale: string;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  name: '',
  type: undefined,
  org: undefined,
  repos: [],
  conventions: [],
  decisions: [],
  ai: { tools: ['claude', 'cursor'], mcp: true },
};

export class WorkspaceLoader {
  private configPath: string;

  constructor(private rootPath: string) {
    this.configPath = path.join(rootPath, 'eos.workspace.yaml');
  }

  exists(): boolean {
    return fs.existsSync(this.configPath);
  }

  load(): WorkspaceConfig | null {
    if (!this.exists()) return null;
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const raw = safeYamlLoad<any>(content);
      if (!raw) return null;
      return {
        name: raw.name || path.basename(this.rootPath),
        type: raw.type,
        org: raw.org,
        repos: raw.repos || [],
        conventions: raw.conventions || [],
        decisions: raw.decisions || [],
        ai: { tools: raw.ai?.tools || ['claude', 'cursor'], mcp: raw.ai?.mcp !== false },
      };
    } catch {
      return null;
    }
  }

  init(name: string, type?: string): WorkspaceConfig {
    const config: WorkspaceConfig = {
      ...DEFAULT_CONFIG,
      name,
      type,
      org: this.inferOrg(),
    };
    this.save(config);
    return config;
  }

  save(config: WorkspaceConfig): void {
    const content = safeYamlDump(config);
    fs.writeFileSync(this.configPath, content, 'utf-8');
  }

  addConvention(name: string, rule: string): void {
    const config = this.load() || this.init(path.basename(this.rootPath));
    const existing = config.conventions.findIndex((c) => c.name === name);
    if (existing >= 0) {
      config.conventions[existing].rule = rule;
    } else {
      config.conventions.push({ name, rule });
    }
    this.save(config);
  }

  addDecision(title: string, decision: string, rationale: string): void {
    const config = this.load() || this.init(path.basename(this.rootPath));
    config.decisions.push({ title, decision, rationale });
    this.save(config);
  }

  addRepo(name: string, repoPath: string, role?: string): void {
    const config = this.load() || this.init(path.basename(this.rootPath));
    const existing = config.repos.findIndex((r) => r.name === name);
    if (existing >= 0) {
      config.repos[existing] = { name, path: repoPath, role };
    } else {
      config.repos.push({ name, path: repoPath, role });
    }
    this.save(config);
  }

  private inferOrg(): string | undefined {
    try {
      const gitConfigPath = path.join(this.rootPath, '.git', 'config');
      const content = fs.readFileSync(gitConfigPath, 'utf-8');
      const match = content.match(/url\s*=\s*.*[:/]([^/]+)\//);
      if (match) return match[1];
    } catch {
      // no git config
    }
    return undefined;
  }
}
