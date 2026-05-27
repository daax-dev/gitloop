<!-- CLAUDE.md and AGENTS.md share the Operator Preferences and Hard Guardrails below. Keep them in sync. -->

# CLAUDE.md

## Project
Name: gitloop
Purpose: Local, git-only inner-loop tool — multiple AI coding models/tools hand work off to each other event-driven and deterministically, using native git primitives (tags, worktrees) as the single source of truth. No shared DB, no orchestration service, no CI/CD. Pure TypeScript.
Goal: A task can be driven end-to-end (`/TASK-N` → `merged/TASK-N`, including at least one rejection loop-back) entirely via git tags and three MCP tools, by two or more independent workers, on a local repo, with no state stored outside git. See `OBJECTIVE.md`.

---

## Operator Preferences
<!-- Operator-specific. Revise or replace when applying to a different operator. -->
- State facts only. No sugarcoating.
- Surface problems, blockers, and risks immediately.
- Consult before one-way-door decisions and before any architectural change.
- Never answer from a guess. Validate claims against primary sources. If validation is not possible, say so explicitly.
- Objective language. No first-person pronouns. No apologies or hedges.

---

## Hard Guardrails (always apply)
- Plan before any non-trivial change. Write the plan down. Wait for approval.
- Never commit or merge directly to `main`.
- Never commit secrets, tokens, keys, or `.env` files with live values.
- No destructive git (`reset --hard`, force-push, branch delete) without explicit operator approval.
- Never overwrite uncommitted user changes. Inspect existing patterns before editing.
- Run formatter, linter, and tests after changes. If that is not possible, state exactly why.
- Log non-trivial decisions to `.logs/decisions/<topic>.jsonl`.
- Repo-local instructions override these template defaults.

---

## Required Reading
`.claude/workflow.md` is always loaded (see include below) — planning and definition of done apply to every task.

Read the matching file **before** you:
- write or edit code → `.claude/language.md` (formatting, linting, testing for that language)
- make an architectural or cross-boundary decision → `.claude/architecture.md`
- touch dependencies, runtime, or infrastructure → `.claude/stack.md`
- perform branch / PR / commit / merge operations → `.claude/sourcecontrol.md`
- write a decision or reference log entry → `.claude/history.md`

@.claude/workflow.md

<!-- BACKLOG.MD MCP GUIDELINES START -->

<CRITICAL_INSTRUCTION>

## BACKLOG WORKFLOW INSTRUCTIONS

This project uses Backlog.md MCP for all task and project management activities.

**CRITICAL GUIDANCE**

- If your client supports MCP resources, read `backlog://workflow/overview` to understand when and how to use Backlog for this project.
- If your client only supports tools or the above request fails, call `backlog.get_backlog_instructions()` to load the tool-oriented overview. Use the `instruction` selector when you need `task-creation`, `task-execution`, or `task-finalization`.

- **First time working here?** Read the overview resource IMMEDIATELY to learn the workflow
- **Already familiar?** You should have the overview cached ("## Backlog.md Overview (MCP)")
- **When to read it**: BEFORE creating tasks, or when you're unsure whether to track work

These guides cover:
- Decision framework for when to create tasks
- Search-first workflow to avoid duplicates
- Links to detailed guides for task creation, execution, and finalization
- MCP tools reference

You MUST read the overview resource to understand the complete workflow. The information is NOT summarized here.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD MCP GUIDELINES END -->
