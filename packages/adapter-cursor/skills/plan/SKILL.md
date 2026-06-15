---
name: eos-plan
description: Plan an Engineering OS feature implementation using EOS context, decisions, conventions, dependencies, and parallel task grouping.
---

# EOS Plan

Use this skill when the user wants an implementation plan, task breakdown, or dependency-aware feature plan.

## Workflow

1. Identify the feature slug and requirement. If the request is vague, ask for the missing requirement details.
2. Call `eos_context` first for relevant architecture and conventions.
3. Call `eos_plan` with the feature slug and requirement.
4. Present task groups, dependencies, risks, and verification steps.
5. Ask for approval before treating the plan as execution-ready.

## Tool Pattern

```text
eos_context { "task": "<feature requirement>" }
eos_plan { "featureSlug": "<slug>", "requirement": "<requirement>" }
```
