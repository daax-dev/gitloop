// pre-push hook installer (TASK-008).
//
// Wires the committed hooks/pre-push stub into a repository's hooks directory.
// Idempotent: re-running is a no-op. Refuses to clobber a pre-existing hook that
// is not gitloop's, unless force is set.

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Git } from '../core/git.js';

/** Substring identifying a gitloop-managed hook (present in hooks/pre-push). */
export const HOOK_MARKER = 'gitloop pre-push hook';

// The canonical, version-controlled hook script (single source of truth).
const HOOK_SOURCE = fileURLToPath(new URL('../../hooks/pre-push', import.meta.url));

export interface InstallResult {
  readonly path: string;
  readonly action: 'installed' | 'updated' | 'unchanged';
}

/**
 * Install the pre-push hook into `repoPath`'s hooks directory (resolved via
 * `git rev-parse --git-path hooks`, so worktrees work). Returns what changed.
 */
export async function installPrePushHook(
  repoPath: string,
  opts: { force?: boolean } = {},
): Promise<InstallResult> {
  const git = new Git(repoPath);
  const { stdout } = await git.run(['rev-parse', '--git-path', 'hooks']);
  const hooksDir = resolve(repoPath, stdout.trim());
  await mkdir(hooksDir, { recursive: true });
  const target = join(hooksDir, 'pre-push');
  const script = await readFile(HOOK_SOURCE, 'utf8');

  let existing: string | undefined;
  try {
    existing = await readFile(target, 'utf8');
  } catch {
    existing = undefined;
  }

  if (existing !== undefined && !existing.includes(HOOK_MARKER) && opts.force !== true) {
    throw new Error(
      `refusing to overwrite existing non-gitloop hook at ${target} (pass force to replace)`,
    );
  }

  if (existing === script) {
    await chmod(target, 0o755); // ensure the executable bit even if unchanged
    return { path: target, action: 'unchanged' };
  }

  await writeFile(target, script, { mode: 0o755 });
  await chmod(target, 0o755);
  return { path: target, action: existing === undefined ? 'installed' : 'updated' };
}
