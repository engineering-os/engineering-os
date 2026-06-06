import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';
import { findBlockEnd } from './typescript-extractor';

export class JavaExtractor implements LanguageExtractor {
  language = 'java';
  extensions = ['.java'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    const classRegex = /^(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+(\w+)/gm;
    const interfaceRegex = /^(?:public|private|protected)?\s*interface\s+(\w+)/gm;
    const enumRegex = /^(?:public|private|protected)?\s*enum\s+(\w+)/gm;
    const methodRegex = /^[ \t]+(?:public|private|protected)?\s*(?:static)?\s*(?:abstract)?\s*(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/gm;

    this.matchAndAdd(classRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(interfaceRegex, content, lines, filePath, 'interface', chunks);
    this.matchAndAdd(enumRegex, content, lines, filePath, 'type', chunks);

    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(content)) !== null) {
      const name = match[1];
      if (['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(name)) continue;
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = findBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      if (!chunks.some((c) => c.name === name && c.startLine === startLine)) {
        chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type: 'method', name });
      }
    }

    return chunks;
  }

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /^import\s+(?:static\s+)?([^;]+);/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) imports.push(match[1].trim());
    return imports;
  }

  extractExports(content: string): string[] {
    const exports: string[] = [];
    const publicRegex = /^public\s+(?:class|interface|enum)\s+(\w+)/gm;
    let match: RegExpExecArray | null;
    while ((match = publicRegex.exec(content)) !== null) exports.push(match[1]);
    return exports;
  }

  private matchAndAdd(regex: RegExp, content: string, lines: string[], filePath: string, type: CodeChunk['type'], chunks: CodeChunk[]): void {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = findBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type, name });
    }
  }
}
