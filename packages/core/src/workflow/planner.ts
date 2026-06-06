import * as fs from 'fs/promises';
import * as path from 'path';
import { sanitizeSlug } from '../security';

export interface TaskNode {
  id: string;
  title: string;
  description: string;
  type: 'frontend' | 'backend' | 'fullstack' | 'infra' | 'test';
  dependsOn: string[];
  estimatedTokens: number;
}

export interface ExecutionPlan {
  featureSlug: string;
  tasks: TaskNode[];
  parallelGroups: string[][]; // groups of task IDs that can run simultaneously
}

export class Planner {
  constructor(private basePath: string = '.eos/features') {}

  /**
   * Generate execution plan from refined requirement and optional architecture doc.
   */
  async plan(featureSlug: string, requirement: string, architecture?: string): Promise<ExecutionPlan> {
    sanitizeSlug(featureSlug, 'featureSlug');
    const tasks = this.generateTaskTemplate(requirement);
    const parallelGroups = this.computeParallelGroups(tasks);

    const plan: ExecutionPlan = {
      featureSlug,
      tasks,
      parallelGroups,
    };

    // Save plan to disk
    const planDir = path.join(this.basePath, featureSlug);
    await fs.mkdir(planDir, { recursive: true });
    await fs.writeFile(
      path.join(planDir, 'plan.json'),
      JSON.stringify(plan, null, 2),
      'utf-8'
    );

    return plan;
  }

  /**
   * Identify parallel execution groups via topological sort.
   * Groups tasks whose dependencies are all satisfied by previous groups.
   */
  private computeParallelGroups(tasks: TaskNode[]): string[][] {
    const groups: string[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(tasks.map((t) => t.id));

    while (remaining.size > 0) {
      const currentGroup: string[] = [];

      for (const taskId of remaining) {
        const task = tasks.find((t) => t.id === taskId)!;
        const depsMetThisRound = task.dependsOn.every((dep) => completed.has(dep));
        if (depsMetThisRound) {
          currentGroup.push(taskId);
        }
      }

      if (currentGroup.length === 0) {
        // Circular dependency or unresolvable - add remaining as final group
        groups.push([...remaining]);
        break;
      }

      groups.push(currentGroup);
      for (const id of currentGroup) {
        completed.add(id);
        remaining.delete(id);
      }
    }

    return groups;
  }

  /**
   * Generate a standard task breakdown from the requirement.
   * MVP uses keyword analysis to determine which tasks are needed.
   */
  private generateTaskTemplate(requirement: string): TaskNode[] {
    const lower = requirement.toLowerCase();
    const tasks: TaskNode[] = [];

    // Data model task - almost always needed
    tasks.push({
      id: 'data-model',
      title: 'Define data model / schema',
      description: 'Create or update database schema, entities, and migrations for the feature.',
      type: 'backend',
      dependsOn: [],
      estimatedTokens: 2000,
    });

    // API endpoint
    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('service') || !lower.includes('ui only')) {
      tasks.push({
        id: 'api-endpoint',
        title: 'Implement API endpoint(s)',
        description: 'Create REST/GraphQL endpoints with request validation, business logic routing, and response formatting.',
        type: 'backend',
        dependsOn: ['data-model'],
        estimatedTokens: 3000,
      });
    }

    // Service logic
    tasks.push({
      id: 'service-logic',
      title: 'Implement business/service logic',
      description: 'Core business logic, domain rules, and service layer implementation.',
      type: 'backend',
      dependsOn: ['data-model'],
      estimatedTokens: 4000,
    });

    // Frontend / UI
    if (lower.includes('ui') || lower.includes('screen') || lower.includes('page') || lower.includes('component') || lower.includes('frontend')) {
      tasks.push({
        id: 'ui-components',
        title: 'Build UI components',
        description: 'Create reusable UI components for the feature.',
        type: 'frontend',
        dependsOn: [],
        estimatedTokens: 3000,
      });

      tasks.push({
        id: 'ui-integration',
        title: 'Integrate UI with API',
        description: 'Connect UI components to backend API, implement state management and data fetching.',
        type: 'frontend',
        dependsOn: ['ui-components', 'api-endpoint'],
        estimatedTokens: 2500,
      });
    }

    // Infrastructure
    if (lower.includes('infra') || lower.includes('deploy') || lower.includes('config') || lower.includes('migration')) {
      tasks.push({
        id: 'infra-setup',
        title: 'Infrastructure / deployment configuration',
        description: 'Set up infrastructure, environment variables, deployment configs, and migrations.',
        type: 'infra',
        dependsOn: ['data-model'],
        estimatedTokens: 1500,
      });
    }

    // Unit tests
    tasks.push({
      id: 'unit-tests',
      title: 'Write unit tests',
      description: 'Unit tests for service logic, utilities, and isolated components.',
      type: 'test',
      dependsOn: ['service-logic'],
      estimatedTokens: 2500,
    });

    // Integration tests
    tasks.push({
      id: 'integration-tests',
      title: 'Write integration tests',
      description: 'Integration tests covering API endpoints and cross-layer interactions.',
      type: 'test',
      dependsOn: ['api-endpoint', 'service-logic'],
      estimatedTokens: 2000,
    });

    // Filter out tasks whose dependencies reference non-existent task IDs
    const taskIds = new Set(tasks.map((t) => t.id));
    for (const task of tasks) {
      task.dependsOn = task.dependsOn.filter((dep) => taskIds.has(dep));
    }

    return tasks;
  }
}
