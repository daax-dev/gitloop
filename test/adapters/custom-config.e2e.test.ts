import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PipelineConfig, loadPipelineConfig } from '../../src/core/config.js';
import { Git } from '../../src/core/git.js';
import {
  type McpDeps,
  advanceTask,
  claimTask,
  getPendingTasks,
} from '../../src/adapters/mcp-tools.js';

// Custom-pipeline end-to-end (TASK-018b): a non-default pipeline whose middle step
// requires a committed design doc. Drives a task through the MCP tool logic and
// asserts the artifact gate and that tags/steps use the custom names.

// in-progress → design (gated on docs/{taskId}/design.md) → merged.
const CONFIG: PipelineConfig = loadPipelineConfig({
  steps: [
    { name: 'in-progress' },
    { name: 'design', requiredArtifact: 'docs/{taskId}/design.md' },
    { name: 'merged' },
  ],
});

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

function deps(git: Git): McpDeps {
  return { git, remote: 'origin', config: CONFIG, workerId: 'alice' };
}

let root: string;
let bare: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gitloop-custom-'));
  bare = join(root, 'remote.git');
  await new Git(root).run(['init', '--bare', '-q', bare]);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('custom pipeline (design step gated on an artifact)', () => {
  it('claim/advance use custom step names and the design gate blocks until the doc is committed', async () => {
    const dir = join(root, 'work');
    const g = await initWorker(dir, bare);
    const d = deps(g);

    // Register the task on the shared remote.
    await g.createTag('TASK-1');
    await g.pushTag('TASK-1', 'origin');

    // get_pending_tasks reports the FIRST custom step as the next action.
    const pending = await getPendingTasks(d);
    expect(pending.tasks).toContainEqual(
      expect.objectContaining({
        taskId: 'TASK-1',
        nextStep: 'in-progress',
        nextTag: 'in-progress/TASK-1/v1',
      }),
    );

    // Claim works against the custom steps.
    const claimed = await claimTask(d, { taskId: 'TASK-1' });
    expect(claimed).toMatchObject({ outcome: 'won', step: 'in-progress', claimed: true });

    // Advance into in-progress (no artifact required there).
    const toInProgress = await advanceTask(d, { taskId: 'TASK-1' });
    expect(toInProgress).toMatchObject({ advanced: true, step: 'in-progress' });
    expect(toInProgress.tag).toBe('in-progress/TASK-1/v1');

    // The next claimable step is the custom 'design' step.
    const midPending = await getPendingTasks(d);
    expect(midPending.tasks).toContainEqual(
      expect.objectContaining({ taskId: 'TASK-1', nextStep: 'design' }),
    );

    // design is BLOCKED until docs/TASK-1/design.md exists at HEAD.
    const blocked = await advanceTask(d, { taskId: 'TASK-1' });
    expect(blocked.advanced).toBe(false);
    expect(blocked.step).toBe('design');
    expect(blocked.reason).toMatch(/artifact missing/);

    // Commit the design artifact at HEAD; the gate opens.
    await mkdir(join(dir, 'docs', 'TASK-1'), { recursive: true });
    await writeFile(join(dir, 'docs', 'TASK-1', 'design.md'), '# design\n');
    await g.run(['add', '.']);
    await g.run(['commit', '-q', '-m', 'design doc']);

    const toDesign = await advanceTask(d, { taskId: 'TASK-1' });
    expect(toDesign).toMatchObject({ advanced: true, step: 'design' });
    expect(toDesign.tag).toBe('design/TASK-1/v1');

    // Advance to the custom terminal step.
    const toMerged = await advanceTask(d, { taskId: 'TASK-1' });
    expect(toMerged).toMatchObject({ advanced: true, step: 'merged' });
    expect(toMerged.tag).toBe('merged/TASK-1/v1');

    // Terminal: no longer pending.
    const after = await getPendingTasks(d);
    expect(after.tasks.find((t) => t.taskId === 'TASK-1')).toBeUndefined();
  }, 60000);
});
