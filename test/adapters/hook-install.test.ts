import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Git } from '../../src/core/git.js';
import { HOOK_MARKER, installPrePushHook } from '../../src/adapters/hook-install.js';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gitloop-hook-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function initRepo(name: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  const g = new Git(dir);
  await g.run(['init', '-q', '-b', 'main']);
  return dir;
}

async function isExecutable(path: string): Promise<boolean> {
  const { mode } = await stat(path);
  return (mode & 0o111) !== 0;
}

describe('installPrePushHook', () => {
  it('installs an executable hook carrying the gitloop marker', async () => {
    const dir = await initRepo('fresh');
    const res = await installPrePushHook(dir);
    expect(res.action).toBe('installed');
    const body = await readFile(res.path, 'utf8');
    expect(body).toContain(HOOK_MARKER);
    expect(body).toContain('/events');
    expect(await isExecutable(res.path)).toBe(true);
  });

  it('is idempotent', async () => {
    const dir = await initRepo('idem');
    await installPrePushHook(dir);
    const second = await installPrePushHook(dir);
    expect(second.action).toBe('unchanged');
  });

  it('refuses to clobber a foreign hook unless forced', async () => {
    const dir = await initRepo('foreign');
    const { stdout } = await new Git(dir).run(['rev-parse', '--git-path', 'hooks']);
    const target = join(dir, stdout.trim(), 'pre-push');
    await writeFile(target, '#!/bin/sh\necho mine\n');
    await chmod(target, 0o755);

    await expect(installPrePushHook(dir)).rejects.toThrow(/refusing to overwrite/);

    const forced = await installPrePushHook(dir, { force: true });
    expect(forced.action).toBe('updated');
    expect(await readFile(forced.path, 'utf8')).toContain(HOOK_MARKER);
  });
});
