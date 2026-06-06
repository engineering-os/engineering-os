import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface KnowledgeArchive {
  version: string;
  exportedAt: string;
  sourceRepo: string;
  sections: {
    decisions: any[];
    architecture: any[];
    patterns: any[];
    conventions: any[];
    security: any[];
    team: any | null;
  };
  metadata: {
    totalFiles: number;
    exportSize: number;
  };
}

export class KnowledgeExporter {
  constructor(private eosDir: string) {}

  async export(repoName?: string): Promise<KnowledgeArchive> {
    const sections = {
      decisions: this.loadYamlDir(path.join(this.eosDir, 'knowledge', 'decisions')),
      architecture: this.loadYamlDir(path.join(this.eosDir, 'knowledge', 'architecture')),
      patterns: this.loadYamlDir(path.join(this.eosDir, 'knowledge', 'patterns')),
      conventions: this.loadYamlDir(path.join(this.eosDir, 'knowledge', 'conventions')),
      security: this.loadYamlDir(path.join(this.eosDir, 'knowledge', 'security')),
      team: this.loadYamlFile(path.join(this.eosDir, 'team', 'manifest.yaml')),
    };

    const totalFiles = Object.values(sections)
      .reduce((sum, s) => sum + (Array.isArray(s) ? s.length : s ? 1 : 0), 0);

    const archive: KnowledgeArchive = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      sourceRepo: repoName || path.basename(path.dirname(this.eosDir)),
      sections,
      metadata: {
        totalFiles,
        exportSize: 0,
      },
    };

    const json = JSON.stringify(archive, null, 2);
    archive.metadata.exportSize = Buffer.byteLength(json, 'utf-8');

    return archive;
  }

  async exportToFile(outputPath: string, repoName?: string): Promise<string> {
    const archive = await this.export(repoName);
    const json = JSON.stringify(archive, null, 2);

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, json, 'utf-8');
    return outputPath;
  }

  private loadYamlDir(dirPath: string): any[] {
    if (!fs.existsSync(dirPath)) return [];

    const results: any[] = [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.yaml' || ext === '.yml') {
          const content = this.loadYamlFile(path.join(dirPath, entry.name));
          if (content) results.push({ fileName: entry.name, ...content });
        } else if (ext === '.json') {
          const content = this.loadJsonFile(path.join(dirPath, entry.name));
          if (content) results.push({ fileName: entry.name, ...content });
        }
      }
    } catch {
      // Directory not readable
    }
    return results;
  }

  private loadYamlFile(filePath: string): any | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return yaml.load(content);
    } catch {
      return null;
    }
  }

  private loadJsonFile(filePath: string): any | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
