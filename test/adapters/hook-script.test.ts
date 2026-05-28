import { execFileSync, spawn } from 'node:child_process';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Exercise the actual bash pre-push hook (TASK-017): feed it stdin push lines and
// assert what it POSTs to the notifier. The hook is the real seam between a git
// push and the notifier, so this tests the shell logic directly.

function binAvailable(name: string): boolean {
  try {
    execFileSync(name, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasBash = binAvailable('bash');
const hasCurl = binAvailable('curl');
// hooks/pre-push lives at the repo root; tests run with cwd = project root.
const HOOK = join(process.cwd(), 'hooks', 'pre-push');
const ZERO = '0'.repeat(40); // git pads a tag-delete local sha to the hash length.

interface Captured {
  tags: string[];
  remote?: string;
}

let server: Server;
let port: number;
let captured: Captured[];

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

beforeAll(async () => {
  captured = [];
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const raw = await readBody(req);
      try {
        captured.push(JSON.parse(raw) as Captured);
      } catch {
        captured.push({ tags: [`UNPARSEABLE:${raw}`] });
      }
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end('{"id":1}');
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

/** Run the hook with a remote name and stdin fixture; returns its exit code. */
async function runHook(remoteName: string, stdin: string, url: string): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [HOOK, remoteName], {
      env: { ...process.env, GITLOOP_NOTIFIER_URL: url },
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1 });
    });
    child.stdin.end(stdin);
  });
}

/** Wait briefly for the fire-and-forget POST to land. */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 250));
}

describe.skipIf(!hasBash || !hasCurl)('pre-push hook script', () => {
  const url = (): string => `http://127.0.0.1:${port}`;

  it('forwards a normal tag push as {tags, remote}', async () => {
    captured.length = 0;
    const line = `refs/tags/in-progress/TASK-1/v1 abc1234def5 refs/tags/in-progress/TASK-1/v1 ${ZERO}\n`;
    const res = await runHook('origin', line, url());
    expect(res.code).toBe(0);
    await settle();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ tags: ['in-progress/TASK-1/v1'], remote: 'origin' });
  });

  it('excludes a non-tag ref (refs/heads/main)', async () => {
    captured.length = 0;
    const line = `refs/heads/main deadbeefcafe refs/heads/main ${ZERO}\n`;
    const res = await runHook('origin', line, url());
    expect(res.code).toBe(0);
    await settle();
    // No pipeline tags → no POST at all.
    expect(captured).toHaveLength(0);
  });

  it('excludes a tag deletion (all-zero local sha)', async () => {
    captured.length = 0;
    const line = `refs/tags/in-progress/TASK-1/v1 ${ZERO} refs/tags/in-progress/TASK-1/v1 deadbeef\n`;
    const res = await runHook('origin', line, url());
    expect(res.code).toBe(0);
    await settle();
    expect(captured).toHaveLength(0);
  });

  it('excludes an injection-unsafe tag name containing a double-quote', async () => {
    captured.length = 0;
    // A double-quote is outside the pipeline charset [a-zA-Z0-9/_.-] → dropped.
    const unsafe = 'in-progress/TASK-1/v1"evil';
    const line = `refs/tags/${unsafe} cafef00d refs/tags/${unsafe} ${ZERO}\n`;
    const res = await runHook('origin', line, url());
    expect(res.code).toBe(0);
    await settle();
    expect(captured).toHaveLength(0);
  });

  it('aggregates multiple tags from one push into the tags array', async () => {
    captured.length = 0;
    const lines =
      `refs/tags/in-progress/TASK-1/v1 cafe1111 refs/tags/in-progress/TASK-1/v1 ${ZERO}\n` +
      `refs/tags/code-complete/TASK-1/v1 cafe2222 refs/tags/code-complete/TASK-1/v1 ${ZERO}\n`;
    const res = await runHook('upstream', lines, url());
    expect(res.code).toBe(0);
    await settle();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      tags: ['in-progress/TASK-1/v1', 'code-complete/TASK-1/v1'],
      remote: 'upstream',
    });
  });

  it('exits 0 when the notifier is dead (best-effort notify)', async () => {
    captured.length = 0;
    const line = `refs/tags/merged/TASK-1/v1 cafe3333 refs/tags/merged/TASK-1/v1 ${ZERO}\n`;
    const res = await runHook('origin', line, 'http://127.0.0.1:64998');
    expect(res.code).toBe(0);
  });
});
