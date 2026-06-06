import * as fs from 'fs/promises';
import * as path from 'path';
import { TeamManifest, ConventionEntry, PatternEntry, SecurityPolicyEntry } from '@engineering-os/shared';
import { safeYamlLoad, safeYamlDump } from '../security';

export class TeamSync {
  private manifestPath: string;

  constructor(private eosDir: string) {
    this.manifestPath = path.join(eosDir, 'team', 'manifest.yaml');
  }

  async getManifest(): Promise<TeamManifest | null> {
    try {
      const content = await fs.readFile(this.manifestPath, 'utf-8');
      return safeYamlLoad<TeamManifest>(content);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async initManifest(team: string): Promise<TeamManifest> {
    const manifest: TeamManifest = {
      version: '1.0',
      team,
      lastUpdated: new Date().toISOString(),
      conventions: [],
      patterns: [],
      securityPolicies: [],
    };
    await this.saveManifest(manifest);
    return manifest;
  }

  async addConvention(entry: Omit<ConventionEntry, 'id'>): Promise<ConventionEntry> {
    const manifest = await this.getOrCreateManifest();
    const id = `CONV-${String(manifest.conventions.length + 1).padStart(3, '0')}`;
    const convention: ConventionEntry = { id, ...entry };
    manifest.conventions.push(convention);
    await this.saveManifest(manifest);
    return convention;
  }

  async removeConvention(id: string): Promise<boolean> {
    const manifest = await this.getOrCreateManifest();
    const before = manifest.conventions.length;
    manifest.conventions = manifest.conventions.filter((c) => c.id !== id);
    if (manifest.conventions.length === before) return false;
    await this.saveManifest(manifest);
    return true;
  }

  async addPattern(entry: Omit<PatternEntry, 'id'>): Promise<PatternEntry> {
    const manifest = await this.getOrCreateManifest();
    const id = `PAT-${String(manifest.patterns.length + 1).padStart(3, '0')}`;
    const pattern: PatternEntry = { id, ...entry };
    manifest.patterns.push(pattern);
    await this.saveManifest(manifest);
    return pattern;
  }

  async removePattern(id: string): Promise<boolean> {
    const manifest = await this.getOrCreateManifest();
    const before = manifest.patterns.length;
    manifest.patterns = manifest.patterns.filter((p) => p.id !== id);
    if (manifest.patterns.length === before) return false;
    await this.saveManifest(manifest);
    return true;
  }

  async addSecurityPolicy(entry: Omit<SecurityPolicyEntry, 'id'>): Promise<SecurityPolicyEntry> {
    const manifest = await this.getOrCreateManifest();
    const id = `SEC-${String(manifest.securityPolicies.length + 1).padStart(3, '0')}`;
    const policy: SecurityPolicyEntry = { id, ...entry };
    manifest.securityPolicies.push(policy);
    await this.saveManifest(manifest);
    return policy;
  }

  async getEnforcedConventions(): Promise<ConventionEntry[]> {
    const manifest = await this.getManifest();
    if (!manifest) return [];
    return manifest.conventions.filter((c) => c.enforced);
  }

  async getEnforcedPolicies(): Promise<SecurityPolicyEntry[]> {
    const manifest = await this.getManifest();
    if (!manifest) return [];
    return manifest.securityPolicies.filter((p) => p.enforced);
  }

  async syncFrom(remotePath: string): Promise<{ added: number; updated: number }> {
    const remoteManifestPath = path.join(remotePath, 'team', 'manifest.yaml');
    let remoteContent: string;
    try {
      remoteContent = await fs.readFile(remoteManifestPath, 'utf-8');
    } catch {
      return { added: 0, updated: 0 };
    }

    const remote = safeYamlLoad<TeamManifest>(remoteContent);
    if (!remote) return { added: 0, updated: 0 };

    const local = await this.getOrCreateManifest();
    let added = 0;
    let updated = 0;

    for (const conv of remote.conventions) {
      const existing = local.conventions.find((c) => c.id === conv.id);
      if (!existing) {
        local.conventions.push(conv);
        added++;
      } else if (conv.addedAt && existing.addedAt && conv.addedAt > existing.addedAt) {
        Object.assign(existing, conv);
        updated++;
      }
    }

    for (const pat of remote.patterns) {
      const existing = local.patterns.find((p) => p.id === pat.id);
      if (!existing) {
        local.patterns.push(pat);
        added++;
      } else if (pat.addedAt && existing.addedAt && pat.addedAt > existing.addedAt) {
        Object.assign(existing, pat);
        updated++;
      }
    }

    for (const pol of remote.securityPolicies) {
      const existing = local.securityPolicies.find((p) => p.id === pol.id);
      if (!existing) {
        local.securityPolicies.push(pol);
        added++;
      }
    }

    await this.saveManifest(local);
    return { added, updated };
  }

  private async getOrCreateManifest(): Promise<TeamManifest> {
    const existing = await this.getManifest();
    if (existing) return existing;
    return this.initManifest('default');
  }

  private async saveManifest(manifest: TeamManifest): Promise<void> {
    manifest.lastUpdated = new Date().toISOString();
    const dir = path.dirname(this.manifestPath);
    await fs.mkdir(dir, { recursive: true });
    const content = safeYamlDump(manifest);
    await fs.writeFile(this.manifestPath, content, 'utf-8');
  }
}
