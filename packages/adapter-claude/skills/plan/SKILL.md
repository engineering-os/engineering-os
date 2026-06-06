---
description: Generate an execution plan with parallel task groups from a refined specification.
---

# EOS Plan

Generate an execution plan from a refined specification. The plan breaks work into parallelizable task groups with dependency ordering.

## Instructions

### Step 1: Identify the feature

Ask the user for the feature slug or requirement. If they already have an approved specification from `/eos-refine`, use that slug.

### Step 2: Generate the execution plan

Call the `eos_plan` MCP tool:

```
Tool: eos_plan
Arguments:
  featureSlug: "<slug>"
  requirement: "<optional requirement text if no prior spec>"
```

### Step 3: Present the execution plan

Format the plan clearly:

**Execution Plan: [feature slug]**

**Parallel Group 1** (can run simultaneously):
| Task | Type | Dependencies |
|------|------|-------------|
| [task name] | [impl/test/config] | none |

**Parallel Group 2** (after Group 1 completes):
| Task | Type | Dependencies |
|------|------|-------------|
| [task name] | [impl/test/config] | [group 1 tasks] |

**Summary**:
- Total tasks: [count]
- Parallel groups: [count]

### Step 4: Approval gate

Ask the user:
> Does this plan look good? I can:
> 1. Approve and save (ready for `/eos-execute`)
> 2. Adjust task grouping or priorities
> 3. Regenerate with different constraints

### Step 5: Confirm

> Plan approved. Run `/eos-execute` to begin implementation with parallel agents.
