---
id: TASK-017
title: Hook script behavioral unit test (real bash + stub listener)
status: Done
assignee: []
created_date: '2026-05-28 00:10'
updated_date: '2026-05-28 01:08'
labels:
  - testing
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Invoke bash hooks/pre-push with crafted stdin fixtures against a stub HTTP listener; assert the POST payload (tag extraction, JSON shape), the injection filter (drops unsafe names), tag-delete skipping (all-zero sha), non-tag-ref skipping, and graceful exit-0 when the listener is absent. Tests the actual shell, not just shellcheck.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Payload JSON asserted for a normal tag push
- [ ] #2 Injection-unsafe and deleted/non-tag refs excluded
- [ ] #3 Exits 0 (push proceeds) when notifier unreachable
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hook bash unit test vs stub HTTP listener: payload/filter/delete/multi-tag/graceful.
<!-- SECTION:NOTES:END -->
