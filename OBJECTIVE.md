# gitloop — Objective

**Source:** [daax-dev/gitloop#1](https://github.com/daax-dev/gitloop/issues/1) ("GitLoop Local — PRD, Draft")
**Status:** Objective draft
**Scope:** Local inner-loop only. No CI/CD. Pure TypeScript implementation.

---

## Objective

Build a local, git-only inner-loop tool that lets multiple AI coding models and
tools hand work off to each other in an event-driven, deterministic way, using
native git primitives (tags, worktrees) as the single source of truth — no shared
database, no orchestration service, no CI/CD.

A unit of work advances through a fixed pipeline. Each step transition is a git tag.
Pushing a tag emits an event. Workers (coding models / tools, on any machine sharing
the repo) consume events, atomically claim the next available task, do their step, and
advance it by pushing the next tag. The loop repeats until the task reaches `merged/`.

"Deterministic" means: given the set of tags present, the next legal action for any
task is unambiguous and verifiable from git state alone.

---

## Pipeline (git tags as canonical state)

```
/TASK-N → in-progress/TASK-N → code-complete/TASK-N → test-complete/TASK-N → review-complete/TASK-N → merged/TASK-N
```

Rejections loop back with a version increment, e.g. `in-progress/TASK-9/v2`.
Tag presence is authoritative; no state lives outside git.

---

## Components (all TypeScript / Node — full reframe of the issue's Python design)

The issue's reference design used a Python Flask notifier and Python MCP tools.
This project reimplements that design in pure TypeScript, with one unavoidable
exception: the git hook must be an executable script git can invoke.

1. **pre-push hook** — `.git/hooks/pre-push`. Thin shell script git invokes during a
   push. (git has no client-side *post-push* hook — `pre-push` is the only push-time
   client hook; the original PRD's `post-push` is not a real git hook. See
   `.logs/decisions/architecture.jsonl` arch-002.) It reads the pushed refs from
   stdin, extracts pipeline tag names, and fires a best-effort HTTP POST to the Node
   notifier with a short timeout so a slow/absent notifier never blocks the push.
   Shell is used only because git requires an executable hook; it contains no
   pipeline logic. Installed via `installPrePushHook` (TASK-008).
2. **tag-notifier** — TypeScript/Node service (local, default port `7777`). Receives
   tag-push events, maintains the in-memory event queue, and derives pipeline state
   from git tags.
3. **MCP tools** — TypeScript MCP server exposing three tools to workers:
   - `get_pending_tasks` — list tasks whose next step is claimable.
   - `claim_task` — atomically claim a task for a step (no two workers claim the same).
   - `advance_task` — push the next pipeline tag, advancing or looping the task.

---

## Out of Scope

- CI/CD integration.
- Notifier authentication.
- Persistent worker registration.
- Automatic worktree lifecycle management.
- UI / dashboard.

---

## Open Questions (from the PRD — to resolve while building)

1. Should `advance_task` require a CI/test pass before allowing `test-complete`?
2. Is SSE push from the notifier worthwhile locally, or is polling sufficient?
3. Should a `review.md` be required before `review-complete` is legal?

---

## Definition of Done (project-level)

The tool is "done" when a task can be driven end-to-end — `/TASK-N` through
`merged/TASK-N`, including at least one rejection-and-loop-back — entirely via git
tags and the three MCP tools, by two or more independent workers, on a local repo,
with no CI/CD and no state stored outside git.
