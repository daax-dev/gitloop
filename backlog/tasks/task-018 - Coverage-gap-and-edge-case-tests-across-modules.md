---
id: TASK-018
title: Coverage-gap and edge-case tests across modules
status: Done
assignee: []
created_date: '2026-05-28 00:10'
updated_date: '2026-05-28 01:08'
labels:
  - testing
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fill real gaps: notifier (events?since edge, body-too-large, invalid port), git error paths (signal/ENOENT), mcp-tools (terminal advance, cannot-reject), multi-task get_pending_tasks ordering and cross-task isolation, bad GITLOOP_WORKER_ID handling, and a custom-config end-to-end (the plan/design step) asserted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Custom-config (added plan/design step) driven end-to-end in a test
- [ ] #2 Multi-task scenario: several pending tasks, correct ordering, no cross-interference
- [ ] #3 Module error/edge branches covered; overall coverage stays ≥80%
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Edge + custom-config + multitask tests; notifier oversized-body fix (pause not destroy → 400 observable).
<!-- SECTION:NOTES:END -->
