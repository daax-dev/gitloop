import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PIPELINE,
  PipelineConfigError,
  firstStep,
  isTerminalStep,
  loadPipelineConfig,
  nextStep,
  prevStep,
  resolveArtifactPath,
  stepIndex,
  stepNames,
  terminalStep,
  validatePipelineConfig,
} from '../../src/core/config.js';

describe('loadPipelineConfig', () => {
  it('returns the default pipeline (six OBJECTIVE steps) with no argument', () => {
    expect(stepNames(loadPipelineConfig())).toEqual([
      'in-progress',
      'code-complete',
      'test-complete',
      'review-complete',
      'merged',
    ]);
    expect(loadPipelineConfig()).toBe(DEFAULT_PIPELINE);
  });

  it('validates a provided config', () => {
    const cfg = loadPipelineConfig({ steps: [{ name: 'do' }, { name: 'done' }] });
    expect(stepNames(cfg)).toEqual(['do', 'done']);
  });

  it('accepts a per-step required artifact template', () => {
    const cfg = validatePipelineConfig({
      steps: [
        { name: 'in-progress' },
        { name: 'review', requiredArtifact: 'tasks/{taskId}/review.md' },
      ],
    });
    expect(cfg.steps[1]?.requiredArtifact).toBe('tasks/{taskId}/review.md');
  });
});

describe('validatePipelineConfig rejects invalid input', () => {
  const cases: { name: string; input: unknown; match: RegExp }[] = [
    { name: 'non-object', input: 42, match: /must be an object/ },
    { name: 'missing steps', input: {}, match: /non-empty `steps`/ },
    { name: 'empty steps', input: { steps: [] }, match: /non-empty `steps`/ },
    { name: 'step not object', input: { steps: ['x'] }, match: /steps\[0\] must be an object/ },
    {
      name: 'bad step name (caps)',
      input: { steps: [{ name: 'In-Progress' }] },
      match: /lowercase-kebab/,
    },
    {
      name: 'bad step name (slash)',
      input: { steps: [{ name: 'a/b' }] },
      match: /lowercase-kebab/,
    },
    {
      name: 'empty artifact',
      input: { steps: [{ name: 'a', requiredArtifact: '' }] },
      match: /requiredArtifact/,
    },
    {
      name: 'duplicate names',
      input: { steps: [{ name: 'a' }, { name: 'a' }] },
      match: /duplicate step name: a/,
    },
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(() => validatePipelineConfig(c.input)).toThrow(PipelineConfigError);
      expect(() => validatePipelineConfig(c.input)).toThrow(c.match);
    });
  }
});

describe('navigation helpers', () => {
  const cfg = DEFAULT_PIPELINE;
  it('indexes and looks up steps', () => {
    expect(stepIndex(cfg, 'test-complete')).toBe(2);
    expect(stepIndex(cfg, 'nope')).toBe(-1);
    expect(firstStep(cfg).name).toBe('in-progress');
    expect(terminalStep(cfg).name).toBe('merged');
  });

  it('computes next/prev with edges', () => {
    expect(nextStep(cfg, 'in-progress')?.name).toBe('code-complete');
    expect(nextStep(cfg, 'merged')).toBeUndefined();
    expect(nextStep(cfg, 'nope')).toBeUndefined();
    expect(prevStep(cfg, 'code-complete')?.name).toBe('in-progress');
    expect(prevStep(cfg, 'in-progress')).toBeUndefined();
  });

  it('identifies the terminal step', () => {
    expect(isTerminalStep(cfg, 'merged')).toBe(true);
    expect(isTerminalStep(cfg, 'review-complete')).toBe(false);
  });
});

describe('resolveArtifactPath', () => {
  it('substitutes all {taskId} occurrences', () => {
    expect(resolveArtifactPath('tasks/{taskId}/review.md', 'TASK-9')).toBe(
      'tasks/TASK-9/review.md',
    );
    expect(resolveArtifactPath('{taskId}/{taskId}.md', 'TASK-1')).toBe('TASK-1/TASK-1.md');
  });
});
