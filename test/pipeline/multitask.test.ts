import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PIPELINE } from '../../src/core/config.js';
import { Git } from '../../src/core/git.js';
import { deriveTaskState, deriveTaskStates, pendingTasks } from '../../src/pipeline/state.js';
import { type McpDeps, advanceTask, getPendingTasks } from '../../src/adapters/mcp-tools.js';

// Multi-task behavior (TASK-018c): several pending tasks at various steps. Assert
// numeric ordering of the derived states and that advancing one task in no way
// changes another (cross-task isolation).

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
  return g;
}

let root: string;
let bare: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gitloop-multi-'));
  bare = join(root, 'remote.git');
  await new Git(root).run(['init', '--bare', '-q', bare]);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('multi-task derivation (pure)', () => {
  // TASK-1 at entry, TASK-2 mid-pipeline, TASK-10 further along. Tag order is
  // deliberately scrambled to prove ordering comes from the deriver, not input.
  const tags = [
    'in-progress/TASK-2/v1',
    'TASK-10',
    'merged/TASK-10/v1',
    'in-progress/TASK-10/v1',
    'code-complete/TASK-10/v1',
    'test-complete/TASK-10/v1',
    'review-complete/TASK-10/v1',
    'TASK-1',
    'TASK-2',
  ];

  it('orders task states numerically (1, 2, 10), not lexically', () => {
    const states = deriveTaskStates(tags, DEFAULT_PIPELINE);
    expect(states.map((s) => s.taskId)).toEqual(['TASK-1', 'TASK-2', 'TASK-10']);
  });

  it('derives the right current step per task independently', () => {
    const states = deriveTaskStates(tags, DEFAULT_PIPELINE);
    const byId = new Map(states.map((s) => [s.taskId, s]));
    expect(byId.get('TASK-1')).toMatchObject({ currentStep: null, status: 'active' });
    expect(byId.get('TASK-2')).toMatchObject({ currentStep: 'in-progress', status: 'active' });
    expect(byId.get('TASK-10')).toMatchObject({ currentStep: 'merged', status: 'merged' });
  });

  it('pendingTasks excludes the terminal task and keeps numeric order', () => {
    const pending = pendingTasks(deriveTaskStates(tags, DEFAULT_PIPELINE));
    // TASK-10 is merged → not pending; TASK-1 and TASK-2 remain, in numeric order.
    expect(pending.map((s) => s.taskId)).toEqual(['TASK-1', 'TASK-2']);
  });

  it('a tag belonging to one task does not affect another task derivation', () => {
    // Adding a step tag for TASK-2 must not change TASK-1's derived state.
    const before = deriveTaskState(tags, DEFAULT_PIPELINE, 'TASK-1');
    const after = deriveTaskState([...tags, 'code-complete/TASK-2/v1'], DEFAULT_PIPELINE, 'TASK-1');
    expect(after).toEqual(before);
  });
});

describe('multi-task isolation (repo-backed via mcp-tools)', () => {
  it('advancing one task leaves another task untouched', async () => {
    const g = await initWorker(join(root, 'iso'), bare);
    const d: McpDeps = {
      git: g,
      remote: 'origin',
      config: DEFAULT_PIPELINE,
      workerId: 'alice',
    };

    // Register two independent tasks on the shared remote.
    for (const id of ['TASK-1', 'TASK-2']) {
      await g.createTag(id);
      await g.pushTag(id, 'origin');
    }

    // Snapshot TASK-2's pending view before touching TASK-1.
    const beforePending = await getPendingTasks(d);
    const before2 = beforePending.tasks.find((t) => t.taskId === 'TASK-2');
    expect(before2).toMatchObject({ nextStep: 'in-progress', version: 1 });

    // Advance TASK-1 twice; TASK-2 must be unaffected.
    await advanceTask(d, { taskId: 'TASK-1' });
    await advanceTask(d, { taskId: 'TASK-1' });

    const afterPending = await getPendingTasks(d);
    const after1 = afterPending.tasks.find((t) => t.taskId === 'TASK-1');
    const after2 = afterPending.tasks.find((t) => t.taskId === 'TASK-2');

    expect(after1).toMatchObject({ currentStep: 'code-complete', nextStep: 'test-complete' });
    // TASK-2 unchanged: same next step and version as before.
    expect(after2).toEqual(before2);
  }, 60000);
});
