---
name: eos-init
description: Initialize Engineering OS for a repository and generate Codex-native AGENTS.md, repo skills, and optional MCP configuration.
---

# EOS Init

Use this skill when setting up Engineering OS in a repository for Codex or other AI coding tools.

## Workflow

1. Check whether `.eos/` already exists.
2. If initialization is needed, run:

```bash
npx engineering-os init --codex
```

3. If the user wants all supported adapters, run:

```bash
npx engineering-os init --all
```

4. Confirm that `AGENTS.md`, `.agents/skills/eos-*`, and `.codex/config.toml` were generated.
5. Tell the user Codex must trust the project for project-local `.codex/config.toml` MCP configuration to load.
