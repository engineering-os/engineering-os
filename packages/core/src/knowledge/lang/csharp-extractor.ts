import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';
import { findBlockEnd } from './typescript-extractor';

export class CSharpExtractor implements LanguageExtractor {
  language = 'csharp';
  extensions = ['.cs'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    const classRegex = /^(?:\s*)(?:public|private|protected|internal)?\s*(?:static|abstract|sealed|partial)?\s*(?:static|abstract|sealed|partial)?\s*class\s+(\w+)/gm;
    const interfaceRegex = /^(?:\s*)(?:public|private|protected|internal)?\s*interface\s+(\w+)/gm;
    const enumRegex = /^(?:\s*)(?:public|private|protected|internal)?\s*enum\s+(\w+)/gm;
    const structRegex = /^(?:\s*)(?:public|private|protected|internal)?\s*(?:readonly)?\s*struct\s+(\w+)/gm;
    const recordRegex = /^(?:\s*)(?:public|private|protected|internal)?\s*(?:sealed|abstract)?\s*record\s+(?:struct\s+|class\s+)?(\w+)/gm;
    const methodRegex = /^[ \t]+(?:public|private|protected|internal)?\s*(?:static|virtual|override|abstract|async)?\s*(?:static|virtual|override|abstract|async)?\s*(?:\w+(?:<[^>]+>)?(?:\?|\[\])?)\s+(\w+)\s*\(/gm;

    this.matchAndAdd(classRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(interfaceRegex, content, lines, filePath, 'interface', chunks);
    this.matchAndAdd(enumRegex, content, lines, filePath, 'type', chunks);
    this.matchAndAdd(structRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(recordRegex, content, lines, filePath, 'class', chunks);

    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(content)) !== null) {
      const name = match[1];
      if (['if', 'for', 'foreach', 'while', 'switch', 'catch', 'return', 'new', 'else', 'lock', 'using', 'throw'].includes(name)) continue;
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
    const usingRegex = /^using\s+(?:static\s+)?([^;=]+);/gm;
    let match: RegExpExecArray | null;
    while ((match = usingRegex.exec(content)) !== null) imports.push(match[1].trim());
    return imports;
  }

  extractExports(content: string): string[] {
    const exports: string[] = [];
    const publicRegex = /^(?:\s*)public\s+(?:static\s+|abstract\s+|sealed\s+|partial\s+)*(?:class|interface|enum|struct|record)\s+(\w+)/gm;
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
