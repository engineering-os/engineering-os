# @engineering-os/adapter-cursor

Generates `.cursor/rules/eos-*.md` files and `.cursor/skills/eos-*` workflows from Engineering OS knowledge.

## What it generates

| File | Content |
|------|---------|
| `eos-system.md` | Steering instructions (use EOS tools, don't explore) |
| `eos-conventions.md` | Team coding conventions |
| `eos-patterns.md` | Recorded coding patterns |
| `eos-architecture.md` | Service map and dependencies |
| `eos-decisions.md` | Settled engineering decisions |
| `eos-service-map.md` | Cross-repo dependency graph |

Cursor skills are installed under `.cursor/skills/eos-*` for the 11 EOS workflows:
`context`, `decide`, `execute`, `init`, `multi-repo`, `plan`, `refine`, `review`, `security`, `status`, and `team`.

## Usage

```bash
# Generate via CLI
eos init --cursor
eos cursor generate

# Programmatic
import { CursorRulesGenerator } from '@engineering-os/adapter-cursor';

const generator = new CursorRulesGenerator({
  eosPath: '/path/to/.eos',
  outputPath: '/path/to/.cursor/rules/eos-conventions.md',
  includeArchitecture: true,
  includePatterns: true,
  includeConventions: true,
  includeDecisions: true,
  useCursorRulesDir: true,
});

await generator.write();
```

## Watch Mode

```typescript
import { CursorRulesWatcher } from '@engineering-os/adapter-cursor';

const watcher = new CursorRulesWatcher(generator, '/path/to/.eos');
watcher.start(); // Auto-regenerates when .eos/knowledge/ changes
```

Reads from `.eos/graph/service-map.json` (no SQLite dependency).
