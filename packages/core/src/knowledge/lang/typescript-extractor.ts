import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';

type ChunkType = 'function' | 'class' | 'interface' | 'module' | 'export' | 'method' | 'type';

export class TypeScriptExtractor implements LanguageExtractor {
  language = 'typescript';
  extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    const classRegex = /(?:export\s+)?class\s+(\w+)/g;
    const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g;
    const typeRegex = /(?:export\s+)?type\s+(\w+)\s*=/g;

    this.matchAndAdd(functionRegex, content, lines, filePath, 'function', chunks);
    this.matchAndAdd(classRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(interfaceRegex, content, lines, filePath, 'interface', chunks);
    this.matchAndAdd(typeRegex, content, lines, filePath, 'type', chunks);

    const methodPatternInClass = /^[ \t]+(?:(?:public|private|protected|static|async|readonly)\s+){0,5}(\w+)\s*\([^)]*\)/gm;
    let match: RegExpExecArray | null;
    while ((match = methodPatternInClass.exec(content)) !== null) {
      const name = match[1];
      if (['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name)) continue;
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
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) imports.push(match[1]);
    while ((match = requireRegex.exec(content)) !== null) imports.push(match[1]);
    return imports;
  }

  extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|interface|type|const|let|var|enum|async\s+function)\s+(\w+)/g;
    const namedExportRegex = /export\s*\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(content)) !== null) exports.push(match[1]);
    while ((match = namedExportRegex.exec(content)) !== null) {
      const names = match[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0].trim());
      exports.push(...names.filter((n) => n.length > 0));
    }
    return exports;
  }

  private matchAndAdd(regex: RegExp, content: string, lines: string[], filePath: string, type: ChunkType, chunks: CodeChunk[]): void {
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

export function findBlockEnd(lines: string[], startIdx: number): number {
  let braceCount = 0;
  let foundOpening = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') { braceCount++; foundOpening = true; }
      else if (ch === '}') {
        braceCount--;
        if (foundOpening && braceCount === 0) return i + 1;
      }
    }
  }

  return Math.min(startIdx + 10, lines.length);
}
