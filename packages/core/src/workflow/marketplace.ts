import * as fs from 'fs/promises';
import * as path from 'path';
import { safeYamlLoad, safeYamlDump } from '../security';

export interface MarketplaceEntry {
  name: string;
  description: string;
  category: string;
  stages: number;
  author: string;
}

interface Registry {
  templates: MarketplaceEntry[];
}

export class WorkflowMarketplace {
  constructor(
    private workflowsDir: string,
    private registryPath: string
  ) {}

  async listTemplates(category?: string): Promise<MarketplaceEntry[]> {
    const registry = await this.loadRegistry();
    if (!registry) return [];
    if (category) {
      return registry.templates.filter((t) => t.category === category);
    }
    return registry.templates;
  }

  async getTemplate(name: string): Promise<string | null> {
    const filePath = path.join(this.workflowsDir, `${name}.yaml`);
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async installTemplate(name: string, yamlContent: string, metadata: Omit<MarketplaceEntry, 'name'>): Promise<void> {
    const filePath = path.join(this.workflowsDir, `${name}.yaml`);
    await fs.writeFile(filePath, yamlContent, 'utf-8');

    const registry = await this.loadRegistry() ?? { templates: [] };
    const existing = registry.templates.findIndex((t) => t.name === name);
    const entry: MarketplaceEntry = { name, ...metadata };

    if (existing >= 0) {
      registry.templates[existing] = entry;
    } else {
      registry.templates.push(entry);
    }

    await this.saveRegistry(registry);
  }

  async removeTemplate(name: string): Promise<boolean> {
    const builtIn = ['feature', 'bugfix', 'refactor', 'migration', 'security-review'];
    if (builtIn.includes(name)) return false;

    const filePath = path.join(this.workflowsDir, `${name}.yaml`);
    try {
      await fs.unlink(filePath);
    } catch {
      return false;
    }

    const registry = await this.loadRegistry();
    if (registry) {
      registry.templates = registry.templates.filter((t) => t.name !== name);
      await this.saveRegistry(registry);
    }
    return true;
  }

  async getCategories(): Promise<string[]> {
    const registry = await this.loadRegistry();
    if (!registry) return [];
    return [...new Set(registry.templates.map((t) => t.category))];
  }

  private async loadRegistry(): Promise<Registry | null> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      return safeYamlLoad<Registry>(content);
    } catch {
      return null;
    }
  }

  private async saveRegistry(registry: Registry): Promise<void> {
    const content = safeYamlDump(registry);
    await fs.writeFile(this.registryPath, content, 'utf-8');
  }
}
