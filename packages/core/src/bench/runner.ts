/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");
const fs = require("fs");

const { MetadataStore } = require("../knowledge/metadata-store");
const { ContextBuilder } = require("../knowledge/context-builder");
const { estimateTokens, computeScores, formatReport } = require("./metrics");

interface Task {
  id: string;
  description: string;
  relevant_files: string[];
  relevant_decisions: string[];
  relevant_conventions: string[];
  category: string;
}

interface TaskResult {
  taskId: string;
  retrieved: string[];
  relevant: string[];
  contextTokens: number;
}

async function run(): Promise<void> {
  // Load tasks - check dist/bench first (runtime), fallback to src/bench (dev)
  let tasksPath = path.resolve(__dirname, "tasks.json");
  if (!fs.existsSync(tasksPath)) {
    tasksPath = path.resolve(__dirname, "../../src/bench/tasks.json");
  }
  if (!fs.existsSync(tasksPath)) {
    console.error(`Tasks file not found. Searched:`);
    console.error(`  - ${path.resolve(__dirname, "tasks.json")}`);
    console.error(`  - ${path.resolve(__dirname, "../../src/bench/tasks.json")}`);
    process.exit(1);
  }
  const tasks: Task[] = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));

  // Locate example project database
  const exampleProject = path.resolve(
    __dirname,
    "../../../../examples/saas-starter"
  );
  const dbPath = path.join(exampleProject, ".eos", "index", "metadata.db");

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at: ${dbPath}`);
    console.error(
      "Run indexing on examples/saas-starter first: eos index --project examples/saas-starter"
    );
    process.exit(1);
  }

  console.log(`Loading metadata from: ${dbPath}`);
  console.log(`Running ${tasks.length} benchmark tasks...\n`);

  // Initialize stores
  const store = new MetadataStore(dbPath);
  store.initialize();

  const contextBuilder = new ContextBuilder(store);

  // Run each task
  const results: TaskResult[] = [];

  for (const task of tasks) {
    process.stdout.write(
      `  [${task.id}] ${task.description.slice(0, 50).padEnd(50)}  `
    );

    // Search using MetadataStore
    const searchResults = store.search(task.description, { limit: 10 });
    const retrieved: string[] = searchResults.map(
      (r: { chunk: { filePath: string } }) => r.chunk.filePath
    );

    // Estimate context tokens via ContextBuilder
    let contextTokens = 0;
    try {
      const contextBundle = await contextBuilder.buildContext(task.description);
      const contextText = [
        ...contextBundle.relevantFiles,
        ...contextBundle.relevantApis,
        ...contextBundle.relatedDecisions,
        ...contextBundle.codingPatterns,
      ].join("\n");
      contextTokens = estimateTokens(contextText);
    } catch {
      // Fallback: estimate from raw search content
      const contentText = searchResults
        .map((r: { chunk: { content: string } }) => r.chunk.content)
        .join("\n");
      contextTokens = estimateTokens(contentText);
    }

    results.push({
      taskId: task.id,
      retrieved,
      relevant: task.relevant_files,
      contextTokens,
    });

    // Print hit/miss for quick feedback
    const hit = retrieved
      .slice(0, 5)
      .some((f: string) =>
        task.relevant_files.some(
          (rel: string) => f.includes(rel) || rel.includes(f)
        )
      );
    console.log(hit ? "HIT" : "MISS");
  }

  // Compute scores
  const scores = computeScores(results);

  // Write results JSON
  const resultsDir = path.resolve(__dirname, "results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const latestPath = path.join(resultsDir, "latest.json");
  const output = {
    timestamp: new Date().toISOString(),
    project: "examples/saas-starter",
    scores: {
      recallAt5: scores.recallAt5,
      recallAt10: scores.recallAt10,
      mrr: scores.mrr,
      ndcg: scores.ndcg,
      avgContextTokens: scores.avgContextTokens,
      taskCount: scores.taskCount,
    },
    perTask: scores.perTask,
  };

  fs.writeFileSync(latestPath, JSON.stringify(output, null, 2));
  console.log(`\nResults written to: ${latestPath}`);

  // Write markdown report
  const docsDir = path.resolve(__dirname, "../../docs");
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const reportPath = path.join(docsDir, "benchmarks.md");
  const report = formatReport(scores);
  fs.writeFileSync(reportPath, report);
  console.log(`Report written to: ${reportPath}`);

  // Print summary to stdout
  console.log("\n--- Benchmark Summary ---");
  console.log(`  Recall@5:    ${(scores.recallAt5 * 100).toFixed(1)}%`);
  console.log(`  Recall@10:   ${(scores.recallAt10 * 100).toFixed(1)}%`);
  console.log(`  MRR:         ${(scores.mrr * 100).toFixed(1)}%`);
  console.log(`  nDCG@5:      ${(scores.ndcg * 100).toFixed(1)}%`);
  console.log(`  Avg Tokens:  ${Math.round(scores.avgContextTokens)}`);
  console.log(`  Tasks:       ${scores.taskCount}`);
}

run().catch((err: Error) => {
  console.error("Benchmark runner failed:", err);
  process.exit(1);
});
