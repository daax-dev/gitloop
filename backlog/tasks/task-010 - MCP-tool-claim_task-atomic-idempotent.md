---
id: TASK-010
title: 'MCP tool: claim_task (atomic, idempotent)'
status: Done
assignee: []
created_date: '2026-05-27 18:32'
updated_date: '2026-05-27 20:01'
labels:
  - adapter
  - mcp
dependencies:
  - TASK-006
  - TASK-009
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose claim_task on the MCP server. Uses the claim-atomicity primitive (TASK-006): claiming pushes a claim tag; first worker wins, others get a clean claim-lost result. Idempotent for the owner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 claim_task atomically claims a {task, step} via the push-claim-tag primitive
- [ ] #2 Two workers claiming the same step: exactly one succeeds, the other gets claim-lost (no error/crash)
- [ ] #3 Idempotent: owner re-claiming its own step succeeds as a no-op
- [ ] #4 Tested incl. the concurrent-claim path
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
claim_task tool over claimStep CAS; exclusive-claim tested. Validation: producer Opus 4.7, validator Codex GPT-5 (codex-cli 0.129.0) — APPROVE.
<!-- SECTION:NOTES:END -->
