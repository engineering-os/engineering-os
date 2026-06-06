# Service Dependency Map

Changes to shared interfaces require coordination across services.

## Dependencies
- monorepo/monorepo → shared/shared [import]
- monorepo/monorepo → core/core [import]
- adapter-vscode/adapter-vscode → core/core [import]
- cli/cli → core/core [import]
- cli/cli → shared/shared [import]
- core/core → shared/shared [import]

## Contracts
- openapi: openapi.yaml (dreamplay-workflow)