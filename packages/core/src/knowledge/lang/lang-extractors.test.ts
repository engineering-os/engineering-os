import { describe, it, expect } from 'vitest';
import { TypeScriptExtractor } from './typescript-extractor';
import { PythonExtractor } from './python-extractor';
import { GoExtractor } from './go-extractor';
import { RustExtractor } from './rust-extractor';
import { JavaExtractor } from './java-extractor';
import { RubyExtractor } from './ruby-extractor';
import { getExtractorForFile } from './index';

describe('Language Extractors', () => {
  describe('getExtractorForFile', () => {
    it('returns correct extractor for TypeScript', () => {
      const ext = getExtractorForFile('app.ts');
      expect(ext).toBeInstanceOf(TypeScriptExtractor);
    });

    it('returns correct extractor for Go', () => {
      const ext = getExtractorForFile('main.go');
      expect(ext).toBeInstanceOf(GoExtractor);
    });

    it('returns null for unsupported files', () => {
      expect(getExtractorForFile('file.txt')).toBeNull();
    });
  });

  describe('GoExtractor', () => {
    const extractor = new GoExtractor();

    it('extracts functions', () => {
      const content = 'func HandleRequest(w http.ResponseWriter, r *http.Request) {\n  w.Write([]byte("ok"))\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'handler.go');
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].name).toBe('HandleRequest');
      expect(chunks[0].type).toBe('function');
    });

    it('extracts structs', () => {
      const content = 'type User struct {\n  Name string\n  Email string\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'models.go');
      expect(chunks[0].name).toBe('User');
      expect(chunks[0].type).toBe('class');
    });

    it('extracts imports', () => {
      const content = 'import (\n  "fmt"\n  "net/http"\n)\n';
      const imports = extractor.extractImports(content);
      expect(imports).toContain('fmt');
      expect(imports).toContain('net/http');
    });

    it('extracts exports (uppercase names)', () => {
      const content = 'func PublicFunc() {}\nfunc privateFunc() {}\ntype PublicStruct struct{}\n';
      const exports = extractor.extractExports(content);
      expect(exports).toContain('PublicFunc');
      expect(exports).toContain('PublicStruct');
      expect(exports).not.toContain('privateFunc');
    });
  });

  describe('RustExtractor', () => {
    const extractor = new RustExtractor();

    it('extracts functions', () => {
      const content = 'pub fn process(data: &str) -> Result<(), Error> {\n    Ok(())\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'lib.rs');
      expect(chunks[0].name).toBe('process');
      expect(chunks[0].type).toBe('function');
    });

    it('extracts structs and enums', () => {
      const content = 'pub struct Config {\n  port: u16,\n}\n\npub enum Status {\n  Active,\n  Inactive,\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'types.rs');
      expect(chunks.some((c) => c.name === 'Config' && c.type === 'class')).toBe(true);
      expect(chunks.some((c) => c.name === 'Status' && c.type === 'type')).toBe(true);
    });

    it('extracts imports', () => {
      const content = 'use std::collections::HashMap;\nuse crate::models::User;\n';
      const imports = extractor.extractImports(content);
      expect(imports).toContain('std::collections::HashMap');
    });
  });

  describe('JavaExtractor', () => {
    const extractor = new JavaExtractor();

    it('extracts classes', () => {
      const content = 'public class UserService {\n  public void save() {\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'UserService.java');
      expect(chunks.some((c) => c.name === 'UserService' && c.type === 'class')).toBe(true);
    });

    it('extracts methods', () => {
      const content = 'public class Svc {\n  public String getName() {\n    return name;\n  }\n}\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'Svc.java');
      expect(chunks.some((c) => c.name === 'getName' && c.type === 'method')).toBe(true);
    });

    it('extracts imports', () => {
      const content = 'import java.util.List;\nimport static org.junit.Assert.*;\n';
      const imports = extractor.extractImports(content);
      expect(imports).toContain('java.util.List');
    });
  });

  describe('RubyExtractor', () => {
    const extractor = new RubyExtractor();

    it('extracts methods', () => {
      const content = 'def calculate_total\n  items.sum(&:price)\nend\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'cart.rb');
      expect(chunks[0].name).toBe('calculate_total');
      expect(chunks[0].type).toBe('function');
    });

    it('extracts classes and modules', () => {
      const content = 'module Payments\n  class Processor\n    def run\n    end\n  end\nend\n';
      const lines = content.split('\n');
      const chunks = extractor.extractChunks(content, lines, 'payments.rb');
      expect(chunks.some((c) => c.name === 'Payments' && c.type === 'module')).toBe(true);
      expect(chunks.some((c) => c.name === 'Processor' && c.type === 'class')).toBe(true);
    });

    it('extracts imports', () => {
      const content = "require 'json'\nrequire_relative 'helpers'\n";
      const imports = extractor.extractImports(content);
      expect(imports).toContain('json');
      expect(imports).toContain('helpers');
    });
  });
});
