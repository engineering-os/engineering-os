import { describe, it, expect } from 'vitest';
import {
  validateContainedPath,
  sanitizeSlug,
  validatePathArray,
  sanitizeErrorMessage,
  PathTraversalError,
  InvalidSlugError,
  validateFileSize,
  safeYamlLoad,
} from '../security';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Path Safety', () => {
  const basePath = '/project/root';

  describe('validateContainedPath', () => {
    it('should allow paths within base directory', () => {
      const result = validateContainedPath(basePath, 'src/index.ts');
      expect(result).toBe(path.resolve(basePath, 'src/index.ts'));
    });

    it('should allow nested paths', () => {
      const result = validateContainedPath(basePath, 'src/deep/nested/file.ts');
      expect(result).toBe(path.resolve(basePath, 'src/deep/nested/file.ts'));
    });

    it('should block ../ traversal', () => {
      expect(() => validateContainedPath(basePath, '../../../etc/passwd')).toThrow(PathTraversalError);
    });

    it('should block absolute paths outside root', () => {
      expect(() => validateContainedPath(basePath, '/etc/passwd')).toThrow(PathTraversalError);
    });

    it('should block encoded traversal attempts', () => {
      expect(() => validateContainedPath(basePath, 'src/../../etc/shadow')).toThrow(PathTraversalError);
    });

    it('should allow the base path itself', () => {
      const result = validateContainedPath(basePath, '.');
      expect(result).toBe(path.resolve(basePath));
    });
  });

  describe('sanitizeSlug', () => {
    it('should accept valid slugs', () => {
      expect(sanitizeSlug('my-feature', 'test')).toBe('my-feature');
      expect(sanitizeSlug('DEC-001', 'test')).toBe('DEC-001');
      expect(sanitizeSlug('task_123', 'test')).toBe('task_123');
    });

    it('should reject empty strings', () => {
      expect(() => sanitizeSlug('', 'test')).toThrow(InvalidSlugError);
    });

    it('should reject path separators', () => {
      expect(() => sanitizeSlug('../../etc', 'test')).toThrow(InvalidSlugError);
      expect(() => sanitizeSlug('a/b', 'test')).toThrow(InvalidSlugError);
    });

    it('should reject dots', () => {
      expect(() => sanitizeSlug('..', 'test')).toThrow(InvalidSlugError);
      expect(() => sanitizeSlug('.hidden', 'test')).toThrow(InvalidSlugError);
    });

    it('should reject excessively long slugs', () => {
      const longSlug = 'a'.repeat(200);
      expect(() => sanitizeSlug(longSlug, 'test')).toThrow(InvalidSlugError);
    });

    it('should reject special characters', () => {
      expect(() => sanitizeSlug('feature; rm -rf /', 'test')).toThrow(InvalidSlugError);
      expect(() => sanitizeSlug('slug"injection', 'test')).toThrow(InvalidSlugError);
    });
  });

  describe('validatePathArray', () => {
    it('should validate all paths in array', () => {
      const results = validatePathArray(basePath, ['src/a.ts', 'src/b.ts']);
      expect(results).toHaveLength(2);
    });

    it('should reject if any path traverses', () => {
      expect(() => validatePathArray(basePath, ['src/a.ts', '../../../etc/passwd'])).toThrow(PathTraversalError);
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should preserve security error messages', () => {
      const err = new PathTraversalError('../../../etc/passwd');
      expect(sanitizeErrorMessage(err)).toContain('Path traversal blocked');
    });

    it('should strip file paths from generic errors', () => {
      const err = new Error('ENOENT: no such file /home/testuser/secret/file.txt');
      const sanitized = sanitizeErrorMessage(err);
      expect(sanitized).not.toContain('/home/testuser');
      expect(sanitized).toContain('[path]');
    });

    it('should handle non-Error objects', () => {
      expect(sanitizeErrorMessage('string error')).toBe('An internal error occurred');
      expect(sanitizeErrorMessage(null)).toBe('An internal error occurred');
    });
  });
});

describe('YAML Safety', () => {
  it('should parse valid YAML', () => {
    const result = safeYamlLoad<{ name: string }>('name: test');
    expect(result).toEqual({ name: 'test' });
  });

  it('should return null for empty content', () => {
    expect(safeYamlLoad('')).toBeNull();
  });

  it('should parse arrays and nested objects', () => {
    const yaml = `
items:
  - name: first
  - name: second
`;
    const result = safeYamlLoad<{ items: { name: string }[] }>(yaml);
    expect(result?.items).toHaveLength(2);
  });

  it('should not execute JavaScript tags', () => {
    const malicious = '!!js/function "() { process.exit(1) }"';
    expect(() => safeYamlLoad(malicious)).toThrow();
  });
});

describe('File Safety', () => {
  it('should reject files larger than limit', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-sec-'));
    const largePath = path.join(tmpDir, 'large.txt');
    await fs.writeFile(largePath, 'x'.repeat(100));

    await expect(validateFileSize(largePath, 50)).rejects.toThrow('File too large');

    await fs.rm(tmpDir, { recursive: true });
  });

  it('should accept files within limit', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-sec-'));
    const smallPath = path.join(tmpDir, 'small.txt');
    await fs.writeFile(smallPath, 'hello');

    await expect(validateFileSize(smallPath, 1024)).resolves.toBeUndefined();

    await fs.rm(tmpDir, { recursive: true });
  });
});
