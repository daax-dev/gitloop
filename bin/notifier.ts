#!/usr/bin/env -S npx tsx
// Entry point: start the tag-notifier HTTP service.
// Configure via GITLOOP_NOTIFIER_PORT (default 7777) and GITLOOP_REPO (default cwd).
// Run via `pnpm start:notifier` (tsx) — TypeScript source.
import { loadPipelineConfigFromEnv } from '../src/core/config-file.js';
import { createNotifier } from '../src/adapters/notifier.js';

// Promise.resolve().then(...) so a synchronous throw (invalid port or bad
// pipeline config file) is caught here too.
void Promise.resolve()
  .then(() => {
    const repoPath = process.env.GITLOOP_REPO ?? process.cwd();
    return createNotifier({
      repoPath,
      config: loadPipelineConfigFromEnv(process.env, repoPath),
    }).start();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
