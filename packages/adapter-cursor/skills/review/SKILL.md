---
name: eos-review
description: Run an architecture-aware Engineering OS code review focused on serious bugs, conventions, decisions, and dependency impact.
---

# EOS Review

Use this skill when the user asks for review, architecture review, PR review, or change validation.

## Workflow

1. Determine the review scope: current branch, changed files, PR, or feature slug.
2. Call `eos_review` when a feature slug or EOS workflow exists.
3. Call `eos_impact` for exported interfaces, APIs, schemas, package boundaries, or shared contracts.
4. Lead with findings ordered by severity. Keep summaries secondary.
5. Focus on P0/P1 issues, security regressions, broken contracts, and decision/convention violations.

## Tool Pattern

```text
eos_review { "featureSlug": "<feature slug>" }
eos_impact { "target": "<changed API or shared file>" }
```
