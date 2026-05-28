# gitloop

A local, git-only inner-loop tool. Multiple AI coding models/tools hand work off
to each other, event-driven and deterministically, using native git primitives
(tags) as the single source of truth — no shared database, no orchestration
service, no CI/CD. Pure TypeScript.

State lives entirely in git tags. Given the set of tags present, the next legal
action for any task is unambiguous and verifiable from git alone.

## Documentation

- [Getting started](docs/getting-started.md) — mental model, the event loop, and a
  worked `TASK-1` → `merged` walkthrough (with a rejection).
- [Adding steps](docs/adding-steps.md) — customize the pipeline with a config file.
- [FAQ](docs/faq.md) — why git tags, why pre-push, how claim races resolve.
- [Troubleshooting](docs/troubleshooting.md) — hook, notifier, config, and advance issues.

## Pipeline

A task advances through a configurable, ordered set of steps. Each transition is a
git tag:

```
TASK-N → in-progress/TASK-N/v1 → code-complete/TASK-N/v1 → test-complete/TASK-N/v1
       → review-complete/TASK-N/v1 → merged/TASK-N/v1
```

- `TASK-N` (bare) is the entry/registration tag — the only tag without a slash.
- Step tags are `<step>/TASK-N/vK`. **Versions are always explicit** (`/v1`, `/v2`,
  …): an implicit-v1 `<step>/TASK-N` would be a git directory/file conflict with a
  loop-back `<step>/TASK-N/v2`.
- A rejection loops the task back to the first step at the next version
  (`in-progress/TASK-N/v2`); forward progress then re-advances at `v2`.

The steps and their optional per-step required artifacts are config-driven (see
[Configuring the pipeline](#configuring-the-pipeline)); the five steps above are the
shipped default.

## Components

- **pre-push hook** (`hooks/pre-push`) — git has no client-side `post-push` hook, so
  this thin `pre-push` stub reads the pushed refs, extracts pipeline tag names, and
  best-effort POSTs them to the notifier (bounded timeout; never blocks the push). No
  pipeline logic lives in shell.
- **tag-notifier** (`src/adapters/notifier.ts`) — a local Node HTTP service
  (default port `7777`) with an in-memory event queue. Derives pipeline state from git
  tags on demand. Endpoints: `POST /events`, `GET /events?since=<id>`, `GET /state`,
  `GET /health`.
- **MCP server** (`src/adapters/mcp-server.ts`) — exposes three tools to workers:
  - `get_pending_tasks` — list tasks whose next step is claimable.
  - `claim_task` — atomically claim a task's next step (no two workers claim the same).
  - `advance_task` — push the next pipeline tag, or `reject` to loop the task back.

## Requirements

- Node 22 (pinned in `.nvmrc`), [pnpm](https://pnpm.io), and `git`.
- `curl` on the machine running the pre-push hook.

## Quickstart

> ⚠️ gitloop pushes pipeline tags (`in-progress/TASK-1/v1`, …) to `GITLOOP_REPO`'s
> remote. **To try it without touching a real repo, run `pnpm sandbox`** — it builds a
> throwaway bare remote + worker in a gitignored `.sandbox/` and drives a task to
> `merged`. The steps below operate on whatever `GITLOOP_REPO` you point at, so use a
> scratch repo/remote when experimenting, not a repo whose remote you care about.

```bash
pnpm install

# 1. Point workers at the repo to drive (use a scratch repo to experiment) and
#    give each worker a stable identity.
export GITLOOP_REPO="$(pwd)"      # repo to derive state from (default: cwd)
export GITLOOP_REMOTE=origin      # shared remote (default: origin)
export GITLOOP_WORKER_ID=alice    # this worker's identity (default: user@host)

# 2. Start the tag-notifier (optional; for event delivery / state inspection).
GITLOOP_NOTIFIER_PORT=7777 pnpm start:notifier

# 3. Install the pre-push hook into the repo (idempotent).
pnpm install:hook            # or: pnpm install:hook /path/to/repo [--force]

# 4. Register a task and let workers drive it (see below).
git tag TASK-1 && git push origin refs/tags/TASK-1
```

Wire the MCP server into an MCP-capable worker by launching `pnpm start:mcp` (stdio
transport) with the `GITLOOP_*` environment set per worker.

## How a task flows

1. A task is registered by pushing the bare entry tag `TASK-N`.
2. A worker calls `get_pending_tasks`, sees `TASK-N` is claimable, and calls
   `claim_task` — which pushes an anonymous claim tag `claim/<step>/TASK-N/vK`. The
   remote ref update is atomic: the first worker wins; others get `lost`. The claimer's
   identity is recorded in the tag's message (no state outside git).
3. The winner does the step and calls `advance_task`, pushing the next pipeline tag.
4. The next worker validates. On success it advances; on failure it calls
   `advance_task` with `reject` — looping the task back to the first step at the next
   version. The loop repeats until `merged/TASK-N/vK`.

### Worked example (one rejection)

```
TASK-1
in-progress/TASK-1/v1        # claimed + advanced by worker A
code-complete/TASK-1/v1      # advanced by worker B
in-progress/TASK-1/v2        # worker A rejects (tests failed) → loop-back
code-complete/TASK-1/v2
test-complete/TASK-1/v2
review-complete/TASK-1/v2
merged/TASK-1/v2             # done
```

The end-to-end proof of this (two workers, one rejection, state reconstructable from a
fresh clone) is `test/e2e/pipeline.e2e.test.ts`.

## Configuring the pipeline

The pipeline is a list of ordered steps; each may declare an optional required
artifact (a `{taskId}`-templated path) that must be committed before that step's tag is
legal. The default is the five steps above. A running server/notifier loads its
pipeline from (in order): `GITLOOP_CONFIG=<path>` → `<repo>/.gitloop/pipeline.json` →
the default. For example, `.gitloop/pipeline.json`:

```json
{
  "steps": [
    { "name": "in-progress" },
    { "name": "design", "requiredArtifact": "docs/{taskId}/design.md" },
    { "name": "code-complete" },
    { "name": "merged" }
  ]
}
```

`advance_task` checks a required artifact against `HEAD` (the commit being tagged). See
[Adding steps](docs/adding-steps.md) for a full worked example, and `loadPipelineConfig`
for the library API.

## Development

```bash
pnpm check        # typecheck + lint + format:check + test
pnpm test         # Vitest
pnpm coverage     # Vitest with 80% coverage gate
```

Layering (enforced in `eslint.config.js`): `core` ← `pipeline` ← `adapters`; `core`
imports neither, `pipeline` never imports `adapters`. See `src/README.md` and the
decision log in `.logs/decisions/architecture.jsonl`.

## Out of scope

CI/CD integration, notifier authentication, persistent worker registration, automatic
worktree lifecycle management, and any UI/dashboard. git is the only state store.
