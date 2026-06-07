# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

- **Email:** engineering.os.dev@gmail.com
- **Do NOT** open a public GitHub issue for security vulnerabilities
- You will receive acknowledgment within 48 hours
- We aim to provide a fix within 7 days for critical issues

## Security Architecture

Engineering OS runs as a local MCP server processing tool calls from AI clients. The trust boundary is the MCP protocol interface — all tool arguments are treated as potentially malicious input.

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
│  (SQLite, filesystem)            │
└─────────────────────────────────┘
```

### Verified Safe

| Area | Status |
|------|--------|
| SQL Injection | All SQLite queries use parameterized prepared statements |
| Command Injection | No `exec`, `spawn`, or shell execution in the server |
| Path Traversal | All user-supplied paths validated with `validateContainedPath()` |
| YAML Deserialization | All parsing uses `safeYamlLoad()` (JSON_SCHEMA only) |
| Hardcoded Secrets | No credentials in source code |
| Data Exfiltration | Runs locally, no outbound network calls |

## Security Utilities

All security primitives live in `packages/core/src/security/`:

| Module | Functions |
|--------|-----------|
| `path-safety.ts` | `validateContainedPath()`, `sanitizeSlug()`, `validatePathArray()`, `sanitizeErrorMessage()` |
| `file-safety.ts` | `validateFileSize()`, `validateContentLength()` |
| `yaml-safety.ts` | `safeYamlLoad()`, `safeYamlDump()` |
| `rate-limiter.ts` | `RateLimiter` (concurrent + per-minute limiting) |

## Guidelines for Contributors

1. **Never trust MCP tool arguments** — validate all strings before path construction
2. **Always use `safeYamlLoad`** — never import `js-yaml` directly
3. **Validate file size before reading** — prevents DoS via large files
4. **Contain all paths** — `validateContainedPath(base, userInput)` before any file I/O
5. **Sanitize error messages** — never return raw paths or stack traces to MCP clients
6. **No shell execution** — all operations must be pure file I/O and database queries
7. **Parameterize all queries** — use `?` placeholders with prepared statements

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x | Yes |

## Test Coverage

Security tests: `packages/core/src/__tests__/security.test.ts`

Run with: `npm test`
