import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PIPELINE } from '../../src/core/config.js';
import { Git } from '../../src/core/git.js';
import { type Notifier, createNotifier } from '../../src/adapters/notifier.js';
import { installPrePushHook } from '../../src/adapters/hook-install.js';
import {
  type McpDeps,
  advanceTask,
  claimTask,
  getPendingTasks,
} from '../../src/adapters/mcp-tools.js';

// Closed-loop SYSTEM test (TASK-016): a real notifier + a worker repo with the
// real pre-push hook installed, driving /TASK-1 → merged via real git pushes that
// fire the hook → notifier seam. This asserts what scripts/sandbox.ts demonstrates.

function curlAvailable(): boolean {
  try {
    execFileSync('curl', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasCurl = curlAvailable();

async function initWorker(dir: string, remote: string): Promise<Git> {
  await mkdir(dir, { recursive: true });
  const g = new Git(dir);
  await g.run(['init', '-q', '-b', 'main']);
  await g.run(['config', 'user.email', 'w@example.com']);
  await g.run(['config', 'user.name', 'Worker']);
  await g.run(['config', 'commit.gpgsign', 'false']);
  await g.run(['remote', 'add', 'origin', remote]);
  await writeFile(join(dir, 'seed.txt'), 'x');
  await g.run(['add', 'seed.txt']);
  await g.run(['commit', '-q', '-m', 'seed']);
  await g.run(['push', '-q', '-u', 'origin', 'main']);
  return g;
}

interface EventsBody {
  events: { id: number; tags: string[]; remote?: string }[];
}

/** Poll the notifier's events endpoint until at least one event lands (or timeout). */
async function waitForEvents(base: string, timeoutMs: number): Promise<EventsBody> {
  const deadline = Date.now() + timeoutMs;
  let body: EventsBody = { events: [] };
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/events`);
    body = (await res.json()) as EventsBody;
    if (body.events.length > 0) {
      return body;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return body;
}

let root: string;
let bare: string;
let worker: string;
let g: Git;
let notifier: Notifier;
let base: string;
let priorUrl: string | undefined;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gitloop-closed-'));
  bare = join(root, 'remote.git');
  await new Git(root).run(['init', '--bare', '-q', bare]);
  worker = join(root, 'workerA');
  g = await initWorker(worker, bare);

  // Install the real hook BEFORE any tag push, so every push fires it.
  await installPrePushHook(worker);

  // Real notifier on an ephemeral port; the hook reaches it via env at push time.
  notifier = createNotifier({ port: 0, repoPath: worker, log: () => {} });
  const { port } = await notifier.start();
  base = `http://127.0.0.1:${port}`;
  priorUrl = process.env.GITLOOP_NOTIFIER_URL;
  process.env.GITLOOP_NOTIFIER_URL = base;
}, 60000);

afterAll(async () => {
  if (priorUrl === undefined) {
    delete process.env.GITLOOP_NOTIFIER_URL;
  } else {
    process.env.GITLOOP_NOTIFIER_URL = priorUrl;
  }
  await notifier?.stop();
  await rm(root, { recursive: true, force: true });
});

describe('closed loop (push → hook → notifier → merged)', () => {
  it('drives /TASK-1 to merged via real pushes, with a rejection loop-back', async () => {
    const deps: McpDeps = { git: g, remote: 'origin', config: DEFAULT_PIPELINE, workerId: 'alice' };

    // Register the task: a real tag push, which fires the installed hook.
    await g.createTag('TASK-1');
    await g.pushTag('TASK-1', 'origin');

    let rejected = false;
    let merged = false;
    for (let i = 0; i < 30 && !merged; i++) {
      const { tasks } = await getPendingTasks(deps);
      const t = tasks.find((x) => x.taskId === 'TASK-1');
      if (!t) break;
      await claimTask(deps, { taskId: 'TASK-1' });
      if (!rejected && t.currentStep === 'code-complete') {
        const r = await advanceTask(deps, { taskId: 'TASK-1', reject: true });
        expect(r).toMatchObject({ advanced: true, rejected: true, tag: 'in-progress/TASK-1/v2' });
        rejected = true;
        continue;
      }
      const adv = await advanceTask(deps, { taskId: 'TASK-1' });
      expect(adv.advanced).toBe(true);
      if (adv.step === 'merged') merged = true;
    }

    expect(rejected).toBe(true);
    expect(merged).toBe(true);

    // No state outside git: a FRESH clone of the bare remote derives 'merged'.
    const freshDir = join(root, 'verify');
    await new Git(root).run(['clone', '-q', bare, freshDir]);
    const tags = await new Git(freshDir).listTags();
    expect(tags).toContain('merged/TASK-1/v2');
    expect(tags).toContain('in-progress/TASK-1/v2');

    // The push → hook → notifier seam fired: the real notifier received events,
    // and a specific advanced step tag appears among them. (curl-gated.)
    if (hasCurl) {
      const body = await waitForEvents(base, 5000);
      expect(body.events.length).toBeGreaterThan(0);
      const allTags = body.events.flatMap((e) => e.tags);
      expect(allTags).toContain('merged/TASK-1/v2');
      // The remote name git passed to the hook is forwarded.
      expect(body.events.some((e) => e.remote === 'origin')).toBe(true);
    }
  }, 90000);

  it('a tag push succeeds (exit 0) even when the notifier is dead', async () => {
    // Point the hook at a port with nothing listening; curl -m 2 returns fast on
    // connection-refused and the hook swallows the failure (best-effort).
    const savedUrl = process.env.GITLOOP_NOTIFIER_URL;
    process.env.GITLOOP_NOTIFIER_URL = 'http://127.0.0.1:64999';
    try {
      await g.createTag('TASK-2');
      const push = await g.pushTag('TASK-2', 'origin');
      // pushed:true with a non-rejected status means git exited 0 — the hook did
      // not block the push despite the unreachable notifier.
      expect(push.pushed).toBe(true);
      expect(push.status).toBe('new');
    } finally {
      if (savedUrl === undefined) {
        delete process.env.GITLOOP_NOTIFIER_URL;
      } else {
        process.env.GITLOOP_NOTIFIER_URL = savedUrl;
      }
    }
  }, 30000);
});
