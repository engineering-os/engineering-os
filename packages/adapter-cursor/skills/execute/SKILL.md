---
name: eos-execute
description: Execute an approved Engineering OS implementation plan while following EOS context, conventions, dependencies, and validation.
---

# EOS Execute

Use this skill when the user asks Cursor to execute an EOS plan or implement from a previously approved feature plan.

## Workflow

1. Call `eos_status` to find active workflows and plans.
2. Load relevant context with `eos_context` and conventions with `eos_conventions`.
3. Execute tasks in dependency order. Parallelize only when the current environment and user request make that safe.
4. Run focused tests or validation for changed behavior.
5. Report changed files, verification results, and any blocked tasks.

If no approved plan exists, recommend `$eos-plan` first.
