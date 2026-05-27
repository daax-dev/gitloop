---
id: TASK-013
title: README + operator runbook
status: To Do
assignee: []
created_date: '2026-05-27 18:32'
labels:
  - docs
dependencies:
  - TASK-012
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Document how to run gitloop end-to-end: start the notifier, install the pre-push hook, configure the pipeline (steps + per-step artifacts), wire the MCP server into workers, and drive a task through the loop. Reflects the corrected pre-push eventing and the config-driven pipeline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Quickstart: install deps, start notifier, install hook, register MCP server
- [ ] #2 Pipeline configuration documented (adding/renaming steps, per-step artifact gates)
- [ ] #3 Worked example: driving /TASK-N to merged including a rejection loop-back
- [ ] #4 Notes the pre-push hook limitation and out-of-scope items from OBJECTIVE
<!-- AC:END -->
