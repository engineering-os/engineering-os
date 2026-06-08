const path = require('path');
const fs = require('fs');
const { MetadataStore } = require('../knowledge/metadata-store');
const { estimateTokens } = require('./metrics');

const REPO_BASE = process.env.BENCH_REPO_BASE || path.resolve(process.env.HOME || '', 'Projects');

interface RepoConfig {
  name: string;
  dbPath: string;
  tasks: { description: string; expectFiles: string[] }[];
}

const repos: RepoConfig[] = [
  {
    name: 'spring-boot-bff',
    dbPath: path.join(REPO_BASE, 'spring-boot-bff/.eos/index/metadata.db'),
    tasks: [
      { description: 'video upload presigned URL', expectFiles: ['upload', 'video', 'presigned'] },
      { description: 'career DPR calculation', expectFiles: ['career', 'dpr', 'algorithm'] },
      { description: 'slot processing pipeline', expectFiles: ['slot', 'processing', 'bigquery'] },
      { description: 'user authentication login', expectFiles: ['auth', 'login', 'user'] },
      { description: 'leaderboard ranking', expectFiles: ['leaderboard', 'ranking'] },
      { description: 'match video status state machine', expectFiles: ['video', 'status', 'match'] },
      { description: 'tournament management', expectFiles: ['tournament'] },
      { description: 'skill report generation', expectFiles: ['skill', 'report'] },
      { description: 'booking verification', expectFiles: ['booking', 'verification'] },
      { description: 'partner video ingestion JWT', expectFiles: ['partner', 'ingestion', 'jwt'] },
    ]
  },
  {
    name: 'react-native-app',
    dbPath: path.join(REPO_BASE, 'react-native-app/.eos/index/metadata.db'),
    tasks: [
      { description: 'video analysis screen', expectFiles: ['video', 'analysis'] },
      { description: 'navigation routing', expectFiles: ['navigation', 'route', 'navigator'] },
      { description: 'authentication login flow', expectFiles: ['auth', 'login'] },
      { description: 'state management store', expectFiles: ['store', 'zustand'] },
      { description: 'API client HTTP calls', expectFiles: ['api', 'client', 'http'] },
      { description: 'push notification', expectFiles: ['notification', 'push'] },
      { description: 'player profile screen', expectFiles: ['player', 'profile'] },
      { description: 'match history list', expectFiles: ['match', 'history'] },
      { description: 'app configuration environment', expectFiles: ['config', 'env'] },
      { description: 'image upload camera', expectFiles: ['image', 'upload', 'camera'] },
    ]
  },
  {
    name: 'workflow-orchestrator',
    dbPath: path.join(REPO_BASE, 'workflow-orchestrator/.eos/index/metadata.db'),
    tasks: [
      { description: 'video data transformation 480p', expectFiles: ['transform', 'video', '480'] },
      { description: 'run DAG trigger pipeline', expectFiles: ['dag', 'run', 'pipeline'] },
      { description: 'label studio annotation', expectFiles: ['label', 'studio', 'annotation'] },
      { description: 'player image extraction', expectFiles: ['player', 'image', 'extraction'] },
      { description: 'highlights generation', expectFiles: ['highlight'] },
      { description: 'workflow monitor stuck processing', expectFiles: ['monitor', 'stuck', 'workflow'] },
      { description: 'firestore service CRUD', expectFiles: ['firestore', 'service'] },
      { description: 'ingestion controller video', expectFiles: ['ingestion', 'controller'] },
      { description: 'slack notification failure', expectFiles: ['slack', 'notification', 'failure'] },
      { description: 'span shot analysis', expectFiles: ['span', 'shot'] },
    ]
  },
  {
    name: 'ml-pipeline',
    dbPath: path.join(REPO_BASE, 'ml-pipeline/.eos/index/metadata.db'),
    tasks: [
      { description: 'court detection model', expectFiles: ['court', 'engine'] },
      { description: 'shuttle tracking TrackNet', expectFiles: ['shuttle', 'track'] },
      { description: 'rally detection inference', expectFiles: ['rally', 'inference'] },
      { description: 'player detection RF-DETR', expectFiles: ['player_detection', 'detect'] },
      { description: 'highlights video generation', expectFiles: ['highlight'] },
      { description: 'skillscore L4 to L1 aggregation', expectFiles: ['skillscore', 'score'] },
      { description: 'router Flask app run_dag', expectFiles: ['router', 'app', 'run_dag'] },
      { description: 'GPU strategy resource allocation', expectFiles: ['gpu', 'strategy', 'device'] },
      { description: 'player movement BoT-SORT', expectFiles: ['player_movement', 'movement'] },
      { description: 'shot quality VLM', expectFiles: ['shot_quality', 'quality'] },
    ]
  },
  {
    name: 'fastapi-service',
    dbPath: path.join(REPO_BASE, 'fastapi-service/.eos/index/metadata.db'),
    tasks: [
      { description: 'career DPR computation algorithm', expectFiles: ['career_dpr', 'algorithm', 'compute'] },
      { description: 'gzip middleware request decompression', expectFiles: ['gzip', 'middleware'] },
      { description: 'FastAPI health endpoint', expectFiles: ['health', 'main'] },
      { description: 'algorithm version registry', expectFiles: ['registry', 'algorithm', 'version'] },
      { description: 'padel chat endpoint', expectFiles: ['chat', 'padel'] },
    ]
  }
];

async function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Engineering OS Multi-Repo Benchmark');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const allResults: { repo: string; hits: number; total: number; avgTokens: number; hitRate: number }[] = [];

  for (const repo of repos) {
    if (!fs.existsSync(repo.dbPath)) {
      console.log(`⚠ ${repo.name}: database not found, skipping\n`);
      continue;
    }

    const store = new MetadataStore(repo.dbPath);
    store.initialize();

    let hits = 0;
    let totalTokens = 0;

    console.log(`▶ ${repo.name} (${repo.tasks.length} tasks)`);
    console.log('─'.repeat(60));

    for (const task of repo.tasks) {
      const results = store.search(task.description, { limit: 10 });
      const retrieved = results.map((r: any) => r.chunk.filePath.toLowerCase());

      const hit = task.expectFiles.some((keyword: string) =>
        retrieved.some((f: string) => f.includes(keyword.toLowerCase()))
      );

      const contentSize = results.map((r: any) => r.chunk.content).join('\n');
      const tokens = estimateTokens(contentSize);
      totalTokens += tokens;

      if (hit) hits++;
      const status = hit ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      console.log(`  ${status} ${task.description.slice(0, 50).padEnd(50)} ${tokens} tok`);
    }

    const hitRate = (hits / repo.tasks.length) * 100;
    const avgTokens = Math.round(totalTokens / repo.tasks.length);
    console.log(`\n  Hit Rate: ${hitRate.toFixed(0)}% (${hits}/${repo.tasks.length})  |  Avg Tokens: ${avgTokens}\n`);

    allResults.push({ repo: repo.name, hits, total: repo.tasks.length, avgTokens, hitRate });
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' OVERALL RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const totalHits = allResults.reduce((s, r) => s + r.hits, 0);
  const totalTasks = allResults.reduce((s, r) => s + r.total, 0);
  const overallRate = (totalHits / totalTasks) * 100;
  const overallTokens = Math.round(allResults.reduce((s, r) => s + r.avgTokens, 0) / allResults.length);

  console.log(`  Repos tested:     ${allResults.length}`);
  console.log(`  Total tasks:      ${totalTasks}`);
  console.log(`  Overall hit rate: ${overallRate.toFixed(1)}% (${totalHits}/${totalTasks})`);
  console.log(`  Avg tokens/query: ${overallTokens}`);
  console.log('');

  for (const r of allResults) {
    const bar = '█'.repeat(Math.round(r.hitRate / 5)) + '░'.repeat(20 - Math.round(r.hitRate / 5));
    console.log(`  ${r.repo.padEnd(20)} ${bar} ${r.hitRate.toFixed(0)}%`);
  }
  console.log('');
}

run().catch(console.error);
