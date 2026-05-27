---
id: TASK-007
title: >-
  tag-notifier HTTP service (port 7777, in-memory event queue, git-derived
  state)
status: To Do
assignee: []
created_date: '2026-05-27 18:32'
labels:
  - adapter
  - notifier
dependencies:
  - TASK-005
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Local Node HTTP service (Node stdlib http) on default port 7777 (env-configurable per arch). Receives tag-push events from the hook, maintains an in-memory event queue (no persistence by design), and derives pipeline state from git tags via the core/pipeline modules. Structured JSON logs to stdout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Listens on PORT env (default 7777); accepts a tag-push event payload (POST)
- [ ] #2 Maintains in-memory event queue; exposes endpoint(s) to read pending events / derived state
- [ ] #3 Pipeline state is derived from git tags on demand, never stored separately
- [ ] #4 Structured JSON logging to stdout; clean startup/shutdown
- [ ] #5 Adapter in src/adapters; does not embed pipeline logic (delegates to src/pipeline); tested
<!-- AC:END -->
