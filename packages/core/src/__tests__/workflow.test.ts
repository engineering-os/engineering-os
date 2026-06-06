import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkflowEngine } from '../workflow/workflow-engine';
import { ArtifactStore } from '../workflow/artifact-store';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

describe('Workflow Engine', () => {
  let tmpDir: string;
  let engine: WorkflowEngine;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-workflow-'));
    // WorkflowEngine expects templates at ../../workflows relative to basePath
    // So we set basePath = tmpDir/a/b and put templates at tmpDir/workflows
    const basePath = path.join(tmpDir, 'a', 'b');
    await fs.mkdir(basePath, { recursive: true });
    await fs.mkdir(path.join(basePath, 'active'), { recursive: true });
    await fs.mkdir(path.join(basePath, 'completed'), { recursive: true });

    // Create workflow templates directory at the correct relative path
    const workflowsDir = path.join(tmpDir, 'workflows');
    await fs.mkdir(workflowsDir, { recursive: true });

    // Create a simple test template
    await fs.writeFile(
      path.join(workflowsDir, 'test.yaml'),
      `name: test
description: Test workflow
stages:
  - id: step1
    description: First step
    dependsOn: []
    approval: none
    output: step1.md
  - id: step2
    description: Second step
    dependsOn:
      - step1
    approval: none
    output: step2.md
  - id: step3
    description: Third step
    dependsOn:
      - step1
    approval: none
    output: step3.md
`
    );
    engine = new WorkflowEngine(basePath);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should load a workflow template', async () => {
    const workflow = await engine.loadTemplate('test');
    expect(workflow.name).toBe('test');
    expect(workflow.stages.length).toBe(3);
    expect(workflow.stages[0].status).toBe('pending');
  });

  it('should start a workflow instance', async () => {
    const workflow = await engine.start('test', 'my-feature');
    expect(workflow.name).toBe('test');
    expect(workflow.slug).toBe('my-feature');
    expect(workflow.startedAt).toBeDefined();
    expect(workflow.stages.length).toBe(3);
    expect(workflow.stages[0].status).toBe('pending');
  });

  it('should persist and retrieve workflow state', async () => {
    const workflow = await engine.getState('my-feature');
    expect(workflow).not.toBeNull();
    expect(workflow!.slug).toBe('my-feature');
    expect(workflow!.startedAt).toBeDefined();
  });

  it('should identify next actionable stages', async () => {
    const workflow = await engine.getState('my-feature');
    const next = engine.getNextStages(workflow!);
    // Only step1 has no dependencies, so it is the only actionable stage
    expect(next.length).toBe(1);
    expect(next[0].id).toBe('step1');
  });

  it('should advance a stage and unblock dependents', async () => {
    await engine.advanceStage('my-feature', 'step1', 'Step 1 output');
    const workflow = await engine.getState('my-feature');
    const next = engine.getNextStages(workflow!);
    // step2 and step3 both depend on step1, now unblocked
    expect(next.length).toBe(2);
    const nextIds = next.map((s) => s.id).sort();
    expect(nextIds).toEqual(['step2', 'step3']);
  });

  it('should mark completed stage correctly', async () => {
    const workflow = await engine.getState('my-feature');
    const step1 = workflow!.stages.find((s) => s.id === 'step1');
    expect(step1!.status).toBe('completed');
    expect(step1!.output).toBe('Step 1 output');
  });

  it('should complete workflow when all stages done', async () => {
    await engine.advanceStage('my-feature', 'step2');
    await engine.advanceStage('my-feature', 'step3');
    // After all stages complete, workflow moves to completed dir
    const activeWorkflow = await engine.getState('my-feature');
    expect(activeWorkflow).toBeNull();
  });

  it('should fail a stage gracefully', async () => {
    // Start a new workflow to test failure
    await engine.start('test', 'fail-feature');
    await engine.failStage('fail-feature', 'step1', 'Something went wrong');
    const workflow = await engine.getState('fail-feature');
    const step1 = workflow!.stages.find((s) => s.id === 'step1');
    expect(step1!.status).toBe('failed');
    expect(step1!.output).toBe('Something went wrong');
  });

  it('should throw when advancing non-existent workflow', async () => {
    await expect(engine.advanceStage('ghost', 'step1')).rejects.toThrow(
      'No active workflow found'
    );
  });

  it('should throw when advancing non-existent stage', async () => {
    await engine.start('test', 'stage-error');
    await expect(engine.advanceStage('stage-error', 'nonexistent')).rejects.toThrow(
      'Stage not found'
    );
  });

  it('should list active workflows', async () => {
    const active = await engine.listActive();
    expect(active.length).toBeGreaterThan(0);
  });
});

describe('Artifact Store', () => {
  let tmpDir: string;
  let store: ArtifactStore;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eos-artifacts-'));
    store = new ArtifactStore(tmpDir);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('should save and retrieve an artifact', async () => {
    await store.save('my-feature', 'requirement', '# My Feature\n\nDo the thing.');
    const artifact = await store.get('my-feature', 'requirement');
    expect(artifact).not.toBeNull();
    expect(artifact!.content).toContain('My Feature');
    expect(artifact!.version).toBe(1);
  });

  it('should version artifacts on subsequent saves', async () => {
    await store.save('my-feature', 'requirement', '# My Feature v2\n\nDo more things.');
    const artifact = await store.get('my-feature', 'requirement');
    expect(artifact!.version).toBe(2);
    expect(artifact!.content).toContain('v2');
  });

  it('should return version history', async () => {
    const history = await store.getHistory('my-feature', 'requirement');
    expect(history.length).toBe(2);
    expect(history[0].version).toBe(1);
    expect(history[1].version).toBe(2);
  });

  it('should return null for non-existent artifact', async () => {
    const artifact = await store.get('ghost-feature', 'requirement');
    expect(artifact).toBeNull();
  });

  it('should get all artifacts for a feature', async () => {
    await store.save('my-feature', 'design', '# Design\n\nArchitecture notes.');
    const all = await store.getAll('my-feature');
    expect(all.length).toBe(2);
    const stages = all.map((a) => a.stage).sort();
    expect(stages).toEqual(['design', 'requirement']);
  });

  it('should handle multiple features independently', async () => {
    await store.save('other-feature', 'requirement', '# Other Feature');
    const artifact = await store.get('other-feature', 'requirement');
    expect(artifact!.content).toContain('Other Feature');
    expect(artifact!.version).toBe(1);

    // Original feature should be unaffected
    const original = await store.get('my-feature', 'requirement');
    expect(original!.version).toBe(2);
  });

  it('should return empty history for non-existent stage', async () => {
    const history = await store.getHistory('my-feature', 'nonexistent');
    expect(history.length).toBe(0);
  });
});
