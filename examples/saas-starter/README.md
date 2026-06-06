# SaaS Starter — Engineering OS Example

This is a pre-configured example showing how Engineering OS works with a typical SaaS backend project. It demonstrates:

- **Decision records** — 3 engineering decisions (Redis for rate limiting, JWT auth, Stripe payments)
- **Architecture discovery** — 3 services with boundaries, APIs, dependencies, and criticality
- **Patterns** — Repository pattern + DTO validation
- **Conventions** — File naming + error handling rules
- **Security conventions** — 7 rules (parameterized queries, no hardcoded secrets, auth middleware, input validation, PII logging, rate limiting, CSRF)
- **Team manifest** — Shared conventions, patterns, and security policies
- **Budget enforcement** — Soft mode at 80% threshold with multi-repo even split

## What's in `.eos/`

```
.eos/
├── config.yaml                          # Project config with budget enforcement
├── knowledge/
│   ├── architecture/
│   │   ├── services/                    # auth, payments, users
│   │   ├── patterns/                    # repository-pattern, dto-validation
│   │   └── conventions/                 # naming, error-handling
│   ├── decisions/                       # DEC-001 through DEC-003
│   └── security/
│       └── conventions.yaml             # 7 security rules
└── team/
    └── manifest.yaml                    # Team-wide enforced standards
```

## Try it

```bash
# From the engineering-os root:
cd examples/saas-starter

# Initialize (indexes the src/ directory)
npx eos init

# Start the MCP server
npx eos serve

# Or connect from Claude Code — it auto-discovers .mcp.json
```

## What your AI tool sees

Once connected, your AI tool can:

```
eos_search "auth login"
→ Returns auth.controller.ts login handler + auth.service.ts login method

eos_recall_decision "rate limiting"
→ Returns DEC-001: Redis chosen for distributed rate limiting

eos_architecture
→ Returns 3 services with boundaries and criticality

eos_conventions
→ Returns naming rules + error handling pattern

eos_security_scan
→ Scans src/ for violations of the 7 security rules

eos_threat_model { featureSlug: "password-reset", specification: "..." }
→ STRIDE analysis with mitigations
```

## Budget enforcement in action

With `enforcement.mode: soft` and `warnThreshold: 0.8`:

1. AI calls `eos_search` repeatedly during implementation
2. At 80% of the 200K implementation budget → response includes: `> Budget: implementation at 82% (164,000/200,000 tokens)`
3. At 100% → response is truncated with: `[... truncated due to budget limit]`

Switch to `mode: hard` to reject calls outright, or `mode: nolimit` to track without enforcing.

## Multi-repo linking

If you have a shared-utils repo:

```bash
eos link shared-utils /path/to/shared-utils

# Then search across both:
# eos_search_all "validation helpers"
```

## Team sync

The `team/manifest.yaml` is designed to be committed to git. Teammates sync via:

```
eos_team_sync { action: "sync", remotePath: "/path/to/teammate/.eos" }
```

