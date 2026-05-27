---
id: TASK-003
title: 'Tag schema: parse/format pipeline tags and rejection version increments'
status: Done
assignee: []
created_date: '2026-05-27 18:31'
updated_date: '2026-05-27 19:09'
labels:
  - core
dependencies:
  - TASK-002
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define the canonical git-tag grammar that encodes pipeline state, and pure parse/format functions. Step names come from the pipeline config (TASK-002), not hardcoded. Handles rejection loop-back versioning, e.g. in-progress/TASK-9/v2.

Per arch: tag presence is authoritative; given the tag set the next legal action must be unambiguous and verifiable from git alone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Parse a tag string into {step, taskId, version} and format the inverse; round-trip stable
- [ ] #2 Entry tag /TASK-N and step tags <step>/TASK-N[/vK] both parse
- [ ] #3 Version increment helper produces the next loop-back tag (v2, v3, ...)
- [ ] #4 Rejects malformed tags with clear errors; step names validated against the config
- [ ] #5 Pure module in src/core; unit-tested with a table of valid/invalid cases
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tag grammar parse/format per arch-006; safe-integer version bounds (Codex caught IEEE-754 precision bug). Validation: producer Opus 4.7, validator Codex GPT-5 (codex-cli 0.129.0) — APPROVE.
<!-- SECTION:NOTES:END -->
