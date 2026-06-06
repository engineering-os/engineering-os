---
description: Refine a raw requirement into a structured engineering specification with acceptance criteria, edge cases, and risks.
---

# EOS Refine

Refine a raw requirement into a structured engineering specification using Engineering OS's refinement engine.

## Instructions

### Step 1: Gather the requirement

Ask the user for the requirement if not already provided. Accept any of:
- A plain-text description of what they want to build
- A link to a PRD, Jira ticket, or issue
- A pasted requirement block

If the user provided the requirement in their message, use that directly.

### Step 2: Call the refinement tool

Call the `eos_refine` MCP tool with the raw requirement text:

```
Tool: eos_refine
Arguments:
  requirement: "<the raw requirement text>"
```

### Step 3: Present the structured specification

Format the returned specification clearly for the user:

**Refined Specification**

- **Title**: [spec title]
- **Slug**: [generated slug]
- **Type**: [feature | bugfix | refactor | enhancement]
- **Scope**: [affected modules/areas]

**Functional Requirements**:
[List each requirement as a bullet]

**Non-Functional Requirements**:
[Performance, security, accessibility constraints]

**Acceptance Criteria**:
[Testable criteria list]

**Dependencies**:
[External services, libraries, other features]

**Risks & Open Questions**:
[Identified risks and questions needing answers]

### Step 4: Approval gate

Ask the user:
> Does this specification look correct? I can:
> 1. Save it as-is
> 2. Refine further with your feedback
> 3. Discard and start over

**Approval is required before saving.**

### Step 5: Save

Once approved, confirm:
> Specification saved. You can now run `/eos-plan` to generate an execution plan.
