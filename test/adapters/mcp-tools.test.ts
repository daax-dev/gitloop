import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type PipelineConfig,
  DEFAULT_PIPELINE,
  loadPipelineConfig,
} from '../../src/core/config.js';
import { Git } from '../../src/core/git.js';
import {
  type McpDeps,
  advanceTask,
  claimTask,
  getPendingTasks,
} from '../../src/adapters/mcp-tools.js';

async function initWorker(dir: string, remote: string): Promise<Git> {
  await mkdir(dir, { recursive: true });
  const g = new Git(dir);
  await g.run(['init', '-q', '-b', 'main']);
  await g.run(['config', 'user.email', 'test@example.com']);
  await g.run(['config', 'user.name', 'Test']);
  await g.run(['config', 'commit.gpgsign', 'false']);
  await g.run(['remote', 'add', 'origin', remote]);
  await writeFile(join(dir, 'seed.txt'), 'x');
  await g.run(['add', 'seed.txt']);
  await g.run(['commit', '-q', '-m', 'seed']);
  return g;
}

function deps(git: Git, workerId: string, config: PipelineConfig = DEFAULT_PIPELINE): McpDeps {
  return { git, remote: 'origin', config, workerId };
}

async function register(git: Git, taskId: string): Promise<void> {
  await git.createTag(taskId);
  await git.pushTag(taskId, 'origin');
}

let root: string;
let bare: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gitloop-mcp-'));
  bare = join(root, 'remote.git');
  await new Git(root).run(['init', '--bare', '-q', bare]);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('claim_task / advance_task / get_pending_tasks', () => {
  it('drives a task entry → merged via claim + advance', async () => {
    const g = await initWorker(join(root, 'happy'), bare);
    const d = deps(g, 'alice');
    await register(g, 'TASK-1');

    const pending = await getPendingTasks(d);
    expect(pending.tasks).toContainEqual(
      expect.objectContaining({ taskId: 'TASK-1', nextStep: 'in-progress' }),
    );

    const claim = await claimTask(d, { taskId: 'TASK-1' });
    expect(claim).toMatchObject({ outcome: 'won', step: 'in-progress', claimed: true });

    for (const step of [
      'in-progress',
      'code-complete',
      'test-complete',
      'review-complete',
      'merged',
    ]) {
      const res = await advanceTask(d, { taskId: 'TASK-1' });
      expect(res).toMatchObject({ advanced: true, step });
    }

    // Terminal: nothing pending, advancing throws nothing but reports not advanced.
    const after = await getPendingTasks(d);
    expect(after.tasks.find((t) => t.taskId === 'TASK-1')).toBeUndefined();
    const terminal = await advanceTask(d, { taskId: 'TASK-1' });
    expect(terminal.advanced).toBe(false);
    expect(terminal.reason).toMatch(/terminal/);
  });

  it('rejection loops back to in-progress at v2 and re-advances', async () => {
    const g = await initWorker(join(root, 'reject'), bare);
    const d = deps(g, 'alice');
    await register(g, 'TASK-2');

    await advanceTask(d, { taskId: 'TASK-2' }); // in-progress
    await advanceTask(d, { taskId: 'TASK-2' }); // code-complete

    const rejected = await advanceTask(d, { taskId: 'TASK-2', reject: true });
    expect(rejected).toMatchObject({
      advanced: true,
      rejected: true,
      tag: 'in-progress/TASK-2/v2',
    });

    const pending = await getPendingTasks(d);
    expect(pending.tasks).toContainEqual(
      expect.objectContaining({ taskId: 'TASK-2', version: 2, nextStep: 'code-complete' }),
    );

    const re = await advanceTask(d, { taskId: 'TASK-2' });
    expect(re).toMatchObject({ advanced: true, tag: 'code-complete/TASK-2/v2' });
  });

  it('idempotent advance: re-advancing the same step does not double-act', async () => {
    const g = await initWorker(join(root, 'idem'), bare);
    const d = deps(g, 'alice');
    await register(g, 'TASK-3');
    const first = await advanceTask(d, { taskId: 'TASK-3' });
    const second = await advanceTask(d, { taskId: 'TASK-3' }); // would target code-complete now
    expect(first.tag).toBe('in-progress/TASK-3/v1');
    expect(second.tag).toBe('code-complete/TASK-3/v1'); // progressed, not stuck/doubled
  });

  it('enforces a per-step required-artifact gate (arch-006d)', async () => {
    const config = loadPipelineConfig({
      steps: [
        { name: 'in-progress' },
        { name: 'reviewed', requiredArtifact: 'tasks/{taskId}/review.md' },
      ],
    });
    const dir = join(root, 'artifact');
    const g = await initWorker(dir, bare);
    const d = deps(g, 'alice', config);
    await register(g, 'TASK-4');
    await advanceTask(d, { taskId: 'TASK-4' }); // in-progress

    const blocked = await advanceTask(d, { taskId: 'TASK-4' });
    expect(blocked.advanced).toBe(false);
    expect(blocked.reason).toMatch(/artifact missing/);

    // Commit the artifact at HEAD, then the gate opens.
    await mkdir(join(dir, 'tasks', 'TASK-4'), { recursive: true });
    await writeFile(join(dir, 'tasks', 'TASK-4', 'review.md'), 'ok');
    await g.run(['add', '.']);
    await g.run(['commit', '-q', '-m', 'review']);

    const allowed = await advanceTask(d, { taskId: 'TASK-4' });
    expect(allowed).toMatchObject({ advanced: true, step: 'reviewed' });
  });

  it('claim is exclusive: a second worker loses', async () => {
    const a = await initWorker(join(root, 'ca'), bare);
    const b = await initWorker(join(root, 'cb'), bare);
    await register(a, 'TASK-5');
    const r1 = await claimTask(deps(a, 'alice'), { taskId: 'TASK-5' });
    const r2 = await claimTask(deps(b, 'bob'), { taskId: 'TASK-5' });
    expect(r1).toMatchObject({ outcome: 'won', claimed: true });
    expect(r2).toMatchObject({ outcome: 'lost', claimed: false, owner: 'alice' });
  });

  it('concurrent advance of one step: one wins, the loser is repaired (no fork)', async () => {
    const a = await initWorker(join(root, 'adv-a'), bare);
    const b = await initWorker(join(root, 'adv-b'), bare);
    await register(a, 'TASK-6'); // both workers will see the entry via fetchTags

    const [ra, rb] = await Promise.all([
      advanceTask(deps(a, 'alice'), { taskId: 'TASK-6' }),
      advanceTask(deps(b, 'bob'), { taskId: 'TASK-6' }),
    ]);
    expect([ra.advanced, rb.advanced].sort()).toEqual([false, true]);

    // Both repos' in-progress tag must point at the SAME commit: the loser's
    // stale local tag was force-repaired to the winner's, so no divergent fork.
    const shaA = (await a.run(['rev-parse', 'refs/tags/in-progress/TASK-6/v1'])).stdout.trim();
    const shaB = (await b.run(['rev-parse', 'refs/tags/in-progress/TASK-6/v1'])).stdout.trim();
    expect(shaA).toBe(shaB);
  });

  it('throws on an unknown task', async () => {
    const g = await initWorker(join(root, 'unknown'), bare);
    await expect(claimTask(deps(g, 'alice'), { taskId: 'TASK-404' })).rejects.toThrow(
      /unknown task/,
    );
  });
});
