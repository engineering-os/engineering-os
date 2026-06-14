---
name: eos-decide
description: Record a durable Engineering OS architecture or implementation decision with context, rationale, alternatives, and tags.
---

# EOS Decide

Use this skill when the user wants to record, document, or preserve an engineering decision for future Cursor, Codex, Claude, or MCP sessions.

## Workflow

1. Extract the decision title, context, chosen option, rationale, alternatives, and tags from the user's message.
2. If any required part is missing, ask concise follow-up questions.
3. Call `eos_decide`.
4. Confirm what was recorded and where future agents should recall it.

## Tool Pattern

```text
eos_decide {
  "title": "<decision title>",
  "context": "<why this decision is needed>",
  "decision": "<chosen option>",
  "rationale": "<why this option was chosen>",
  "alternatives": [{ "option": "<alternative>", "proscons": "<tradeoffs>" }],
  "tags": ["<area>", "<topic>"]
}
```
