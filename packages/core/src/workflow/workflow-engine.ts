import { Workflow, WorkflowStage, WorkflowArtifact } from '@engineering-os/shared';
import * as fs from 'fs/promises';
import * as path from 'path';
import { safeYamlLoad, safeYamlDump, sanitizeSlug } from '../security';

/** Extended workflow with runtime state tracked via yaml persistence */
interface WorkflowState extends Workflow {
  slug?: string;
  currentStage?: string;
  startedAt?: string;
  completedAt?: string;
}

export class WorkflowEngine {
  constructor(private basePath: string) {} // .eos/workflows/

  /**
   * Load a workflow template by name from the project's workflows/ directory.
   */
  async loadTemplate(name: string): Promise<Workflow> {
    sanitizeSlug(name, 'templateName');
    const templateDir = path.resolve(this.basePath, '../../workflows');
    const templatePath = path.join(templateDir, `${name}.yaml`);

    const content = await fs.readFile(templatePath, 'utf-8');
    const template = safeYamlLoad<{
      name: string;
      description: string;
      stages: Array<{
        id: string;
        description: string;
        dependsOn: string[];
        approval: string;
        output: string;
      }>;
    }>(content);

    if (!template) {
      throw new Error(`Failed to parse workflow template: ${name}`);
    }

    const stages: WorkflowStage[] = template.stages.map((s) => ({
      id: s.id,
      description: s.description,
      dependsOn: s.dependsOn,
      approval: s.approval as 'required' | 'optional' | 'none',
      output: s.output,
      status: 'pending' as const,
    }));

    return {
      name: template.name,
      description: template.description,
      stages,
    };
  }

  /**
   * Start a new workflow instance for a feature.
   */
  async start(templateName: string, featureSlug: string): Promise<Workflow> {
    sanitizeSlug(featureSlug, 'featureSlug');
    const workflow = await this.loadTemplate(templateName);
    workflow.slug = featureSlug;
    workflow.startedAt = new Date().toISOString();
    workflow.currentStage = workflow.stages.length > 0 ? workflow.stages[0].id : undefined;

    await this.saveState(featureSlug, workflow);
    return workflow;
  }

  /**
   * Get current workflow state for a feature.
   */
  async getState(featureSlug: string): Promise<Workflow | null> {
    sanitizeSlug(featureSlug, 'featureSlug');
    const statePath = path.join(this.basePath, 'active', `${featureSlug}.yaml`);
    try {
      const content = await fs.readFile(statePath, 'utf-8');
      return safeYamlLoad<Workflow>(content);
    } catch {
      return null;
    }
  }

  /**
   * Advance a stage to completed and update workflow state.
   */
  async advanceStage(featureSlug: string, stageId: string, output?: string): Promise<Workflow> {
    sanitizeSlug(featureSlug, 'featureSlug');
    const workflow = await this.getState(featureSlug);
    if (!workflow) {
      throw new Error(`No active workflow found for feature: ${featureSlug}`);
    }

    const stage = workflow.stages.find((s) => s.id === stageId);
    if (!stage) {
      throw new Error(`Stage not found: ${stageId}`);
    }

    stage.status = 'completed';
    if (output) {
      stage.output = output;
    }

    if (this.isComplete(workflow)) {
      workflow.completedAt = new Date().toISOString();
      await this.moveToCompleted(featureSlug, workflow);
    } else {
      await this.saveState(featureSlug, workflow);
    }

    return workflow;
  }

  /**
   * Mark a stage as failed.
   */
  async failStage(featureSlug: string, stageId: string, error: string): Promise<Workflow> {
    sanitizeSlug(featureSlug, 'featureSlug');
    const workflow = await this.getState(featureSlug);
    if (!workflow) {
      throw new Error(`No active workflow found for feature: ${featureSlug}`);
    }

    const stage = workflow.stages.find((s) => s.id === stageId);
    if (!stage) {
      throw new Error(`Stage not found: ${stageId}`);
    }

    stage.status = 'failed';
    stage.output = error;

    await this.saveState(featureSlug, workflow);
    return workflow;
  }

  /**
   * Get next actionable stages (dependencies all completed, own status pending).
   */
  getNextStages(workflow: Workflow): WorkflowStage[] {
    const completedIds = new Set(
      workflow.stages.filter((s) => s.status === 'completed').map((s) => s.id)
    );

    return workflow.stages.filter((stage: WorkflowStage) => {
      if (stage.status !== 'pending') return false;
      return stage.dependsOn.every((dep: string) => completedIds.has(dep));
    });
  }

  /**
   * Check if all stages in the workflow are completed.
   */
  isComplete(workflow: Workflow): boolean {
    return workflow.stages.every((s: WorkflowStage) => s.status === 'completed');
  }

  /**
   * List all active workflows.
   */
  async listActive(): Promise<Workflow[]> {
    const activeDir = path.join(this.basePath, 'active');
    try {
      const files = await fs.readdir(activeDir);
      const workflows: Workflow[] = [];

      for (const file of files) {
        if (file.endsWith('.yaml')) {
          const content = await fs.readFile(path.join(activeDir, file), 'utf-8');
          workflows.push(safeYamlLoad<Workflow>(content)!);
        }
      }

      return workflows;
    } catch {
      return [];
    }
  }

  /**
   * Save workflow state to disk.
   */
  private async saveState(featureSlug: string, workflow: Workflow): Promise<void> {
    const activeDir = path.join(this.basePath, 'active');
    await fs.mkdir(activeDir, { recursive: true });

    const statePath = path.join(activeDir, `${featureSlug}.yaml`);
    const content = safeYamlDump(workflow);
    await fs.writeFile(statePath, content, 'utf-8');
  }

  /**
   * Move completed workflow from active to completed directory.
   */
  private async moveToCompleted(featureSlug: string, workflow: Workflow): Promise<void> {
    const completedDir = path.join(this.basePath, 'completed');
    await fs.mkdir(completedDir, { recursive: true });

    const completedPath = path.join(completedDir, `${featureSlug}.yaml`);
    const content = safeYamlDump(workflow);
    await fs.writeFile(completedPath, content, 'utf-8');

    // Remove from active
    const activePath = path.join(this.basePath, 'active', `${featureSlug}.yaml`);
    try {
      await fs.unlink(activePath);
    } catch {
      // Already removed or doesn't exist
    }
  }
}
