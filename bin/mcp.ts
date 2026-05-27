#!/usr/bin/env -S npx tsx
// Entry point: start the gitloop MCP server over stdio for a worker process.
// Run via `pnpm start:mcp` (tsx) — this is TypeScript source, not compiled JS.
// Configure via GITLOOP_REPO, GITLOOP_REMOTE, GITLOOP_WORKER_ID (see arch-007).
import { startStdioServer } from '../src/adapters/mcp-server.js';

void startStdioServer().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
