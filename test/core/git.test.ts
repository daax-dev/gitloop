import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Git, GitError, execGit } from '../../src/core/git.js';

// Integration test: drives the real git binary against throwaway repositories.

async function initRepo(dir: string, remote?: string): Promise<Git> {
  await mkdir(dir, { recursive: true });
  const g = new Git(dir);
  await g.run(['init', '-q', '-b', 'main']);
  await g.run(['config', 'user.email', 'test@example.com']);
  await g.run(['config', 'user.name', 'Test']);
  await g.run(['config', 'commit.gpgsign', 'false']);
  if (remote) {
    await g.run(['remote', 'add', 'origin', remote]);
  }
  return g;
}

async function commitFile(dir: string, g: Git, name: string, content: string): Promise<void> {
  await writeFile(join(dir, name), content);
  await g.run(['add', name]);
  await g.run(['commit', '-q', '-m', `add ${name}`]);
}

let root: string;
let bare: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gitloop-git-'));
  bare = join(root, 'remote.git');
  await new Git(root).run(['init', '--bare', '-q', bare]);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('Git read operations', () => {
  it('lists tags, checks existence, and reads paths at a ref', async () => {
    const dir = join(root, 'read');
    const g = await initRepo(dir);
    await commitFile(dir, g, 'a.txt', 'hello');
    await g.createTag('TASK-1');
    await g.createTag('in-progress/TASK-1');

    expect((await g.listTags()).sort()).toEqual(['TASK-1', 'in-progress/TASK-1']);
    expect(await g.tagExists('TASK-1')).toBe(true);
    expect(await g.tagExists('nope/TASK-1')).toBe(false);

    expect(await g.pathExistsAt('TASK-1', 'a.txt')).toBe(true);
    expect(await g.pathExistsAt('TASK-1', 'missing.md')).toBe(false);
  });

  it('reads an annotated tag message (claimer identity)', async () => {
    const dir = join(root, 'annotated');
    const g = await initRepo(dir);
    await commitFile(dir, g, 'a.txt', 'x');
    await g.createTag('claim/in-progress/TASK-1', { message: 'worker=alice' });
    expect(await g.readTagMessage('claim/in-progress/TASK-1')).toBe('worker=alice');
  });

  it('throws GitError on a failing command', async () => {
    const dir = join(root, 'err');
    const g = await initRepo(dir);
    await expect(g.run(['rev-parse', 'refs/tags/does-not-exist'])).rejects.toBeInstanceOf(GitError);
  });
});

describe('pushTag — atomic CAS semantics (arch-005)', () => {
  it('first push wins; a second worker pushing the same tag is rejected', async () => {
    const dirA = join(root, 'workerA');
    const dirB = join(root, 'workerB');
    const a = await initRepo(dirA, bare);
    const b = await initRepo(dirB, bare);
    await commitFile(dirA, a, 'a.txt', 'A');
    await commitFile(dirB, b, 'b.txt', 'B'); // different commit than A

    // Both create the same claim tag at their own (different) commits.
    await a.createTag('claim/in-progress/TASK-1');
    await b.createTag('claim/in-progress/TASK-1');

    const first = await a.pushTag('claim/in-progress/TASK-1', 'origin');
    expect(first).toMatchObject({ pushed: true, alreadyExists: false });

    const second = await b.pushTag('claim/in-progress/TASK-1', 'origin');
    expect(second).toMatchObject({ pushed: false, alreadyExists: true });
  });

  it('throws GitError for a non-existence push failure (bad remote)', async () => {
    const dir = join(root, 'badremote');
    const g = await initRepo(dir);
    await commitFile(dir, g, 'a.txt', 'x');
    await g.createTag('TASK-2');
    await expect(g.pushTag('TASK-2', 'origin')).rejects.toBeInstanceOf(GitError);
  });
});

describe('execGit', () => {
  it('resolves with a non-zero code instead of throwing', async () => {
    const res = await execGit(['rev-parse', '--verify', 'refs/tags/none'], { cwd: root });
    expect(res.code).not.toBe(0);
  });
});
