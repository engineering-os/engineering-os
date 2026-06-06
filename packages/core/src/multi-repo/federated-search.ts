import * as path from 'path';
import { LinkedRepo, FederatedSearchResult, FederatedResultItem } from '@engineering-os/shared';
import { MetadataStore } from '../knowledge/metadata-store';
import { expandQuery } from '../knowledge/query-expander';
import { RepoRegistry } from './repo-registry';

export class FederatedSearch {
  constructor(private registry: RepoRegistry) {}

  async search(
    query: string,
    options?: { limit?: number; scope?: string; repos?: string[]; maxTotalTokens?: number }
  ): Promise<FederatedSearchResult[]> {
    const limit = options?.limit ?? 10;
    const linkedRepos = await this.registry.getLinkedRepos();

    const targetRepos = options?.repos
      ? linkedRepos.filter((r) => options.repos!.includes(r.name))
      : linkedRepos;

    const results: FederatedSearchResult[] = [];
    const queries = expandQuery(query);
    const maxTotalTokens = options?.maxTotalTokens;
    let tokensUsed = 0;

    for (const repo of targetRepos) {
      if (maxTotalTokens && tokensUsed >= maxTotalTokens) break;

      try {
        const repoResults = await this.searchRepo(repo, queries, limit, options?.scope);
        if (repoResults.length > 0) {
          // Apply token budget if set
          if (maxTotalTokens) {
            const perRepoLimit = Math.floor((maxTotalTokens - tokensUsed) / Math.max(1, targetRepos.length));
            let repoTokens = 0;
            const bounded: typeof repoResults = [];
            for (const item of repoResults) {
              const itemTokens = Math.ceil(item.content.length / 4);
              if (repoTokens + itemTokens > perRepoLimit) break;
              bounded.push(item);
              repoTokens += itemTokens;
            }
            tokensUsed += repoTokens;
            if (bounded.length > 0) {
              results.push({ repo: repo.name, repoPath: repo.path, results: bounded });
            }
          } else {
            results.push({ repo: repo.name, repoPath: repo.path, results: repoResults });
          }
        }
      } catch {
        // Skip repos whose indexes are unavailable
      }
    }

    return results;
  }

  private async searchRepo(
    repo: LinkedRepo,
    queries: string[],
    limit: number,
    scope?: string
  ): Promise<FederatedResultItem[]> {
    const dbPath = path.join(repo.eosDir, 'index', 'metadata.db');
    const store = new MetadataStore(dbPath);
    store.initialize();

    const seen = new Set<string>();
    const items: FederatedResultItem[] = [];

    for (const q of queries) {
      const searchResults = store.search(q, { limit, scope });
      for (const r of searchResults) {
        const key = `${r.chunk.filePath}:${r.chunk.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          type: 'code',
          filePath: r.chunk.filePath,
          name: r.chunk.name,
          score: r.score,
          content: r.chunk.content.slice(0, 500),
          startLine: r.chunk.startLine,
          endLine: r.chunk.endLine,
        });
      }
    }

    return items.slice(0, limit);
  }
}
