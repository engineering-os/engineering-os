---
description: Record an engineering decision with rationale, alternatives considered, and consequences.
---

# EOS Decide

Record an engineering decision with full rationale, context, and traceability. Decisions are stored in the knowledge layer and influence future context queries.

## Instructions

### Step 1: Gather decision details

If the user provided decision details in their message, extract them. Otherwise, ask for:

1. **Title**: What is this decision about?
2. **Context**: What situation prompted this decision?
3. **Options considered**: What alternatives were evaluated?
4. **Choice**: Which option was selected?
5. **Rationale**: Why was this option chosen?

### Step 2: Record the decision

Call the `eos_decide` MCP tool:

```
Tool: eos_decide
Arguments:
  title: "<decision title>"
  context: "<context>"
  decision: "<what was decided>"
  rationale: "<why>"
  alternatives: [{"option": "<alt 1>", "proscons": "<pros/cons>"}, ...]
  tags: ["<relevant>", "<tags>"]
```

### Step 3: Confirm recording

> Decision recorded: **[title]**
>
> This will now be included in relevant context queries. Future tasks in [affected area] will reference this decision.
>
> Use `eos_recall_decision` to search for this decision later.
