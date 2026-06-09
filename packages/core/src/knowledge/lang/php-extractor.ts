import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';
import { findBlockEnd } from './typescript-extractor';

export class PhpExtractor implements LanguageExtractor {
  language = 'php';
  extensions = ['.php'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    const classRegex = /^(?:\s*)(?:abstract|final)?\s*class\s+(\w+)/gm;
    const interfaceRegex = /^(?:\s*)interface\s+(\w+)/gm;
    const traitRegex = /^(?:\s*)trait\s+(\w+)/gm;
    const enumRegex = /^(?:\s*)enum\s+(\w+)/gm;
    const functionRegex = /^function\s+(\w+)\s*\(/gm;
    const methodRegex = /^[ \t]+(?:public|private|protected)?\s*(?:static)?\s*function\s+(\w+)\s*\(/gm;

    this.matchAndAdd(classRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(interfaceRegex, content, lines, filePath, 'interface', chunks);
    this.matchAndAdd(traitRegex, content, lines, filePath, 'module', chunks);
    this.matchAndAdd(enumRegex, content, lines, filePath, 'type', chunks);
    this.matchAndAdd(functionRegex, content, lines, filePath, 'function', chunks);

    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(content)) !== null) {
      const name = match[1];
      if (['if', 'for', 'foreach', 'while', 'switch', 'catch'].includes(name)) continue;
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
    const useRegex = /^use\s+([^;]+);/gm;
    const requireRegex = /(?:require|require_once|include|include_once)\s+['"]([^'"]+)['"]/gm;
    let match: RegExpExecArray | null;
    while ((match = useRegex.exec(content)) !== null) imports.push(match[1].trim());
    while ((match = requireRegex.exec(content)) !== null) imports.push(match[1]);
    return imports;
  }

  extractExports(content: string): string[] {
    const exports: string[] = [];
    const namespaceRegex = /^namespace\s+([^;{]+)/gm;
    const publicClassRegex = /^(?:\s*)(?:abstract|final)?\s*class\s+(\w+)/gm;
    let match: RegExpExecArray | null;
    while ((match = namespaceRegex.exec(content)) !== null) exports.push(match[1].trim());
    while ((match = publicClassRegex.exec(content)) !== null) exports.push(match[1]);
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
