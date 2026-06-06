import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';

export class RubyExtractor implements LanguageExtractor {
  language = 'ruby';
  extensions = ['.rb'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    const defRegex = /^\s*def\s+(?:self\.)?(\w+[?!]?)/gm;
    const classRegex = /^\s*class\s+(\w+)/gm;
    const moduleRegex = /^\s*module\s+(\w+)/gm;

    this.matchAndAdd(defRegex, content, lines, filePath, 'function', chunks);
    this.matchAndAdd(classRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(moduleRegex, content, lines, filePath, 'module', chunks);

    return chunks;
  }

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const requireRegex = /^require(?:_relative)?\s+['"]([^'"]+)['"]/gm;
    let match: RegExpExecArray | null;
    while ((match = requireRegex.exec(content)) !== null) imports.push(match[1]);
    return imports;
  }

  extractExports(content: string): string[] {
    // Ruby doesn't have explicit exports; public methods are accessible
    return [];
  }

  private matchAndAdd(regex: RegExp, content: string, lines: string[], filePath: string, type: CodeChunk['type'], chunks: CodeChunk[]): void {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findRubyBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type, name });
    }
  }

  private findRubyBlockEnd(lines: string[], startIdx: number): number {
    let depth = 0;
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^(?:def|class|module|if|unless|while|until|for|do|begin|case)\b/.test(line) || line.endsWith(' do')) {
        depth++;
      }
      if (line === 'end' || line.startsWith('end ') || line.startsWith('end;')) {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return Math.min(startIdx + 10, lines.length);
  }
}
