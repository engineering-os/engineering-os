# Engineering OS

[![GitHub stars](https://img.shields.io/github/stars/engineering-os/engineering-os?style=social)](https://github.com/engineering-os/engineering-os)
[![npm](https://img.shields.io/npm/v/engineering-os?color=6366f1)](https://www.npmjs.com/package/engineering-os)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)

**Your AI finally remembers your codebase.**

Stop re-explaining your architecture every session. Engineering OS gives Claude Code, Cursor, Codex, and any MCP-compatible AI code editor the memory they've always been missing. They finally write code like someone who actually knows your project.

```bash
npm install -g engineering-os
cd your-project
eos init --claude
```

That's it. Your AI now has persistent project knowledge. Permanently.

<p align="center">
  <img src="docs/demo/demo.gif" alt="Engineering OS Demo" width="700">
</p>

---

## The Problem

Every new session, your AI re-explores files, re-debates decisions you already made, and has no idea your frontend talks to three backend services.


| Today (without Engineering OS)                | With Engineering OS                              |
| --------------------------------------------- | ------------------------------------------------ |
| "Let me explore your project structure..."    | Already knows. Starts working immediately.       |
| "Should we use Redux or Zustand?"             | "You decided on Zustand last month. Here's why." |
| Suggests code that breaks another service     | Sees the dependency graph. Avoids breakage.      |
| You explain the same gotcha every session     | Learned it once. Warns you proactively.          |
| grep-ing for 30s trying to find that function | Instant answer. It's pre-indexed.                |
| Security review is something you do "later"   | Already scanned. Flags issues as you code.       |


## How It Works

```
AI Code Editor (Claude Code / Cursor / Codex / Any MCP Client)
    │ MCP Protocol (stdio)
    ▼
Engineering OS (runs on your machine, zero cloud)
    ├── Code Search (FTS5 + BM25, instant results)
    ├── Service Graph (cross-repo topology)
    ├── Skill Memory (learns from every session)
    ├── Decision Records (never re-debates)
    ├── Convention Enforcement (your rules, always followed)
    └── Security Scanner (OWASP, CVE, compliance)
    │
    ▼
Your Codebase + Linked Repos (SQLite, 100% local)
```

1. `eos init` indexes your codebase, discovers architecture, builds the service graph
2. Your AI tool connects automatically via MCP (no manual config)
3. AI calls `eos_context` and gets full project knowledge instantly
4. AI calls `eos_learn` when it discovers something. That knowledge persists forever.

## Quick Start

```bash
# Install
npm install -g engineering-os

# Point it at your project
cd your-project
eos init --claude --cursor --codex

# Link sibling services (optional)
eos link backend-api ../backend-api
eos link ml-pipeline ../ml-service

# Keep it fresh
eos refresh --incremental
```

## What You Get

- **Never explains twice.** Architecture, routes, conventions, and decisions persist across every session.
- **Sees all your repos.** Link your mobile app, BFF, backend, ML pipeline. Your AI sees the full picture.
- **Learns your tricks.** That weird workaround? That gotcha with uploads? Remembered. Forever.
- **Catches security issues.** Secrets, injection flaws, known CVEs in your dependencies. Scans continuously.
- **Finds code instantly.** Pre-indexed search. Ask "where's the auth middleware?" and get the answer in milliseconds.
- **Maps your architecture.** Auto-detects how your services connect, which layers exist, what patterns you follow.

## CLI Commands


| Command                      | What it does                                   |
| ---------------------------- | ---------------------------------------------- |
| `eos init --claude --cursor --codex` | Index your project + generate AI context files |
| `eos serve`                  | Start the MCP server                           |
| `eos refresh --incremental`  | Update knowledge after code changes            |
| `eos cursor generate`        | Regenerate Cursor rules and EOS skills         |
| `eos codex generate`         | Regenerate Codex `AGENTS.md`, skills, and MCP config |
| `eos link <name> <path>`     | Link a sibling repository                      |
| `eos workspace init`         | Create team-shared config (checked into git)   |
| `eos index --watch`          | Continuous re-indexing as you code             |
| `eos status`                 | Show knowledge health and drift                |


## Works With

- **Claude Code** (Anthropic)
- **Cursor**
- **Codex** (OpenAI)
- **VS Code**
- Any editor that speaks MCP protocol

## Team Sharing

Create `eos.workspace.yaml` and check it into git. Your entire team shares the same conventions and decisions:

```yaml
name: my-project
type: monorepo
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
    rule: "Use Result<T> pattern. Only controllers throw HTTP exceptions."
  - name: state
    rule: "Zustand only. No Redux. One store per domain."

decisions:
  - title: "Redis for sessions"
    decision: "Redis Cluster for session management"
    rationale: "Sub-ms reads, horizontal scaling, built-in expiry"
```

## Troubleshooting

### MCP Error `-32000` in Claude Code

Node.js version mismatch. The native SQLite module was compiled for a different Node version.

```bash
# Fix: rebuild for your current Node
npm rebuild better-sqlite3

# Or just reinstall
npm install -g engineering-os
```

**Why:** If you use nvm and your shell defaults to a different Node version than what installed Engineering OS, the native binary won't load. Make sure both match.

### Requirements

- Node.js >= 18 (LTS 20 or 22 recommended)
- No API keys, no cloud, nothing external

## Documentation

Full docs with API reference, guides, and tool list: [engineering-os.github.io/engineering-os](https://engineering-os.github.io/engineering-os/)

## Architecture

```
packages/
├── shared/           # Shared types
├── core/             # MCP server, knowledge engine, security, workflows
├── cli/              # CLI (the `eos` command)
├── adapter-claude/   # Claude Code plugin (11 skills)
├── adapter-cursor/   # Cursor rules generator
├── adapter-vscode/   # VS Code extension
└── engineering-os/   # Single npm package (bundles everything)
```

## License

Apache 2.0 — see [LICENSE](./LICENSE)
