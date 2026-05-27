import { describe, expect, it } from 'vitest';

// Placeholder proving the toolchain (tsx + Vitest + strict TS) runs.
// Replaced by real module tests starting in TASK-002.
describe('scaffolding', () => {
  it('runs the test toolchain', () => {
    expect(1 + 1).toBe(2);
  });

  it('loads the layer barrels without error', async () => {
    await expect(import('../src/core/index.js')).resolves.toBeDefined();
    await expect(import('../src/pipeline/index.js')).resolves.toBeDefined();
    await expect(import('../src/adapters/index.js')).resolves.toBeDefined();
  });
});
