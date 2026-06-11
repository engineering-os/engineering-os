# Engineering OS Benchmarks

## Retrieval Quality — Multi-Repo Production Test

Tested against 5 production repositories (Spring Boot, React Native, Python ML, FastAPI, Java orchestrator) with 45 real-world developer tasks.

### Results


| Repository            | Stack              | Files Indexed | Hit Rate  |
| --------------------- | ------------------ | ------------- | --------- |
| spring-boot-bff       | Java / Spring Boot | 1,075         | 90%       |
| react-native-app      | TypeScript / Expo  | 1,294         | 100%      |
| workflow-orchestrator | Java / Cloud Run   | 252           | 100%      |
| ml-pipeline           | Python / Ray       | 242           | 100%      |
| fastapi-service       | Python / FastAPI   | 25            | 80%       |
| **Overall**           | **Mixed**          | **2,888**     | **95.6%** |


### What "hit rate" means

For each task (e.g., "add password reset to auth service"), Engineering OS searches its index and returns the top 10 results. A **hit** means at least one relevant file appears in those results.

95.6% means: for 43 out of 45 real developer tasks, Engineering OS found the right code on the first query.

### Token Efficiency


| Metric                                               | Value    |
| ---------------------------------------------------- | -------- |
| Avg tokens per query (structured context)            | 5,640    |
| Estimated tokens without EOS (full file exploration) | ~20,000  |
| **Reduction**                                        | **~72%** |


Without Engineering OS, an AI agent typically reads 10+ files to find relevant context. With an average of 5 chunks per file at ~400 tokens each, that's ~20,000 tokens of exploration. Engineering OS returns pre-ranked relevant chunks in a single call, averaging 5,640 tokens.

### Methodology

- **Tasks:** 45 hand-crafted developer queries across 5 categories (feature-add, bug-fix, refactor, exploration, security)
- **Retrieval:** `eos_search` using SQLite FTS5 with BM25 ranking + synonym expansion
- **Ground truth:** Human-labeled expected file matches per task
- **Metric:** Hit@10 (does a relevant file appear in top-10 results?)
- **Reproducible:** `BENCH_REPO_BASE=/path/to/repos node dist/bench/multi-repo-runner.js`

### Limitations

- Hit rate measures retrieval quality, not end-to-end task completion
- Tasks involving decisions/conventions (stored in YAML, not code files) are not measured here
- Token reduction estimate assumes 10-file exploration baseline (actual varies by task complexity)

---

## Model Comparison: Haiku + EOS vs Sonnet (no EOS)

The key question: can a cheaper model with Engineering OS match a frontier model without it?

### Setup

- **Haiku + EOS:** Claude Haiku 4.5 ($0.80/M input) with full EOS tool access
- **Sonnet (no EOS):** Claude Sonnet 4.6 ($3/M input) using only grep, find, and Read
- **Tasks:** 10 real developer questions against `examples/saas-starter`
- **Graded on:** correctness, confidence (self-reported 1-5), and efficiency

### Results

| Metric | Haiku + EOS | Sonnet (no EOS) |
|--------|-------------|-----------------|
| Tasks answered correctly | 8/10 | 7/10 |
| Average confidence | 4.1/5 | 3.9/5 |
| Total tool calls | 11 | 29 |
| Tokens consumed | ~5,600 | ~7,000 |
| Found architecture decisions | Yes | No |
| Found security conventions | Yes | Partial |

### The Killer Difference

**Task 4: "What rate limiting approach was decided on, and why?"**

- **Haiku + EOS:** "Redis-based rate limiting (DEC-001). Rationale: supports multi-instance distributed throttling. Alternative considered: in-memory (rejected due to single-instance limitation)." Confidence: 5.
- **Sonnet (no EOS):** "Rate limiting uses a rateLimiter middleware... No decision documentation found." Confidence: 2.

EOS has knowledge that doesn't exist in source code. Grep can't find a YAML decision record it doesn't know to look for.

### Cost Comparison

| Model | Cost per task | Total (10 tasks) |
|-------|--------------|------------------|
| Haiku + EOS | ~$0.005 | ~$0.05 |
| Sonnet (no EOS) | ~$0.012 | ~$0.12 |

**Haiku + EOS is 2.4x cheaper while delivering equal or better results.**

### Headline

> Haiku ($0.80/M) + Engineering OS outperforms Sonnet ($3/M) on codebase understanding tasks. Fewer tool calls, lower cost, and finds knowledge that doesn't exist in code.

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

