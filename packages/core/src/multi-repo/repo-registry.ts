import * as fs from 'fs/promises';
import * as path from 'path';
import { LinkedRepo } from '@engineering-os/shared';
import { safeYamlLoad, safeYamlDump } from '../security';

export class RepoRegistry {
  private configPath: string;

  constructor(private eosDir: string) {
    this.configPath = path.join(eosDir, 'multi-repo.yaml');
  }

  async getLinkedRepos(): Promise<LinkedRepo[]> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const config = safeYamlLoad<{ repos: LinkedRepo[] }>(content);
      return config?.repos ?? [];
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async linkRepo(repo: LinkedRepo): Promise<void> {
    const repos = await this.getLinkedRepos();
    const existing = repos.findIndex((r) => r.name === repo.name);
    if (existing >= 0) {
      repos[existing] = repo;
    } else {
      repos.push(repo);
    }
    await this.save(repos);
  }

  async unlinkRepo(name: string): Promise<boolean> {
    const repos = await this.getLinkedRepos();
    const filtered = repos.filter((r) => r.name !== name);
    if (filtered.length === repos.length) return false;
    await this.save(filtered);
    return true;
  }

  async validateLinks(): Promise<{ valid: LinkedRepo[]; broken: LinkedRepo[] }> {
    const repos = await this.getLinkedRepos();
    const valid: LinkedRepo[] = [];
    const broken: LinkedRepo[] = [];

    for (const repo of repos) {
      try {
        await fs.access(path.join(repo.eosDir, 'index', 'metadata.db'));
        valid.push(repo);
      } catch {
        broken.push(repo);
      }
    }

    return { valid, broken };
  }

  private async save(repos: LinkedRepo[]): Promise<void> {
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    const content = safeYamlDump({ repos });
    await fs.writeFile(this.configPath, content, 'utf-8');
  }
}
