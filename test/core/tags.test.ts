import { describe, expect, it } from 'vitest';
import { DEFAULT_PIPELINE } from '../../src/core/config.js';
import {
  type ParsedTag,
  formatEntryTag,
  formatStepTag,
  isTaskId,
  nextVersion,
  parseTag,
} from '../../src/core/tags.js';

describe('parseTag', () => {
  const valid: { tag: string; expected: ParsedTag }[] = [
    { tag: 'TASK-9', expected: { kind: 'entry', taskId: 'TASK-9' } },
    { tag: 'TASK-123', expected: { kind: 'entry', taskId: 'TASK-123' } },
    {
      tag: 'in-progress/TASK-9',
      expected: { kind: 'step', step: 'in-progress', taskId: 'TASK-9', version: 1 },
    },
    {
      tag: 'in-progress/TASK-9/v2',
      expected: { kind: 'step', step: 'in-progress', taskId: 'TASK-9', version: 2 },
    },
    {
      tag: 'merged/TASK-1/v10',
      expected: { kind: 'step', step: 'merged', taskId: 'TASK-1', version: 10 },
    },
  ];
  for (const c of valid) {
    it(`parses ${c.tag}`, () => {
      expect(parseTag(c.tag)).toEqual(c.expected);
    });
  }

  const invalid = [
    '',
    '/TASK-9', // leading slash (git-illegal; OBJECTIVE notation only)
    'TASK-0', // no leading-zero / zero ids
    'TASK-09',
    'task-9', // wrong case
    'in-progress/TASK-9/v1', // v1 must be implicit
    'in-progress/TASK-9/v0',
    'in-progress/TASK-9/v01',
    'in-progress/TASK-9/x2',
    'In-Progress/TASK-9', // bad step case
    'a/b/c/d', // too many segments
    'in-progress/NOTATASK',
    'in-progress/TASK-1/v9007199254740993', // past Number.MAX_SAFE_INTEGER — precision loss
  ];
  for (const tag of invalid) {
    it(`rejects ${JSON.stringify(tag)}`, () => {
      expect(parseTag(tag)).toBeNull();
    });
  }

  it('validates step names against the config when supplied', () => {
    expect(parseTag('in-progress/TASK-9', DEFAULT_PIPELINE)).not.toBeNull();
    // `qa` is a well-formed segment but not a step in the default pipeline.
    expect(parseTag('qa/TASK-9', DEFAULT_PIPELINE)).toBeNull();
    expect(parseTag('qa/TASK-9')).not.toBeNull(); // structural parse without config
  });

  it('ignores claim-namespace tags under the default config', () => {
    expect(parseTag('claim/in-progress/TASK-9', DEFAULT_PIPELINE)).toBeNull();
  });
});

describe('format round-trips', () => {
  it('formats entry and step tags', () => {
    expect(formatEntryTag('TASK-9')).toBe('TASK-9');
    expect(formatStepTag('in-progress', 'TASK-9', 1)).toBe('in-progress/TASK-9');
    expect(formatStepTag('in-progress', 'TASK-9', 2)).toBe('in-progress/TASK-9/v2');
  });

  it('round-trips parse∘format for a matrix', () => {
    for (const taskId of ['TASK-1', 'TASK-42']) {
      for (const step of ['in-progress', 'merged']) {
        for (const version of [1, 2, 7]) {
          const tag = formatStepTag(step, taskId, version);
          expect(parseTag(tag)).toEqual({ kind: 'step', step, taskId, version });
        }
      }
      expect(parseTag(formatEntryTag(taskId))).toEqual({ kind: 'entry', taskId });
    }
  });

  it('throws on invalid inputs', () => {
    expect(() => formatEntryTag('TASK-0')).toThrow(/invalid task id/);
    expect(() => formatStepTag('Bad', 'TASK-1', 1)).toThrow(/invalid step name/);
    expect(() => formatStepTag('in-progress', 'nope', 1)).toThrow(/invalid task id/);
    expect(() => formatStepTag('in-progress', 'TASK-1', 0)).toThrow(/invalid version/);
  });
});

describe('isTaskId / nextVersion', () => {
  it('isTaskId', () => {
    expect(isTaskId('TASK-9')).toBe(true);
    expect(isTaskId('TASK-0')).toBe(false);
    expect(isTaskId('x')).toBe(false);
  });
  it('nextVersion', () => {
    expect(nextVersion(1)).toBe(2);
    expect(nextVersion(9)).toBe(10);
    expect(() => nextVersion(0)).toThrow(/invalid version/);
    // Never silently fail to increment at the IEEE-754 limit (arch-006c).
    expect(() => nextVersion(Number.MAX_SAFE_INTEGER)).toThrow(/overflow/);
    expect(() => nextVersion(Number.MAX_SAFE_INTEGER + 2)).toThrow(/invalid version/);
  });
});
