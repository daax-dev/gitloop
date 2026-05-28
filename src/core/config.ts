// Pipeline configuration (TASK-002, arch-004).
//
// The pipeline is config-driven, not hardcoded: steps can be added or renamed,
// and each step may optionally require a per-step completion artifact committed
// to git before that step's tag is legal (enforced in TASK-011).
//
// `steps` are the post-entry pipeline steps in order. The entry/registration
// state (bare tag `TASK-N`, arch-006) is implicit and precedes `steps[0]`. The
// last step is terminal (e.g. `merged`).

/** A single pipeline step. */
export interface StepConfig {
  /** Tag path segment for this step, e.g. `in-progress`. Lowercase kebab. */
  readonly name: string;
  /**
   * Optional completion artifact required before this step's tag is legal.
   * A path template; `{taskId}` is substituted with the task id (arch-006d),
   * e.g. `tasks/{taskId}/review.md`. Checked against the commit the current
   * step's tag points at.
   */
  readonly requiredArtifact?: string;
}

/** An ordered pipeline definition. */
export interface PipelineConfig {
  readonly steps: readonly StepConfig[];
}

/** Thrown when a pipeline config fails validation. Message is operator-facing. */
export class PipelineConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineConfigError';
  }
}

/** The five OBJECTIVE steps as the shipped default (entry `TASK-N` is implicit). */
export const DEFAULT_PIPELINE: PipelineConfig = {
  steps: [
    { name: 'in-progress' },
    { name: 'code-complete' },
    { name: 'test-complete' },
    { name: 'review-complete' },
    { name: 'merged' },
  ],
};

// A step name must be a safe single git-ref path segment: lowercase letters,
// digits, and internal hyphens. This keeps `<step>/TASK-N` a valid ref and
// keeps the entry tag (no slash) unambiguously distinct from step tags.
const STEP_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateStep(raw: unknown, index: number): StepConfig {
  if (!isPlainObject(raw)) {
    throw new PipelineConfigError(`steps[${index}] must be an object`);
  }
  const { name, requiredArtifact } = raw;
  if (typeof name !== 'string' || !STEP_NAME_RE.test(name)) {
    throw new PipelineConfigError(
      `steps[${index}].name must be a lowercase-kebab string (got ${JSON.stringify(name)})`,
    );
  }
  if (requiredArtifact !== undefined) {
    if (typeof requiredArtifact !== 'string' || requiredArtifact.trim() === '') {
      throw new PipelineConfigError(
        `steps[${index}].requiredArtifact must be a non-empty string when present`,
      );
    }
    return { name, requiredArtifact };
  }
  return { name };
}

/**
 * Validate an untrusted config object, returning a normalized PipelineConfig.
 * Throws PipelineConfigError with a clear message on any violation.
 */
export function validatePipelineConfig(input: unknown): PipelineConfig {
  if (!isPlainObject(input)) {
    throw new PipelineConfigError('pipeline config must be an object');
  }
  const { steps } = input;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new PipelineConfigError('pipeline config must have a non-empty `steps` array');
  }
  const normalized = steps.map((step, i) => validateStep(step, i));
  const seen = new Set<string>();
  for (const step of normalized) {
    if (seen.has(step.name)) {
      throw new PipelineConfigError(`duplicate step name: ${step.name}`);
    }
    seen.add(step.name);
  }
  return { steps: normalized };
}

/**
 * Load a pipeline config. With no argument, returns the default pipeline.
 * Otherwise validates the provided object.
 */
export function loadPipelineConfig(input?: unknown): PipelineConfig {
  if (input === undefined) {
    return DEFAULT_PIPELINE;
  }
  return validatePipelineConfig(input);
}

/** Ordered step names. */
export function stepNames(config: PipelineConfig): string[] {
  return config.steps.map((s) => s.name);
}

/** Zero-based index of a step, or -1 if the name is not in the pipeline. */
export function stepIndex(config: PipelineConfig, name: string): number {
  return config.steps.findIndex((s) => s.name === name);
}

/** The step config for a name, or undefined if absent. */
export function stepByName(config: PipelineConfig, name: string): StepConfig | undefined {
  return config.steps.find((s) => s.name === name);
}

/** The first (post-entry) step. */
export function firstStep(config: PipelineConfig): StepConfig {
  // `steps` is validated non-empty, so index 0 exists.
  return config.steps[0] as StepConfig;
}

/** The terminal step (the last in the pipeline, e.g. `merged`). */
export function terminalStep(config: PipelineConfig): StepConfig {
  return config.steps[config.steps.length - 1] as StepConfig;
}

/** Whether `name` is the terminal step. */
export function isTerminalStep(config: PipelineConfig, name: string): boolean {
  return stepIndex(config, name) === config.steps.length - 1;
}

/** The step after `name`, or undefined if `name` is terminal or unknown. */
export function nextStep(config: PipelineConfig, name: string): StepConfig | undefined {
  const i = stepIndex(config, name);
  if (i < 0 || i >= config.steps.length - 1) {
    return undefined;
  }
  return config.steps[i + 1];
}

/** The step before `name`, or undefined if `name` is the first step or unknown. */
export function prevStep(config: PipelineConfig, name: string): StepConfig | undefined {
  const i = stepIndex(config, name);
  if (i <= 0) {
    return undefined;
  }
  return config.steps[i - 1];
}

/** Substitute `{taskId}` into a required-artifact template (arch-006d). */
export function resolveArtifactPath(template: string, taskId: string): string {
  return template.replaceAll('{taskId}', taskId);
}
