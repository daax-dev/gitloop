// MCP tool logic (TASK-009/010/011).
//
// The behavior behind the three MCP tools, kept independent of the MCP SDK so it
// is unit-testable without a transport. Each tool first fetches remote tags so
// it acts on the latest shared state, then derives/claims/advances via the
// core + pipeline layers. Worker identity comes from arch-007.

import { type PipelineConfig, resolveArtifactPath, stepByName } from '../core/config.js';
import type { Git } from '../core/git.js';
import { type ClaimOutcome, claimStep } from '../pipeline/claim.js';
import { deriveTaskState, deriveTaskStates, pendingTasks } from '../pipeline/state.js';

/** Shared dependencies for the tools. */
export interface McpDeps {
  readonly git: Git;
  readonly remote: string;
  readonly config: PipelineConfig;
  readonly workerId: string;
}

export interface PendingTaskView {
  readonly taskId: string;
  readonly currentStep: string | null;
  readonly version: number;
  readonly nextStep: string;
  readonly nextTag: string;
  readonly canReject: boolean;
}

/** get_pending_tasks: tasks whose next step is claimable, from latest tags. */
export async function getPendingTasks(deps: McpDeps): Promise<{ tasks: PendingTaskView[] }> {
  await deps.git.fetchTags(deps.remote);
  const tags = await deps.git.listTags();
  const states = pendingTasks(deriveTaskStates(tags, deps.config));
  const tasks = states.map((s): PendingTaskView => {
    // pendingTasks guarantees nextAction is non-null.
    const next = s.nextAction!;
    return {
      taskId: s.taskId,
      currentStep: s.currentStep,
      version: s.version,
      nextStep: next.toStep,
      nextTag: next.tag,
      canReject: s.rejectAction !== null,
    };
  });
  return { tasks };
}

export interface ClaimTaskResult {
  readonly taskId: string;
  readonly step: string;
  readonly version: number;
  readonly outcome: ClaimOutcome;
  readonly owner: string;
  readonly tag: string;
  /** True unless another worker holds the claim. */
  readonly claimed: boolean;
}

/** claim_task: atomically claim the right to perform a task's next step. */
export async function claimTask(
  deps: McpDeps,
  input: { taskId: string },
): Promise<ClaimTaskResult> {
  await deps.git.fetchTags(deps.remote);
  const tags = await deps.git.listTags();
  const state = deriveTaskState(tags, deps.config, input.taskId);
  if (state === null) {
    throw new Error(`unknown task: ${input.taskId}`);
  }
  if (state.nextAction === null) {
    throw new Error(
      `task ${input.taskId} is terminal (${state.currentStep ?? 'entry'}); nothing to claim`,
    );
  }
  const { toStep, version } = state.nextAction;
  const res = await claimStep(deps.git, {
    remote: deps.remote,
    taskId: input.taskId,
    step: toStep,
    version,
    workerId: deps.workerId,
  });
  return {
    taskId: input.taskId,
    step: toStep,
    version,
    outcome: res.outcome,
    owner: res.owner,
    tag: res.tag,
    claimed: res.outcome !== 'lost',
  };
}

export interface AdvanceTaskResult {
  readonly taskId: string;
  readonly advanced: boolean;
  readonly tag: string;
  readonly step: string;
  readonly version: number;
  readonly rejected: boolean;
  /** Present when advanced is false. */
  readonly reason?: string;
}

/**
 * advance_task: push the next pipeline tag to advance a task, or (reject=true)
 * loop it back to the first step at version+1. Forward advances enforce the
 * target step's required-artifact gate (arch-006d) against HEAD — the commit
 * being tagged. Idempotent and safe under concurrent workers.
 */
export async function advanceTask(
  deps: McpDeps,
  input: { taskId: string; reject?: boolean },
): Promise<AdvanceTaskResult> {
  await deps.git.fetchTags(deps.remote);
  const tags = await deps.git.listTags();
  const state = deriveTaskState(tags, deps.config, input.taskId);
  if (state === null) {
    throw new Error(`unknown task: ${input.taskId}`);
  }

  const reject = input.reject === true;
  const action = reject ? state.rejectAction : state.nextAction;
  if (action === null) {
    const reason = reject
      ? `task ${input.taskId} cannot be rejected from its current state`
      : `task ${input.taskId} is terminal; nothing to advance`;
    return {
      taskId: input.taskId,
      advanced: false,
      tag: '',
      step: state.currentStep ?? '',
      version: state.version,
      rejected: reject,
      reason,
    };
  }

  // Idempotency: fetchTags above synced local tags to the remote, and a rejected
  // push below repairs any stale local tag — so if the target tag exists now, it
  // is the remote's and the step is already advanced. Return without re-acting.
  if (await deps.git.tagExists(action.tag)) {
    return {
      taskId: input.taskId,
      advanced: true,
      tag: action.tag,
      step: action.toStep,
      version: action.version,
      rejected: reject,
    };
  }

  // Forward artifact gate: the target step may require a committed artifact
  // present at HEAD (the commit this tag will point at). Only relevant when we
  // are about to create+push the tag at HEAD.
  if (!reject) {
    const stepCfg = stepByName(deps.config, action.toStep);
    if (stepCfg?.requiredArtifact !== undefined) {
      const path = resolveArtifactPath(stepCfg.requiredArtifact, input.taskId);
      if (!(await deps.git.pathExistsAt('HEAD', path))) {
        return {
          taskId: input.taskId,
          advanced: false,
          tag: action.tag,
          step: action.toStep,
          version: action.version,
          rejected: reject,
          reason: `required artifact missing at HEAD: ${path}`,
        };
      }
    }
  }

  // Create the step tag at HEAD (the gated commit) and publish it.
  await deps.git.createTag(action.tag);
  const push = await deps.git.pushTag(action.tag, deps.remote);
  if (push.status === 'rejected') {
    // Another worker advanced this step first (at a different commit). Repair our
    // now-stale local tag to the winner's so later derivations never act on an
    // unaccepted commit.
    await deps.git.fetchTag(deps.remote, action.tag);
    return {
      taskId: input.taskId,
      advanced: false,
      tag: action.tag,
      step: action.toStep,
      version: action.version,
      rejected: reject,
      reason: 'tag already advanced by another worker',
    };
  }
  // 'new' = we advanced it; 'up-to-date' = already advanced identically (idempotent).
  return {
    taskId: input.taskId,
    advanced: true,
    tag: action.tag,
    step: action.toStep,
    version: action.version,
    rejected: reject,
  };
}
