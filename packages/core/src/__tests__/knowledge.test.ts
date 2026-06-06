import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RepositoryIndexer } from '../knowledge/indexer';
import { MetadataStore } from '../knowledge/metadata-store';
import { ContextBuilder } from '../knowledge/context-builder';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Knowledge Engine', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-test-'));
    // Create sample source files in tmpDir for testing
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, 'src/auth.service.ts'),
      `
export class AuthService {
  async login(email: string, password: string): Promise<Token> {
    // authenticate user
    return { accessToken: 'token', refreshToken: 'refresh' };
  }

  async refreshToken(token: string): Promise<Token> {
    return { accessToken: 'new-token', refreshToken: 'new-refresh' };
  }
}

interface Token {
  accessToken: string;
  refreshToken: string;
}
`
    );
    await fs.writeFile(
      path.join(tmpDir, 'src/user.service.ts'),
      `
import { AuthService } from './auth.service';

export class UserService {
  constructor(private auth: AuthService) {}

  async getProfile(userId: string) {
    return { id: userId, name: 'Test User' };
  }
}
`
    );
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  describe('RepositoryIndexer', () => {
    it('should index TypeScript files', async () => {
      const indexer = new RepositoryIndexer(tmpDir);
      const files = await indexer.indexAll();
      expect(files.length).toBeGreaterThan(0);
      expect(files[0].language).toBe('typescript');
    });

    it('should extract function chunks', async () => {
      const indexer = new RepositoryIndexer(tmpDir);
      const files = await indexer.indexAll();
      const authFile = files.find((f) => f.filePath.includes('auth.service'));
      expect(authFile).toBeDefined();
      expect(authFile!.chunks.length).toBeGreaterThan(0);
      const loginChunk = authFile!.chunks.find((c) => c.name === 'login');
      expect(loginChunk).toBeDefined();
      expect(loginChunk!.type).toBe('method');
    });

    it('should extract class declarations', async () => {
      const indexer = new RepositoryIndexer(tmpDir);
      const files = await indexer.indexAll();
      const authFile = files.find((f) => f.filePath.includes('auth.service'));
      const classChunk = authFile!.chunks.find((c) => c.name === 'AuthService');
      expect(classChunk).toBeDefined();
      expect(classChunk!.type).toBe('class');
    });

    it('should detect supported languages', () => {
      const indexer = new RepositoryIndexer(tmpDir);
      const languages = indexer.getSupportedLanguages();
      expect(languages).toContain('typescript');
      expect(languages).toContain('javascript');
      expect(languages).toContain('python');
    });

    it('should skip unsupported file types', async () => {
      await fs.writeFile(path.join(tmpDir, 'src/readme.md'), '# Hello');
      const indexer = new RepositoryIndexer(tmpDir);
      const files = await indexer.indexAll();
      const mdFile = files.find((f) => f.filePath.endsWith('.md'));
      expect(mdFile).toBeUndefined();
    });

    it('should resolve relative and absolute paths', async () => {
      const indexer = new RepositoryIndexer(tmpDir);
      const file = await indexer.indexFile('src/auth.service.ts');
      expect(file.filePath).toBe(path.resolve(tmpDir, 'src/auth.service.ts'));
    });
  });

  describe('MetadataStore', () => {
    it('should store and retrieve file metadata', () => {
      const dbPath = path.join(tmpDir, 'test-metadata.db');
      const store = new MetadataStore(dbPath);
      store.initialize();
      store.upsertFile({
        filePath: 'src/auth.service.ts',
        language: 'typescript',
        lastModified: new Date().toISOString(),
        chunks: [],
        imports: [],
        exports: [],
      });
      const files = store.getIndexedFiles();
      expect(files.length).toBe(1);
      expect(files[0].filePath).toBe('src/auth.service.ts');
    });

    it('should track dependencies between files', () => {
      const dbPath = path.join(tmpDir, 'test-deps.db');
      const store = new MetadataStore(dbPath);
      store.initialize();
      store.storeRelationships('src/user.service.ts', ['./auth.service'], ['UserService']);
      const deps = store.findDependencies('src/user.service.ts');
      expect(deps).toContain('./auth.service');
    });

    it('should find dependents of a module', () => {
      const dbPath = path.join(tmpDir, 'test-dependents.db');
      const store = new MetadataStore(dbPath);
      store.initialize();
      store.storeRelationships('src/user.service.ts', ['./auth.service'], ['UserService']);
      store.storeRelationships('src/admin.service.ts', ['./auth.service'], ['AdminService']);
      const dependents = store.findDependents('./auth.service');
      expect(dependents).toContain('src/user.service.ts');
      expect(dependents).toContain('src/admin.service.ts');
    });

    it('should return stats', () => {
      const dbPath = path.join(tmpDir, 'test-stats.db');
      const store = new MetadataStore(dbPath);
      store.initialize();
      store.upsertFile({
        filePath: 'src/a.ts',
        language: 'typescript',
        lastModified: new Date().toISOString(),
        chunks: [],
        imports: [],
        exports: [],
      });
      store.upsertFile({
        filePath: 'src/b.ts',
        language: 'typescript',
        lastModified: new Date().toISOString(),
        chunks: [],
        imports: [],
        exports: [],
      });
      const stats = store.getStats();
      expect(stats.totalFiles).toBe(2);
    });

    it('should update existing file metadata on upsert', () => {
      const dbPath = path.join(tmpDir, 'test-upsert.db');
      const store = new MetadataStore(dbPath);
      store.initialize();
      store.upsertFile({
        filePath: 'src/auth.service.ts',
        language: 'typescript',
        lastModified: '2024-01-01T00:00:00Z',
        chunks: [],
        imports: [],
        exports: [],
      });
      store.upsertFile({
        filePath: 'src/auth.service.ts',
        language: 'typescript',
        lastModified: '2024-06-01T00:00:00Z',
        chunks: [],
        imports: [],
        exports: [],
      });
      const files = store.getIndexedFiles();
      expect(files.length).toBe(1);
      expect(files[0].lastModified).toBe('2024-06-01T00:00:00Z');
    });
  });
});
