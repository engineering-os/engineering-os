---
name: eos-refine
description: Refine a raw requirement into a structured Engineering OS specification with acceptance criteria, risks, and open questions.
---

# EOS Refine

Use this skill when the user has a rough feature, bug, or enhancement request that needs to become an implementation-ready specification.

## Workflow

1. Gather the raw requirement from the prompt or ask for it.
2. Call `eos_refine`.
3. Present scope, functional requirements, non-functional requirements, acceptance criteria, dependencies, risks, and open questions.
4. Ask for approval before saving or moving to `$eos-plan`.

## Tool Pattern

```text
eos_refine { "requirement": "<raw requirement>" }
```
