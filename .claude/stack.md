# Stack

`[FILL IN]` marks an undefined entry. Treat as "ask the operator," not a guess.
Only document what is confirmed and deployable today.

---

## Runtime
- Node 22 LTS (pinned via `.nvmrc` at repo root).
- TypeScript (strict). Run TS directly with `tsx`; no build step required for local dev.
- git is a hard runtime dependency — gitloop is built on native git primitives (tags, worktrees).

## Frameworks
- Backend: tag-notifier is a Node HTTP service (Node stdlib `http`; small router lib acceptable if justified). Default port 7777.
- CLI: TypeScript. Framework TBD when the CLI surface is built (candidates: commander, none). Currently `[FILL IN — confirm CLI framework when CLI work starts]`.
- MCP: `@modelcontextprotocol/sdk` (TypeScript) for the three MCP tools.

## State & Eventing
- Pipeline state: git tags are the single source of truth; derived from git, never stored separately.
- Notifier event queue: in-memory only (no persistence by design; local inner-loop).
- Eventing: git post-push hook → HTTP POST (or local exec) to the tag-notifier. No external broker. SSE-vs-polling for notifier→worker delivery is an open question (see `OBJECTIVE.md`).
- Logs: structured JSON to stdout.

## Build / Package
- TypeScript: pnpm. No npm or yarn. Lockfile (`pnpm-lock.yaml`) is committed.
- CI: none — local inner-loop only, by design (no CI/CD).
- Artifact registry: none (not published yet).

## Explicitly Not in Stack
List rejected tools and the reason. Prevents re-proposal.
- Python / Flask — the issue's reference design was Python; this project is a full pure-TypeScript reframe.
- CI/CD systems (GitHub Actions, etc.) — out of scope; the loop runs entirely locally.
- External databases / message brokers — git is the only state store by design.
- Notifier authentication / persistent worker registration — explicitly out of scope (see `OBJECTIVE.md`).
