---
id: TASK-005
title: >-
  Pipeline domain: derive current step and next legal action; rejection
  loop-back
status: To Do
assignee: []
created_date: '2026-05-27 18:31'
labels:
  - pipeline
dependencies:
  - TASK-002
  - TASK-003
  - TASK-004
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The deterministic core. Given the set of tags present (from TASK-004) and the pipeline config (TASK-002), derive each tasks current step and the single next legal action. Implement rejection loop-back: a reject moves the task to the prior step with an incremented version. Enforce idempotency rules (advancing an already-advanced task is a safe no-op).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a tag set, returns each task's current step unambiguously
- [ ] #2 Returns the next legal action (advance to step X, or reject to prior step vK+1) — exactly one, or none if terminal/blocked
- [ ] #3 Rejection loop-back computes the correct prior-step tag with version increment
- [ ] #4 Idempotency: re-deriving after an already-applied transition yields no-op, not a double-action
- [ ] #5 Pure module in src/pipeline; table-driven tests cover happy path, loop-back, terminal (merged), and ambiguous/blocked states
<!-- AC:END -->
