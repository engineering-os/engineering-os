# engineering-os

AI-native knowledge layer for your codebase. MCP server with 47 tools for code intelligence, architecture discovery, security scanning, and workflow automation.

## Install

```bash
npm install -g engineering-os
```

## Quick Start

```bash
# Initialize in your project
cd your-project
eos init

# Start the MCP server (auto-connects to Claude Code, Cursor, VS Code)
eos serve

# Check status
eos status
```

## What it does

Engineering OS indexes your codebase and serves structured knowledge to AI tools via the [Model Context Protocol](https://modelcontextprotocol.io):

- **Code search** — FTS5 with BM25 ranking and synonym expansion
- **Architecture discovery** — Auto-detects services, layers, patterns, conventions
- **Decision tracking** — Record and recall engineering decisions
- **Security intelligence** — Secrets, injection, XSS scanning + OWASP mapping
- **Cross-repo search** — Federated search across linked repositories
- **Workflow engine** — DAG-based feature workflows (refine → plan → execute → review)
- **Skill retention** — Learns from sessions, remembers for next time

## Adapters included

- **Claude Code** — 11 skills (`/eos:init`, `/eos:plan`, `/eos:security`, etc.)
- **Cursor** — Auto-generated `.cursor/rules/eos-*` and `.cursor/skills/eos-*`
- **Codex** — Auto-generated `AGENTS.md`, `.agents/skills/eos-*`, and `.codex/config.toml`
- **VS Code** — Extension with sidebar and command palette

## Requirements

- Node.js >= 18 (LTS recommended)
- Native build tools for SQLite (comes with most systems)

## Documentation

- [Full Docs](https://engineering-os.github.io/engineering-os/) — interactive HTML documentation
- [GitHub](https://github.com/engineering-os/engineering-os)
- [Contributing](https://github.com/engineering-os/engineering-os/blob/main/CONTRIBUTING.md)
- [Security](https://github.com/engineering-os/engineering-os/blob/main/SECURITY.md)

## License

Apache 2.0 — see [LICENSE](https://github.com/engineering-os/engineering-os/blob/main/LICENSE)
