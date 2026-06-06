import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillStore, Skill } from './skill-store';

describe('SkillStore', () => {
  let store: SkillStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-skill-test-'));
    store = new SkillStore(path.join(tmpDir, '.eos'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('create()', () => {
    it('should create a skill with auto-generated ID', () => {
      const skill = store.create({
        type: 'pattern',
        name: 'Test Pattern',
        content: 'Always use dependency injection',
      });

      expect(skill.id).toBe('SKILL-001');
    });

    it('should assign sequential IDs', () => {
      const first = store.create({ type: 'pattern', content: 'First skill' });
      const second = store.create({ type: 'gotcha', content: 'Second skill' });

      expect(first.id).toBe('SKILL-001');
      expect(second.id).toBe('SKILL-002');
    });

    it('should set the correct type', () => {
      const skill = store.create({
        type: 'gotcha',
        content: 'Watch out for null refs',
      });

      expect(skill.type).toBe('gotcha');
    });

    it('should set the content', () => {
      const skill = store.create({
        type: 'convention',
        content: 'Use camelCase for variables',
      });

      expect(skill.content).toBe('Use camelCase for variables');
    });

    it('should set initial confidence to medium', () => {
      const skill = store.create({
        type: 'shortcut',
        content: 'Cmd+Shift+P opens palette',
      });

      expect(skill.confidence).toBe('medium');
    });

    it('should set timesApplied to 0', () => {
      const skill = store.create({
        type: 'pattern',
        content: 'Some pattern',
      });

      expect(skill.timesApplied).toBe(0);
    });

    it('should store context when provided', () => {
      const skill = store.create({
        type: 'connection',
        content: 'Service A calls Service B',
        context: 'microservices architecture',
      });

      expect(skill.context).toBe('microservices architecture');
    });

    it('should store tags when provided', () => {
      const skill = store.create({
        type: 'pattern',
        content: 'Always validate input',
        tags: ['validation', 'security'],
      });

      expect(skill.tags).toEqual(['validation', 'security']);
    });

    it('should infer name from content when name not provided', () => {
      const skill = store.create({
        type: 'pattern',
        content: 'Short content line',
      });

      expect(skill.name).toBe('Short content line');
    });

    it('should truncate inferred name at 50 characters', () => {
      const longContent = 'This is a very long content line that exceeds fifty characters and should be truncated';
      const skill = store.create({
        type: 'pattern',
        content: longContent,
      });

      expect(skill.name).toBe(longContent.slice(0, 50) + '...');
      expect(skill.name.length).toBe(53);
    });

    it('should use provided name over inferred name', () => {
      const skill = store.create({
        type: 'pattern',
        name: 'My Custom Name',
        content: 'Some content here',
      });

      expect(skill.name).toBe('My Custom Name');
    });

    it('should set createdAt timestamp', () => {
      const before = new Date().toISOString();
      const skill = store.create({ type: 'pattern', content: 'test' });
      const after = new Date().toISOString();

      expect(skill.createdAt >= before).toBe(true);
      expect(skill.createdAt <= after).toBe(true);
    });

    it('should persist the skill as a YAML file', () => {
      const skill = store.create({ type: 'pattern', content: 'persisted' });
      const filePath = path.join(tmpDir, '.eos', 'knowledge', 'skills', `${skill.id}.yaml`);

      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('get()', () => {
    it('should retrieve a skill by ID', () => {
      const created = store.create({
        type: 'gotcha',
        name: 'Null Check',
        content: 'Always check for null',
      });

      const retrieved = store.get(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.type).toBe('gotcha');
      expect(retrieved!.name).toBe('Null Check');
      expect(retrieved!.content).toBe('Always check for null');
    });

    it('should return null for non-existent ID', () => {
      const result = store.get('SKILL-999');

      expect(result).toBeNull();
    });

    it('should return the full skill object with all fields', () => {
      store.create({
        type: 'convention',
        name: 'Naming',
        content: 'Use PascalCase for classes',
        context: 'TypeScript projects',
        tags: ['naming', 'typescript'],
      });

      const skill = store.get('SKILL-001');

      expect(skill!.confidence).toBe('medium');
      expect(skill!.timesApplied).toBe(0);
      expect(skill!.context).toBe('TypeScript projects');
      expect(skill!.tags).toEqual(['naming', 'typescript']);
      expect(skill!.createdAt).toBeDefined();
      expect(skill!.learnedFrom).toBeDefined();
    });
  });

  describe('list()', () => {
    beforeEach(() => {
      store.create({ type: 'pattern', content: 'Pattern one' });
      store.create({ type: 'gotcha', content: 'Gotcha one' });
      store.create({ type: 'pattern', content: 'Pattern two' });
      store.create({ type: 'convention', content: 'Convention one' });
    });

    it('should return all skills when no filter is provided', () => {
      const skills = store.list();

      expect(skills).toHaveLength(4);
    });

    it('should filter by type', () => {
      const patterns = store.list({ type: 'pattern' });

      expect(patterns).toHaveLength(2);
      expect(patterns.every((s) => s.type === 'pattern')).toBe(true);
    });

    it('should return empty array for type with no matches', () => {
      const shortcuts = store.list({ type: 'shortcut' });

      expect(shortcuts).toHaveLength(0);
    });

    it('should sort by timesApplied descending', () => {
      store.recordApplied('SKILL-002');
      store.recordApplied('SKILL-002');
      store.recordApplied('SKILL-003');

      const skills = store.list();

      expect(skills[0].id).toBe('SKILL-002');
      expect(skills[1].id).toBe('SKILL-003');
    });

    it('should filter by minConfidence', () => {
      // SKILL-001 starts at medium
      store.recordApplied('SKILL-001');
      store.recordApplied('SKILL-001');
      store.recordApplied('SKILL-001');
      store.recordApplied('SKILL-001');
      store.recordApplied('SKILL-001'); // 5 times -> high

      const highOnly = store.list({ minConfidence: 'high' });

      expect(highOnly).toHaveLength(1);
      expect(highOnly[0].id).toBe('SKILL-001');
    });

    it('should return empty list when skills directory has no files', () => {
      const emptyTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-skill-empty-'));
      const emptyStore = new SkillStore(path.join(emptyTmpDir, '.eos'));

      const skills = emptyStore.list();

      expect(skills).toHaveLength(0);
      fs.rmSync(emptyTmpDir, { recursive: true, force: true });
    });
  });

  describe('search()', () => {
    beforeEach(() => {
      store.create({
        type: 'pattern',
        name: 'Dependency Injection',
        content: 'Use constructor injection for services',
        context: 'backend architecture',
        tags: ['di', 'spring'],
      });
      store.create({
        type: 'gotcha',
        name: 'Circular Dependencies',
        content: 'Avoid circular imports between modules',
        context: 'typescript modules',
        tags: ['imports', 'modules'],
      });
      store.create({
        type: 'convention',
        name: 'File Naming',
        content: 'Use kebab-case for file names',
        context: 'frontend project',
        tags: ['naming'],
      });
    });

    it('should search by name keyword', () => {
      const results = store.search('injection');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Dependency Injection');
    });

    it('should search by content keyword', () => {
      const results = store.search('circular');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Circular Dependencies');
    });

    it('should search by context keyword', () => {
      const results = store.search('frontend');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('File Naming');
    });

    it('should search by tags', () => {
      const results = store.search('spring');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Dependency Injection');
    });

    it('should be case-insensitive', () => {
      const results = store.search('KEBAB');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('File Naming');
    });

    it('should match any term in multi-word query', () => {
      const results = store.search('injection frontend');

      expect(results).toHaveLength(2);
    });

    it('should return empty array when no matches', () => {
      const results = store.search('nonexistent');

      expect(results).toHaveLength(0);
    });
  });

  describe('getRelevantSkills()', () => {
    beforeEach(() => {
      store.create({
        type: 'pattern',
        name: 'Database Migration',
        content: 'Always create reversible migrations',
        context: 'database schema changes',
        tags: ['database', 'migration'],
      });
      store.create({
        type: 'gotcha',
        name: 'API Versioning',
        content: 'Never break existing API contracts',
        context: 'REST API development',
        tags: ['api', 'versioning'],
      });
      store.create({
        type: 'convention',
        name: 'Test Naming',
        content: 'Name tests with should_expectedBehavior_when_condition',
        context: 'unit testing patterns',
        tags: ['testing'],
      });
    });

    it('should return skills matching task context keywords', () => {
      const results = store.getRelevantSkills('working on database migration');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((s) => s.name === 'Database Migration')).toBe(true);
    });

    it('should filter out short keywords (3 chars or less)', () => {
      // "add new api" -> only "new" is too short (3), "add" is too short (3), so no keywords match > 3 chars
      // but "adding" would work
      const results = store.getRelevantSkills('add new api');

      // "api" is 3 chars so it gets filtered. No keywords > 3 chars match anything
      expect(results).toHaveLength(0);
    });

    it('should match based on content and context of skills', () => {
      const results = store.getRelevantSkills('writing unit testing code');

      expect(results.some((s) => s.name === 'Test Naming')).toBe(true);
    });

    it('should limit results to maximum 10', () => {
      // Create more than 10 skills all matching same context
      for (let i = 0; i < 15; i++) {
        store.create({
          type: 'pattern',
          content: `Pattern related to deployment number ${i}`,
          context: 'deployment pipeline',
        });
      }

      const results = store.getRelevantSkills('deployment pipeline patterns');

      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('should return empty array when no skills match', () => {
      const results = store.getRelevantSkills('quantum computing algorithms');

      expect(results).toHaveLength(0);
    });
  });

  describe('recordApplied()', () => {
    it('should increment timesApplied', () => {
      const skill = store.create({ type: 'pattern', content: 'test' });

      store.recordApplied(skill.id);

      const updated = store.get(skill.id);
      expect(updated!.timesApplied).toBe(1);
    });

    it('should set lastApplied timestamp', () => {
      const skill = store.create({ type: 'pattern', content: 'test' });

      store.recordApplied(skill.id);

      const updated = store.get(skill.id);
      expect(updated!.lastApplied).toBeDefined();
    });

    it('should escalate confidence from low to medium at 2 applications', () => {
      const skill = store.create({ type: 'pattern', content: 'test' });
      // Manually set to low confidence for testing
      const raw = store.get(skill.id)!;
      raw.confidence = 'low';
      store.save(raw);

      store.recordApplied(skill.id); // timesApplied = 1, still low
      expect(store.get(skill.id)!.confidence).toBe('low');

      store.recordApplied(skill.id); // timesApplied = 2, escalates to medium
      expect(store.get(skill.id)!.confidence).toBe('medium');
    });

    it('should escalate confidence from medium to high at 5 applications', () => {
      const skill = store.create({ type: 'pattern', content: 'test' });

      store.recordApplied(skill.id); // 1
      store.recordApplied(skill.id); // 2
      store.recordApplied(skill.id); // 3
      store.recordApplied(skill.id); // 4
      expect(store.get(skill.id)!.confidence).toBe('medium');

      store.recordApplied(skill.id); // 5 -> high
      expect(store.get(skill.id)!.confidence).toBe('high');
    });

    it('should not escalate beyond high', () => {
      const skill = store.create({ type: 'pattern', content: 'test' });

      for (let i = 0; i < 10; i++) {
        store.recordApplied(skill.id);
      }

      expect(store.get(skill.id)!.confidence).toBe('high');
    });

    it('should do nothing for non-existent skill', () => {
      // Should not throw
      store.recordApplied('SKILL-999');
    });
  });

  describe('delete()', () => {
    it('should remove a skill', () => {
      const skill = store.create({ type: 'pattern', content: 'to delete' });

      const result = store.delete(skill.id);

      expect(result).toBe(true);
      expect(store.get(skill.id)).toBeNull();
    });

    it('should return false for non-existent skill', () => {
      const result = store.delete('SKILL-999');

      expect(result).toBe(false);
    });

    it('should remove the YAML file from disk', () => {
      const skill = store.create({ type: 'pattern', content: 'to delete' });
      const filePath = path.join(tmpDir, '.eos', 'knowledge', 'skills', `${skill.id}.yaml`);

      expect(fs.existsSync(filePath)).toBe(true);
      store.delete(skill.id);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should not affect other skills', () => {
      store.create({ type: 'pattern', content: 'keep this' });
      const toDelete = store.create({ type: 'gotcha', content: 'remove this' });
      store.create({ type: 'convention', content: 'keep this too' });

      store.delete(toDelete.id);

      const remaining = store.list();
      expect(remaining).toHaveLength(2);
      expect(remaining.every((s) => s.id !== toDelete.id)).toBe(true);
    });
  });
});
