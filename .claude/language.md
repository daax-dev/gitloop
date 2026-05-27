# Language Conventions

`[FILL IN]` marks a gap. Treat as "ask the operator," not a guess.

For each active language, this file records:
1. Pinned version and how it is pinned.
2. Formatter and config location.
3. Linter and config location.
4. Type checker and strictness level.
5. Test framework and coverage threshold.
6. Any style rules that override the formatter's defaults.

---

## Active Languages

### TypeScript
- Runtime: Node 22 LTS, pinned via `.nvmrc` at repo root.
- Package manager: pnpm — no npm or yarn. `pnpm-lock.yaml` is committed.
- Formatter: Prettier, config: `.prettierrc` (or `prettier` key in `package.json`).
- Linter: ESLint + `@typescript-eslint`, config: `eslint.config.js` (flat config).
- Type checker: strict — `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true` in `tsconfig.json`. `any` requires a justifying comment.
- Tests: Vitest. Run TS directly with `tsx`. Full suite: `pnpm test`.
- Coverage threshold: 80%.

### Shell (bash)
- Version target: bash 5.x.
- Linter: shellcheck.
- Style: `set -euo pipefail` in every script. Quote all expansions. No `eval`.
- Scope in this repo: limited to the git `post-push` hook stub, which only forwards the
  pushed-tag payload to the Node notifier. No pipeline logic lives in shell.

---

## Cross-Cutting Rules
- No language rule overrides the formatter. Fix the config, not the code.
- Generated code lives under a path excluded by the linter/formatter. Never edit generated files by hand.
- Lockfiles are committed. Updating a lockfile is a deliberate change — call it out in the PR.
- Pre-commit hooks gate formatter and linter on every commit. No bypasses (`--no-verify`).
