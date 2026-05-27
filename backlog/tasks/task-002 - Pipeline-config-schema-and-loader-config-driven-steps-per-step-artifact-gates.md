---
id: TASK-002
title: >-
  Pipeline config schema and loader (config-driven steps + per-step artifact
  gates)
status: To Do
assignee: []
created_date: '2026-05-27 18:31'
labels:
  - core
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per arch-004: the pipeline is config-driven, not hardcoded. Define and load a pipeline config that lists ordered steps, allows add/rename, and lets each step optionally require a per-step completion markdown artifact committed to git before that step tag is legal. Ships the six OBJECTIVE steps as the default config.

Steps (default): in-progress, code-complete, test-complete, review-complete, merged (entry is /TASK-N).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Config schema defines ordered steps with stable names; validated on load with clear errors
- [ ] #2 Each step may declare an optional required artifact filename (e.g. review.md)
- [ ] #3 Steps can be added/renamed via config without code changes
- [ ] #4 Default config reproduces the six OBJECTIVE steps and the /TASK-N entry point
- [ ] #5 Pure module in src/core, no adapter imports; unit-tested incl. invalid-config cases
<!-- AC:END -->
