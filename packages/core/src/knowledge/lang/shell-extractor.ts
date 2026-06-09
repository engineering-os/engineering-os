import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';

export class ShellExtractor implements LanguageExtractor {
  language = 'shell';
  extensions = ['.sh', '.bash', '.zsh'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    // function name() { ... } or function name { ... }
    const functionKeywordRegex = /^function\s+(\w+)\s*(?:\(\))?\s*\{?/gm;
    // name() { ... }
    const functionParenRegex = /^(\w+)\s*\(\)\s*\{?/gm;

    this.matchAndAdd(functionKeywordRegex, content, lines, filePath, 'function', chunks);

    let match: RegExpExecArray | null;
    while ((match = functionParenRegex.exec(content)) !== null) {
      const name = match[1];
      // Skip common shell keywords that precede ()
      if (['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'select', 'time'].includes(name)) continue;
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findShellBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      if (!chunks.some((c) => c.name === name && c.startLine === startLine)) {
        chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type: 'function', name });
      }
    }

    return chunks;
  }

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const sourceRegex = /^(?:source|\.) +['"]?([^'";\s#]+)['"]?/gm;
    let match: RegExpExecArray | null;
    while ((match = sourceRegex.exec(content)) !== null) imports.push(match[1]);
    return imports;
  }

  extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /^export\s+(?:declare\s+)?(?:-[fnrx]+\s+)?(\w+)/gm;
    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(content)) !== null) exports.push(match[1]);
    return exports;
  }

  private matchAndAdd(regex: RegExp, content: string, lines: string[], filePath: string, type: CodeChunk['type'], chunks: CodeChunk[]): void {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findShellBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type, name });
    }
  }

  private findShellBlockEnd(lines: string[], startIdx: number): number {
    let braceCount = 0;
    let foundOpening = false;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      // Strip comments before counting braces
      const code = line.replace(/#.*$/, '');
      for (const ch of code) {
        if (ch === '{') { braceCount++; foundOpening = true; }
        else if (ch === '}') {
          braceCount--;
          if (foundOpening && braceCount === 0) return i + 1;
        }
      }
    }

    return Math.min(startIdx + 10, lines.length);
  }
}
