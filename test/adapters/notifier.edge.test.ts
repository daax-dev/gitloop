import { afterEach, describe, expect, it } from 'vitest';
import type { Git } from '../../src/core/git.js';
import { type Notifier, createNotifier } from '../../src/adapters/notifier.js';

// Notifier edges not covered by notifier.test.ts (TASK-018a): non-integer `since`,
// oversized body rejection, and an invalid configured port.

// The accepted fake-Git cast (see notifier.test.ts): /state is unused here but the
// notifier needs a git layer.
function fakeGit(tags: string[]): Git {
  return { listTags: () => Promise.resolve(tags) } as unknown as Git;
}

let notifier: Notifier | undefined;
let base: string;

async function start(): Promise<void> {
  notifier = createNotifier({ port: 0, git: fakeGit([]), log: () => {} });
  const { port } = await notifier.start();
  base = `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  await notifier?.stop();
  notifier = undefined;
});

async function postEvent(tags: string[]): Promise<void> {
  await fetch(`${base}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
}

describe('tag-notifier edges', () => {
  it('GET /events?since with a non-integer value returns all events (defaults to 0)', async () => {
    await start();
    await postEvent(['a/TASK-1/v1']);
    await postEvent(['b/TASK-1/v1']);

    // Number('abc') is NaN; Number.isInteger(NaN) is false → from = 0 → all events.
    const res = await fetch(`${base}/events?since=abc`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { id: number }[] };
    expect(body.events.map((e) => e.id)).toEqual([1, 2]);
  });

  it('GET /events?since with a fractional value returns all events (defaults to 0)', async () => {
    await start();
    await postEvent(['a/TASK-1/v1']);
    // 1.5 is not an integer → from = 0, so event id 1 is still included.
    const res = await fetch(`${base}/events?since=1.5`);
    const body = (await res.json()) as { events: { id: number }[] };
    expect(body.events.map((e) => e.id)).toEqual([1]);
  });

  it('rejects an oversized body with 413 + Connection: close and does not enqueue', async () => {
    await start();
    // One valid tag plus padding that pushes the raw body past MAX_BODY_BYTES (1MB).
    const padding = 'x'.repeat(1024 * 1024 + 16);
    const res = await fetch(`${base}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags: ['in-progress/TASK-1/v1'], pad: padding }),
    });
    expect(res.status).toBe(413);
    expect(res.headers.get('connection')).toBe('close');
    // The oversized event was never enqueued (memory stays bounded).
    expect(notifier?.events).toHaveLength(0);
  });

  it('createNotifier throws synchronously on an invalid port', () => {
    expect(() => createNotifier({ port: -1 })).toThrow(/invalid notifier port/);
  });
});
