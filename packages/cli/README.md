# @engineering-os/cli

Command-line interface for Engineering OS.

## Install

```bash
npm install -g engineering-os
```

## Commands

```
eos init [--claude] [--cursor] [--codex] [--copilot] [--windsurf] [--all] [-f]
eos serve [--global] [-p path]
eos refresh [--incremental] [--since ref] [--full]
eos cursor generate | watch
eos codex generate | doctor
eos workspace init | show | add-convention | add-decision | add-repo
eos link <name> <path>
eos unlink <name>
eos index [--force] [--watch] [--paths]
eos status
eos enable
eos disable
eos marketplace [action] [name]
```

## Quick Start

```bash
cd your-project
eos init --claude    # Index + generate CLAUDE.md
eos init --cursor    # Generate .cursor/rules/eos-* and .cursor/skills/eos-*
eos init --codex     # Generate AGENTS.md, .agents/skills/eos-*, and Codex MCP config
eos serve            # Start MCP server (Claude Code connects automatically)
```

## Global Mode

```bash
eos serve --global   # Serves ALL registered repos from any directory
```

The server auto-detects which repo you're working in based on CWD and serves that as primary, with all other registered repos available for cross-repo search.
