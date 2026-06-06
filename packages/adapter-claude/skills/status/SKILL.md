---
description: Show Engineering OS dashboard with workflow state, knowledge health, budget usage, and progress.
---

# EOS Status

Display a comprehensive dashboard of Engineering OS state: active workflows, knowledge health, recent decisions, and progress metrics.

## Instructions

### Step 1: Gather status data

Call both MCP tools:

```
Tool: eos_status
Arguments: {}
```

```
Tool: eos_health
Arguments: {}
```

### Step 2: Present the dashboard

**Engineering OS Status Dashboard**

**Knowledge Layer**:
| Metric | Value | Health |
|--------|-------|--------|
| Files indexed | [count] | [ok/stale] |
| Code chunks | [count] | - |
| Relationships | [count] | - |
| Coverage | [percent] | [ok/low] |

**Active Workflows**:
| Workflow | Stage | Progress |
|----------|-------|----------|
| [name] | [current stage] | [x/y] |

**Budget Usage**:
- Per-stage token consumption and limits

**System Health**:
- MCP Server: Connected
- Knowledge index: [fresh/stale]

### Step 3: Suggest actions

> Available actions:
> - `/eos-refine` - Start a new feature workflow
> - `/eos-context` - Query the knowledge layer
> - `/eos-security` - Run security scan
