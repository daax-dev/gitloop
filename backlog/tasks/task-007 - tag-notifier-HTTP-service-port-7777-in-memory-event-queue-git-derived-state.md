---
id: TASK-007
title: >-
  tag-notifier HTTP service (port 7777, in-memory event queue, git-derived
  state)
status: Done
assignee: []
created_date: '2026-05-27 18:32'
updated_date: '2026-05-27 19:30'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
tag-notifier HTTP service: in-mem queue, /events /state /health, git-derived state, structured JSON logs, safeLog (sync+async). Validation: producer Opus 4.7, validator Codex GPT-5 (codex-cli 0.129.0) — APPROVE.
<!-- SECTION:NOTES:END -->
