// Pipeline domain (TASK-005, arch-006).
//
// The deterministic core: given the set of tags present and the pipeline config,
// derive each task's current step and its legal transitions. State is read from
// git tags only — re-deriving from the same tag set always yields the same
// answer (the determinism guarantee).
//
// Versioning (arch-006c): a task's current version is the max `/vK` across its
// tags. The current step is the furthest-progressed step *at that version*; tags
// from earlier versions are historical. A rejection loops the task back to the
// first step at version+1; forward progress then re-advances at the new version.

import {
  type PipelineConfig,
  firstStep,
  isTerminalStep,
  nextStep as nextStepConfig,
  stepIndex,
} from '../core/config.js';
import { type ParsedTag, formatStepTag, nextVersion, parseTag } from '../core/tags.js';

export type TaskStatus = 'active' | 'merged';

/** Forward progression: push the next step's tag at the current version. */
export interface AdvanceAction {
  readonly type: 'advance';
  readonly taskId: string;
  readonly toStep: string;
  readonly version: number;
  readonly tag: string;
}

/** Rejection loop-back: push the first step's tag at version+1. */
export interface RejectAction {
  readonly type: 'reject';
  readonly taskId: string;
  readonly toStep: string;
  readonly version: number;
  readonly tag: string;
}

/** Derived state of a single task. */
export interface TaskState {
  readonly taskId: string;
  /** Current (max) version across the task's tags. */
  readonly version: number;
  /** Furthest-progressed step at the current version, or null at entry. */
  readonly currentStep: string | null;
  readonly status: TaskStatus;
  /** The forward advance, or null when terminal. Exactly one when progressable. */
  readonly nextAction: AdvanceAction | null;
  /** The available loop-back, or null at entry/terminal. */
  readonly rejectAction: RejectAction | null;
}

type StepTag = { step: string; version: number };

function deriveOne(taskId: string, steps: readonly StepTag[], config: PipelineConfig): TaskState {
  const version = steps.reduce((max, s) => Math.max(max, s.version), 1);

  // Furthest-progressed step at the current version.
  let currentIndex = -1;
  for (const s of steps) {
    if (s.version === version) {
      currentIndex = Math.max(currentIndex, stepIndex(config, s.step));
    }
  }
  const currentStep =
    currentIndex >= 0 ? (config.steps[currentIndex] as { name: string }).name : null;

  const terminal = currentStep !== null && isTerminalStep(config, currentStep);
  const status: TaskStatus = terminal ? 'merged' : 'active';

  let nextAction: AdvanceAction | null = null;
  let rejectAction: RejectAction | null = null;

  if (currentStep === null) {
    // Entry/registration only: advance to the first step at version 1.
    const first = firstStep(config);
    nextAction = {
      type: 'advance',
      taskId,
      toStep: first.name,
      version: 1,
      tag: formatStepTag(first.name, taskId, 1),
    };
  } else if (!terminal) {
    const next = nextStepConfig(config, currentStep);
    if (next) {
      nextAction = {
        type: 'advance',
        taskId,
        toStep: next.name,
        version,
        tag: formatStepTag(next.name, taskId, version),
      };
    }
    // Reject loops back to the first step at the next version.
    const first = firstStep(config);
    const rejectVersion = nextVersion(version);
    rejectAction = {
      type: 'reject',
      taskId,
      toStep: first.name,
      version: rejectVersion,
      tag: formatStepTag(first.name, taskId, rejectVersion),
    };
  }

  return { taskId, version, currentStep, status, nextAction, rejectAction };
}

/** Derive the state of every known task from a set of tag names. */
export function deriveTaskStates(tags: readonly string[], config: PipelineConfig): TaskState[] {
  const byTask = new Map<string, StepTag[]>();
  const ensure = (taskId: string): StepTag[] => {
    let steps = byTask.get(taskId);
    if (!steps) {
      steps = [];
      byTask.set(taskId, steps);
    }
    return steps;
  };

  for (const tag of tags) {
    const parsed: ParsedTag | null = parseTag(tag, config);
    if (parsed === null) {
      continue; // not a pipeline tag (or unknown step) — ignored
    }
    if (parsed.kind === 'entry') {
      ensure(parsed.taskId); // register the task; entry carries no step/version
    } else {
      ensure(parsed.taskId).push({ step: parsed.step, version: parsed.version });
    }
  }

  const states: TaskState[] = [];
  for (const [taskId, steps] of byTask) {
    states.push(deriveOne(taskId, steps, config));
  }
  // Stable ordering by task id keeps output deterministic for callers.
  states.sort((a, b) => a.taskId.localeCompare(b.taskId, 'en', { numeric: true }));
  return states;
}

/** Derive a single task's state, or null if the task is unknown. */
export function deriveTaskState(
  tags: readonly string[],
  config: PipelineConfig,
  taskId: string,
): TaskState | null {
  return deriveTaskStates(tags, config).find((s) => s.taskId === taskId) ?? null;
}

/** Tasks whose next forward step is available to claim (entry or mid-pipeline). */
export function pendingTasks(states: readonly TaskState[]): TaskState[] {
  return states.filter((s) => s.nextAction !== null);
}
