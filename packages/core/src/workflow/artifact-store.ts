import { WorkflowArtifact } from '@engineering-os/shared';
import * as fs from 'fs/promises';
import * as path from 'path';
import { sanitizeSlug } from '../security';

export class ArtifactStore {
  constructor(private basePath: string) {} // .eos/features/

  /**
   * Save an artifact for a feature's stage. Manages versioning automatically.
   */
  async save(featureSlug: string, stage: string, content: string): Promise<WorkflowArtifact> {
    sanitizeSlug(featureSlug, 'featureSlug');
    sanitizeSlug(stage, 'stage');
    const featureDir = path.join(this.basePath, featureSlug);
    await fs.mkdir(featureDir, { recursive: true });

    // Determine version number
    const history = await this.getHistory(featureSlug, stage);
    const version = history.length + 1;

    // Save versioned copy
    const versionedPath = path.join(featureDir, `${stage}.v${version}.md`);
    await fs.writeFile(versionedPath, content, 'utf-8');

    // Save as latest
    const latestPath = path.join(featureDir, `${stage}.md`);
    await fs.writeFile(latestPath, content, 'utf-8');

    const artifact: WorkflowArtifact = {
      stage,
      path: latestPath,
      content,
      version,
      createdAt: new Date().toISOString(),
    };

    return artifact;
  }

  /**
   * Get the latest artifact for a given feature stage.
   */
  async get(featureSlug: string, stage: string): Promise<WorkflowArtifact | null> {
    sanitizeSlug(featureSlug, 'featureSlug');
    sanitizeSlug(stage, 'stage');
    const latestPath = path.join(this.basePath, featureSlug, `${stage}.md`);
    try {
      const content = await fs.readFile(latestPath, 'utf-8');
      const history = await this.getHistory(featureSlug, stage);
      const version = history.length > 0 ? history.length : 1;

      return {
        stage,
        path: latestPath,
        content,
        version,
        createdAt: await this.getFileCreatedAt(latestPath),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all artifacts for a feature (latest version of each stage).
   */
  async getAll(featureSlug: string): Promise<WorkflowArtifact[]> {
    const featureDir = path.join(this.basePath, featureSlug);
    try {
      const files = await fs.readdir(featureDir);
      const artifacts: WorkflowArtifact[] = [];

      // Get unique stage names from non-versioned files
      const latestFiles = files.filter(
        (f) => f.endsWith('.md') && !f.match(/\.v\d+\.md$/)
      );

      for (const file of latestFiles) {
        const stage = file.replace('.md', '');
        const artifact = await this.get(featureSlug, stage);
        if (artifact) {
          artifacts.push(artifact);
        }
      }

      return artifacts;
    } catch {
      return [];
    }
  }

  /**
   * Get all versions of an artifact for a given stage.
   */
  async getHistory(featureSlug: string, stage: string): Promise<WorkflowArtifact[]> {
    const featureDir = path.join(this.basePath, featureSlug);
    const artifacts: WorkflowArtifact[] = [];

    try {
      const files = await fs.readdir(featureDir);
      const versionedFiles = files
        .filter((f) => f.match(new RegExp(`^${this.escapeRegex(stage)}\\.v\\d+\\.md$`)))
        .sort((a, b) => {
          const vA = parseInt(a.match(/\.v(\d+)\.md$/)![1], 10);
          const vB = parseInt(b.match(/\.v(\d+)\.md$/)![1], 10);
          return vA - vB;
        });

      for (const file of versionedFiles) {
        const version = parseInt(file.match(/\.v(\d+)\.md$/)![1], 10);
        const filePath = path.join(featureDir, file);
        const content = await fs.readFile(filePath, 'utf-8');

        artifacts.push({
          stage,
          path: filePath,
          content,
          version,
          createdAt: await this.getFileCreatedAt(filePath),
        });
      }
    } catch {
      // Directory doesn't exist yet
    }

    return artifacts;
  }

  /**
   * Get file creation time as ISO string.
   */
  private async getFileCreatedAt(filePath: string): Promise<string> {
    try {
      const stat = await fs.stat(filePath);
      return stat.birthtime.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Escape special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
