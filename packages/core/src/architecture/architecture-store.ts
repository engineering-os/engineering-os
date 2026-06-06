import { ServiceModel, Pattern, Convention } from '@engineering-os/shared';
import { ArchitectureDiscovery } from './architecture-discovery';
import * as fs from 'fs/promises';
import * as path from 'path';
import { safeYamlLoad, safeYamlDump } from '../security';

export class ArchitectureStore {
  private servicesDir: string;
  private patternsDir: string;
  private conventionsDir: string;

  constructor(private basePath: string) {
    this.servicesDir = path.join(basePath, 'services');
    this.patternsDir = path.join(basePath, 'patterns');
    this.conventionsDir = path.join(basePath, 'conventions');
  }

  /**
   * Ensure all storage directories exist.
   */
  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.servicesDir, { recursive: true });
    await fs.mkdir(this.patternsDir, { recursive: true });
    await fs.mkdir(this.conventionsDir, { recursive: true });
  }

  /**
   * Save a service model as YAML.
   */
  async saveService(service: ServiceModel): Promise<void> {
    await fs.mkdir(this.servicesDir, { recursive: true });
    const fileName = this.slugify(service.name) + '.yaml';
    const filePath = path.join(this.servicesDir, fileName);
    const content = safeYamlDump(service);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Save a pattern as YAML.
   */
  async savePattern(pattern: Pattern): Promise<void> {
    await fs.mkdir(this.patternsDir, { recursive: true });
    const fileName = this.slugify(pattern.name) + '.yaml';
    const filePath = path.join(this.patternsDir, fileName);
    const content = safeYamlDump(pattern);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Save a convention as YAML.
   */
  async saveConvention(convention: Convention): Promise<void> {
    await fs.mkdir(this.conventionsDir, { recursive: true });
    const fileName = this.slugify(convention.name) + '.yaml';
    const filePath = path.join(this.conventionsDir, fileName);
    const content = safeYamlDump(convention);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Get all services.
   */
  async getServices(): Promise<ServiceModel[]> {
    return this.loadAll<ServiceModel>(this.servicesDir);
  }

  /**
   * Get a service by name.
   */
  async getService(name: string): Promise<ServiceModel | null> {
    const fileName = this.slugify(name) + '.yaml';
    const filePath = path.join(this.servicesDir, fileName);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return safeYamlLoad<ServiceModel>(content);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  /**
   * Get all patterns, optionally filtered by area.
   */
  async getPatterns(area?: string): Promise<Pattern[]> {
    const patterns = await this.loadAll<Pattern>(this.patternsDir);
    if (area) {
      return patterns.filter((p) => p.usage === area);
    }
    return patterns;
  }

  /**
   * Get all conventions.
   */
  async getConventions(): Promise<Convention[]> {
    return this.loadAll<Convention>(this.conventionsDir);
  }

  /**
   * Full architecture refresh: re-discover and save all architecture data.
   */
  async refresh(discovery: ArchitectureDiscovery): Promise<void> {
    await this.ensureDirs();

    // Discover and save services
    const services = await discovery.discoverServices();
    for (const service of services) {
      await this.saveService(service);
    }

    // Discover and save patterns
    const patterns = await discovery.discoverPatterns();
    for (const pattern of patterns) {
      await this.savePattern(pattern);
    }

    // Discover and save conventions
    const conventions = await discovery.inferConventions();
    for (const convention of conventions) {
      await this.saveConvention(convention);
    }
  }

  /**
   * Load all YAML files from a directory into typed objects.
   */
  private async loadAll<T>(dir: string): Promise<T[]> {
    try {
      const files = await fs.readdir(dir);
      const yamlFiles = files.filter((f) => f.endsWith('.yaml'));
      const results: T[] = [];

      for (const file of yamlFiles) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8');
        const obj = safeYamlLoad<T>(content);
        if (obj) {
          results.push(obj);
        }
      }

      return results;
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  /**
   * Convert a name to a filesystem-safe slug.
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
