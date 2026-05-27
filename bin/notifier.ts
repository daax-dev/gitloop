#!/usr/bin/env -S npx tsx
// Entry point: start the tag-notifier HTTP service.
// Configure via GITLOOP_NOTIFIER_PORT (default 7777) and GITLOOP_REPO (default cwd).
// Run via `pnpm start:notifier` (tsx) — TypeScript source.
import { createNotifier } from '../src/adapters/notifier.js';

// Promise.resolve().then(...) so a synchronous throw from createNotifier
// (e.g. an invalid GITLOOP_NOTIFIER_PORT) is caught here too.
void Promise.resolve()
  .then(() => createNotifier().start())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
