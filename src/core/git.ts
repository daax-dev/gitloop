// Git I/O layer (TASK-004).
//
// A thin, typed wrapper over the git CLI for the operations the pipeline needs:
// enumerate tags, create/push tags, check ref existence, and check whether a
// path exists at a given commit (for the artifact gate, arch-006d). No pipeline
// logic lives here — just git I/O. git is always invoked with an explicit
// argument vector (never a shell string), so tag/path values cannot inject.

import { execFile } from 'node:child_process';

/** Raw result of a git invocation. `code` is the process exit status. */
export interface GitResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

/** Runs git with an explicit argv in `cwd`, resolving even on non-zero exit. */
export type GitExec = (
  args: readonly string[],
  opts: { readonly cwd: string },
) => Promise<GitResult>;

/** Thrown when a git command that is expected to succeed exits non-zero. */
export class GitError extends Error {
  readonly result: GitResult;
  constructor(args: readonly string[], result: GitResult) {
    super(`git ${args.join(' ')} failed (exit ${result.code}): ${result.stderr.trim()}`);
    this.name = 'GitError';
    this.result = result;
  }
}

/** Default GitExec backed by the system git binary. */
export const execGit: GitExec = (args, { cwd }) =>
  new Promise<GitResult>((resolve) => {
    execFile('git', [...args], { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout, stderr, code: 0 });
        return;
      }
      const e = error as NodeJS.ErrnoException & { signal?: NodeJS.Signals };
      if (typeof e.code === 'number') {
        // A real git exit status.
        resolve({ stdout, stderr, code: e.code });
        return;
      }
      // Spawn failure (e.g. ENOENT: git not installed) or signal termination —
      // not a git exit status. Surface as 127 with the cause in stderr so
      // callers don't mistake it for a normal non-zero exit.
      const cause = e.signal
        ? `terminated by signal ${e.signal}`
        : `${e.code ?? ''} ${e.message}`.trim();
      // Always preserve the cause; append rather than drop it when git also
      // wrote to stderr (e.g. a signal-terminated process that logged first).
      const detail = stderr ? `${stderr.trimEnd()} (${cause})` : cause;
      resolve({ stdout, stderr: detail, code: 127 });
    });
  });

/** Porcelain push status for a single ref (from `git push --porcelain` flags). */
export type PushStatus =
  | 'new' // '*' — ref newly created on the remote (this push won)
  | 'up-to-date' // '=' — remote already had this exact ref (idempotent re-push)
  | 'rejected'; // '!' — remote refused (ref already exists with other content)

/** Outcome of pushing a single tag to a remote. */
export interface PushResult {
  readonly tag: string;
  readonly status: PushStatus;
  /** True when the push left the remote ref in place (new or up-to-date). */
  readonly pushed: boolean;
  /**
   * True when the push was rejected (porcelain `!`). For a no-force tag push the
   * dominant cause is "tag already exists on the remote" (the claim CAS, arch-005);
   * a `!` can also mean a hook/remote rejection — callers needing the precise
   * cause should inspect `status` and `raw`.
   */
  readonly alreadyExists: boolean;
  readonly raw: GitResult;
}

// A `git push --porcelain` ref line: "<flag>\t<src>:<dst>\t<summary>".
const PORCELAIN_REF_RE = /^([ +\-*!=])\t/;

/** Typed git operations against a single repository working directory. */
export class Git {
  private readonly cwd: string;
  private readonly exec: GitExec;

  constructor(cwd: string, exec: GitExec = execGit) {
    this.cwd = cwd;
    this.exec = exec;
  }

  /** Run git, throwing GitError on non-zero exit. */
  async run(args: readonly string[]): Promise<GitResult> {
    const result = await this.exec(args, { cwd: this.cwd });
    if (result.code !== 0) {
      throw new GitError(args, result);
    }
    return result;
  }

  /** Run git, returning the raw result without throwing on non-zero exit. */
  async runRaw(args: readonly string[]): Promise<GitResult> {
    return this.exec(args, { cwd: this.cwd });
  }

  /** All tag names under refs/tags (short names, one per tag). */
  async listTags(): Promise<string[]> {
    const { stdout } = await this.run(['for-each-ref', '--format=%(refname:strip=2)', 'refs/tags']);
    return stdout.split('\n').filter((line) => line.length > 0);
  }

  /** Whether a tag exists locally. */
  async tagExists(tag: string): Promise<boolean> {
    const result = await this.runRaw(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]);
    return result.code === 0;
  }

  /**
   * Create a tag locally. With `message`, creates an annotated tag (used by the
   * claim flow to record claimer identity, arch-005). `ref` defaults to HEAD.
   */
  async createTag(tag: string, opts: { ref?: string; message?: string } = {}): Promise<void> {
    const args = ['tag'];
    if (opts.message !== undefined) {
      args.push('-a', '-m', opts.message);
    }
    args.push(tag);
    if (opts.ref !== undefined) {
      args.push(opts.ref);
    }
    await this.run(args);
  }

  /**
   * Push a single tag to a remote. The remote ref update is atomic and rejects a
   * tag that already exists (no force), which is the claim primitive (arch-005):
   * a 'rejected' status means another worker won the race. Uses `--porcelain` so
   * the new/up-to-date/rejected distinction comes from machine-stable status
   * flags rather than locale-dependent human text.
   */
  async pushTag(tag: string, remote: string): Promise<PushResult> {
    const args = ['push', '--porcelain', remote, `refs/tags/${tag}:refs/tags/${tag}`];
    const raw = await this.runRaw(args);
    const refLine = raw.stdout.split('\n').find((line) => PORCELAIN_REF_RE.test(line));
    const flag = refLine ? refLine[0] : undefined;
    let status: PushStatus;
    if (flag === '*') {
      status = 'new';
    } else if (flag === '=') {
      status = 'up-to-date';
    } else if (flag === '!') {
      status = 'rejected';
    } else {
      // No recognizable ref status line — a genuine failure (e.g. bad remote).
      throw new GitError(args, raw);
    }
    return {
      tag,
      status,
      pushed: status !== 'rejected',
      alreadyExists: status === 'rejected',
      raw,
    };
  }

  /**
   * Force-update a local tag to match the remote's. The leading `+` in the
   * refspec overrides git's refusal to move a tag, so any existing local tag of
   * this name is clobbered. Scoped to `claim/*` refs at the call site (arch-007),
   * where the local tag is a stale losing claim that should be replaced by the
   * winner's, so the clobber is intended.
   */
  async fetchTag(remote: string, tag: string): Promise<void> {
    await this.run(['fetch', remote, `+refs/tags/${tag}:refs/tags/${tag}`]);
  }

  /**
   * Fetch tags from a remote so local state reflects other workers. Pipeline
   * tags are append-only and immutable, so this never needs to clobber.
   */
  async fetchTags(remote: string): Promise<void> {
    await this.run(['fetch', remote, '--tags', '--quiet']);
  }

  /** Whether `path` exists in the tree at `ref` (arch-006d artifact gate). */
  async pathExistsAt(ref: string, path: string): Promise<boolean> {
    const result = await this.runRaw(['cat-file', '-e', `${ref}:${path}`]);
    return result.code === 0;
  }

  /**
   * Read the subject line of an annotated tag (claimer identity, arch-005).
   * The claim flow writes identity as a single line, so the subject is the whole
   * message; `%(contents:subject)` returns it without git's trailing newlines.
   */
  async readTagMessage(tag: string): Promise<string> {
    const { stdout } = await this.run(['tag', '-l', '--format=%(contents:subject)', tag]);
    return stdout.replace(/\n$/, '');
  }
}
