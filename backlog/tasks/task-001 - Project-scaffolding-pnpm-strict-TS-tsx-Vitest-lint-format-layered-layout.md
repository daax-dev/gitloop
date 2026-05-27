---
id: TASK-001
title: 'Project scaffolding: pnpm, strict TS, tsx, Vitest, lint/format, layered layout'
status: Done
assignee: []
created_date: '2026-05-27 18:31'
updated_date: '2026-05-27 18:51'
labels:
  - infra
  - scaffolding
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stand up the TypeScript project skeleton per .claude/stack.md and the layering in .claude/architecture.md. Foundational task; blocks all code work.

Layering: src/core (git primitives, tag schema), src/pipeline (legal transitions, claim/advance domain), src/adapters (notifier HTTP, MCP tools, hook). Core never imports an adapter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package.json uses pnpm; Node 22 pinned via existing .nvmrc; pnpm-lock.yaml committed
- [ ] #2 tsconfig.json strict:true; tsx runs .ts directly with no build step
- [ ] #3 Vitest configured; 'pnpm test' runs and passes on a placeholder test
- [ ] #4 ESLint + Prettier configured; 'pnpm lint' and 'pnpm format' run clean
- [ ] #5 Directory layout exists: src/core, src/pipeline, src/adapters, test/ — with the core-never-imports-adapter rule documented
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scaffolding complete: pnpm, strict TS (NodeNext + noUncheckedIndexedAccess/exactOptionalPropertyTypes), tsx, Vitest (80% coverage gate on pnpm coverage), ESLint flat + Prettier, husky pre-commit -> lint-staged. Three-layer src/ with lint-enforced dependency direction (static + dynamic imports). Gate green on node 22. Validation: producer Opus 4.7, validator Codex GPT-5 (codex-cli 0.129.0) APPROVE; fixed dynamic-import bypass, tightened layering regex.
<!-- SECTION:NOTES:END -->
