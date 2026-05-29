#!/usr/bin/env -S npx tsx
// Sandbox harness (TASK-015): build a throwaway .sandbox/ with a real bare
// remote, a worker repo with the installed pre-push hook, and a running
// notifier; then drive a task to merged via real git pushes and check that the
// push → hook → notifier seam actually fires. Exploratory: run it by hand to
// find rough edges. Runtime dir .sandbox/ is gitignored.
//
//   pnpm sandbox
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DEFAULT_PIPELINE } from '../src/core/config.js';
import { Git } from '../src/core/git.js';
import { installPrePushHook } from '../src/adapters/hook-install.js';
import { createNotifier } from '../src/adapters/notifier.js';
import { advanceTask, claimTask, getPendingTasks } from '../src/adapters/mcp-tools.js';

const SB = resolve('.sandbox');
const PORT = 7788;
const findings: string[] = [];

function log(msg: string): void {
  console.log(msg);
}

async function main(): Promise<void> {
  // curl is required by the hook.
  try {
    execFileSync('curl', ['--version'], { stdio: 'ignore' });
  } catch {
    findings.push('curl not found on PATH — the pre-push hook cannot notify.');
  }

  rmSync(SB, { recursive: true, force: true });
  await mkdir(SB, { recursive: true });

  const bare = join(SB, 'remote.git');
  const worker = join(SB, 'workerA');
  await new Git(SB).run(['init', '--bare', '-q', bare]);

  await mkdir(worker, { recursive: true });
  const g = new Git(worker);
  await g.run(['init', '-q', '-b', 'main']);
  await g.run(['config', 'user.email', 'sandbox@example.com']);
  await g.run(['config', 'user.name', 'Sandbox']);
  await g.run(['config', 'commit.gpgsign', 'false']);
  await g.run(['remote', 'add', 'origin', bare]);
  await writeFile(join(worker, 'README.md'), '# sandbox work\n');
  await g.run(['add', 'README.md']);
  await g.run(['commit', '-q', '-m', 'seed']);
  await g.run(['push', '-q', '-u', 'origin', 'main']);

  const hook = await installPrePushHook(worker);
  log(`installed hook: ${hook.action} → ${hook.path}`);

  // The hook reads GITLOOP_NOTIFIER_URL at push time from the git child env.
  // Prefer a stable port for easier manual exploration, but fall back to an
  // ephemeral port if it's already taken.
  let notifier = createNotifier({ port: PORT, repoPath: worker, log: () => {} });
  let boundPort = PORT;
  try {
    ({ port: boundPort } = await notifier.start());
  } catch (err: unknown) {
    const code = (err as { code?: unknown }).code;
    if (code !== 'EADDRINUSE') throw err;
    notifier = createNotifier({ port: 0, repoPath: worker, log: () => {} });
    ({ port: boundPort } = await notifier.start());
  }
  process.env.GITLOOP_NOTIFIER_URL = `http://127.0.0.1:${String(boundPort)}`;
  log(`notifier listening on ${String(boundPort)}, deriving state from ${worker}`);

  // Register and drive the task with one rejection, via the real MCP tool logic
  // (each push fires the installed hook → notifier).
  await g.createTag('TASK-1');
  await g.pushTag('TASK-1', 'origin');

  const deps = { git: g, remote: 'origin', config: DEFAULT_PIPELINE, workerId: 'sandbox' };
  let rejected = false;
  let merged = false;
  for (let i = 0; i < 30 && !merged; i++) {
    const { tasks } = await getPendingTasks(deps);
    const t = tasks.find((x) => x.taskId === 'TASK-1');
    if (!t) break;
    await claimTask(deps, { taskId: 'TASK-1' });
    if (!rejected && t.currentStep === 'code-complete') {
      const r = await advanceTask(deps, { taskId: 'TASK-1', reject: true });
      log(`reject → ${r.tag}`);
      rejected = true;
      continue;
    }
    const adv = await advanceTask(deps, { taskId: 'TASK-1' });
    log(`advance → ${adv.tag}${adv.advanced ? '' : ` (BLOCKED: ${adv.reason ?? '?'})`}`);
    if (adv.step === 'merged' && adv.advanced) merged = true;
  }

  // Give fire-and-forget hook POSTs a moment to land.
  await new Promise((r) => setTimeout(r, 500));

  const res = await fetch(`http://127.0.0.1:${String(PORT)}/events`);
  const body = (await res.json()) as { events: { id: number; tags: string[] }[] };
  const tags = await g.listTags();

  log('');
  log(`reached merged: ${String(merged)}; rejection happened: ${String(rejected)}`);
  log(`notifier events received: ${String(body.events.length)}`);
  log(`tags now present (${String(tags.length)}): ${tags.sort().join(', ')}`);

  if (!merged) findings.push('task did not reach merged');
  if (!rejected) findings.push('no rejection loop-back occurred');
  if (body.events.length === 0) {
    findings.push('notifier received NO events — the push→hook→notifier seam did not fire');
  }

  await notifier.stop();

  log('');
  if (findings.length === 0) {
    log('✅ no rough edges found: hook fired, events flowed, task reached merged via a rejection.');
  } else {
    log('⚠️ rough edges:');
    for (const f of findings) log(`  - ${f}`);
  }
  log('');
  log(`Sandbox left at ${SB} (gitignored). To explore manually:`);
  log(`  GITLOOP_REPO=${worker} GITLOOP_NOTIFIER_PORT=${String(PORT)} pnpm start:notifier`);
  log(`  GITLOOP_REPO=${worker} GITLOOP_WORKER_ID=you pnpm start:mcp`);
}

void main().catch((err: unknown) => {
  console.error(err);
  if (existsSync(SB)) log(`(sandbox left at ${SB} for inspection)`);
  process.exitCode = 1;
});
