---
id: TASK-008
title: pre-push git hook + installer (fire-and-forget notify; correct OBJECTIVE)
status: To Do
assignee: []
created_date: '2026-05-27 18:32'
labels:
  - adapter
  - hook
dependencies:
  - TASK-007
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per arch-002: git has no client post-push hook. Use the pre-push hook — a thin shell stub that reads the stdin payload (local ref, local sha, remote ref, remote sha) and fires a fire-and-forget HTTP POST to the notifier, then exits 0 so the push proceeds. The hook contains no pipeline logic. Provide an installer that wires .git/hooks/pre-push.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pre-push hook stub parses stdin payload and POSTs tag-push events to the notifier; non-blocking, exits 0
- [ ] #2 Hook contains no pipeline logic (thin stub only)
- [ ] #3 Installer script wires .git/hooks/pre-push and is idempotent
- [ ] #4 OBJECTIVE.md corrected: post-push references updated to pre-push with a note on the git limitation
- [ ] #5 Manual/integration evidence: pushing a pipeline tag produces a notifier event
<!-- AC:END -->
