# Contributing to Engineering OS

Thank you for your interest in contributing to Engineering OS! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/engineering-os/engineering-os.git
cd engineering-os

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

## Project Structure

```
packages/
├── shared/         → Shared TypeScript types and interfaces
├── core/           → Knowledge engine, MCP server, security intel, workflows
├── cli/            → CLI tool (eos init, serve, status, index, link, unlink)
├── adapter-claude/ → Claude Code plugin (skills as .md files)
├── adapter-cursor/ → Cursor IDE .cursorrules generator
└── adapter-vscode/ → VS Code extension
```

## Build System

- **Turbo** for monorepo orchestration
- **TypeScript** (CommonJS output) for all packages
- **Vitest** for testing

```bash
# Build a specific package
npx turbo build --filter=@engineering-os/core

# Type check without emitting
npx tsc --project packages/core/tsconfig.json --noEmit
```

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Run `npm test` to verify nothing is broken
4. Run `npm run build` to confirm compilation succeeds
5. Add a changeset: `npx changeset` — describe what changed and pick a semver bump
6. Open a Pull Request

## Adding a New MCP Tool

1. Define the tool schema in `packages/core/src/server/tool-definitions.ts`
2. Implement the handler in `packages/core/src/server/tool-handlers.ts`
3. Add tests in `packages/core/src/__tests__/`
4. Optionally create a Claude Code skill in `packages/adapter-claude/skills/<name>/SKILL.md`

## Adding a Language Extractor

1. Create `packages/core/src/knowledge/extractors/<language>.ts`
2. Implement the `LanguageExtractor` interface
3. Register it in the indexer

## Code Style

- TypeScript strict mode
- No comments unless explaining non-obvious WHY
- Constructor injection (`final` + `@RequiredArgsConstructor` pattern)
- Tests alongside source in `__tests__/` directories

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a changeset (`npx changeset`) for user-facing changes
- Ensure CI passes (build + test across Node 18/20/22)
- Update relevant documentation if adding new features

## Reporting Issues

Use [GitHub Issues](https://github.com/engineering-os/engineering-os/issues) for bug reports and feature requests. Include:
- Steps to reproduce
- Expected vs actual behavior
- Node version and OS

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
