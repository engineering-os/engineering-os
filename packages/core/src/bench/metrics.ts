export interface RetrievalResult {
  taskId: string;
  retrieved: string[];
  relevant: string[];
  contextTokens: number;
}

export interface BenchmarkScores {
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  ndcg: number;
  avgContextTokens: number;
  taskCount: number;
  perTask: TaskScore[];
}

export interface TaskScore {
  taskId: string;
  recallAt5: number;
  mrr: number;
  contextTokens: number;
  hit: boolean;
}

export function recallAtK(retrieved: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 1.0;
  const topK = retrieved.slice(0, k);
  const found = relevant.filter(r => topK.some(f => f.endsWith(r) || r.endsWith(f.split('/').slice(-2).join('/'))));
  return Math.min(found.length / relevant.length, 1.0);
}

export function meanReciprocalRank(retrieved: string[], relevant: string[]): number {
  if (relevant.length === 0) return 1.0;
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.some(r => retrieved[i].includes(r) || r.includes(retrieved[i]))) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

export function ndcgAtK(retrieved: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 1.0;
  const topK = retrieved.slice(0, k);

  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    const isRelevant = relevant.some(r => topK[i].includes(r) || r.includes(topK[i]));
    if (isRelevant) {
      dcg += 1 / Math.log2(i + 2);
    }
  }

  let idcg = 0;
  const idealCount = Math.min(relevant.length, k);
  for (let i = 0; i < idealCount; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg === 0 ? 0 : dcg / idcg;
}

export function computeScores(results: RetrievalResult[]): BenchmarkScores {
  const perTask: TaskScore[] = results.map(r => ({
    taskId: r.taskId,
    recallAt5: recallAtK(r.retrieved, r.relevant, 5),
    mrr: meanReciprocalRank(r.retrieved, r.relevant),
    contextTokens: r.contextTokens,
    hit: r.retrieved.slice(0, 5).some(f => r.relevant.some(rel => f.includes(rel) || rel.includes(f))),
  }));

  const n = perTask.length;
  return {
    recallAt5: perTask.reduce((s, t) => s + t.recallAt5, 0) / n,
    recallAt10: results.reduce((s, r) => s + recallAtK(r.retrieved, r.relevant, 10), 0) / n,
    mrr: perTask.reduce((s, t) => s + t.mrr, 0) / n,
    ndcg: results.reduce((s, r) => s + ndcgAtK(r.retrieved, r.relevant, 5), 0) / n,
    avgContextTokens: perTask.reduce((s, t) => s + t.contextTokens, 0) / n,
    taskCount: n,
    perTask,
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatReport(scores: BenchmarkScores): string {
  const lines = [
    '# Engineering OS Benchmark Results',
    '',
    '## Summary',
    '',
    `| Metric | Score |`,
    `|--------|-------|`,
    `| Recall@5 | ${(scores.recallAt5 * 100).toFixed(1)}% |`,
    `| Recall@10 | ${(scores.recallAt10 * 100).toFixed(1)}% |`,
    `| MRR (Mean Reciprocal Rank) | ${(scores.mrr * 100).toFixed(1)}% |`,
    `| nDCG@5 | ${(scores.ndcg * 100).toFixed(1)}% |`,
    `| Avg Context Tokens | ${Math.round(scores.avgContextTokens)} |`,
    `| Tasks Evaluated | ${scores.taskCount} |`,
    '',
    '## Per-Task Breakdown',
    '',
    '| Task | R@5 | MRR | Tokens | Hit? |',
    '|------|-----|-----|--------|------|',
    ...scores.perTask.map(t =>
      `| ${t.taskId} | ${(t.recallAt5 * 100).toFixed(0)}% | ${(t.mrr * 100).toFixed(0)}% | ${t.contextTokens} | ${t.hit ? 'Yes' : 'No'} |`
    ),
    '',
    '## Methodology',
    '',
    '- **Dataset:** 25 hand-labeled tasks against `examples/saas-starter`',
    '- **Retrieval:** `eos_search` (FTS5 + BM25 + synonym expansion)',
    '- **Context:** `eos_context` (token-budgeted, keyword-matched)',
    '- **Metrics:** Standard IR metrics (Recall@K, MRR, nDCG)',
    '- **Reproducible:** `npm run bench` from repo root',
    '',
    '## How to Reproduce',
    '',
    '```bash',
    'git clone https://github.com/engineering-os/engineering-os',
    'cd engineering-os',
    'npm install && npm run build',
    'npm run bench',
    '```',
  ];
  return lines.join('\n');
}
