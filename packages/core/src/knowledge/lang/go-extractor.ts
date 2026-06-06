import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';
import { findBlockEnd } from './typescript-extractor';

export class GoExtractor implements LanguageExtractor {
  language = 'go';
  extensions = ['.go'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    // Functions: func Name(...)
    const funcRegex = /^func\s+(\w+)\s*\(/gm;
    // Methods: func (receiver) Name(...)
    const methodRegex = /^func\s+\([^)]+\)\s+(\w+)\s*\(/gm;
    // Structs: type Name struct
    const structRegex = /^type\s+(\w+)\s+struct\b/gm;
    // Interfaces: type Name interface
    const interfaceRegex = /^type\s+(\w+)\s+interface\b/gm;

    this.matchAndAdd(funcRegex, content, lines, filePath, 'function', chunks);
    this.matchAndAdd(methodRegex, content, lines, filePath, 'method', chunks);
    this.matchAndAdd(structRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(interfaceRegex, content, lines, filePath, 'interface', chunks);

    return chunks;
  }

  extractImports(content: string): string[] {
    const imports: string[] = [];
    // Single import
    const singleImport = /^import\s+"([^"]+)"/gm;
    let match: RegExpExecArray | null;
    while ((match = singleImport.exec(content)) !== null) imports.push(match[1]);
    // Grouped imports
    const groupImport = /^import\s*\(([\s\S]*?)\)/gm;
    while ((match = groupImport.exec(content)) !== null) {
      const block = match[1];
      const lineImports = block.match(/"([^"]+)"/g);
      if (lineImports) {
        imports.push(...lineImports.map((l) => l.replace(/"/g, '')));
      }
    }
    return imports;
  }

  extractExports(content: string): string[] {
    // In Go, exported names start with uppercase
    const exports: string[] = [];
    const exportRegex = /^(?:func|type|var|const)\s+(?:\([^)]+\)\s+)?([A-Z]\w*)/gm;
    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(content)) !== null) exports.push(match[1]);
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
