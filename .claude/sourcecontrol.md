# Source Control

---

## Repository
- Host: GitHub — daax-dev/gitloop
- Default branch: main
- All work lands via PR. No direct commits to main.

---

## Branch Naming
- Feature: `feature/<short-topic>`
- Bug fix: `fix/<short-topic>`
- Docs: `docs/<short-topic>`
- Chore / tooling: `chore/<short-topic>`
- Claude Code sessions: harness-assigned name (e.g., `claude/<task>-<id>`). Do not rename mid-session.
- Lowercase, hyphen-separated. Keep names short.

---

## Commits
- Imperative mood, present tense: "add X", not "added X" or "adds X".
- Subject line ≤ 72 characters.
- Body explains the **why**. The diff shows the what.
- One logical change per commit. Mixed-purpose commits get rejected at review.
- Do not amend a commit that has already been pushed unless explicitly asked.

---

## Pull Requests
- Open a PR as soon as the branch has a meaningful commit. Draft is fine.
- PR title = leading commit subject line.
- PR body must include:
  - Problem statement.
  - Approach taken and alternatives considered.
  - Test evidence (commands run, output).
  - Which model produced and which model validated (if AI-assisted).
- Never merge your own PR unless explicitly authorized by the operator.
- Squash-merge by default unless the branch history is intentionally curated.

---

## Worktrees
- Long-running parallel work uses `git worktree` rather than branch-switching in place.
- Worktree paths live outside the primary checkout (e.g., `../<repo>-<branch>`).
- Worktrees are disposable. Clean them up when the branch lands.

---

## What Never Gets Committed
- Secrets, tokens, keys, connection strings.
- `.env` files with live values.
- Generated build output (unless the project explicitly checks in artifacts).
- IDE / OS noise (`.DS_Store`, `Thumbs.db`) — add to `.gitignore`.

---

## Destructive Operations
- Force-push to a shared branch requires explicit operator authorization.
- `git reset --hard`, branch deletion, and history rewrites require confirmation when recovery is uncertain.
- Treat destructive git operations as high-risk: pause, verify the target, get confirmation.

---

## Tags and Releases
- **Two distinct tag namespaces — do not conflate them:**
  - *Pipeline tags* are gitloop's own workflow state and are created/pushed by the
    tool (or by workers via the MCP tools), not by hand:
    `/TASK-N` → `in-progress/TASK-N` → `code-complete/TASK-N` → `test-complete/TASK-N`
    → `review-complete/TASK-N` → `merged/TASK-N`, with rejection loop-back
    `…/TASK-N/vK`. These are operational state, never a release marker.
  - *Release tags*: semver `vMAJOR.MINOR.PATCH`, created manually. None yet (pre-1.0).
- Release notes: manual until a release process is defined.
- Do not hand-create or delete pipeline tags during normal development; let the tool
  manage them. Deleting a pipeline tag mutates workflow state and is a destructive op
  (see above).
