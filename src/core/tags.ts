// Tag schema (TASK-003, arch-006).
//
// Pipeline state is encoded entirely in git tag names. The grammar:
//
//   entry tag   TASK-<n>                     (registration; the only no-slash tag)
//   step tag    <step>/TASK-<n>              (version 1, implicit)
//   step tag    <step>/TASK-<n>/v<k>         (version k >= 2, after loop-back)
//
// `<step>` is a name from the pipeline config (TASK-002). Version 1 is implicit;
// versions >= 2 are explicit `/vK`. Tag presence is authoritative — given the set
// of tags, the next legal action is derivable from these parsed forms alone.

import type { PipelineConfig } from './config.js';
import { stepIndex } from './config.js';

/** A parsed pipeline tag. */
export type ParsedTag =
  | { readonly kind: 'entry'; readonly taskId: string }
  | {
      readonly kind: 'step';
      readonly step: string;
      readonly taskId: string;
      readonly version: number;
    };

// Task ids are `TASK-<positive int>` with no leading zeros (canonical form).
const TASK_ID_RE = /^TASK-(?:[1-9][0-9]*)$/;
// Step name segment (mirrors config's STEP_NAME_RE): lowercase kebab.
const STEP_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Version suffix: `v` then an integer >= 2, no leading zeros (v1 is implicit).
const VERSION_RE = /^v(?:[2-9]|[1-9][0-9]+)$/;

/** Whether a string is a canonical task id (`TASK-<n>`). */
export function isTaskId(value: string): boolean {
  return TASK_ID_RE.test(value);
}

/**
 * Parse a git tag name into a ParsedTag, or return null if it is not a
 * well-formed pipeline tag. When `config` is supplied, a step tag whose step is
 * not in the pipeline is rejected (returns null) — step names are validated
 * against the config (AC TASK-003 #4).
 */
export function parseTag(tag: string, config?: PipelineConfig): ParsedTag | null {
  const segments = tag.split('/');

  if (segments.length === 1) {
    const [taskId] = segments as [string];
    return TASK_ID_RE.test(taskId) ? { kind: 'entry', taskId } : null;
  }

  if (segments.length === 2 || segments.length === 3) {
    const step = segments[0] as string;
    const taskId = segments[1] as string;
    if (!STEP_NAME_RE.test(step) || !TASK_ID_RE.test(taskId)) {
      return null;
    }
    if (config && stepIndex(config, step) < 0) {
      return null;
    }
    if (segments.length === 2) {
      return { kind: 'step', step, taskId, version: 1 };
    }
    const versionPart = segments[2] as string;
    if (!VERSION_RE.test(versionPart)) {
      return null;
    }
    const version = Number(versionPart.slice(1));
    // Reject versions past the IEEE-754 safe-integer range: Number() would lose
    // precision and two distinct version strings could collide, breaking the
    // max-version determinism rule (arch-006c).
    if (!Number.isSafeInteger(version)) {
      return null;
    }
    return { kind: 'step', step, taskId, version };
  }

  return null;
}

/** Format the entry/registration tag for a task. Throws on an invalid id. */
export function formatEntryTag(taskId: string): string {
  if (!TASK_ID_RE.test(taskId)) {
    throw new Error(`invalid task id: ${JSON.stringify(taskId)}`);
  }
  return taskId;
}

/**
 * Format a step tag. Version 1 omits the suffix; versions >= 2 append `/vK`.
 * Throws on an invalid step name, task id, or version (< 1).
 */
export function formatStepTag(step: string, taskId: string, version: number): string {
  if (!STEP_NAME_RE.test(step)) {
    throw new Error(`invalid step name: ${JSON.stringify(step)}`);
  }
  if (!TASK_ID_RE.test(taskId)) {
    throw new Error(`invalid task id: ${JSON.stringify(taskId)}`);
  }
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`invalid version: ${version} (must be a safe integer >= 1)`);
  }
  return version === 1 ? `${step}/${taskId}` : `${step}/${taskId}/v${version}`;
}

/** The next loop-back version (arch-006c). */
export function nextVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`invalid version: ${version} (must be a safe integer >= 1)`);
  }
  const next = version + 1;
  if (!Number.isSafeInteger(next)) {
    throw new Error(`version overflow: ${version} is at the safe-integer limit`);
  }
  return next;
}
