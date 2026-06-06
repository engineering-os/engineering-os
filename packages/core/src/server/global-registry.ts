import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { safeYamlLoad, safeYamlDump } from '../security';

export interface RegisteredRepo {
  name: string;
  path: string;
  lastInit: string;
}

interface RegistryData {
  repos: RegisteredRepo[];
}

export class GlobalRegistry {
  private readonly registryPath: string;

  constructor() {
    const eosDir = path.join(os.homedir(), '.eos');
    if (!fs.existsSync(eosDir)) {
      fs.mkdirSync(eosDir, { recursive: true });
    }
    this.registryPath = path.join(eosDir, 'repos.yaml');
  }

  list(): RegisteredRepo[] {
    const data = this.load();
    return data.repos;
  }

  register(name: string, repoPath: string): void {
    const data = this.load();
    const existing = data.repos.findIndex((r) => r.name === name);
    const entry: RegisteredRepo = {
      name,
      path: repoPath,
      lastInit: new Date().toISOString(),
    };

    if (existing >= 0) {
      data.repos[existing] = entry;
    } else {
      data.repos.push(entry);
    }

    this.save(data);
  }

  unregister(name: string): void {
    const data = this.load();
    data.repos = data.repos.filter((r) => r.name !== name);
    this.save(data);
  }

  getRegistryPath(): string {
    return this.registryPath;
  }

  validate(): { valid: RegisteredRepo[]; broken: RegisteredRepo[] } {
    const data = this.load();
    const valid: RegisteredRepo[] = [];
    const broken: RegisteredRepo[] = [];

    for (const repo of data.repos) {
      if (fs.existsSync(repo.path)) {
        valid.push(repo);
      } else {
        broken.push(repo);
      }
    }

    return { valid, broken };
  }

  private load(): RegistryData {
    if (!fs.existsSync(this.registryPath)) {
      return { repos: [] };
    }

    const content = fs.readFileSync(this.registryPath, 'utf-8');
    const parsed = safeYamlLoad<RegistryData>(content);

    if (!parsed || !Array.isArray(parsed.repos)) {
      return { repos: [] };
    }

    return parsed;
  }

  private save(data: RegistryData): void {
    const yamlContent = safeYamlDump(data);
    fs.writeFileSync(this.registryPath, yamlContent, 'utf-8');
  }
}
