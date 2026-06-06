---
description: Query the Engineering OS knowledge layer for task-relevant context including architecture, decisions, and patterns.
---

# EOS Context

Query the Engineering OS knowledge layer for task-relevant context. Returns architecture patterns, related code, decisions, and conventions relevant to a given question or task.

## Instructions

### Step 1: Gather the query

Accept the user's question or task description. This can be:
- A direct question ("How does authentication work in this codebase?")
- A task description ("I need to add a new API endpoint for user profiles")
- A file or module reference ("What patterns does the payment module follow?")

### Step 2: Call the tools

Call `eos_context` with the user's query for the structured bundle:

```
Tool: eos_context
Arguments:
  task: "<the user's original question or task description>"
```

Optionally also call `eos_search` for broader matches:

```
Tool: eos_search
Arguments:
  query: "<expanded keyword variant>"
  limit: 5
```

### Step 3: Present the context bundle

**Context Bundle: [query summary]**

**Architecture**:
- Related services and their boundaries
- Patterns in use in this area
- Conventions that apply

**Related Code**:
- [file path]: [brief description of relevance]

**Relevant Decisions**:
- [DEC-NNN]: [decision title] - [key rationale]

**Dependencies**:
- Internal/external dependencies relevant to the query

### Step 4: Offer follow-up

> Need more detail? I can:
> - Drill deeper into a specific file or pattern
> - Show the full text of a referenced decision
> - Search for related tests or examples
