#!/usr/bin/env -S npx tsx
// Entry point: install the gitloop pre-push hook into a repo (default: cwd).
// Run via `pnpm install:hook [repoPath] [--force]` (tsx) — TypeScript source.
import { installPrePushHook } from '../src/adapters/hook-install.js';

const repo = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd();
const force = process.argv.includes('--force');

void installPrePushHook(repo, { force }).then(
  (result) => {
    console.log(`pre-push hook ${result.action}: ${result.path}`);
  },
  (error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  },
);
