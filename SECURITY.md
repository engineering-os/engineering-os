# Engineering OS — Security

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

- **Email:** engineering.os.dev@gmail.com
- **Do NOT** open a public GitHub issue for security vulnerabilities
- You will receive acknowledgment within 48 hours
- We aim to provide a fix within 7 days for critical issues

## Security Architecture

Engineering OS runs as a local MCP server processing tool calls from AI clients. The trust boundary is the MCP protocol interface — all tool arguments must be treated as potentially malicious input.

```
MCP Client (untrusted input)
    │
    ▼
┌─────────────────────────────────┐
│  Input Validation Layer          │
│  (sanitizeSlug, validatePath)    │
├─────────────────────────────────┤
│  Rate Limiting                   │
│  (RateLimiter for expensive ops) │
├─────────────────────────────────┤
│  Business Logic                  │
│  (knowledge, decisions, etc.)    │
├─────────────────────────────────┤
│  Storage Layer                   │
│  (SQLite, LanceDB, filesystem)   │
└─────────────────────────────────┘
```

---

## Security Audit Results

Audit performed: 2026-05-30

### Vulnerabilities Found & Fixed

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | CRITICAL | Path traversal via `eos_index` paths array | `validateContainedPath()` ensures all paths stay within project root |
| 2 | CRITICAL | Path traversal via `featureSlug` in workflow/artifacts | `sanitizeSlug()` rejects any non-alphanumeric characters |
| 3 | CRITICAL | Path traversal via `decisionId` in decision store | `sanitizeSlug()` validates ID format |
| 4 | HIGH | LanceDB filter injection in `deleteByFile` | Double-quote escaping in filter strings |
| 5 | HIGH | Unsafe YAML deserialization (7 locations) | All `yaml.load()` replaced with `safeYamlLoad()` using JSON_SCHEMA |
| 6 | HIGH | Latent path traversal in `loadTemplate` name | `sanitizeSlug()` validates template names |
| 7 | MEDIUM | No input validation on MCP tool arguments | `sanitizeErrorMessage()` prevents path leaks; type-level validation |
| 8 | MEDIUM | Unbounded file read (DoS) | `validateFileSize()` enforces 1MB limit before reading |
| 9 | MEDIUM | Stats query loads 100K rows | Replaced with `countRows()` API |
| 10 | MEDIUM | ReDoS in method regex | Quantifier limited to `{0,5}` repetitions |
| 11 | MEDIUM | Path traversal via `stage` parameter | `sanitizeSlug()` applied to stage names |
| 12 | LOW | Error messages leak internal paths | `sanitizeErrorMessage()` strips filesystem paths |
| 13 | LOW | No rate limiting | `RateLimiter` applied to `eos_index` (1 concurrent, 5/min) |
| 14 | LOW | Invalid decision status accepted | Runtime validation against allowed enum values |

### Not Vulnerable (Verified)

| Area | Status |
|------|--------|
| SQL Injection | Safe — all SQLite queries use parameterized prepared statements |
| Command Injection | Safe — no `exec`, `spawn`, or shell execution anywhere |
| Hardcoded Secrets | Safe — no credentials in source code |
| Data Exfiltration | Safe — server runs locally, no outbound network calls |

---

## Security Utilities

All security primitives live in `packages/core/src/security/`:

### `path-safety.ts`

| Function | Purpose |
|----------|---------|
| `validateContainedPath(base, userPath)` | Resolves path and throws if it escapes base directory |
| `sanitizeSlug(input, fieldName)` | Validates slugs: alphanumeric + hyphens + underscores only |
| `validatePathArray(base, paths)` | Batch validation for path arrays |
| `sanitizeErrorMessage(error)` | Strips internal filesystem paths from error messages |

### `file-safety.ts`

| Function | Purpose |
|----------|---------|
| `validateFileSize(path, maxBytes?)` | Throws if file exceeds size limit (default 1MB) |
| `validateContentLength(content, max?)` | Throws if string content exceeds length limit |

### `yaml-safety.ts`

| Function | Purpose |
|----------|---------|
| `safeYamlLoad<T>(content)` | Parses YAML with JSON_SCHEMA only (no code execution) |
| `safeYamlDump(obj)` | Serializes to YAML safely |

### `rate-limiter.ts`

| Class | Purpose |
|-------|---------|
| `RateLimiter` | Limits concurrent executions and per-minute call rate |

---

## Guidelines for Contributors

### Rule 1: Never Trust MCP Tool Arguments

Every string from a tool call could contain path traversal (`../`), injection payloads, or oversized content. Always validate before use.

```typescript
// WRONG — direct path construction from user input
const filePath = path.join(baseDir, args.featureSlug, 'plan.json');

// RIGHT — validate first
sanitizeSlug(args.featureSlug, 'featureSlug');
const filePath = path.join(baseDir, args.featureSlug, 'plan.json');
```

### Rule 2: Always Use `safeYamlLoad` and `safeYamlDump`

Never import `js-yaml` directly in core packages. Always use the security wrappers.

```typescript
// WRONG
import * as yaml from 'js-yaml';
const data = yaml.load(content);

// RIGHT
import { safeYamlLoad } from '../security';
const data = safeYamlLoad<MyType>(content);
```

### Rule 3: Validate File Size Before Reading

Any file read triggered by user input must check size first.

```typescript
import { validateFileSize } from '../security';
await validateFileSize(filePath); // throws if > 1MB
const content = await fs.readFile(filePath, 'utf-8');
```

### Rule 4: Contain All Paths

Any path constructed from user input must be validated to stay within the project root.

```typescript
import { validateContainedPath } from '../security';
const safePath = validateContainedPath(this.rootPath, userInput);
```

### Rule 5: Sanitize Error Messages

Never return raw error messages to MCP clients. Internal paths and stack traces are information leaks.

```typescript
import { sanitizeErrorMessage } from '../security';
catch (error) {
  return sanitizeErrorMessage(error); // strips paths, returns safe message
}
```

### Rule 6: No Shell Execution

Never use `child_process.exec`, `execSync`, `spawn`, or similar. All operations must be pure file I/O and database queries.

### Rule 7: Parameterize All Queries

SQLite: always use `?` placeholders with `better-sqlite3` prepared statements.
LanceDB: escape user input before interpolating into filter strings.

---

## Reporting Vulnerabilities

If you discover a security vulnerability, please email engineering.os.dev@gmail.com (or open a private security advisory on GitHub). Do not open a public issue for security vulnerabilities.

---

## Test Coverage

Security tests: `packages/core/src/__tests__/security.test.ts`

```
23 tests covering:
- Path traversal blocking (6 tests)
- Slug sanitization (6 tests)
- Path array validation (2 tests)
- Error message sanitization (3 tests)
- YAML safety (4 tests)
- File size limits (2 tests)
```

Run with: `npm test`
