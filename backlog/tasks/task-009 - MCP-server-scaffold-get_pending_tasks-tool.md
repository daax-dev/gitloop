---
id: TASK-009
title: MCP server scaffold + get_pending_tasks tool
status: To Do
assignee: []
created_date: '2026-05-27 18:32'
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
