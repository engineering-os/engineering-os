---
description: Initialize Engineering OS in the current repository. Sets up knowledge layer, indexes codebase, and discovers architecture.
---

# EOS Init

Initialize Engineering OS in the current repository. This sets up the knowledge layer, indexes the codebase, and discovers architecture patterns.

## Instructions

### Step 1: Check existing initialization

Check if `.eos/` directory already exists in the current working directory.

```bash
ls .eos/ 2>/dev/null
```

If `.eos/` already exists, inform the user:
> Engineering OS is already initialized in this repository. Use `/eos-status` to see current state, or delete `.eos/` and re-run to reinitialize.

If the user wants to reinitialize, confirm before proceeding.

### Step 2: Run initialization

Run the Engineering OS initialization via CLI:

```bash
npx engineering-os init
```

This will:
- Create the `.eos/` directory structure
- Index all source files in the repository
- Discover architecture patterns (layers, modules, conventions)
- Detect the tech stack and frameworks
- Build the initial knowledge graph

### Step 3: Report results

After initialization completes, call the `eos_status` MCP tool to retrieve the initialization summary.

Present the results to the user in this format:

**Engineering OS Initialized**

- Files indexed: [count]
- Architecture discovered: [patterns found]
- Tech stack: [detected frameworks/languages]
- Patterns found: [naming conventions, layer structure, etc.]
- Knowledge layer: Ready

### Step 4: Suggest next steps

Suggest the user can now:
- `/eos-refine` - Refine a requirement into a specification
- `/eos-context` - Query context about the codebase
- `/eos-status` - View detailed system status
