---
name: eos-context
description: Query Engineering OS for task-relevant project context, architecture, decisions, conventions, dependencies, and related code.
---

# EOS Context

Use this skill when the user asks how the codebase works, where something lives, what conventions apply, or what context is needed before implementation.

## Workflow

1. Use `eos_context` with the user's task or question.
2. Use `eos_search` for targeted follow-up lookup when the context bundle is not enough.
3. Summarize architecture, relevant files, decisions, dependencies, and conventions.
4. Keep the answer actionable and cite paths returned by EOS when available.

## Tool Pattern

```text
eos_context { "task": "<user task or question>" }
eos_search { "query": "<targeted lookup>", "limit": 5 }
```
