import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { KnowledgeExporter } from './knowledge-exporter';

describe('KnowledgeExporter', () => {
  let tmpDir: string;
  let exporter: KnowledgeExporter;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-export-'));
    const eosDir = path.join(tmpDir, '.eos');

    // Create knowledge structure
    fs.mkdirSync(path.join(eosDir, 'knowledge', 'decisions'), { recursive: true });
    fs.mkdirSync(path.join(eosDir, 'knowledge', 'architecture'), { recursive: true });
    fs.mkdirSync(path.join(eosDir, 'knowledge', 'patterns'), { recursive: true });
    fs.mkdirSync(path.join(eosDir, 'knowledge', 'conventions'), { recursive: true });
    fs.mkdirSync(path.join(eosDir, 'knowledge', 'security'), { recursive: true });
    fs.mkdirSync(path.join(eosDir, 'team'), { recursive: true });

    // Write sample knowledge files
    fs.writeFileSync(path.join(eosDir, 'knowledge', 'decisions', 'DEC-001.yaml'),
      'id: DEC-001\ntitle: Use TypeScript\nstatus: accepted\nrationale: Type safety\n');

    fs.writeFileSync(path.join(eosDir, 'knowledge', 'decisions', 'DEC-002.yaml'),
      'id: DEC-002\ntitle: Use SQLite\nstatus: accepted\nrationale: Local-first\n');

    fs.writeFileSync(path.join(eosDir, 'knowledge', 'architecture', 'services.yaml'),
      'services:\n  - name: core\n    criticality: high\n');

    fs.writeFileSync(path.join(eosDir, 'knowledge', 'patterns', 'patterns.yaml'),
      'patterns:\n  - name: repository-pattern\n    usage: data-access\n');

    fs.writeFileSync(path.join(eosDir, 'knowledge', 'security', 'conventions.yaml'),
      'rules:\n  - id: no-secrets\n    severity: critical\n');

    fs.writeFileSync(path.join(eosDir, 'team', 'manifest.yaml'),
      'team: engineering\nlastUpdated: 2026-05-31\nconventions: []\n');

    exporter = new KnowledgeExporter(eosDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exports all knowledge sections', async () => {
    const archive = await exporter.export('test-project');
    expect(archive.version).toBe('1.0.0');
    expect(archive.sourceRepo).toBe('test-project');
    expect(archive.exportedAt).toBeTruthy();
  });

  it('includes decisions', async () => {
    const archive = await exporter.export();
    expect(archive.sections.decisions).toHaveLength(2);
    expect(archive.sections.decisions[0].id).toBe('DEC-001');
  });

  it('includes architecture', async () => {
    const archive = await exporter.export();
    expect(archive.sections.architecture).toHaveLength(1);
    expect(archive.sections.architecture[0].services).toBeDefined();
  });

  it('includes patterns', async () => {
    const archive = await exporter.export();
    expect(archive.sections.patterns).toHaveLength(1);
  });

  it('includes security knowledge', async () => {
    const archive = await exporter.export();
    expect(archive.sections.security).toHaveLength(1);
    expect(archive.sections.security[0].rules).toBeDefined();
  });

  it('includes team manifest', async () => {
    const archive = await exporter.export();
    expect(archive.sections.team).not.toBeNull();
    expect(archive.sections.team.team).toBe('engineering');
  });

  it('tracks metadata', async () => {
    const archive = await exporter.export();
    expect(archive.metadata.totalFiles).toBeGreaterThan(0);
    expect(archive.metadata.exportSize).toBeGreaterThan(0);
  });

  it('exports to file', async () => {
    const outputPath = path.join(tmpDir, 'export.json');
    await exporter.exportToFile(outputPath, 'my-project');
    expect(fs.existsSync(outputPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(content.sourceRepo).toBe('my-project');
    expect(content.sections.decisions).toHaveLength(2);
  });

  it('handles missing directories gracefully', async () => {
    const emptyEos = path.join(tmpDir, 'empty-eos');
    fs.mkdirSync(emptyEos, { recursive: true });
    const emptyExporter = new KnowledgeExporter(emptyEos);
    const archive = await emptyExporter.export();
    expect(archive.sections.decisions).toEqual([]);
    expect(archive.sections.architecture).toEqual([]);
    expect(archive.sections.team).toBeNull();
  });
});
