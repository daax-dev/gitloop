import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Git } from '../../src/core/git.js';
import { type LogFn, type Notifier, createNotifier } from '../../src/adapters/notifier.js';

// A fake Git that returns a fixed tag set, so /state needs no real repo.
function fakeGit(tags: string[]): Git {
  return { listTags: () => Promise.resolve(tags) } as unknown as Git;
}

let notifier: Notifier;
let base: string;

async function startWith(tags: string[]): Promise<void> {
  notifier = createNotifier({ port: 0, git: fakeGit(tags), log: () => {} });
  const { port } = await notifier.start();
  base = `http://127.0.0.1:${port}`;
}

beforeEach(async () => {
  await startWith([]);
});

afterEach(async () => {
  await notifier.stop();
});

describe('tag-notifier', () => {
  it('GET /health → ok', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('POST /events enqueues and assigns monotonic ids', async () => {
    const post = (tags: string[]) =>
      fetch(`${base}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags, remote: 'origin' }),
      });

    const r1 = await post(['in-progress/TASK-1']);
    expect(r1.status).toBe(202);
    expect(await r1.json()).toEqual({ id: 1 });

    const r2 = await post(['code-complete/TASK-1']);
    expect(await r2.json()).toEqual({ id: 2 });

    expect(notifier.events).toHaveLength(2);
    expect(notifier.events[0]).toMatchObject({
      id: 1,
      tags: ['in-progress/TASK-1'],
      remote: 'origin',
    });
    expect(typeof notifier.events[0]?.receivedAt).toBe('string');
  });

  it('GET /events?since filters by id', async () => {
    for (const t of ['a/TASK-1', 'b/TASK-1', 'c/TASK-1']) {
      await fetch(`${base}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: [t] }),
      });
    }
    const res = await fetch(`${base}/events?since=1`);
    const body = (await res.json()) as { events: { id: number }[] };
    expect(body.events.map((e) => e.id)).toEqual([2, 3]);
  });

  it('POST /events rejects a malformed body with 400', async () => {
    const res = await fetch(`${base}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: 'not-an-array' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/tags/);
  });

  it('accepts an event without a remote', async () => {
    const res = await fetch(`${base}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['merged/TASK-1'] }),
    });
    expect(res.status).toBe(202);
    expect(notifier.events[0]).not.toHaveProperty('remote');
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await fetch(`${base}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });

  it('unknown route → 404', async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});

describe('tag-notifier — logger safety', () => {
  it('does not leak an unhandled rejection when the logger throws async', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    // Deliberately misuse the LogFn slot with an async-throwing logger; the
    // notifier's safeLog must absorb the rejection.
    const asyncThrowingLog = (() => Promise.reject(new Error('log failed'))) as unknown as LogFn;
    const n = createNotifier({ port: 0, git: fakeGit([]), log: asyncThrowingLog });
    const { port } = await n.start();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200); // request still succeeds despite logger failure
      await new Promise((r) => setImmediate(r)); // let any rejection surface
      expect(rejections).toEqual([]);
    } finally {
      await n.stop();
      process.off('unhandledRejection', onRejection);
    }
  });
});

describe('tag-notifier — error handling', () => {
  it('returns 500 when state derivation fails', async () => {
    const failingGit = {
      listTags: () => Promise.reject(new Error('git exploded')),
    } as unknown as Git;
    const n = createNotifier({ port: 0, git: failingGit, log: () => {} });
    const { port } = await n.start();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/state`);
      expect(res.status).toBe(500);
      expect(((await res.json()) as { error: string }).error).toMatch(/exploded/);
    } finally {
      await n.stop();
    }
  });
});

describe('tag-notifier /state', () => {
  it('derives pipeline state from git tags', async () => {
    await notifier.stop();
    await startWith(['TASK-1', 'in-progress/TASK-1', 'merged/TASK-2']);
    const res = await fetch(`${base}/state`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: { taskId: string; currentStep: string | null; status: string }[];
    };
    expect(body.tasks).toEqual([
      expect.objectContaining({ taskId: 'TASK-1', currentStep: 'in-progress', status: 'active' }),
      expect.objectContaining({ taskId: 'TASK-2', currentStep: 'merged', status: 'merged' }),
    ]);
  });
});
