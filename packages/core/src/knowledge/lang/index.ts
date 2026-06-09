import { CodeChunk } from '@engineering-os/shared';

export interface LanguageExtractor {
  language: string;
  extensions: string[];
  extractChunks(content: string, lines: string[], filePath: string): CodeChunk[];
  extractImports(content: string): string[];
  extractExports(content: string): string[];
}

import { TypeScriptExtractor } from './typescript-extractor';
import { PythonExtractor } from './python-extractor';
import { GoExtractor } from './go-extractor';
import { RustExtractor } from './rust-extractor';
import { JavaExtractor } from './java-extractor';
import { RubyExtractor } from './ruby-extractor';
import { KotlinExtractor } from './kotlin-extractor';
import { CSharpExtractor } from './csharp-extractor';
import { PhpExtractor } from './php-extractor';
import { ShellExtractor } from './shell-extractor';

const ALL_EXTRACTORS: LanguageExtractor[] = [
  new TypeScriptExtractor(),
  new PythonExtractor(),
  new GoExtractor(),
  new RustExtractor(),
  new JavaExtractor(),
  new RubyExtractor(),
  new KotlinExtractor(),
  new CSharpExtractor(),
  new PhpExtractor(),
  new ShellExtractor(),
];

const EXTENSION_MAP = new Map<string, LanguageExtractor>();
for (const ext of ALL_EXTRACTORS) {
  for (const extension of ext.extensions) {
    EXTENSION_MAP.set(extension, ext);
  }
}

export function getExtractorForFile(filePath: string): LanguageExtractor | null {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MAP.get(ext) || null;
}

export function getSupportedExtensions(): string[] {
  return Array.from(EXTENSION_MAP.keys());
}

export function getSupportedLanguages(): string[] {
  return ALL_EXTRACTORS.map((e) => e.language);
}

export { TypeScriptExtractor } from './typescript-extractor';
export { PythonExtractor } from './python-extractor';
export { GoExtractor } from './go-extractor';
export { RustExtractor } from './rust-extractor';
export { JavaExtractor } from './java-extractor';
export { RubyExtractor } from './ruby-extractor';
export { KotlinExtractor } from './kotlin-extractor';
export { CSharpExtractor } from './csharp-extractor';
export { PhpExtractor } from './php-extractor';
export { ShellExtractor } from './shell-extractor';
