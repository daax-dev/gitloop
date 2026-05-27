# Architecture

Architectural decisions require operator approval before implementation.
ADRs log to `.logs/decisions/architecture.jsonl` (see `.claude/history.md`).

---

## Default Patterns
- Layering: git-primitive core (tag schema + read/derive state) / pipeline domain (legal transitions, claim/advance) / adapters (notifier HTTP, MCP tools, post-push hook). The core never imports an adapter.
- State authority: git tags are the single source of truth. Pipeline state is *derived* from the tags present, never stored separately. Given the tag set, the next legal action for any task must be unambiguous and verifiable from git alone (the determinism guarantee).
- API style: local HTTP (notifier) + MCP tools (`get_pending_tasks`, `claim_task`, `advance_task`). No public/remote API surface.
- Idempotency: `claim_task` and `advance_task` must be atomic and idempotent against concurrent workers — claiming an already-claimed step, or advancing an already-advanced task, is a safe no-op, not a double-action. Atomicity is enforced via git primitives (e.g., tag creation as the claim token), not an external lock.
- Configuration: env vars for runtime config (e.g., notifier port, default 7777). No secrets in source control or committed env files.
- Time: UTC everywhere internally. Local time is a presentation concern.
- IDs: task IDs are `TASK-N` (from the tag schema). No separate ID scheme.

---

## Boundaries
- Module boundary = test boundary. If two modules cannot be tested apart, they are one module.
- Cross-service calls require an explicit client with timeout, retry-with-backoff, and circuit-breaker.
- No shared databases between services. Data shared via APIs or events only.

---

## Anti-Patterns (refuse these)
- Distributed monolith: services that claim independence but cannot deploy independently.
- Snowflake environments: dev/staging/prod differ only in scale and data, not topology.
- "Temporary" workarounds without an expiry date and an owner.
- Secrets in env files, source control, or CI variables without rotation.
- Cross-cutting frameworks that own the application's main loop.

---

## Decision Logging
Log to `.logs/decisions/architecture.jsonl`:
```json
{"id":"arch-001","date":"YYYY-MM-DD","decision":"...","rationale":"...","alternatives":"...","references":["https://..."]}
```

---

## Reference Architectures
When citing patterns, prefer primary sources:
- Official vendor documentation (AWS Well-Architected, Azure Architecture Center, GCP).
- NIST SP 800-series for security architecture.
- OWASP for application security patterns.
Cite the exact URL in `.logs/references/architecture.jsonl`.
