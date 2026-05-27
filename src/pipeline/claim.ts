// Worker claim (TASK-006, arch-005 + arch-007).
//
// A claim is an annotated tag `claim/<step>/TASK-N[/vK]` whose ref name carries
// no identity (so the push is an atomic compare-and-swap — first worker to push
// wins) and whose message records the claimer. The losing worker force-fetches
// the remote tag and reads the winner's identity; if the winner is itself, the
// re-claim is an idempotent no-op. No state lives outside git.

import { hostname, userInfo } from 'node:os';
import type { Git } from '../core/git.js';
import { formatStepTag } from '../core/tags.js';

export type ClaimOutcome =
  | 'won' // this worker pushed the claim first
  | 'already-owned' // the claim already exists and belongs to this worker (idempotent)
  | 'lost'; // another worker holds the claim

export interface ClaimRequest {
  readonly remote: string;
  readonly taskId: string;
  readonly step: string;
  readonly version: number;
  readonly workerId: string;
}

export interface ClaimResult {
  readonly tag: string;
  readonly outcome: ClaimOutcome;
  /** Identity of the worker that holds the claim. */
  readonly owner: string;
}

/** The claim tag for a given step/version: `claim/` + the step tag. */
export function formatClaimTag(step: string, taskId: string, version: number): string {
  return `claim/${formatStepTag(step, taskId, version)}`;
}

/**
 * Assert a worker id is usable as a single-line claim-tag message: non-empty and
 * free of newlines (which would desync the `%(contents:subject)` owner read).
 */
export function assertValidWorkerId(id: string): void {
  if (id.trim() === '' || /[\r\n]/.test(id)) {
    throw new Error(`invalid worker id: ${JSON.stringify(id)} (must be non-empty and single-line)`);
  }
}

/** This process's worker identity: GITLOOP_WORKER_ID, else `user@host` (arch-007). */
export function workerId(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.GITLOOP_WORKER_ID?.trim();
  if (fromEnv) {
    assertValidWorkerId(fromEnv);
    return fromEnv;
  }
  return `${userInfo().username}@${hostname()}`;
}

/**
 * Attempt to claim a step for a worker. Atomic against concurrent workers: the
 * remote rejects a duplicate claim tag, so exactly one push wins. Re-claiming a
 * step this worker already owns is a no-op success.
 */
export async function claimStep(git: Git, req: ClaimRequest): Promise<ClaimResult> {
  assertValidWorkerId(req.workerId);
  const tag = formatClaimTag(req.step, req.taskId, req.version);

  // Stage the claim locally with our identity. If a local claim tag already
  // exists owned by another worker (typically fetched from the remote winner),
  // we have lost — report it without pushing, so we never publish another
  // worker's tag while reporting it as ours.
  if (await git.tagExists(tag)) {
    const localOwner = await git.readTagMessage(tag);
    if (localOwner !== req.workerId) {
      return { tag, outcome: 'lost', owner: localOwner };
    }
    // It is ours: fall through to push (up-to-date if already on the remote,
    // new if a prior attempt created it locally but never pushed).
  } else {
    await git.createTag(tag, { message: req.workerId });
  }

  // Push status comes from porcelain flags (Git.pushTag), so new vs up-to-date
  // vs rejected is deterministic and locale-independent.
  const push = await git.pushTag(tag, req.remote);
  if (push.status === 'new') {
    return { tag, outcome: 'won', owner: req.workerId };
  }
  if (push.status === 'up-to-date') {
    return { tag, outcome: 'already-owned', owner: req.workerId };
  }

  // Rejected: a different claim already holds the ref. Force-fetch the winning
  // tag and read its claimer identity — if it is ours, this is an idempotent
  // re-claim; otherwise we lost the race.
  await git.fetchTag(req.remote, tag);
  const owner = await git.readTagMessage(tag);
  return { tag, outcome: owner === req.workerId ? 'already-owned' : 'lost', owner };
}
