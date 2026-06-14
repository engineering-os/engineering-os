---
name: eos-status
description: Show Engineering OS knowledge health, active workflows, Cursor integration status, and recommended next actions.
---

# EOS Status

Use this skill when the user asks for Engineering OS state, health, active plans, workflows, or integration status.

## Workflow

1. Call `eos_status`.
2. Call `eos_health` when available for knowledge/index health.
3. Summarize index health, active workflows, known decisions, adapter status, and recommended next actions.
4. If Cursor setup is the focus, verify `.cursor/rules/eos-*` and `.cursor/skills/eos-*`.

## Tool Pattern

```text
eos_status {}
eos_health {}
```
