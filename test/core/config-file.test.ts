import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PipelineConfigError } from '../../src/core/config.js';
import { loadPipelineConfigFromEnv, readPipelineConfigFile } from '../../src/core/config-file.js';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'gitloop-cfg-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const custom = JSON.stringify({
  steps: [
    { name: 'in-progress' },
    { name: 'design', requiredArtifact: 'docs/{taskId}/design.md' },
    { name: 'merged' },
  ],
});

describe('readPipelineConfigFile', () => {
  it('reads and validates a JSON config', async () => {
    const path = join(root, 'pipeline.json');
    await writeFile(path, custom);
    const cfg = readPipelineConfigFile(path);
    expect(cfg.steps.map((s) => s.name)).toEqual(['in-progress', 'design', 'merged']);
    expect(cfg.steps[1]?.requiredArtifact).toBe('docs/{taskId}/design.md');
  });

  it('throws on a missing file', () => {
    expect(() => readPipelineConfigFile(join(root, 'nope.json'))).toThrow(PipelineConfigError);
    expect(() => readPipelineConfigFile(join(root, 'nope.json'))).toThrow(/cannot read/);
  });

  it('throws on invalid JSON', async () => {
    const path = join(root, 'bad.json');
    await writeFile(path, '{ not json');
    expect(() => readPipelineConfigFile(path)).toThrow(/not valid JSON/);
  });

  it('throws on a schema-invalid config', async () => {
    const path = join(root, 'empty.json');
    await writeFile(path, JSON.stringify({ steps: [] }));
    expect(() => readPipelineConfigFile(path)).toThrow(/non-empty/);
  });
});

describe('loadPipelineConfigFromEnv', () => {
  it('uses GITLOOP_CONFIG when set', async () => {
    const path = join(root, 'explicit.json');
    await writeFile(path, custom);
    const cfg = loadPipelineConfigFromEnv({ GITLOOP_CONFIG: path }, root);
    expect(cfg.steps.map((s) => s.name)).toEqual(['in-progress', 'design', 'merged']);
  });

  it('resolves a relative GITLOOP_CONFIG against repoPath, not cwd', async () => {
    const repo = join(root, 'relrepo');
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, 'pipeline.json'), custom);
    const cfg = loadPipelineConfigFromEnv({ GITLOOP_CONFIG: 'pipeline.json' }, repo);
    expect(cfg.steps.map((s) => s.name)).toEqual(['in-progress', 'design', 'merged']);
  });

  it('auto-discovers .gitloop/pipeline.json in the repo', async () => {
    const repo = join(root, 'repo');
    await mkdir(join(repo, '.gitloop'), { recursive: true });
    await writeFile(join(repo, '.gitloop', 'pipeline.json'), custom);
    const cfg = loadPipelineConfigFromEnv({}, repo);
    expect(cfg.steps.map((s) => s.name)).toEqual(['in-progress', 'design', 'merged']);
  });

  it('falls back to the default pipeline', () => {
    const repo = join(root, 'bare-repo');
    const cfg = loadPipelineConfigFromEnv({}, repo);
    expect(cfg.steps.map((s) => s.name)).toEqual([
      'in-progress',
      'code-complete',
      'test-complete',
      'review-complete',
      'merged',
    ]);
  });

  it('prefers GITLOOP_CONFIG over auto-discovery', async () => {
    const repo = join(root, 'repo2');
    await mkdir(join(repo, '.gitloop'), { recursive: true });
    await writeFile(
      join(repo, '.gitloop', 'pipeline.json'),
      JSON.stringify({ steps: [{ name: 'discovered' }] }),
    );
    const explicit = join(root, 'explicit2.json');
    await writeFile(explicit, JSON.stringify({ steps: [{ name: 'chosen' }] }));
    const cfg = loadPipelineConfigFromEnv({ GITLOOP_CONFIG: explicit }, repo);
    expect(cfg.steps.map((s) => s.name)).toEqual(['chosen']);
  });
});
