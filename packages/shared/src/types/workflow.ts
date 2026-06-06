/** A single stage in a workflow */
export interface WorkflowStage {
  id: string;
  description?: string;
  agent?: string;
  dependsOn: string[];
  approval: 'required' | 'optional' | 'none';
  output: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

/** A workflow instance */
export interface Workflow {
  name: string;
  slug?: string;
  description?: string;
  stages: WorkflowStage[];
  currentStage?: string;
  startedAt?: string;
  completedAt?: string;
}

/** A versioned workflow artifact */
export interface WorkflowArtifact {
  stage: string;
  path: string;
  content: string;
  version: number;
  createdAt: string;
}
