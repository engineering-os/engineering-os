---
name: eos-init
description: Initialize Engineering OS for Cursor by generating .cursor/rules/eos-* and .cursor/skills/eos-*.
---

# EOS Init

Use this skill when setting up Engineering OS in a repository for Cursor or all supported AI coding tools.

## Workflow

1. Check whether `.eos/` already exists.
2. If initialization is needed for Cursor, run:

```bash
npx engineering-os init --cursor
```

3. If the user wants all supported adapters, run:

```bash
npx engineering-os init --all
```

4. Confirm that `.cursor/rules/eos-*` and `.cursor/skills/eos-*` were generated.
5. Remind the user that Cursor must have the EOS MCP server available to call EOS tools.
