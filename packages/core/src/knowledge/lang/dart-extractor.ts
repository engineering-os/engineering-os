import { CodeChunk } from '@engineering-os/shared';
import { LanguageExtractor } from './index';
import { findBlockEnd } from './typescript-extractor';

// Keywords that share the `name(...)` shape but are not declarations.
// Also includes common debug-log calls (log/print/debugPrint): bare `log('x');`
// is shape-identical to a typeless abstract decl, so it's filtered by name.
const NON_DECLARATION_NAMES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'assert', 'do',
  'else', 'yield', 'await', 'final', 'const', 'var', 'new', 'super', 'this',
  'sync', 'async',
  'log', 'print', 'debugPrint',
]);

export class DartExtractor implements LanguageExtractor {
  language = 'dart';
  extensions = ['.dart'];

  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    // Mixins: mixin Name, base mixin Foo, mixin class Bar
    // Runs before class regexes so `mixin class` is tagged 'module' before dedup.
    const mixinRegex = /^[ \t]*(?:base\s+)?mixin(?:\s+class)?\s+([\w$]+)/gm;

    // Enums: plain and Dart 2.17+ enhanced enums with members/methods.
    const enumRegex = /^[ \t]*enum\s+([\w$]+)/gm;

    // Named extensions: extension Name on Type (anonymous `extension on X` skipped).
    const extensionRegex = /^[ \t]*extension\s+([\w$]+)\s+on\s+/gm;

    // Extension types (Dart 3.3+): extension type Name(Type value)
    const extensionTypeRegex = /^[ \t]*extension\s+type\s+(?:const\s+)?([\w$]+)/gm;

    // Modified classes: abstract/base/final/sealed/interface/mixin class Name
    const modifiedClassRegex =
      /^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:abstract|base|final|sealed|interface|mixin)\s+)+class\s+([\w$]+)/gm;
    // Plain classes: class Name — dedup helper skips already-matched modified/mixin classes.
    const plainClassRegex = /^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*class\s+([\w$]+)/gm;

    // Top-level functions: keyword-less `name(params) { / =>`.
    // Negative lookahead excludes declaration keywords that share the shape.
    const topLevelFnRegex =
      /^(?!\s*(?:class|enum|extension|mixin|typedef|import|export|part|abstract|base|final|sealed|interface)\b)(?:@\w+(?:\([^)]*\))?\s*\n?)*(?:[\w$.<>,?\[\] ]+\s+)?([\w$]+)\s*\([^;{]*\)\s*(?:async\*?|sync\*)?\s*(?:=>|\{)/gm;

    // Methods: indented, same keyword-less shape; trailing `;` covers abstract declarations.
    // Leading negative lookahead rejects statement keywords (throw/return/await/...) so call
    // and throw statements — `throw X(...);`, `log(...);`, `await F().m(...)` — aren't mistaken
    // for declarations. The captured name lives in the prefix-eaten region, so NON_DECLARATION_NAMES
    // alone can't catch these; the lookahead must block the whole line at the indent.
    const methodRegex =
      /^[ \t]+(?![ \t]*(?:return|throw|await|yield|if|for|while|switch|assert|else)\b)(?:@\w+(?:\([^)]*\))?\s*\n?[ \t]*)*(?:(?:static|final|const|late|external|abstract|covariant)\s+)*(?:[\w$.<>,?\[\] ]+\s+)?([\w$]+)\s*\([^;{]*\)\s*(?:async\*?|sync\*)?\s*(?:=>|\{|;)/gm;

    // Getters: `Type get name => / {` — no parameter list, so methodRegex won't match.
    const getterRegex =
      /^[ \t]+(?:@\w+(?:\([^)]*\))?\s*\n?[ \t]*)*(?:[\w$.<>,?\[\] ]+\s+)?get\s+([\w$]+)\s*(?:=>|\{)/gm;

    this.matchAndAdd(mixinRegex, content, lines, filePath, 'module', chunks);
    this.matchAndAdd(enumRegex, content, lines, filePath, 'type', chunks);
    this.matchAndAdd(extensionRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAdd(extensionTypeRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAddExcluding(modifiedClassRegex, content, lines, filePath, 'class', chunks);
    this.matchAndAddExcluding(plainClassRegex, content, lines, filePath, 'class', chunks);

    this.matchShaped(topLevelFnRegex, content, lines, filePath, 'function', chunks);
    this.matchShaped(methodRegex, content, lines, filePath, 'method', chunks);
    this.matchShaped(getterRegex, content, lines, filePath, 'method', chunks);

    // Directives: import, export, part
    const directiveRegex = /^\s*(?:import|export|part)\s+(['"])(.+?)\1/gm;
    let match: RegExpExecArray | null;
    while ((match = directiveRegex.exec(content)) !== null) {
      const name = match[2];
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
    const directiveRegex = /^\s*(?:import|export|part)\s+(['"])(.+?)\1/gm;
    let match: RegExpExecArray | null;
    while ((match = directiveRegex.exec(content)) !== null) {
      imports.push(match[2]);
    }
    return imports;
  }

  extractExports(content: string): string[] {
    const exports: string[] = [];

    // Explicit re-exports: export 'src/foo.dart';
    const exportRegex = /^\s*export\s+(['"])(.+?)\1/gm;
    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(content)) !== null) exports.push(match[2]);

    // Leading underscore = library-private; everything else is public surface.
    const declRegexes = [
      /^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:abstract|base|final|sealed|interface|mixin)\s+)*class\s+([\w$]+)/gm,
      /^[ \t]*(?:base\s+)?mixin(?:\s+class)?\s+([\w$]+)/gm,
      /^[ \t]*enum\s+([\w$]+)/gm,
      /^[ \t]*extension\s+([\w$]+)\s+on\s+/gm,
      /^[ \t]*extension\s+type\s+(?:const\s+)?([\w$]+)/gm,
      /^(?!\s*(?:class|enum|extension|mixin|typedef|abstract|base|final|sealed|interface)\b)(?:[\w$.<>,?\[\] ]+\s+)?([\w$]+)\s*\([^;{]*\)\s*(?:async\*?|sync\*)?\s*(?:=>|\{)/gm,
    ];
    for (const regex of declRegexes) {
      while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        if (name && !name.startsWith('_') && !NON_DECLARATION_NAMES.has(name)) {
          exports.push(name);
        }
      }
    }

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
      // Skip if already captured by a more specific regex.
      if (chunks.some((c) => c.name === name && c.startLine === startLine)) continue;
      const endLine = findBlockEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type, name });
    }
  }

  // Keyword-less declarations: skips NON_DECLARATION_NAMES and already-captured chunks.
  private matchShaped(
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
      if (!name || NON_DECLARATION_NAMES.has(name)) continue;
      const startLine = content.substring(0, match.index).split('\n').length;
      if (chunks.some((c) => c.name === name && c.startLine === startLine)) continue;
      const endLine = this.findFunctionEnd(lines, startLine - 1);
      const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({ filePath, startLine, endLine, content: chunkContent, language: this.language, type, name });
    }
  }

  // Handles block bodies (`{}`), arrow expressions (`=>`), and abstract declarations (`;`).
  private findFunctionEnd(lines: string[], startIdx: number): number {
    let braceCount = 0;
    let foundOpening = false;
    let foundArrow = false;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];

      if (!foundOpening && !foundArrow) {
        const trimmed = line.replace(/\/\/.*$/, '').trim();
        if (/=>/.test(trimmed) && !trimmed.includes('{')) {
          foundArrow = true;
        } else if (trimmed.endsWith(';') && !trimmed.includes('{')) {
          return i + 1; // abstract/bodiless declaration
        }
      }

      for (const ch of line) {
        if (ch === '{') { braceCount++; foundOpening = true; }
        else if (ch === '}') {
          braceCount--;
          if (foundOpening && braceCount === 0) return i + 1;
        }
      }

      // Arrow body ends when expression terminates (no trailing operator/paren).
      if (foundArrow && !foundOpening && i >= startIdx) {
        const trimmed = lines[i].replace(/\/\/.*$/, '').trimEnd();
        const continues = /[,+\-*/|&?:]$/.test(trimmed) || /\($/.test(trimmed);
        if (!continues) return i + 1;
      }
    }

    if (foundArrow) return Math.min(startIdx + 5, lines.length);
    return Math.min(startIdx + 10, lines.length);
  }

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
