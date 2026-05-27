import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PIPELINE } from '../../src/core/config.js';
import type { Git } from '../../src/core/git.js';
import type { McpDeps } from '../../src/adapters/mcp-tools.js';
import { createMcpServer, depsFromEnv } from '../../src/adapters/mcp-server.js';

// Exercise the real MCP wiring over an in-memory transport, proving the three
// tools are registered and callable end-to-end without a stdio process.

function fakeDeps(tags: string[]): McpDeps {
  const git = {
    fetchTags: () => Promise.resolve(),
    listTags: () => Promise.resolve(tags),
  } as unknown as Git;
  return { git, remote: 'origin', config: DEFAULT_PIPELINE, workerId: 'tester' };
}

let client: Client | undefined;

afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect(deps: McpDeps): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(deps);
  await server.connect(serverTransport);
  const c = new Client({ name: 'test-client', version: '0.0.0' });
  await c.connect(clientTransport);
  return c;
}

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content.map((c) => c.text ?? '').join('');
}

describe('MCP server wiring', () => {
  it('registers the three gitloop tools', async () => {
    client = await connect(fakeDeps([]));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'advance_task',
      'claim_task',
      'get_pending_tasks',
    ]);
  });

  it('calls get_pending_tasks and returns derived state as JSON', async () => {
    client = await connect(fakeDeps(['TASK-1']));
    const result = await client.callTool({ name: 'get_pending_tasks', arguments: {} });
    const payload = JSON.parse(textOf(result)) as { tasks: { taskId: string; nextStep: string }[] };
    expect(payload.tasks).toContainEqual(
      expect.objectContaining({ taskId: 'TASK-1', nextStep: 'in-progress' }),
    );
  });
});

describe('depsFromEnv', () => {
  it('reads remote and worker id from the environment', () => {
    const deps = depsFromEnv({
      GITLOOP_REMOTE: 'upstream',
      GITLOOP_WORKER_ID: 'w1',
      GITLOOP_REPO: '/tmp',
    });
    expect(deps.remote).toBe('upstream');
    expect(deps.workerId).toBe('w1');
  });
});
