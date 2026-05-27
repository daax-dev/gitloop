---
id: TASK-012
title: 'End-to-end DoD harness: two workers drive /TASK-N to merged with one rejection'
status: To Do
assignee: []
created_date: '2026-05-27 18:32'
labels:
  - integration
  - dod
dependencies:
  - TASK-008
  - TASK-010
  - TASK-011
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The project-level Definition of Done (OBJECTIVE lines 75-80). An automated harness/integration test drives a task end-to-end — /TASK-N through merged/TASK-N — including at least one rejection-and-loop-back, by two or more independent workers, on a local repo, with no CI/CD and no state stored outside git. Verifies the determinism guarantee: state reconstructable from git tags alone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two independent workers (separate processes) drive one task /TASK-N -> merged/TASK-N
- [ ] #2 The run includes at least one rejection that loops back with a version increment, then re-advances
- [ ] #3 No two workers claim the same step (claim atomicity holds under the real run)
- [ ] #4 All pipeline state is reconstructable from git tags alone; nothing persisted outside git
- [ ] #5 Runs under 'pnpm test' (Vitest) as a repeatable integration test
<!-- AC:END -->
