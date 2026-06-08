# Engineering OS Benchmarks

## Retrieval Quality — Multi-Repo Production Test

Tested against 5 production repositories (Spring Boot, React Native, Python ML, FastAPI, Java orchestrator) with 45 real-world developer tasks.

### Results

| Repository | Stack | Files Indexed | Hit Rate |
|-----------|-------|---------------|----------|
| spring-boot-bff | Java / Spring Boot | 1,075 | 90% |
| react-native-app | TypeScript / Expo | 1,294 | 100% |
| workflow-orchestrator | Java / Cloud Run | 252 | 100% |
| ml-pipeline | Python / Ray | 242 | 100% |
| fastapi-service | Python / FastAPI | 25 | 80% |
| **Overall** | **Mixed** | **2,888** | **95.6%** |

### What "hit rate" means

For each task (e.g., "add password reset to auth service"), Engineering OS searches its index and returns the top 10 results. A **hit** means at least one relevant file appears in those results.

95.6% means: for 43 out of 45 real developer tasks, Engineering OS found the right code on the first query.

### Token Efficiency

| Metric | Value |
|--------|-------|
| Avg tokens per query (structured context) | 5,640 |
| Estimated tokens without EOS (full file exploration) | ~45,000+ |
| **Reduction** | **~87%** |

Without Engineering OS, an AI agent typically reads 8-15 files to find relevant context (averaging 3,000-5,000 tokens per file). With Engineering OS, it gets pre-ranked, relevant chunks in a single call.

### Methodology

- **Tasks:** 45 hand-crafted developer queries across 5 categories (feature-add, bug-fix, refactor, exploration, security)
- **Retrieval:** `eos_search` using SQLite FTS5 with BM25 ranking + synonym expansion
- **Ground truth:** Human-labeled expected file matches per task
- **Metric:** Hit@10 (does a relevant file appear in top-10 results?)
- **Reproducible:** `BENCH_REPO_BASE=/path/to/repos node dist/bench/multi-repo-runner.js`

### Limitations

- Hit rate measures retrieval, not end-to-end task completion
- Tasks involving decisions/conventions (stored in YAML, not code) are not measured here
- The 5-file example project scores lower (46% R@5) due to limited content for keyword matching
- No model comparison benchmark yet (Haiku+EOS vs Sonnet planned)

## How to Reproduce

```bash
git clone https://github.com/engineering-os/engineering-os
cd engineering-os
npm install && npm run build

# Run against example project
npm run bench --workspace=packages/core

# Run against your own repos (index them first with eos init)
BENCH_REPO_BASE=/path/to/your/repos node packages/core/dist/bench/multi-repo-runner.js
```
