import { AgentDefinition, AgentPrompt } from './types';

/**
 * Context provided to the prompt composer from upstream pipeline stages
 * and the EOS knowledge layer.
 */
export interface PromptContext {
  requirement?: string;
  projectContext: string;
  relevantSkills: string[];
  previousStageOutput?: string;
  conventions?: string[];
  decisions?: string[];
}

/**
 * Composes a complete, execution-ready prompt by combining agent identity,
 * project context, learned skills, prior-stage output, and constraints.
 *
 * The system prompt establishes the persona (role, expertise, constraints).
 * The user prompt provides the concrete task with all available context.
 */
export function composePrompt(
  definition: AgentDefinition,
  context: PromptContext,
): AgentPrompt {
  const systemPrompt = buildSystemPrompt(definition);
  const userPrompt = buildUserPrompt(definition, context);

  return {
    agentName: definition.name,
    systemPrompt,
    userPrompt,
    expectedOutputDescription: deriveExpectedOutput(definition),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildSystemPrompt(definition: AgentDefinition): string {
  const sections: string[] = [];

  // Identity
  sections.push(`You are ${definition.name}, a ${definition.role}.`);

  // Expertise
  if (definition.expertise.length > 0) {
    sections.push(
      `Your areas of expertise:\n${definition.expertise.map((e) => `- ${e}`).join('\n')}`,
    );
  }

  // Core directive from the definition
  if (definition.systemPrompt) {
    sections.push(definition.systemPrompt);
  }

  // Constraints
  if (definition.constraints.length > 0) {
    sections.push(
      `Constraints you MUST follow:\n${definition.constraints.map((c) => `- ${c}`).join('\n')}`,
    );
  }

  return sections.join('\n\n');
}

function buildUserPrompt(
  definition: AgentDefinition,
  context: PromptContext,
): string {
  const sections: string[] = [];

  // Requirement (the core task)
  if (context.requirement) {
    sections.push(`## Requirement\n\n${context.requirement}`);
  }

  // Project context from GistBuilder
  if (context.projectContext) {
    sections.push(
      `## Project Context\n\n${context.projectContext}`,
    );
  }

  // Relevant conventions
  if (context.conventions && context.conventions.length > 0) {
    sections.push(
      `## Conventions\n\nFollow these project conventions:\n${context.conventions.map((c) => `- ${c}`).join('\n')}`,
    );
  }

  // Prior decisions that may inform this work
  if (context.decisions && context.decisions.length > 0) {
    sections.push(
      `## Relevant Decisions\n\nThese decisions have already been made and must be respected:\n${context.decisions.map((d) => `- ${d}`).join('\n')}`,
    );
  }

  // Learned skills (gotchas, patterns, connections)
  if (context.relevantSkills.length > 0) {
    sections.push(
      `## Learned Skills & Gotchas\n\nPast sessions discovered the following relevant knowledge:\n${context.relevantSkills.map((s) => `- ${s}`).join('\n')}`,
    );
  }

  // Output from the previous pipeline stage
  if (context.previousStageOutput) {
    sections.push(
      `## Previous Stage Output\n\nThe prior pipeline stage produced:\n\n${context.previousStageOutput}`,
    );
  }

  // Instruction footer
  sections.push(
    `## Instructions\n\nProduce your output as structured JSON matching your role's schema. Be precise, actionable, and grounded in the project context above. Do not invent services, files, or patterns that are not evidenced in the context.`,
  );

  return sections.join('\n\n');
}

function deriveExpectedOutput(definition: AgentDefinition): string {
  const roleOutputMap: Record<string, string> = {
    'product-refiner': 'A ProductSpec JSON object with feature, problem, impact, user stories, acceptance criteria, rollout plan, and risks.',
    'tech-refiner': 'A TechSpec JSON object with affected services, technical constraints, reuse opportunities, new work items, and risks.',
    'planner': 'An ExecutionPlan JSON object with ordered steps, parallelizable groups, and estimated duration.',
    'fe-engineer': 'Implementation code for frontend components, hooks, and screens following project conventions.',
    'be-engineer': 'Implementation code for backend services, controllers, DTOs, and database migrations.',
    'devops-engineer': 'Infrastructure-as-code changes, CI/CD pipeline updates, and deployment configurations.',
    'security-engineer': 'Security analysis with threat model, vulnerability assessment, and recommended mitigations.',
    'ai-engineer': 'AI/ML pipeline code, model integration, and prompt engineering artifacts.',
    'fullstack-engineer': 'End-to-end implementation spanning frontend and backend with API contracts.',
    'qa-engineer': 'Test plans, test cases, and automated test implementations.',
  };

  return (
    roleOutputMap[definition.name] ??
    `Structured output appropriate for the ${definition.role} role, as JSON.`
  );
}
