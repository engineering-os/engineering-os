# @engineering-os/shared

Shared type definitions for Engineering OS.

## What's in here

- `types/knowledge.ts` — IndexedFile, SearchResult, CodeChunk, ContextBundle
- `types/decisions.ts` — Decision, DecisionOption
- `types/architecture.ts` — ServiceModel, Pattern, Convention
- `types/workflow.ts` — Workflow, WorkflowStage
- `types/security.ts` — SecurityFinding, SecurityScanResult
- `types/graph.ts` — GraphService, GraphConnection, GraphContract, ImpactResult
- `types/multi-repo.ts` — LinkedRepo, TeamManifest, AuditReport
- `types/config.ts` — ProjectConfig
- `types/tools.ts` — Tool input/output schemas

## Usage

```typescript
import { GraphService, SearchResult, Decision } from '@engineering-os/shared';
```

All types are re-exported from the package root.
