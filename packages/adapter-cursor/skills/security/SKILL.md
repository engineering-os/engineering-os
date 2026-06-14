---
name: eos-security
description: Run adversarial Engineering OS security scanning, auditing, dependency checks, threat modeling, or compliance checks.
---

# EOS Security

Use this skill when the user asks for security review, audit, threat model, dependency check, compliance check, or hardening.

## Workflow

1. Determine scope and depth: quick scan, full audit, dependency check, threat model, compliance check, or posture score.
2. Run the appropriate EOS MCP security tool.
3. Present critical and high findings first with concrete remediation.
4. Offer to fix critical/high findings when the repository state allows it.

## Tool Pattern

```text
eos_security_scan { "paths": ["src/"] }
eos_security_audit { "includeDependencies": true }
eos_dependency_check {}
eos_threat_model { "featureSlug": "<slug>", "specification": "<spec>" }
eos_compliance_check { "framework": "soc2" }
eos_posture_score {}
```
