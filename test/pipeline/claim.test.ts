import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Git } from '../../src/core/git.js';
import {
  assertValidWorkerId,
  claimStep,
  formatClaimTag,
  workerId,
} from '../../src/pipeline/claim.js';

async function initRepo(dir: string, remote: string): Promise<Git> {
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

let root: string;
let bare: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gitloop-claim-'));
  bare = join(root, 'remote.git');
  await new Git(root).run(['init', '--bare', '-q', bare]);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('workerId / formatClaimTag', () => {
  it('reads GITLOOP_WORKER_ID, falling back to user@host', () => {
    expect(workerId({ GITLOOP_WORKER_ID: 'alice' })).toBe('alice');
    expect(workerId({ GITLOOP_WORKER_ID: '  ' })).toContain('@');
    expect(workerId({})).toContain('@');
  });

  it('namespaces the claim tag under claim/ (version always explicit)', () => {
    expect(formatClaimTag('in-progress', 'TASK-1', 1)).toBe('claim/in-progress/TASK-1/v1');
    expect(formatClaimTag('in-progress', 'TASK-1', 2)).toBe('claim/in-progress/TASK-1/v2');
  });

  it('rejects empty or multiline worker ids', () => {
    expect(() => assertValidWorkerId('')).toThrow(/invalid worker id/);
    expect(() => assertValidWorkerId('a\nb')).toThrow(/invalid worker id/);
    expect(() => workerId({ GITLOOP_WORKER_ID: 'a\nb' })).toThrow(/invalid worker id/);
    expect(() => assertValidWorkerId('alice')).not.toThrow();
  });
});

describe('claimStep — outcomes (arch-005/007)', () => {
  it('won → already-owned (same worker) → lost (other worker)', async () => {
    const a = await initRepo(join(root, 'A'), bare);
    const aSameId = await initRepo(join(root, 'A2'), bare); // different repo, same identity
    const b = await initRepo(join(root, 'B'), bare);
    const base = { remote: 'origin', taskId: 'TASK-1', step: 'in-progress', version: 1 };

    const won = await claimStep(a, { ...base, workerId: 'alice' });
    expect(won).toMatchObject({
      outcome: 'won',
      owner: 'alice',
      tag: 'claim/in-progress/TASK-1/v1',
    });

    const owned = await claimStep(aSameId, { ...base, workerId: 'alice' });
    expect(owned).toMatchObject({ outcome: 'already-owned', owner: 'alice' });

    const lost = await claimStep(b, { ...base, workerId: 'bob' });
    expect(lost).toMatchObject({ outcome: 'lost', owner: 'alice' });
  });

  it('rejects a multiline worker id before touching git', async () => {
    const a = await initRepo(join(root, 'badid'), bare);
    await expect(
      claimStep(a, {
        remote: 'origin',
        taskId: 'TASK-9',
        step: 'in-progress',
        version: 1,
        workerId: 'a\nb',
      }),
    ).rejects.toThrow(/invalid worker id/);
  });

  it('reports lost (does not push) when a local claim is held by another worker', async () => {
    const g = await initRepo(join(root, 'conflict'), bare);
    await g.createTag('claim/in-progress/TASK-7/v1', { message: 'alice' });
    const res = await claimStep(g, {
      remote: 'origin',
      taskId: 'TASK-7',
      step: 'in-progress',
      version: 1,
      workerId: 'bob',
    });
    expect(res).toMatchObject({ outcome: 'lost', owner: 'alice' });
  });

  it('concurrent race for one step: exactly one winner', async () => {
    const a = await initRepo(join(root, 'race-a'), bare);
    const b = await initRepo(join(root, 'race-b'), bare);
    const base = { remote: 'origin', taskId: 'TASK-2', step: 'in-progress', version: 1 };

    const [ra, rb] = await Promise.all([
      claimStep(a, { ...base, workerId: 'alice' }),
      claimStep(b, { ...base, workerId: 'bob' }),
    ]);

    const outcomes = [ra.outcome, rb.outcome].sort();
    expect(outcomes).toEqual(['lost', 'won']);
    const winner = ra.outcome === 'won' ? 'alice' : 'bob';
    expect(ra.owner).toBe(winner);
    expect(rb.owner).toBe(winner);
  });
});
