---
id: TASK-011
title: 'MCP tool: advance_task (advance, per-step artifact gate, rejection loop-back)'
status: To Do
assignee: []
created_date: '2026-05-27 18:32'
labels:
  - adapter
  - mcp
dependencies:
  - TASK-005
  - TASK-009
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose advance_task. Pushes the next pipeline tag to advance a task, or rejects it backward with a version increment (loop-back). Enforces per-step required-artifact gates from the pipeline config (arch-004): if the target step requires e.g. review.md, the artifact must exist in git or the advance is illegal. No CI/test gate (arch-003) — validation is worker-driven.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 advance_task pushes the next legal step tag for a task
- [ ] #2 Rejection path pushes the prior-step tag with incremented version (loop-back)
- [ ] #3 If the target step's config requires an artifact, advance is rejected unless the artifact exists in git
- [ ] #4 No CI/test enforcement; idempotent against an already-advanced task
- [ ] #5 Tested: advance, illegal-without-artifact, and rejection loop-back paths
<!-- AC:END -->
