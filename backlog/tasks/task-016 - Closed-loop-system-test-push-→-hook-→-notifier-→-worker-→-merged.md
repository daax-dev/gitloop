---
id: TASK-016
title: 'Closed-loop system test: push → hook → notifier → worker → merged'
status: Done
assignee: []
created_date: '2026-05-28 00:10'
updated_date: '2026-05-28 01:08'
labels:
  - testing
  - e2e
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Automated Vitest test wrapping the sandbox: start the REAL notifier, real repo with the INSTALLED pre-push hook, register a task, drive to merged via real worker(s), and ASSERT the notifier received an event for each tag push (proving the hook actually fires and reaches the notifier). This exercises the eventing seam the current suite never runs end to end.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Real notifier process + real installed hook + real git push
- [ ] #2 Notifier receives a tag-push event per advance (asserted via GET /events)
- [ ] #3 Task reaches merged; final state reconstructable from git tags
- [ ] #4 Graceful: notifier down / curl missing → push still succeeds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed-loop system test: real notifier + installed hook + real git push; asserts seam fires (events incl merged tag), fresh-clone derivation, notifier-down graceful.
<!-- SECTION:NOTES:END -->
