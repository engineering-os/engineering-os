import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';
import { findBlockEnd } from './typescript-extractor';

export class KotlinExtractor implements LanguageExtractor {
  language = 'kotlin';
  extensions = ['.kt', '.kts'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    // Classes: class, data class, sealed class, abstract class, enum class, annotation class, inner class, open class
    const classRegex = /^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|protected|internal)\s+)?(?:data|sealed|abstract|enum|annotation|inner|open|value)\s+class\s+(\w+)/gm;
    const plainClassRegex = /^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|protected|internal)\s+)?class\s+(\w+)/gm;

    // Object declarations (singleton): object Singleton, companion object
    const objectRegex = /^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|protected|internal)\s+)?object\s+(\w+)/gm;

    // Interfaces: interface Repository, fun interface Callback
    const interfaceRegex = /^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|private|protected|internal)\s+)?(?:fun\s+)?interface\s+(\w+)/gm;

    // Top-level functions: fun doSomething(), suspend fun fetchData(), inline fun helper()
    const topLevelFunRegex = /^(?:@\w+(?:\([^)]*\))?\s*\n?)*(?:(?:public|private|protected|internal)\s+)?(?:inline|infix|operator|tailrec|suspend|actual|expect)\s+fun\s+(?:(?:<[^>]+>\s+)?(\w+(?:\.\w+)*))\s*[(<]/gm;
    const topLevelFunSimpleRegex = /^(?:@\w+(?:\([^)]*\))?\s*\n?)*(?:(?:public|private|protected|internal)\s+)?fun\s+(?:<[^>]+>\s+)?(\w+(?:\.\w+)*)\s*[(<]/gm;

    // Methods inside classes: indented functions
    const methodRegex = /^[ \t]+(?:@\w+(?:\([^)]*\))?\s*\n?[ \t]+)*(?:(?:public|private|protected|internal|override|open|final|abstract)\s+)*(?:inline|infix|operator|tailrec|suspend)?\s*fun\s+(?:<[^>]+>\s+)?(\w+(?:\.\w+)*)\s*[(<]/gm;

    // Companion objects
    const companionRegex = /^[ \t]+companion\s+object\s*(\w*)/gm;

    this.matchAndAdd(classRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAddExcluding(plainClassRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(objectRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(interfaceRegex, content, lines, filePath, 'interface', chunks);

    // Top-level functions (with modifier keywords like suspend, inline, etc.)
    this.matchFunctions(topLevelFunRegex, content, lines, filePath, 'function', chunks);
    // Top-level functions (simple fun keyword)
    this.matchFunctions(topLevelFunSimpleRegex, content, lines, filePath, 'function', chunks);

    // Methods inside classes
    this.matchMethods(methodRegex, content, lines, filePath, chunks);

    // Companion objects
    this.matchCompanionObjects(companionRegex, content, lines, filePath, chunks);

    // Import statements (mapped to 'module' type per CodeChunk union)
    const importRegex = /^import\s+(.+)/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const name = match[1].trim();
      const startLine = content.substring(0, match.index).split('\n').length;
      chunks.push({
        filePath,
        startLine,
        endLine: startLine,
        content: match[0],
        language: this.language,
        type: 'module',
        name,
      });
    }

    return this.deduplicateChunks(chunks);
  }

  extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /^import\s+(.+)/gm;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1].trim());
    }
    return imports;
  }

  extractExports(content: string): string[] {
    const exports: string[] = [];
    // Kotlin does not have explicit export keywords; public declarations are accessible.
    // Treat top-level public classes, interfaces, objects, and functions as exports.
    const publicClassRegex = /^(?:(?:public|internal)\s+)?(?:data|sealed|abstract|enum|annotation|open|value)?\s*class\s+(\w+)/gm;
    const publicInterfaceRegex = /^(?:(?:public|internal)\s+)?(?:fun\s+)?interface\s+(\w+)/gm;
    const publicObjectRegex = /^(?:(?:public|internal)\s+)?object\s+(\w+)/gm;
    const publicFunRegex = /^(?:(?:public|internal)\s+)?(?:inline|infix|operator|tailrec|suspend)?\s*fun\s+(?:<[^>]+>\s+)?(\w+)/gm;

    let match: RegExpExecArray | null;
    while ((match = publicClassRegex.exec(content)) !== null) exports.push(match[1]);
    while ((match = publicInterfaceRegex.exec(content)) !== null) exports.push(match[1]);
    while ((match = publicObjectRegex.exec(content)) !== null) exports.push(match[1]);
    while ((match = publicFunRegex.exec(content)) !== null) exports.push(match[1]);

    return Array.from(new Set(exports));
  }

  private matchAndAdd(
    regex: RegExp,
    content: string,
    lines: string[],
    filePath: string,
    type: CodeChunk['type'],
    chunks: CodeChunk[],
  ): void {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = findBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type, name });
    }
  }

  private matchAndAddExcluding(
    regex: RegExp,
    content: string,
    lines: string[],
    filePath: string,
    type: CodeChunk['type'],
    chunks: CodeChunk[],
  ): void {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      // Skip if already captured by the more specific class regex
      if (chunks.some((c) => c.name === name && c.startLine === startLine)) continue;
      const endLine = findBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type, name });
    }
  }

  private matchFunctions(
    regex: RegExp,
    content: string,
    lines: string[],
    filePath: string,
    type: CodeChunk['type'],
    chunks: CodeChunk[],
  ): void {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      if (!name) continue;
      const startLine = content.substring(0, match.index).split('\n').length;
      // Skip if already captured
      if (chunks.some((c) => c.name === name && c.startLine === startLine)) continue;
      const endLine = this.findFunctionEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type, name });
    }
  }

  private matchMethods(
    regex: RegExp,
    content: string,
    lines: string[],
    filePath: string,
    chunks: CodeChunk[],
  ): void {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      if (!name) continue;
      if (['if', 'for', 'while', 'when', 'catch', 'return', 'throw'].includes(name)) continue;
      const startLine = content.substring(0, match.index).split('\n').length;
      // Skip if already captured as a top-level function
      if (chunks.some((c) => c.name === name && c.startLine === startLine)) continue;
      const endLine = this.findFunctionEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type: 'method', name });
    }
  }

  private matchCompanionObjects(
    regex: RegExp,
    content: string,
    lines: string[],
    filePath: string,
    chunks: CodeChunk[],
  ): void {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1] || 'Companion';
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = findBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type: 'class', name });
    }
  }

  /**
   * Find the end of a Kotlin function. Handles both block bodies (with braces)
   * and expression bodies (single-line with `=`).
   */
  private findFunctionEnd(lines: string[], startIdx: number): number {
    let braceCount = 0;
    let foundOpening = false;
    let foundEquals = false;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];

      // Check for expression body (fun foo() = expr)
      if (!foundOpening && !foundEquals) {
        const trimmed = line.replace(/\/\/.*$/, '').trim();
        // Detect expression body: line contains = but no opening brace after it
        if (/=\s*[^{]/.test(trimmed) && !trimmed.includes('{')) {
          foundEquals = true;
        }
      }

      for (const ch of line) {
        if (ch === '{') { braceCount++; foundOpening = true; }
        else if (ch === '}') {
          braceCount--;
          if (foundOpening && braceCount === 0) return i + 1;
        }
      }

      // For expression bodies without braces, the function ends at the current line
      // unless the expression continues (trailing operator or unclosed parens)
      if (foundEquals && !foundOpening && i > startIdx) {
        const trimmed = lines[i].replace(/\/\/.*$/, '').trimEnd();
        const continues = /[,+\-*/|&]$/.test(trimmed) || /\($/.test(trimmed);
        if (!continues) return i + 1;
      }
    }

    // If no brace-delimited block found, return a reasonable default
    if (foundEquals) return Math.min(startIdx + 5, lines.length);
    return Math.min(startIdx + 10, lines.length);
  }

  /**
   * Remove duplicate chunks (same name and startLine).
   */
  private deduplicateChunks(chunks: CodeChunk[]): CodeChunk[] {
    const seen = new Set<string>();
    return chunks.filter((chunk) => {
      const key = `${chunk.name}:${chunk.startLine}:${chunk.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
