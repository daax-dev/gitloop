---
id: TASK-004
title: 'Git read layer: list tags, push tags, derive tag set (git CLI wrapper)'
status: Done
assignee: []
created_date: '2026-05-27 18:31'
updated_date: '2026-05-27 19:09'
labels:
  - core
dependencies:
  - TASK-001
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Thin wrapper over the git CLI for the operations the pipeline needs: enumerate tags (git for-each-ref refs/tags), push a tag to the shared remote, check ref existence. No pipeline logic here — just git I/O returning typed results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 List all pipeline tags from refs/tags as typed parsed tags (uses TASK-003)
- [ ] #2 Push a single tag to a named remote; surfaces success vs rejected-ref distinctly (needed for claim atomicity)
- [ ] #3 Check existence of a specific tag/ref
- [ ] #4 git invoked via child process with explicit args (no shell injection); errors typed, not swallowed
- [ ] #5 Module in src/core; integration-tested against a throwaway local repo
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Typed git CLI wrapper: listTags/tagExists/createTag/pushTag(CAS)/pathExistsAt/readTagMessage; integration-tested vs throwaway repos. Validation: producer Opus 4.7, validator Codex GPT-5 (codex-cli 0.129.0) — APPROVE.
<!-- SECTION:NOTES:END -->
