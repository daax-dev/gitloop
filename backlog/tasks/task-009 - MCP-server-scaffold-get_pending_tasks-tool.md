---
id: TASK-009
title: MCP server scaffold + get_pending_tasks tool
status: Done
assignee: []
created_date: '2026-05-27 18:32'
updated_date: '2026-05-27 20:01'
labels:
  - adapter
  - mcp
dependencies:
  - TASK-005
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stand up the TypeScript MCP server using @modelcontextprotocol/sdk and expose the first of the three tools. get_pending_tasks lists tasks whose next step is claimable, derived from git tags via src/pipeline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MCP server boots via @modelcontextprotocol/sdk and registers tools
- [ ] #2 get_pending_tasks returns tasks whose next legal step is claimable, derived from git tag state
- [ ] #3 Output is deterministic for a given tag set
- [ ] #4 Adapter in src/adapters; delegates state derivation to src/pipeline; tested
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
MCP server scaffold (@modelcontextprotocol/sdk, zod) + get_pending_tasks; in-memory round-trip tested. Validation: producer Opus 4.7, validator Codex GPT-5 (codex-cli 0.129.0) — APPROVE.
<!-- SECTION:NOTES:END -->
