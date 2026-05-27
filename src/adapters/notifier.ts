// tag-notifier HTTP service (TASK-007).
//
// A local Node service that receives tag-push events (from the pre-push hook,
// TASK-008), keeps them in an in-memory queue (no persistence by design), and
// derives pipeline state on demand from git tags via the pipeline domain. No
// pipeline logic lives here — derivation is delegated to src/pipeline. Logs are
// structured JSON, one object per line, to stdout.

import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { type PipelineConfig, DEFAULT_PIPELINE } from '../core/config.js';
import { Git } from '../core/git.js';
import { deriveTaskStates } from '../pipeline/state.js';

/** A received tag-push event. */
export interface NotifierEvent {
  readonly id: number;
  /** UTC ISO timestamp of receipt. */
  readonly receivedAt: string;
  readonly tags: string[];
  readonly remote?: string;
}

export type LogFn = (record: Record<string, unknown>) => void;

/** A client error (bad request body, too large, malformed JSON) → HTTP 400. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export interface NotifierOptions {
  /** Listen port. Defaults to GITLOOP_NOTIFIER_PORT, then 7777. Use 0 for ephemeral. */
  readonly port?: number;
  /** Repository to derive state from. Defaults to GITLOOP_REPO, then process.cwd(). */
  readonly repoPath?: string;
  readonly config?: PipelineConfig;
  /** Injectable git layer (tests pass a fake); defaults to a Git on repoPath. */
  readonly git?: Git;
  /** Injectable structured logger; defaults to a JSON line on stdout. */
  readonly log?: LogFn;
}

export interface Notifier {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
  /** The in-memory event queue (read-only view). */
  readonly events: readonly NotifierEvent[];
}

const MAX_BODY_BYTES = 1024 * 1024;

function defaultLog(record: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function resolvePort(port: number | undefined, env: NodeJS.ProcessEnv): number {
  let value: number;
  if (port !== undefined) {
    value = port;
  } else if (env.GITLOOP_NOTIFIER_PORT !== undefined) {
    value = Number(env.GITLOOP_NOTIFIER_PORT);
  } else {
    return 7777;
  }
  // 0 = OS-assigned ephemeral port; otherwise a valid TCP port.
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error(`invalid notifier port: ${JSON.stringify(env.GITLOOP_NOTIFIER_PORT ?? port)}`);
  }
  return value;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      req.destroy(); // stop receiving the rest of the upload
      throw new BadRequestError('request body too large');
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseEventBody(raw: string): { tags: string[]; remote?: string } {
  let parsed: unknown;
  try {
    parsed = raw.trim() === '' ? {} : JSON.parse(raw);
  } catch {
    throw new BadRequestError('body must be valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BadRequestError('body must be a JSON object');
  }
  const { tags, remote } = parsed as Record<string, unknown>;
  if (!Array.isArray(tags) || !tags.every((t): t is string => typeof t === 'string')) {
    throw new BadRequestError('`tags` must be an array of strings');
  }
  if (remote !== undefined && typeof remote !== 'string') {
    throw new BadRequestError('`remote` must be a string when present');
  }
  return remote === undefined ? { tags } : { tags, remote };
}

/** Create a tag-notifier. Call start() to listen and stop() to shut down. */
export function createNotifier(opts: NotifierOptions = {}): Notifier {
  const env = process.env;
  const port = resolvePort(opts.port, env);
  const repoPath = opts.repoPath ?? env.GITLOOP_REPO ?? process.cwd();
  const config = opts.config ?? DEFAULT_PIPELINE;
  const git = opts.git ?? new Git(repoPath);
  const rawLog = opts.log ?? defaultLog;
  // A logger must never crash a request or leak an unhandled rejection — guard
  // both synchronous throws and rejected promises from an async logger.
  const log: LogFn = (record) => {
    try {
      const result = rawLog(record) as unknown;
      if (result instanceof Promise) {
        result.catch(() => {
          /* swallow async logger failures */
        });
      }
    } catch {
      /* swallow synchronous logger failures */
    }
  };

  const events: NotifierEvent[] = [];
  let nextId = 1;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    if (method === 'GET' && path === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (method === 'POST' && path === '/events') {
      const event = parseEventBody(await readBody(req));
      const record: NotifierEvent = {
        id: nextId++,
        receivedAt: new Date().toISOString(),
        tags: event.tags,
        ...(event.remote !== undefined ? { remote: event.remote } : {}),
      };
      events.push(record);
      log({ level: 'info', msg: 'event', id: record.id, tags: record.tags });
      sendJson(res, 202, { id: record.id });
      return;
    }

    if (method === 'GET' && path === '/events') {
      const since = Number(url.searchParams.get('since') ?? '0');
      const from = Number.isInteger(since) ? since : 0;
      sendJson(res, 200, { events: events.filter((e) => e.id > from) });
      return;
    }

    if (method === 'GET' && path === '/state') {
      const tags = await git.listTags();
      sendJson(res, 200, { tasks: deriveTaskStates(tags, config) });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  }

  const server: Server = createServer((req, res) => {
    const startedAt = Date.now();
    handle(req, res)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        // Typed client errors (and malformed JSON) are 400; everything else 500.
        const clientError = err instanceof BadRequestError || err instanceof SyntaxError;
        if (!res.headersSent) {
          sendJson(res, clientError ? 400 : 500, { error: message });
        }
        log({ level: 'error', msg: 'request failed', error: message });
      })
      .finally(() => {
        log({
          level: 'info',
          msg: 'request',
          method: req.method,
          path: req.url,
          ms: Date.now() - startedAt,
        });
      });
  });

  return {
    get events() {
      return events;
    },
    start() {
      return new Promise<{ port: number }>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => {
          const addr = server.address();
          const boundPort = typeof addr === 'object' && addr !== null ? addr.port : port;
          log({ level: 'info', msg: 'listening', port: boundPort, repoPath });
          resolve({ port: boundPort });
        });
      });
    },
    stop() {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
