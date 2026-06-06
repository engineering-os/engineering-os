# @engineering-os/core

The brain of Engineering OS. MCP server + knowledge engine + all intelligence.

## Modules

| Module | What it does |
|--------|-------------|
| `knowledge/` | Indexer, MetadataStore (FTS5), ContextBuilder, RouteScanner, GraphQLParser, InfraParser, SkillStore, EosWatcher |
| `architecture/` | GraphStore, ContractDiscovery, GraphLinker (auto-linking), ImpactAnalyzer, CrossRepoContextBuilder |
| `decisions/` | DecisionStore — CRUD for engineering decisions |
| `generators/` | GistBuilder (rich context), AiContextGenerator (CLAUDE.md), WorkspaceLoader |
| `agents/` | Orchestrator, agent definitions (11 specialists), prompt composer |
| `workflow/` | WorkflowEngine (DAG execution), Planner, Validator, Marketplace |
| `security-intel/` | SecurityScanner, DependencyAuditor, GradleAuditor, ThreatModeler, OWASP mapper |
| `server/` | EosMcpServer, ToolHandlers (47 tools), ContextInjector, GlobalRegistry |
| `multi-repo/` | RepoRegistry, FederatedSearch, TeamSync, AuditReporter |
| `enterprise/` | AuditStore, PostureScorer, KnowledgeExporter |
| `compliance/` | ComplianceChecker (SOC2, HIPAA, PCI-DSS) |
| `budget/` | BudgetTracker, BudgetEnforcer |

## Usage

```typescript
import { EosMcpServer, GraphStore, SkillStore, Orchestrator } from '@engineering-os/core';

const server = new EosMcpServer('/path/to/project');
await server.initialize();
await server.start(); // Starts MCP server on stdio
```

## Language Support

Code indexing: TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, Kotlin

Route scanning: Express, NestJS, Fastify, Next.js, Vert.x, Ktor, Spring Boot, Android Compose Navigation

Dependency auditing: npm, Python, Go, Java/Maven, Gradle, Rust, Ruby
