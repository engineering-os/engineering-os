---
name: eos-team
description: Manage shared Engineering OS conventions, patterns, security policies, and team knowledge synchronization.
---

# EOS Team

Use this skill when the user wants to add or inspect team conventions, shared patterns, security policies, or synchronized knowledge.

## Workflow

1. Call `eos_team_sync` with action `status`.
2. Add conventions, patterns, or policies only when the user asks for a durable team rule.
3. Sync from teammate repositories only with an explicit path and user confirmation.
4. Mention that durable conventions influence future Codex via `AGENTS.md` and EOS MCP context.

## Tool Pattern

```text
eos_team_sync { "action": "status" }
eos_team_sync { "action": "add-convention", "name": "PascalCase components", "rule": "React components use PascalCase" }
eos_team_sync { "action": "add-policy", "rule": "All endpoints validate input", "severity": "high", "category": "input-validation" }
```
