---
description: Execute an approved implementation plan using parallel agents in isolated worktrees.
---

# EOS Execute

Execute an approved implementation plan using parallel agents. Independent tasks run simultaneously in separate worktrees, with progress monitoring and coordination.

## Instructions

### Step 1: Load the approved plan

Call `eos_status` to find active workflows and plans:

```
Tool: eos_status
Arguments: {}
```

If no approved plan is found:
> No approved plan found. Run `/eos-plan` first to generate and approve a plan.

### Step 2: Confirm execution

Present the plan summary and ask:
> Ready to execute plan: **[plan title]**
> - [N] tasks in [M] parallel groups
>
> Start execution? (yes/no)

### Step 3: Execute parallel groups

For each parallel group, spawn tasks concurrently using the Agent tool with `isolation: "worktree"`:

For each task in the current group:
- Provide the task description, relevant context from `eos_context`, and conventions from `eos_conventions`
- Each agent works in an isolated worktree
- Monitor with TaskList and report progress

### Step 4: Handle completion

When all groups are done:

> **Execution Complete**
> - Tasks completed: [N]/[total]
> - Files modified: [list]
>
> Next steps:
> - `/eos-review` to generate architecture review
> - `/eos-security` to run security scan on changes
