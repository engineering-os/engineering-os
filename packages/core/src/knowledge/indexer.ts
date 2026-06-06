import fg from 'fast-glob';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CodeChunk, IndexedFile } from '@engineering-os/shared';
import { validateContainedPath, validateFileSize } from '../security';
import { getExtractorForFile, getSupportedExtensions } from './lang';

export class RepositoryIndexer {
  constructor(private rootPath: string) {}

  async indexAll(options?: { paths?: string[]; force?: boolean }): Promise<IndexedFile[]> {
    const files = options?.paths ?? await this.walkDirectory(this.rootPath);

    if (options?.paths) {
      for (const p of options.paths) {
        validateContainedPath(this.rootPath, p);
      }
    }

    const results: IndexedFile[] = [];

    for (const filePath of files) {
      const extractor = getExtractorForFile(filePath);
      if (!extractor) continue;

      try {
        const indexed = await this.indexFile(filePath);
        results.push(indexed);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to index ${filePath}: ${message}`);
      }
    }

    return results;
  }

  async indexFile(filePath: string): Promise<IndexedFile> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.rootPath, filePath);

    const extractor = getExtractorForFile(absolutePath);
    if (!extractor) {
      throw new Error(`Unsupported file type: ${absolutePath}`);
    }

    await validateFileSize(absolutePath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    const stat = await fs.stat(absolutePath);
    const lines = content.split('\n');

    const chunks = extractor.extractChunks(content, lines, absolutePath);
    const imports = extractor.extractImports(content);
    const exports = extractor.extractExports(content);

    return {
      filePath: absolutePath,
      language: extractor.language,
      lastModified: stat.mtime.toISOString(),
      chunks,
      imports,
      exports,
    };
  }

  getSupportedLanguages(): string[] {
    return ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'ruby'];
  }

  async walkDirectory(dir: string): Promise<string[]> {
    const ignorePatterns = await this.loadIgnorePatterns();
    const extensions = getSupportedExtensions().map((ext) => ext.slice(1));
    const pattern = `**/*.{${extensions.join(',')}}`;

    const files = await fg(pattern, {
      cwd: dir,
      absolute: true,
      ignore: ignorePatterns,
      dot: false,
    });

    return files;
  }

  private async loadIgnorePatterns(): Promise<string[]> {
    const defaults = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.eos/**'];

    try {
      const gitignorePath = path.join(this.rootPath, '.gitignore');
      const content = await fs.readFile(gitignorePath, 'utf-8');
      const patterns = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((pattern) => {
          if (pattern.startsWith('/')) {
            return pattern.slice(1);
          }
          return `**/${pattern}`;
        });

      return [...defaults, ...patterns];
    } catch {
      return defaults;
    }
  }
}
