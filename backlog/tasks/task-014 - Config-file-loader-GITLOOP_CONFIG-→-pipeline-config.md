---
id: TASK-014
title: 'Config-file loader: GITLOOP_CONFIG → pipeline config'
status: Done
assignee: []
created_date: '2026-05-28 00:09'
updated_date: '2026-05-28 00:54'
labels:
  - core
  - config
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prerequisite for custom pipelines at runtime. depsFromEnv and the notifier currently hardcode DEFAULT_PIPELINE. Add a loader: GITLOOP_CONFIG points to a JSON file parsed via loadPipelineConfig; absent → default. Wire into depsFromEnv (MCP) and the notifier. Without this, the docs "add a plan/design step" example cannot run against a real server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GITLOOP_CONFIG=path loads + validates a JSON pipeline config; clear error on bad file/JSON
- [ ] #2 Unset GITLOOP_CONFIG falls back to DEFAULT_PIPELINE
- [ ] #3 Wired into depsFromEnv (MCP server) and notifier startup
- [ ] #4 Unit + integration tested incl. invalid-config failure
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GITLOOP_CONFIG→JSON, else .gitloop/pipeline.json discovery, else default; wired into depsFromEnv + notifier bin. 8 tests. arch-009.
<!-- SECTION:NOTES:END -->
