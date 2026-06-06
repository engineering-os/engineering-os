import { ContextBundle, SearchResult } from '@engineering-os/shared';
import { MetadataStore } from './metadata-store';

const DEFAULT_MAX_TOKENS = 8000;

export interface ContextDependencies {
  decisionStore?: { search(query: string): Promise<Array<{ id: string; title: string; decision: string; rationale?: string; tags?: string[] }>> };
  architectureStore?: { getPatterns(area?: string): Promise<Array<{ name: string; description?: string; usage?: string }>> };
  artifactStore?: { getAll(featureSlug: string): Promise<Array<{ stage: string; content: string }>> };
}

export class ContextBuilder {
  private deps: ContextDependencies;

  constructor(
    private metadataStore: MetadataStore,
    deps?: ContextDependencies
  ) {
    this.deps = deps || {};
  }

  async buildContext(task: string, maxTokens?: number): Promise<ContextBundle> {
    const budget = maxTokens ?? DEFAULT_MAX_TOKENS;

    const searchResults = this.metadataStore.search(task, { limit: 30 });

    const [relatedDecisions, codingPatterns] = await Promise.all([
      this.findRelatedDecisions(task),
      this.findRelevantPatterns(task),
    ]);

    if (searchResults.length === 0 && relatedDecisions.length === 0) {
      return {
        relevantFiles: [],
        relevantApis: [],
        relatedDecisions,
        codingPatterns,
        estimatedTokens: 0,
      };
    }

    const decisionTokens = relatedDecisions.reduce(
      (sum, d) => sum + this.estimateTokens(d), 0
    );
    const patternTokens = codingPatterns.reduce(
      (sum, p) => sum + this.estimateTokens(p), 0
    );
    const remainingBudget = budget - decisionTokens - patternTokens;

    const enrichedResults = this.enrichWithRelationships(searchResults);
    const fittedResults = this.fitToBudget(enrichedResults, Math.max(remainingBudget, 0));

    const codeTokens = fittedResults.reduce(
      (sum, r) => sum + this.estimateTokens(r.chunk.content),
      0
    );

    const relevantFiles = [...new Set(fittedResults.map((r) => r.chunk.filePath))];
    const relevantApis = fittedResults
      .filter((r) => r.chunk.type === 'function' || r.chunk.type === 'method')
      .map((r) => `${r.chunk.filePath}:${r.chunk.name}`);

    return {
      relevantFiles,
      relevantApis,
      relatedDecisions,
      codingPatterns,
      estimatedTokens: codeTokens + decisionTokens + patternTokens,
    };
  }

  private async findRelatedDecisions(task: string): Promise<string[]> {
    if (!this.deps.decisionStore) return [];
    const keywords = this.extractKeywords(task);
    const allDecisions: Array<{ id: string; title: string; decision: string; rationale?: string }> = [];

    for (const keyword of keywords.slice(0, 3)) {
      const found = await this.deps.decisionStore.search(keyword);
      for (const d of found) {
        if (!allDecisions.some((existing) => existing.id === d.id)) {
          allDecisions.push(d);
        }
      }
    }

    return allDecisions.slice(0, 5).map(
      (d) => `[${d.id}] ${d.title}: ${d.decision}${d.rationale ? ` (${d.rationale.slice(0, 150)})` : ''}`
    );
  }

  private async findRelevantPatterns(task: string): Promise<string[]> {
    if (!this.deps.architectureStore) return [];
    const patterns = await this.deps.architectureStore.getPatterns();
    const lowerTask = task.toLowerCase();

    return patterns
      .filter((p) => {
        const name = p.name.toLowerCase();
        const desc = (p.description || '').toLowerCase();
        return lowerTask.includes(name) || name.split('-').some((word) => lowerTask.includes(word)) ||
          desc.split(' ').some((word) => word.length > 4 && lowerTask.includes(word));
      })
      .slice(0, 5)
      .map((p) => `${p.name}: ${p.description || p.usage || ''}`);
  }

  private extractKeywords(task: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'need', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'and', 'but', 'or', 'not', 'no', 'all',
      'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
      'than', 'too', 'very', 'just', 'because', 'how', 'what', 'which', 'who',
      'when', 'where', 'why', 'this', 'that', 'these', 'those', 'i', 'we', 'you',
      'it', 'they', 'my', 'our', 'your', 'its', 'their']);

    return task
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }

  private enrichWithRelationships(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const enriched: SearchResult[] = [];

    for (const result of results) {
      const key = `${result.chunk.filePath}:${result.chunk.startLine}`;
      if (seen.has(key)) continue;
      seen.add(key);
      enriched.push(result);

      try {
        const deps = this.metadataStore.findDependencies(result.chunk.filePath);
        const dependents = this.metadataStore.findDependents(result.chunk.filePath);

        const relatedFiles = [...deps, ...dependents].slice(0, 3);
        for (const relFile of relatedFiles) {
          const relResults = results.filter(
            (r) => r.chunk.filePath === relFile && !seen.has(`${r.chunk.filePath}:${r.chunk.startLine}`)
          );
          for (const rr of relResults) {
            const rrKey = `${rr.chunk.filePath}:${rr.chunk.startLine}`;
            if (!seen.has(rrKey)) {
              seen.add(rrKey);
              enriched.push({ ...rr, score: (rr.score ?? 0) * 0.8 });
            }
          }
        }
      } catch {
        // Relationships may not exist yet
      }
    }

    return enriched.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  private fitToBudget(results: SearchResult[], maxTokens: number): SearchResult[] {
    const fitted: SearchResult[] = [];
    let usedTokens = 0;

    for (const result of results) {
      const tokens = this.estimateTokens(result.chunk.content);
      if (usedTokens + tokens > maxTokens) {
        break;
      }
      fitted.push(result);
      usedTokens += tokens;
    }

    return fitted;
  }
}
