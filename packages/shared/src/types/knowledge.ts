/** A parsed code chunk from a source file */
export interface CodeChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
  type: 'function' | 'class' | 'interface' | 'module' | 'export' | 'method' | 'type';
  name: string;
  embedding?: number[];
}

/** An indexed source file with its chunks and relationships */
export interface IndexedFile {
  filePath: string;
  language: string;
  lastModified: string;
  chunks: CodeChunk[];
  imports: string[];
  exports: string[];
}

/** A search result with relevance score */
export interface SearchResult {
  chunk: CodeChunk;
  score: number;
  metadata: Record<string, unknown>;
}

/** A token-budgeted context bundle for a task */
export interface ContextBundle {
  relevantFiles: string[];
  relevantApis: string[];
  relatedDecisions: string[];
  codingPatterns: string[];
  estimatedTokens: number;
}
