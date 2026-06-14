import * as path from 'path';
import {
  AiContextGenerator,
  ArchitectureStore,
  DecisionStore,
  GraphStore,
} from '@engineering-os/core';
import { readConfig } from './config.js';

export async function createAiContextGenerator(rootPath: string, projectName?: string): Promise<AiContextGenerator> {
  const eosDir = path.join(rootPath, '.eos');
  const graphStore = new GraphStore(path.join(eosDir, 'graph', 'services.db'));
  graphStore.initialize();

  let resolvedProjectName = projectName;
  if (!resolvedProjectName) {
    try {
      const config = await readConfig(rootPath);
      resolvedProjectName = config.projectName;
    } catch {
      resolvedProjectName = path.basename(rootPath);
    }
  }

  return new AiContextGenerator({
    architectureStore: new ArchitectureStore(path.join(eosDir, 'knowledge', 'architecture')),
    decisionStore: new DecisionStore(path.join(eosDir, 'knowledge', 'decisions')),
    graphStore,
    rootPath,
    projectName: resolvedProjectName,
  });
}
