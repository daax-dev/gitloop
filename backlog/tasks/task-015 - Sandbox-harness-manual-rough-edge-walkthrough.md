---
id: TASK-015
title: Sandbox harness + manual rough-edge walkthrough
status: Done
assignee: []
created_date: '2026-05-28 00:10'
updated_date: '2026-05-28 00:56'
labels:
  - tooling
  - testing
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Committed setup script (scripts/sandbox.ts) that builds a gitignored .sandbox/ runtime: a bare remote, two worker clones, installed pre-push hook, running notifier, a registered task, and printed drive commands. Run it by hand, walk the full workflow, record rough edges, and fix what surfaces (e.g. config wiring, env passing, first-push quirks, hook portability). The same script is the basis for the closed-loop test (TASK-017).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .sandbox/ is gitignored; scripts/sandbox.ts is committed and idempotent
- [ ] #2 Script sets up bare remote + 2 workers + installed hook + notifier + a task
- [ ] #3 Manual walkthrough completed; rough edges documented and fixed (or logged as decisions)
- [ ] #4 Pre-push timing semantics decided and recorded (advisory event, not source of truth)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
scripts/sandbox.ts builds gitignored .sandbox/ (bare + worker + installed hook + notifier) and drives /TASK-1→merged with a rejection via real pushes; verified push→hook→notifier seam (15 events) and notifier-down graceful degradation. Rough edges are advisory semantics → arch-010, to be documented.
<!-- SECTION:NOTES:END -->
