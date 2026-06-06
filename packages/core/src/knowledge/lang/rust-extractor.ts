import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';
import { findBlockEnd } from './typescript-extractor';

export class RustExtractor implements LanguageExtractor {
  language = 'rust';
  extensions = ['.rs'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    const fnRegex = /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm;
    const structRegex = /^(?:pub\s+)?struct\s+(\w+)/gm;
    const enumRegex = /^(?:pub\s+)?enum\s+(\w+)/gm;
    const traitRegex = /^(?:pub\s+)?trait\s+(\w+)/gm;
    const implRegex = /^impl(?:<[^>]+>)?\s+(\w+)/gm;

    this.matchAndAdd(fnRegex, content, lines, filePath, 'function', chunks);
    this.matchAndAdd(structRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(enumRegex, content, lines, filePath, 'type', chunks);
    this.matchAndAdd(traitRegex, content, lines, filePath, 'interface', chunks);
    this.matchAndAdd(implRegex, content, lines, filePath, 'module', chunks);

    return chunks;
  }

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const useRegex = /^use\s+([^;]+);/gm;
    let match: RegExpExecArray | null;
    while ((match = useRegex.exec(content)) !== null) imports.push(match[1].trim());
    return imports;
  }

  extractExports(content: string): string[] {
    const exports: string[] = [];
    const pubRegex = /^pub\s+(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/gm;
    let match: RegExpExecArray | null;
    while ((match = pubRegex.exec(content)) !== null) exports.push(match[1]);
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
