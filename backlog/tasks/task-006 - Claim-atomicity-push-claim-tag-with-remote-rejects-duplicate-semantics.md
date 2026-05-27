---
id: TASK-006
title: 'Claim atomicity: push-claim-tag with remote-rejects-duplicate semantics'
status: To Do
assignee: []
created_date: '2026-05-27 18:32'
labels:
  - pipeline
dependencies:
  - TASK-004
  - TASK-005
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per arch-005: a worker claims a step by pushing a claim tag to the shared remote. The remote ref update is atomic and rejects a duplicate, so a second worker pushing the same claim tag fails cleanly. No filesystem lock; no state outside git. Claiming an already-claimed step is a safe no-op for the owner and a clean failure for others.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Claim = push a deterministic claim tag for {task, step}; first push wins
- [ ] #2 Concurrent duplicate claim is rejected by the remote and reported as claim-lost, not a crash
- [ ] #3 Idempotent: the owning worker re-claiming its own step is a no-op success
- [ ] #4 Integration test spawns two concurrent processes racing the same claim; exactly one wins
- [ ] #5 No lockfile or state outside git introduced
<!-- AC:END -->
