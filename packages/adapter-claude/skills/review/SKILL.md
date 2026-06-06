---
description: Generate an architecture-aware code review checking patterns, conventions, and decision alignment.
---

# EOS Review

Generate an architecture-aware code review using Engineering OS's knowledge of codebase patterns, decisions, and conventions.

## Instructions

### Step 1: Determine review scope

Accept the review scope from the user:
- A feature slug (reviews all changes for that feature)
- "current" or no argument (reviews current branch)

### Step 2: Call the review tool

Call the `eos_review` MCP tool:

```
Tool: eos_review
Arguments:
  featureSlug: "<feature slug>"
```

### Step 3: Present the review

**Architecture Review: [scope]**

**Summary**: [one-line assessment]

For each finding:
- **[severity]** - [title]
- Location: [file:line]
- Pattern violated: [which pattern/convention]
- Recommendation: [how to fix]

**Metrics**:
- Architecture compliance
- Pattern consistency
- Decision alignment

### Step 4: Offer remediation

If issues found:
> Found [N] issues. Would you like me to:
> 1. Fix critical issues automatically
> 2. Explain any finding in more detail

If passes:
> Code follows architecture patterns and decisions. Ready to merge.
