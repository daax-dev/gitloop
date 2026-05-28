// Pipeline config loading from disk (TASK-014, arch-009).
//
// Resolution order for a running server/notifier:
//   1. GITLOOP_CONFIG=<path>           — explicit JSON file (error if unreadable)
//   2. <repoPath>/.gitloop/pipeline.json — auto-discovered if present
//   3. DEFAULT_PIPELINE                — the five shipped steps
//
// Parsing/IO live here; validation stays in the pure config module.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  type PipelineConfig,
  DEFAULT_PIPELINE,
  PipelineConfigError,
  validatePipelineConfig,
} from './config.js';

/** Read, parse, and validate a pipeline config JSON file. Throws on any failure. */
export function readPipelineConfigFile(path: string): PipelineConfig {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new PipelineConfigError(
      `cannot read pipeline config at ${path}: ${(err as Error).message}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PipelineConfigError(`pipeline config at ${path} is not valid JSON`);
  }
  return validatePipelineConfig(parsed);
}

/**
 * Resolve the pipeline config for a running process from the environment and
 * repo, per the order above. Synchronous (one-time startup load).
 */
export function loadPipelineConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  repoPath: string = process.cwd(),
): PipelineConfig {
  const explicit = env.GITLOOP_CONFIG?.trim();
  if (explicit) {
    // Resolve a relative GITLOOP_CONFIG against the repo, not the process cwd.
    return readPipelineConfigFile(isAbsolute(explicit) ? explicit : join(repoPath, explicit));
  }
  const discovered = join(repoPath, '.gitloop', 'pipeline.json');
  if (existsSync(discovered)) {
    return readPipelineConfigFile(discovered);
  }
  return DEFAULT_PIPELINE;
}
