# Engineering OS

**The engineering brain for your AI coding tools.**

EOS gives Claude Code, Cursor, and Windsurf persistent knowledge about your codebase — architecture, conventions, decisions, and cross-service dependencies that survive between sessions.

```bash
npm install -g engineering-os
cd your-project
eos init --claude
```

That's it. Your AI tool now has persistent project knowledge.

---

## What It Does

| Without EOS | With EOS |
|---|---|
| AI forgets between sessions | Knowledge persists forever |
| AI makes generic decisions | AI follows YOUR conventions |
| AI re-debates solved problems | Past decisions are recalled instantly |
| AI knows one repo at a time | Full cross-repo service topology |
| Gotchas rediscovered every time | Skills accumulate over sessions |

## How It Works

```
AI Tool (Claude Code / Cursor / Windsurf)
    │ MCP Protocol
    ▼
Engineering OS (local server)
    ├── Code Index (SQLite FTS5)
    ├── Service Graph (cross-repo connections)
    ├── Skills Store (learns over time)
    ├── Decision Records
    ├── Convention Enforcement
    └── Security Scanning
```

1. `eos init` indexes your codebase, discovers architecture, builds service graph
2. `CLAUDE.md` steers Claude to call EOS tools before acting
3. Claude calls `eos_context` → gets routes, architecture, conventions, skills
4. Claude calls `eos_learn` → discoveries persist for future sessions

## Features

- **47 MCP Tools** — knowledge, architecture, decisions, security, workflows
- **8 Languages** — TypeScript, JavaScript, Python, Go, Rust, Java, Ruby, Kotlin
- **Cross-Repo Intelligence** — links services, shows topology, tracks impact
- **Skill Retention** — learns gotchas, patterns, connections from every session
- **Route Scanning** — Express, NestJS, Fastify, Next.js, Vert.x, Ktor, Spring Boot, Android Nav
- **Security** — secrets, injection, XSS, OWASP, CVE scanning (npm, Python, Go, Java, Gradle, Rust, Ruby)
- **Multi-Agent Build** — requirement → product spec → tech spec → execution plan
- **Global MCP** — one server for all repos, works from any directory
- **Team Sharing** — `eos.workspace.yaml` in git (conventions, decisions, repo links)
- **100% Local** — SQLite, no cloud, no API keys, no telemetry

## Quick Start

```bash
# Install
npm install -g engineering-os

# Initialize (indexes + generates CLAUDE.md)
cd your-project
eos init --claude --cursor

# For cross-repo: declare linked services
eos workspace init
eos workspace add-repo api-service ../api-service --role backend

# Re-init to link them
eos init --claude
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `eos init --claude --cursor` | Initialize + generate AI context files |
| `eos serve --global` | Start MCP server (works from any directory) |
| `eos refresh --incremental` | Update knowledge after code changes |
| `eos workspace init` | Create team-shared workspace config |
| `eos workspace add-convention` | Add team convention |
| `eos workspace add-decision` | Record engineering decision |
| `eos workspace add-repo` | Link a service repo |
| `eos link <name> <path>` | Link a repository |
| `eos index --watch` | Continuous re-indexing |
| `eos status` | Show knowledge stats |

## Workspace Config

Create `eos.workspace.yaml` (checked into git, shared with team):

```yaml
name: my-project
type: react-native-monorepo
org: my-company

repos:
  - name: api-gateway
    path: ../api-gateway
    role: gateway
  - name: backend
    path: ../backend-service
    role: bff

conventions:
  - name: error-handling
    rule: "Use Result<T> pattern, never throw in service layer"

decisions:
  - title: "Redis for sessions"
    decision: "Redis Cluster for session management"
    rationale: "Sub-ms reads, horizontal scaling"

ai:
  tools: [claude, cursor]
  mcp: true
```

## Troubleshooting

### MCP Error `-32000` in Claude Code

This means Node.js version mismatch. The native SQLite module was compiled for a different Node version than what's running.

```bash
# Fix: rebuild for your current Node
npm rebuild better-sqlite3

# Or reinstall globally
npm install -g engineering-os
```

**Root cause:** If you use nvm and your shell defaults to a different Node version than what you used during `npm install`, the native module won't load. Ensure the Node version that installs EOS matches the Node version that runs it.

### Requirements

- Node.js >= 18 (LTS 20 or 22 recommended)
- No API keys, no cloud, no external dependencies

## Documentation

Full documentation: [engineering-os.github.io/engineering-os](https://engineering-os.github.io/engineering-os/)

## Architecture

```
packages/
├── shared/           # Shared types
├── core/             # MCP server, knowledge engine, agents (the brain)
├── cli/              # CLI (eos command)
├── adapter-claude/   # Claude Code plugin (11 skills)
├── adapter-cursor/   # Cursor rules generator
├── adapter-vscode/   # VS Code extension
└── engineering-os/   # Single npm package (bundles all of the above)
```

Install the single package — it includes everything:

```bash
npm install -g engineering-os
```

## Stats

| Metric | Value |
|--------|-------|
| MCP Tools | 47 |
| Tests | 341 |
| Languages | 8 |
| CLI Commands | 11 |
| Lines of Code | ~26K |

## License

Apache 2.0 — see [LICENSE](./LICENSE)
