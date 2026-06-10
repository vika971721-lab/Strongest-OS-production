import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import type { Telegraf } from 'telegraf';
import type { AppEnv } from './config/env.js';
import type { Scheduler } from './scheduler/scheduler.js';
import type { BotContext } from './types/context.js';
import { logger, normalizeError } from './utils/logger.js';
import { withRetry } from './utils/retry.js';

export interface SupabaseReadinessClient {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

export interface RuntimeState {
  envValid: boolean;
  compositionReady: boolean;
  botReady: boolean;
  httpServerStarted: boolean;
  ready: boolean;
  shuttingDown: boolean;
  scheduler?: Scheduler;
}

export interface HttpServerDependencies {
  env: AppEnv;
  bot: Telegraf<BotContext>;
  state: RuntimeState;
  supabaseClient?: SupabaseReadinessClient | undefined;
}

const JSON_LIMIT_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

const writeJson = (res: ServerResponse, status: number, payload: Record<string, unknown>): void => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};

const safeCompare = (actual: string | undefined, expected: string): boolean => {
  if (!actual) return false;
  const actualDigest = createHmac('sha256', expected).update(actual).digest();
  const expectedDigest = createHmac('sha256', expected).update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
};

const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > JSON_LIMIT_BYTES) {
      const error = new Error('body_too_large');
      error.name = 'BodyTooLargeError';
      throw error;
    }
    chunks.push(new Uint8Array(buffer));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    const error = new Error('invalid_json');
    error.name = 'InvalidJsonError';
    throw error;
  }
};

export const checkSupabaseReadiness = async (
  client: SupabaseReadinessClient | undefined,
): Promise<boolean> => {
  if (!client) return false;
  await Promise.race([
    client.from('subscriptions').select('id').limit(1),
    delay(2_000).then(() => {
      throw new Error('supabase_timeout');
    }),
  ]).then((result) => {
    if (result.error) throw new Error('supabase_unreachable');
  });
  return true;
};

const readinessReason = async (deps: HttpServerDependencies): Promise<string | undefined> => {
  if (!deps.state.envValid) return 'env_invalid';
  if (!deps.state.compositionReady) return 'composition_not_ready';
  if (!deps.state.botReady) return 'bot_not_ready';
  if (!deps.state.httpServerStarted) return 'http_not_started';
  if (deps.state.shuttingDown) return 'shutting_down';
  if (!deps.state.ready) return 'startup_not_ready';
  if ((deps.env.schedulerEnabled ?? true) && !deps.state.scheduler) return 'scheduler_not_ready';
  if (deps.env.healthCheckSupabase ?? true) {
    try {
      await withRetry(() => checkSupabaseReadiness(deps.supabaseClient), {
        attempts: 2,
        baseDelayMs: 50,
        maxDelayMs: 200,
        operation: 'supabase_readiness',
        logger,
      });
    } catch {
      return 'supabase_unreachable';
    }
  }
  return undefined;
};

const getRoute = (url: string | undefined): string => {
  const parsed = new URL(url ?? '/', 'http://localhost');
  return parsed.pathname;
};

export const createHttpServer = (deps: HttpServerDependencies): Server => {
  const server = createServer((req, res) => {
    const started = Date.now();
    const route = getRoute(req.url);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('request_timeout')));

    const finish = (status: number, payload: Record<string, unknown>): void => {
      writeJson(res, status, payload);
      logger.info(
        { method: req.method, route, status, durationMs: Date.now() - started },
        'http_request_completed',
      );
    };

    void (async () => {
      if (req.method === 'GET' && route === '/health') {
        finish(200, { status: 'ok', service: 'strongest-os-bot' });
        return;
      }

      if (req.method === 'GET' && route === '/ready') {
        const reason = await readinessReason(deps);
        if (reason) {
          logger.warn({ reason }, 'readiness_failed');
          finish(503, { status: 'not_ready', reason });
          return;
        }
        finish(200, { status: 'ready' });
        return;
      }

      if (route === (deps.env.webhookPath ?? '/telegram/webhook')) {
        if (req.method !== 'POST') {
          finish(405, { status: 'error', reason: 'method_not_allowed' });
          return;
        }
        const header = req.headers['x-telegram-bot-api-secret-token'];
        const actualSecret = Array.isArray(header) ? header[0] : header;
        const expectedSecret = deps.env.webhookSecret;
        if (!expectedSecret || !safeCompare(actualSecret, expectedSecret)) {
          finish(actualSecret ? 403 : 401, { status: 'error', reason: 'invalid_secret' });
          return;
        }
        let update: unknown;
        try {
          update = await readJsonBody(req);
        } catch (error) {
          const name = error instanceof Error ? error.name : 'InvalidJsonError';
          finish(name === 'BodyTooLargeError' ? 413 : 400, {
            status: 'error',
            reason: name === 'BodyTooLargeError' ? 'body_too_large' : 'invalid_json',
          });
          return;
        }
        const updateId =
          typeof update === 'object' && update !== null && 'update_id' in update
            ? Number((update as { update_id?: unknown }).update_id)
            : undefined;
        logger.info(
          { updateId: Number.isFinite(updateId) ? updateId : undefined },
          'webhook_update_received',
        );
        try {
          await deps.bot.handleUpdate(
            update as Parameters<Telegraf<BotContext>['handleUpdate']>[0],
          );
        } catch (error) {
          logger.error({ err: normalizeError(error) }, 'webhook_update_failed');
        }
        finish(200, { status: 'ok' });
        return;
      }

      finish(404, { status: 'error', reason: 'not_found' });
    })().catch((error: unknown) => {
      logger.error({ err: normalizeError(error), route }, 'http_request_failed');
      if (!res.headersSent) finish(500, { status: 'error', reason: 'internal_error' });
    });
  });

  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = REQUEST_TIMEOUT_MS + 1_000;
  return server;
};

export const closeHttpServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};
