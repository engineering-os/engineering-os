---
name: eos-multi-repo
description: Search linked repositories and manage the Engineering OS multi-repo dependency graph.
---

# EOS Multi-Repo

Use this skill when the task spans repositories, shared services, cross-repo dependencies, or linked workspace context.

## Workflow

1. Call `eos_team_sync` with action `status` to understand linked repos.
2. Use `eos_search_all` for cross-repo code, pattern, and decision lookup.
3. Use `eos_link_repo` or `eos_unlink_repo` only when the user explicitly asks to modify linked repos.
4. Before shared interface changes, call `eos_impact`.

## Tool Pattern

```text
eos_search_all { "query": "auth middleware" }
eos_link_repo { "name": "backend-api", "path": "/path/to/backend" }
eos_unlink_repo { "name": "old-repo" }
```
