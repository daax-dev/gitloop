import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PIPELINE } from '../../src/core/config.js';
import { Git } from '../../src/core/git.js';
import { deriveTaskState } from '../../src/pipeline/state.js';

// Project Definition of Done (OBJECTIVE lines 75-80): a task is driven
// /TASK-N → merged/TASK-N — including at least one rejection-and-loop-back —
// entirely via git tags and the THREE MCP TOOLS, by two INDEPENDENT workers (here:
// separate repos, identities, AND OS processes — the only shared state is the bare
// git remote), on a local repo, with no CI/CD and no state stored outside git.

const projectRoot = process.cwd();
const tsxBin = join(projectRoot, 'node_modules', '.bin', 'tsx');

async function initWorker(dir: string, remote: string): Promise<void> {
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
}

function cleanEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  return { ...env, ...overrides };
}

/** Spawn a real MCP server process for a worker and connect a client over stdio. */
async function connectWorker(repoDir: string, workerId: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: tsxBin,
    args: ['bin/mcp.ts'],
    cwd: projectRoot,
    env: cleanEnv({ GITLOOP_REPO: repoDir, GITLOOP_REMOTE: 'origin', GITLOOP_WORKER_ID: workerId }),
  });
  const client = new Client({ name: `worker-${workerId}`, version: '0.0.0' });
  await client.connect(transport);
  return client;
}

async function call<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text?: string }[];
  return JSON.parse(content.map((c) => c.text ?? '').join('')) as T;
}

interface PendingResult {
  tasks: { taskId: string; currentStep: string | null; version: number }[];
}
interface ClaimResult {
  outcome: 'won' | 'already-owned' | 'lost';
}
interface AdvanceResult {
  advanced: boolean;
  step: string;
  rejected: boolean;
  tag: string;
}

let root: string;
let bare: string;
let alice: Client;
let bob: Client;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gitloop-e2e-'));
  bare = join(root, 'remote.git');
  await new Git(root).run(['init', '--bare', '-q', bare]);
  await initWorker(join(root, 'workerA'), bare);
  await initWorker(join(root, 'workerB'), bare);
  alice = await connectWorker(join(root, 'workerA'), 'alice');
  bob = await connectWorker(join(root, 'workerB'), 'bob');
}, 60000);

afterAll(async () => {
  await alice?.close();
  await bob?.close();
  await rm(root, { recursive: true, force: true });
});

describe('end-to-end (project DoD)', () => {
  it('two independent worker processes drive /TASK-1 → merged via MCP, with a rejection loop-back', async () => {
    // Register the task by pushing the bare entry tag to the shared remote.
    const driver = new Git(join(root, 'workerA'));
    await driver.createTag('TASK-1');
    await driver.pushTag('TASK-1', 'origin');

    const workers = [
      { client: alice, id: 'alice' },
      { client: bob, id: 'bob' },
    ];
    let rejectedOnce = false;
    let merged = false;
    const winners: string[] = [];

    for (let i = 0; i < 40 && !merged; i++) {
      const pending = await call<PendingResult>(alice, 'get_pending_tasks', {});
      const task = pending.tasks.find((t) => t.taskId === 'TASK-1');
      if (!task) break;

      // Both worker processes race to claim the same step via the MCP tool.
      // Alternate issue order so the handoff spans both workers; the atomic
      // claim must yield exactly one winner regardless.
      const order = i % 2 === 0 ? workers : [workers[1]!, workers[0]!];
      const [r0, r1] = await Promise.all([
        call<ClaimResult>(order[0]!.client, 'claim_task', { taskId: 'TASK-1' }),
        call<ClaimResult>(order[1]!.client, 'claim_task', { taskId: 'TASK-1' }),
      ]);
      expect([r0.outcome, r1.outcome].filter((o) => o === 'won')).toHaveLength(1);
      expect([r0.outcome, r1.outcome].filter((o) => o === 'lost')).toHaveLength(1);
      const winner = r0.outcome === 'won' ? order[0]! : order[1]!;
      winners.push(winner.id);

      // The validating worker rejects once at code-complete — a loop-back.
      if (!rejectedOnce && task.currentStep === 'code-complete') {
        const r = await call<AdvanceResult>(winner.client, 'advance_task', {
          taskId: 'TASK-1',
          reject: true,
        });
        expect(r).toMatchObject({ advanced: true, rejected: true, tag: 'in-progress/TASK-1/v2' });
        rejectedOnce = true;
        continue;
      }

      const adv = await call<AdvanceResult>(winner.client, 'advance_task', { taskId: 'TASK-1' });
      expect(adv.advanced).toBe(true);
      if (adv.step === 'merged') merged = true;
    }

    // DoD assertions.
    expect(rejectedOnce).toBe(true); // ≥1 rejection-and-loop-back
    expect(merged).toBe(true); // reached merged/TASK-1
    expect(winners).toContain('alice'); // both independent processes did work
    expect(winners).toContain('bob');

    // No state outside git: a FRESH clone of the shared remote alone fully
    // reconstructs the terminal state (the worker processes shared nothing else).
    const freshDir = join(root, 'verify');
    await new Git(root).run(['clone', '-q', bare, freshDir]);
    const tags = await new Git(freshDir).listTags();
    expect(deriveTaskState(tags, DEFAULT_PIPELINE, 'TASK-1')).toMatchObject({
      currentStep: 'merged',
      status: 'merged',
      version: 2,
    });
    expect(tags).toContain('merged/TASK-1/v2');
    expect(tags).toContain('in-progress/TASK-1/v2');
  }, 90000);
});
