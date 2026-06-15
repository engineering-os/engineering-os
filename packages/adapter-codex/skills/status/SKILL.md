---
name: eos-status
description: Show Engineering OS knowledge health, active workflows, tool integration status, and recommended next actions.
---

# EOS Status

Use this skill when the user asks for Engineering OS state, health, active plans, workflows, or integration status.

## Workflow

1. Call `eos_status`.
2. Call `eos_health` when available for knowledge/index health.
3. Summarize index health, active workflows, known decisions, adapter status, and recommended next actions.
4. If Codex setup is the focus, verify `AGENTS.md`, `.agents/skills/eos-*`, and `.codex/config.toml`.

## Tool Pattern

```text
eos_status {}
eos_health {}
```
