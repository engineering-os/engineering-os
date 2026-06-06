import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';

export class PythonExtractor implements LanguageExtractor {
  language = 'python';
  extensions = ['.py'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    const functionRegex = /^(?:async\s+)?def\s+(\w+)/gm;
    const classRegex = /^class\s+(\w+)/gm;

    this.matchAndAdd(functionRegex, content, lines, filePath, 'function', chunks);
    this.matchAndAdd(classRegex, content, lines, filePath, 'class', chunks);

    return chunks;
  }

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const pyImportRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
    let match: RegExpExecArray | null;
    while ((match = pyImportRegex.exec(content)) !== null) {
      imports.push(match[1] || match[2]);
    }
    return imports;
  }

  extractExports(content: string): string[] {
    const exports: string[] = [];
    const allRegex = /__all__\s*=\s*\[([^\]]+)\]/;
    const match = allRegex.exec(content);
    if (match) {
      const names = match[1].split(',').map((n) => n.trim().replace(/['"]/g, ''));
      exports.push(...names.filter((n) => n.length > 0));
    }
    return exports;
  }

  private matchAndAdd(regex: RegExp, content: string, lines: string[], filePath: string, type: 'function' | 'class', chunks: CodeChunk[]): void {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findPythonBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type, name });
    }
  }

  private findPythonBlockEnd(lines: string[], startIdx: number): number {
    const startIndent = lines[startIdx].search(/\S/);
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const indent = line.search(/\S/);
      if (indent <= startIndent) return i;
    }
    return lines.length;
  }
}
