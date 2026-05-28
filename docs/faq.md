# FAQ

### Why git tags as state?

Because git is already the shared, distributed, atomic store every worker has. Putting
state in tags means there is **no second source of truth** to keep in sync — no
database, no service, no lockfile. Given the set of tags present, the next legal action
for any task is unambiguous and verifiable from git alone, even from a fresh clone.
This is the core invariant: **no state lives outside git.**

### Why pre-push and not post-push?

Because git has **no client-side `post-push` hook**. `pre-push` is the only push-time
client hook git provides; it receives the pushed refs on stdin. The original PRD's
reference to `post-push` was a mistake (see decision arch-002). gitloop uses `pre-push`
to fire a best-effort notification, accepting that the event may arrive just before the
push actually lands — which is fine, because the event is only advisory (see below).

### Is there a database or central server?

No. There is no database and no orchestration service. The optional **tag-notifier** is
a tiny local HTTP service with an **in-memory** event queue — it persists nothing and
derives state on demand from git tags. You can run gitloop with the notifier off
entirely; workers can poll git directly.

### How do two workers avoid doing the same step?

Through an atomic **claim tag**. When a worker calls `claim_task`, it pushes an
anonymous tag `claim/<step>/TASK-N/vK`. The remote ref update is an atomic
compare-and-swap: the **first** worker to push that ref wins, and every other worker's
push is rejected. The loser's `claim_task` returns `{ outcome: "lost", claimed: false }`.

The ref name carries **no** identity (so the CAS works on a single shared ref); the
winning worker's identity is written into the tag's **message**. A worker re-claiming a
step it already owns is an idempotent no-op (`already-owned`).

### What happens on rejection?

A worker calls `advance_task` with `{ reject: true }`. This loops the task back to the
**first** step at the **next version** — e.g. `in-progress/TASK-1/v2`. Forward progress
then re-advances through every step at that version until the task reaches the terminal
step (`merged/TASK-1/v2`). The current version of a task is the highest `/vK` present
across its tags, so the loop-back state is fully reconstructable from the tag set.

### Do I need the notifier running?

No. The notifier is **optional**. It provides event delivery and a `/state` view for
inspection, but the MCP tools always re-derive authoritative state from git tags
(`fetchTags` + `listTags`) — they never rely on the notifier. If the notifier is down
or `curl` is missing, pushes still succeed; workers can poll git on their own cadence.

### SSE vs polling?

**Polling.** Locally, polling git for the current tag set is sufficient and keeps the
loop simple. There is no SSE/push channel from the notifier; its events are an advisory
wake-up, not a stream you must consume. (This resolved an open design question — see
arch-010.)

### Can I add or rename steps?

Yes. The pipeline is config-driven. Provide a JSON config via `GITLOOP_CONFIG` or place
it at `<repo>/.gitloop/pipeline.json` for auto-discovery. You can add, rename, and
reorder steps, and give any step a required artifact. See
[Adding steps](./adding-steps.md). **All workers must share the same config.**

### What is `GITLOOP_WORKER_ID`?

A worker's identity, written into claim tag messages so you can see who holds a claim.
Set it via the `GITLOOP_WORKER_ID` environment variable. If unset, it defaults to
`user@host` (the OS username and hostname). It must be non-empty and single-line.

### Are claim tags cleaned up?

No. Claim tags (`claim/<step>/TASK-N/vK`) **accumulate** in the repo. They are
deliberately **ignored** by state derivation — only the pipeline tags (`TASK-N` and
`<step>/TASK-N/vK`) determine a task's next action. They are left in place as the
record of who claimed what; gitloop does not delete them.

### Does it do CI?

No. CI/CD is explicitly out of scope. There is **no CI/test gate** on any transition —
in particular, `advance_task` does not run or require a passing test suite before
`test-complete`. Validation is worker-driven: the receiving worker tests and reviews,
and on failure it rejects (loops the task back). Correctness comes from git's atomicity
and the rejection loop, not from a CI pipeline.

## See also

- [Getting started](./getting-started.md)
- [Adding steps](./adding-steps.md)
- [Troubleshooting](./troubleshooting.md)
