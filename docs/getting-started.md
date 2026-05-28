# Getting started with gitloop

gitloop lets several AI coding workers hand a task off to each other using nothing
but **git tags**. There is no database, no orchestration server, no CI/CD. The set
of tags present in the repo _is_ the state, and from that set the next legal action
for any task is unambiguous.

## The mental model: a task is a baton

A task is a baton. Each git tag is a handoff. A worker can only pick up the baton it
is allowed to pick up next, and the moment it finishes its leg it drops a new tag —
the next handoff — and the next worker takes over.

```
   TASK-1            in-progress/      code-complete/   test-complete/   review-complete/   merged/
 (registered)        TASK-1/v1         TASK-1/v1        TASK-1/v1        TASK-1/v1          TASK-1/v1
     ●  ───────────▶   ●  ──────────▶    ●  ─────────▶    ●  ─────────▶    ●  ────────────▶  ★
   entry tag         worker claims     worker claims    worker tests     worker reviews     done
  (bare, no slash)   + does the work   + writes code    + advances       + advances
```

Two rules make this deterministic:

- **The entry tag is bare**: `TASK-1` (the only pipeline tag with no slash).
- **Step tags always carry an explicit version**: `<step>/TASK-1/vK`, including `/v1`.
  There is no implicit-v1 form — `in-progress/TASK-1` would collide in git with the
  loop-back `in-progress/TASK-1/v2` (a directory/file conflict). Every step tag is
  `<step>/TASK-N/vK`.

The default pipeline ships with **five steps**:

| Order | Step              | Meaning                                   |
| ----: | ----------------- | ----------------------------------------- |
|     — | `TASK-N` (entry)  | Task registered, awaiting first worker    |
|     1 | `in-progress`     | A worker has started the work             |
|     2 | `code-complete`   | Code written                              |
|     3 | `test-complete`   | Tests pass (worker-validated, no CI gate) |
|     4 | `review-complete` | Reviewed                                  |
|     5 | `merged`          | Terminal — the task is done               |

You can add, rename, or reorder steps — see [Adding steps](./adding-steps.md).

## The event loop

A push emits an advisory wake-up; workers always re-derive truth from git tags.

```
  ┌──────────────────────────── one worker ────────────────────────────┐
  │                                                                     │
  │  poll git ──▶ claim_task ──▶ do the work ──▶ advance_task ──▶ push  │
  │  (fetch +     (atomic tag    (write code,    (push next      (git)  │
  │   derive)      push = CAS)    tests, etc.)    pipeline tag)         │
  │     ▲                                                        │      │
  │     └────────────────────── repeat ◀────────────────────────┘      │
  └─────────────────────────────────────────────────────────────│─────┘
                                                                  │
                                            git push fires the    │
                                            pre-push hook ────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │  pre-push hook        │  best-effort
                                       │  curl POST /events ──▶│  (advisory)
                                       └──────────────────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │  tag-notifier :7777   │  in-memory
                                       │  GET /events, /state  │  event queue
                                       └──────────────────────┘
```

git has **no client-side post-push hook**, so the `pre-push` hook fires _just before_
the push completes. That means an event can reach the notifier microseconds before
the tag actually lands (or for a push that is later rejected). The event is therefore
**advisory only** — a nudge to go look. Workers never act on the event payload; they
re-derive authoritative state from git tags (`fetchTags` + `listTags`), which is
exactly what the three MCP tools do. If the notifier is down or `curl` is missing, the
push still succeeds.

## The three MCP tools

Workers do not type shell commands. An AI worker drives gitloop through its **MCP
client**, which calls three tools exposed by the gitloop MCP server:

| Tool                | Input                 | What it does                                                           |
| ------------------- | --------------------- | ---------------------------------------------------------------------- |
| `get_pending_tasks` | (none)                | Lists tasks whose next step is claimable, derived from git tags        |
| `claim_task`        | `{ taskId }`          | Atomically claims the next step (first worker wins; others get `lost`) |
| `advance_task`      | `{ taskId, reject? }` | Pushes the next pipeline tag; `reject: true` loops the task back       |

## Quickstart

> ⚠️ **Want to just see it work first?** Jump to
> [Try it end-to-end in a sandbox](#try-it-end-to-end-in-a-sandbox) (`pnpm sandbox`) — it
> builds a throwaway bare remote + worker in a gitignored `.sandbox/` and drives a task
> to `merged` with zero risk. The manual steps below push pipeline tags to whatever
> `GITLOOP_REPO`'s remote is, so use a **scratch repo** when experimenting — not a repo
> whose `origin` you care about.

### Requirements

- **Node 22** (pinned in `.nvmrc`), [pnpm](https://pnpm.io), and `git`.
- `curl` on the machine that runs the pre-push hook.

### 1. Install dependencies

```bash
pnpm install
```

### 2. Point workers at the shared repo and give each a stable identity

```bash
export GITLOOP_REPO="$(pwd)"      # repo to derive state from (default: cwd)
export GITLOOP_REMOTE=origin      # shared remote (default: origin)
export GITLOOP_WORKER_ID=alice    # this worker's identity (default: user@host)
```

### 3. Start the tag-notifier (optional, for event delivery / state inspection)

```bash
GITLOOP_NOTIFIER_PORT=7777 pnpm start:notifier
```

The notifier serves:

- `GET  /health` — liveness (`{ "status": "ok" }`)
- `GET  /state` — pipeline state derived from current git tags
- `GET  /events?since=<id>` — events seen so far (poll for new ones)
- `POST /events` — where the pre-push hook delivers tag-push notifications

### 4. Install the pre-push hook into the repo

```bash
pnpm install:hook                       # installs into the current directory's repo
# or target another repo explicitly:
pnpm install:hook /path/to/repo
# re-run with --force to replace a non-gitloop hook:
pnpm install:hook /path/to/repo --force
```

With no path argument the hook is installed into the repo at the **current working
directory**. Installation is idempotent: re-running reports `unchanged`.

### 5. Register a task

A task is registered by pushing its bare entry tag:

```bash
git tag TASK-1
git push origin refs/tags/TASK-1
```

### 6. Wire the MCP server into a worker

Launch the MCP server (stdio transport) from each worker's MCP client, with that
worker's `GITLOOP_*` environment set:

```bash
GITLOOP_REPO="$(pwd)" GITLOOP_WORKER_ID=alice pnpm start:mcp
```

## Worked walkthrough: `TASK-1` → `merged`, with one rejection

The honest way to follow along is to watch the **tags appear on the remote**. After
each handoff, list them:

```bash
git tag -l
```

Here is the full sequence for two workers, **A** and **B**, where B rejects A's first
attempt. Each line is a tag that appears as a worker's MCP client calls the tools. A
claim grants the right to perform **one** step, so a worker calls `claim_task` again
before each subsequent `advance_task`.

```
TASK-1                          # you registered the task (quickstart step 5)

# --- attempt v1 ---
in-progress/TASK-1/v1           # worker A: get_pending_tasks → claim_task → advance_task
code-complete/TASK-1/v1         # worker A: advance_task (code written)

# --- worker B validates, finds a problem, rejects ---
in-progress/TASK-1/v2           # worker B: advance_task with reject:true → loop-back to step 1, v2

# --- attempt v2 re-advances ---
code-complete/TASK-1/v2         # worker A: advance_task
test-complete/TASK-1/v2         # worker B: advance_task (tests pass)
review-complete/TASK-1/v2       # worker B: advance_task (reviewed)
merged/TASK-1/v2                # done ✅
```

What happened, step by step:

1. **Register.** You push `TASK-1`. Its next step (`in-progress`) is now claimable.
2. **Claim.** Worker A's client calls `claim_task` with `{ taskId: "TASK-1" }`. This
   pushes an anonymous claim tag `claim/in-progress/TASK-1/v1`. The remote ref update
   is an atomic compare-and-swap: the first worker to push wins, any other gets
   `{ outcome: "lost", claimed: false }`. A's identity is recorded _inside_ the claim
   tag's message — no state lives outside git.
3. **Advance.** Worker A's client calls `advance_task` with `{ taskId: "TASK-1" }`,
   pushing `in-progress/TASK-1/v1`. To advance again it re-claims (`claim_task` for the
   now-pending `code-complete`) and calls `advance_task` to push
   `code-complete/TASK-1/v1`. Each push fires the pre-push hook, which POSTs the tag to
   the notifier.
4. **Reject.** Worker B validates the work, finds a problem, and calls `advance_task`
   with `{ taskId: "TASK-1", reject: true }`. This loops the task back to the **first**
   step at the **next version**: `in-progress/TASK-1/v2`. Forward progress then
   re-advances at `v2`.
5. **Finish.** The workers re-advance through `code-complete/TASK-1/v2`,
   `test-complete/TASK-1/v2`, `review-complete/TASK-1/v2`, and finally
   `merged/TASK-1/v2`. The task is done.

> Note the claim tags (`claim/<step>/TASK-1/vK`) also pile up in `git tag -l`. They are
> ignored by state derivation — only the pipeline tags above determine the next action.

### Try it end-to-end in a sandbox

A throwaway sandbox builds a real bare remote, a worker repo with the hook installed,
and a running notifier, then drives `TASK-1` to `merged` (with a rejection) over real
git pushes:

```bash
pnpm sandbox
```

It prints the tags present at the end and confirms the push → hook → notifier seam
fired. The sandbox is left in `.sandbox/` (gitignored) for manual exploration.

## Where to next

- [Adding steps](./adding-steps.md) — customize the pipeline with a config file.
- [FAQ](./faq.md) — why git tags, why pre-push, how races are resolved.
- [Troubleshooting](./troubleshooting.md) — when the hook, notifier, or advances misbehave.
