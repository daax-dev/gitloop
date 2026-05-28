// MCP server wiring (TASK-009).
//
// Thin adapter exposing the three gitloop tools over MCP. All behavior lives in
// mcp-tools.ts; this file only maps tools to the SDK and builds deps from the
// environment. Kept minimal so a zod 3/4 or SDK change touches one small place.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadPipelineConfigFromEnv } from '../core/config-file.js';
import { Git } from '../core/git.js';
import { workerId } from '../pipeline/claim.js';
import { type McpDeps, advanceTask, claimTask, getPendingTasks } from './mcp-tools.js';

function jsonResult(value: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Build an MCP server exposing get_pending_tasks, claim_task, advance_task. */
export function createMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'gitloop', version: '0.0.0' });

  server.registerTool(
    'get_pending_tasks',
    {
      description: 'List tasks whose next pipeline step is claimable, derived from git tags.',
    },
    async () => jsonResult(await getPendingTasks(deps)),
  );

  server.registerTool(
    'claim_task',
    {
      description: "Atomically claim the right to perform a task's next pipeline step.",
      inputSchema: { taskId: z.string().describe('Task id, e.g. TASK-9') },
    },
    async ({ taskId }) => jsonResult(await claimTask(deps, { taskId })),
  );

  server.registerTool(
    'advance_task',
    {
      description:
        'Advance a task by pushing its next pipeline tag; set reject=true to loop it back to the first step at the next version.',
      inputSchema: {
        taskId: z.string().describe('Task id, e.g. TASK-9'),
        reject: z.boolean().optional().describe('Reject (loop back) instead of advancing'),
      },
    },
    async ({ taskId, reject }) =>
      jsonResult(await advanceTask(deps, reject === undefined ? { taskId } : { taskId, reject })),
  );

  return server;
}

/** Build tool dependencies from the environment (arch-007 identity). */
export function depsFromEnv(env: NodeJS.ProcessEnv = process.env): McpDeps {
  const repoPath = env.GITLOOP_REPO ?? process.cwd();
  return {
    git: new Git(repoPath),
    remote: env.GITLOOP_REMOTE ?? 'origin',
    config: loadPipelineConfigFromEnv(env, repoPath),
    workerId: workerId(env),
  };
}

/** Start the MCP server over stdio (entry point for a worker process). */
export async function startStdioServer(): Promise<void> {
  const server = createMcpServer(depsFromEnv());
  await server.connect(new StdioServerTransport());
}
