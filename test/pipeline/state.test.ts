import { describe, expect, it } from 'vitest';
import { DEFAULT_PIPELINE, loadPipelineConfig } from '../../src/core/config.js';
import { deriveTaskState, deriveTaskStates, pendingTasks } from '../../src/pipeline/state.js';

const cfg = DEFAULT_PIPELINE;

describe('deriveTaskState — progression', () => {
  it('entry only → advance to in-progress v1, no reject', () => {
    const s = deriveTaskState(['TASK-9'], cfg, 'TASK-9');
    expect(s).toMatchObject({
      taskId: 'TASK-9',
      version: 1,
      currentStep: null,
      status: 'active',
      nextAction: {
        type: 'advance',
        toStep: 'in-progress',
        version: 1,
        tag: 'in-progress/TASK-9/v1',
      },
      rejectAction: null,
    });
  });

  it('mid-pipeline → advance to next step, reject to first step at v+1', () => {
    const s = deriveTaskState(
      ['TASK-9', 'in-progress/TASK-9/v1', 'code-complete/TASK-9/v1'],
      cfg,
      'TASK-9',
    );
    expect(s?.currentStep).toBe('code-complete');
    expect(s?.nextAction?.tag).toBe('test-complete/TASK-9/v1');
    expect(s?.rejectAction?.tag).toBe('in-progress/TASK-9/v2');
  });

  it('terminal (merged) → no actions, status merged', () => {
    const tags = [
      'TASK-9',
      'in-progress/TASK-9/v1',
      'code-complete/TASK-9/v1',
      'test-complete/TASK-9/v1',
      'review-complete/TASK-9/v1',
      'merged/TASK-9/v1',
    ];
    const s = deriveTaskState(tags, cfg, 'TASK-9');
    expect(s).toMatchObject({
      currentStep: 'merged',
      status: 'merged',
      nextAction: null,
      rejectAction: null,
    });
  });
});

describe('deriveTaskState — loop-back versioning (arch-006c)', () => {
  // The case the advisor flagged: a loop-back must not read as "already complete".
  it('{in-progress/v1, code-complete/v1, in-progress/v2} → at in-progress v2, advance to code-complete/v2', () => {
    const tags = ['in-progress/TASK-9/v1', 'code-complete/TASK-9/v1', 'in-progress/TASK-9/v2'];
    const s = deriveTaskState(tags, cfg, 'TASK-9');
    expect(s).toMatchObject({
      version: 2,
      currentStep: 'in-progress',
      status: 'active',
      nextAction: { toStep: 'code-complete', version: 2, tag: 'code-complete/TASK-9/v2' },
      rejectAction: { toStep: 'in-progress', version: 3, tag: 'in-progress/TASK-9/v3' },
    });
  });

  it('re-advanced after loop-back → code-complete v2 current, next is test-complete v2', () => {
    const tags = [
      'in-progress/TASK-9/v1',
      'code-complete/TASK-9/v1',
      'test-complete/TASK-9/v1',
      'in-progress/TASK-9/v2',
      'code-complete/TASK-9/v2',
    ];
    const s = deriveTaskState(tags, cfg, 'TASK-9');
    expect(s?.version).toBe(2);
    expect(s?.currentStep).toBe('code-complete');
    expect(s?.nextAction?.tag).toBe('test-complete/TASK-9/v2');
  });
});

describe('deriveTaskState — gaps and unknowns', () => {
  it('resolves a gap deterministically by furthest progress', () => {
    // in-progress missing, code-complete present: current = code-complete (max index at v1).
    const s = deriveTaskState(['code-complete/TASK-5/v1'], cfg, 'TASK-5');
    expect(s?.currentStep).toBe('code-complete');
    expect(s?.nextAction?.toStep).toBe('test-complete');
  });

  it('ignores non-pipeline and unknown-step tags', () => {
    const s = deriveTaskState(['TASK-7', 'qa/TASK-7/v1', 'random-tag', 'v1.0.0'], cfg, 'TASK-7');
    expect(s?.currentStep).toBeNull(); // qa is not a step; only the entry counts
  });

  it('returns null for an unknown task', () => {
    expect(deriveTaskState(['TASK-9'], cfg, 'TASK-404')).toBeNull();
  });

  it('ignores step tags with unsafe (precision-losing) versions', () => {
    // parseTag rejects v > MAX_SAFE_INTEGER, so it cannot poison max-version derivation.
    const tags = ['TASK-8', 'in-progress/TASK-8/v1', 'in-progress/TASK-8/v9007199254740993'];
    const s = deriveTaskState(tags, cfg, 'TASK-8');
    expect(s?.version).toBe(1);
    expect(s?.currentStep).toBe('in-progress');
  });
});

describe('deriveTaskStates — multiple tasks', () => {
  it('derives and numerically sorts all known tasks', () => {
    const states = deriveTaskStates(['TASK-2', 'TASK-10', 'in-progress/TASK-2/v1'], cfg);
    expect(states.map((s) => s.taskId)).toEqual(['TASK-2', 'TASK-10']);
  });

  it('pendingTasks returns those with a forward action', () => {
    const tags = [
      'TASK-1',
      'in-progress/TASK-2/v1',
      'code-complete/TASK-2/v1',
      'test-complete/TASK-2/v1',
      'review-complete/TASK-2/v1',
      'merged/TASK-2/v1',
    ];
    const pending = pendingTasks(deriveTaskStates(tags, cfg));
    expect(pending.map((s) => s.taskId)).toEqual(['TASK-1']); // TASK-2 is merged
  });
});

describe('custom config', () => {
  it('honors a two-step renamed pipeline', () => {
    const custom = loadPipelineConfig({ steps: [{ name: 'build' }, { name: 'ship' }] });
    const s = deriveTaskState(['build/TASK-1/v1'], custom, 'TASK-1');
    expect(s?.currentStep).toBe('build');
    expect(s?.nextAction?.tag).toBe('ship/TASK-1/v1');
    expect(s?.status).toBe('active');
    const shipped = deriveTaskState(['build/TASK-1/v1', 'ship/TASK-1/v1'], custom, 'TASK-1');
    expect(shipped?.status).toBe('merged');
  });
});
