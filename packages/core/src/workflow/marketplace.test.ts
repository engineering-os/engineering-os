import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkflowMarketplace } from './marketplace';

describe('WorkflowMarketplace', () => {
  let tmpDir: string;
  let marketplace: WorkflowMarketplace;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eos-marketplace-'));
    const registryPath = path.join(tmpDir, 'registry.yaml');

    // Create a registry file
    fs.writeFileSync(registryPath, `templates:
  - name: feature
    description: Full feature development workflow
    category: development
    stages: 7
    author: engineering-os
  - name: bugfix
    description: Bug fix workflow
    category: maintenance
    stages: 5
    author: engineering-os
`);

    // Create a template file
    fs.writeFileSync(path.join(tmpDir, 'feature.yaml'), `name: feature
description: Full feature development workflow
stages:
  - id: refine
    description: Refine requirement
    dependsOn: []
`);

    marketplace = new WorkflowMarketplace(tmpDir, registryPath);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists all templates', async () => {
    const templates = await marketplace.listTemplates();
    expect(templates).toHaveLength(2);
    expect(templates[0].name).toBe('feature');
  });

  it('filters by category', async () => {
    const templates = await marketplace.listTemplates('maintenance');
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('bugfix');
  });

  it('gets a template by name', async () => {
    const yaml = await marketplace.getTemplate('feature');
    expect(yaml).toContain('name: feature');
    expect(yaml).toContain('refine');
  });

  it('returns null for non-existent template', async () => {
    const yaml = await marketplace.getTemplate('nonexistent');
    expect(yaml).toBeNull();
  });

  it('installs a custom template', async () => {
    const customYaml = `name: custom-deploy
description: Custom deployment
stages:
  - id: build
    description: Build the app
    dependsOn: []
  - id: deploy
    description: Deploy to production
    dependsOn: [build]
`;
    await marketplace.installTemplate('custom-deploy', customYaml, {
      description: 'Custom deployment workflow',
      category: 'custom',
      stages: 2,
      author: 'user',
    });

    const templates = await marketplace.listTemplates();
    expect(templates).toHaveLength(3);
    const custom = templates.find((t) => t.name === 'custom-deploy');
    expect(custom).toBeDefined();
    expect(custom!.category).toBe('custom');
  });

  it('gets categories', async () => {
    const categories = await marketplace.getCategories();
    expect(categories).toContain('development');
    expect(categories).toContain('maintenance');
    expect(categories).toContain('custom');
  });

  it('removes a custom template', async () => {
    const removed = await marketplace.removeTemplate('custom-deploy');
    expect(removed).toBe(true);
    const templates = await marketplace.listTemplates();
    expect(templates).toHaveLength(2);
  });

  it('cannot remove built-in templates', async () => {
    const removed = await marketplace.removeTemplate('feature');
    expect(removed).toBe(false);
  });
});
