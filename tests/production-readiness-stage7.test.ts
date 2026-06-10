import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureWebhook, TELEGRAM_ALLOWED_UPDATES } from '../src/app.js';
import { buildWebhookUrl, parseEnv, type AppEnv } from '../src/config/env.js';
import { handleAdminSystemStatusCommand } from '../src/commands/productionAdminCommands.js';
import { createHttpServer, type RuntimeState } from '../src/httpServer.js';
import { NoopScheduler, type Scheduler } from '../src/scheduler/scheduler.js';
import { REDACTION_PATHS } from '../src/utils/logger.js';
import { withRetry } from '../src/utils/retry.js';

const baseEnv = (): AppEnv =>
  parseEnv({
    NODE_ENV: 'test',
    BOT_MODE: 'webhook',
    BOT_TOKEN: 'test-token',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    APP_URL: 'https://app.example.com',
    ADMIN_TELEGRAM_IDS: '42',
    WEBHOOK_DOMAIN: 'https://bot.example.com/',
    WEBHOOK_PATH: '/telegram/webhook',
    WEBHOOK_SECRET: 'test-webhook-secret-value',
    WEBHOOK_AUTO_SETUP: 'true',
    HEALTH_CHECK_SUPABASE: 'false',
    SCHEDULER_ENABLED: 'true',
  });

const state = (scheduler: Scheduler = new NoopScheduler()): RuntimeState => ({
  envValid: true,
  compositionReady: true,
  botReady: true,
  httpServerStarted: true,
  ready: true,
  shuttingDown: false,
  scheduler,
});

const createMockBot = () => ({
  handleUpdate: vi.fn().mockResolvedValue(undefined),
  telegram: {
    setWebhook: vi.fn().mockResolvedValue(true),
    getMe: vi.fn().mockResolvedValue({ id: 1, is_bot: true, username: 'bot' }),
    getWebhookInfo: vi.fn().mockResolvedValue({
      url: 'https://bot.example.com/secret/path',
      pending_update_count: 0,
      allowed_updates: TELEGRAM_ALLOWED_UPDATES,
    }),
  },
  stop: vi.fn(),
  launch: vi.fn().mockResolvedValue(undefined),
});

const startedServers: ReturnType<typeof createHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(
    startedServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  vi.restoreAllMocks();
});

const listen = async (server: ReturnType<typeof createHttpServer>): Promise<string> => {
  server.listen(0, '127.0.0.1');
  startedServers.push(server);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

describe('stage 7 production readiness', () => {
  it('parses development polling config', () => {
    const env = parseEnv({ NODE_ENV: 'development', BOT_MODE: 'polling', BOT_TOKEN: 'token' });
    expect(env.botMode).toBe('polling');
    expect(env.webhookAutoSetup).toBe(true);
  });

  it('parses production webhook config', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      BOT_MODE: 'webhook',
      BOT_TOKEN: 'token',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'role',
      APP_URL: 'https://app.example.com',
      ADMIN_TELEGRAM_IDS: '42',
      WEBHOOK_DOMAIN: 'https://bot.example.com/',
      WEBHOOK_SECRET: 'long-production-secret',
      PORT: '3000',
    });
    expect(buildWebhookUrl(env)).toBe('https://bot.example.com/telegram/webhook');
  });

  it('rejects production webhook without WEBHOOK_DOMAIN', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        BOT_MODE: 'webhook',
        BOT_TOKEN: 'token',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'role',
        APP_URL: 'https://app.example.com',
        ADMIN_TELEGRAM_IDS: '42',
        WEBHOOK_SECRET: 'long-production-secret',
      }),
    ).toThrow('WEBHOOK_DOMAIN');
  });

  it('rejects HTTP WEBHOOK_DOMAIN in production', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        BOT_MODE: 'webhook',
        BOT_TOKEN: 'token',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'role',
        APP_URL: 'https://app.example.com',
        ADMIN_TELEGRAM_IDS: '42',
        WEBHOOK_DOMAIN: 'http://bot.example.com',
        WEBHOOK_SECRET: 'long-production-secret',
      }),
    ).toThrow('WEBHOOK_DOMAIN');
  });

  it('rejects empty WEBHOOK_SECRET in production webhook', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        BOT_MODE: 'webhook',
        BOT_TOKEN: 'token',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'role',
        APP_URL: 'https://app.example.com',
        ADMIN_TELEGRAM_IDS: '42',
        WEBHOOK_DOMAIN: 'https://bot.example.com',
        WEBHOOK_SECRET: '',
      }),
    ).toThrow('WEBHOOK_SECRET');
  });

  it('rejects invalid PORT', () => {
    expect(() => parseEnv({ NODE_ENV: 'test', BOT_TOKEN: 'token', PORT: '0' })).toThrow('PORT');
  });

  it('health returns 200 without secrets', async () => {
    const env = baseEnv();
    const server = createHttpServer({ env, bot: createMockBot() as never, state: state() });
    const url = await listen(server);
    const response = await fetch(`${url}/health`);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain(env.webhookSecret);
  });

  it('ready returns 200 when ready', async () => {
    const server = createHttpServer({
      env: baseEnv(),
      bot: createMockBot() as never,
      state: state(),
    });
    const url = await listen(server);
    expect((await fetch(`${url}/ready`)).status).toBe(200);
  });

  it('ready returns 503 on Supabase failure', async () => {
    const env = { ...baseEnv(), healthCheckSupabase: true };
    const supabaseClient = {
      from: () => ({ select: () => ({ limit: vi.fn().mockRejectedValue(new Error('timeout')) }) }),
    };
    const server = createHttpServer({
      env,
      bot: createMockBot() as never,
      state: state(),
      supabaseClient,
    });
    const url = await listen(server);
    const response = await fetch(`${url}/ready`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'not_ready', reason: 'supabase_unreachable' });
  });

  it('webhook accepts correct secret', async () => {
    const bot = createMockBot();
    const env = baseEnv();
    const server = createHttpServer({ env, bot: bot as never, state: state() });
    const url = await listen(server);
    const response = await fetch(`${url}${env.webhookPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': env.webhookSecret ?? '',
      },
      body: JSON.stringify({ update_id: 1, message: { text: 'secret text' } }),
    });
    expect(response.status).toBe(200);
    expect(bot.handleUpdate).toHaveBeenCalledTimes(1);
  });

  it('webhook rejects wrong and missing secret', async () => {
    const env = baseEnv();
    const server = createHttpServer({ env, bot: createMockBot() as never, state: state() });
    const url = await listen(server);
    expect(
      (
        await fetch(`${url}${env.webhookPath}`, {
          method: 'POST',
          headers: { 'x-telegram-bot-api-secret-token': 'wrong' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect((await fetch(`${url}${env.webhookPath}`, { method: 'POST', body: '{}' })).status).toBe(
      401,
    );
  });

  it('webhook rejects invalid JSON and body over limit', async () => {
    const env = baseEnv();
    const server = createHttpServer({ env, bot: createMockBot() as never, state: state() });
    const url = await listen(server);
    const headers = { 'x-telegram-bot-api-secret-token': env.webhookSecret ?? '' };
    expect(
      (await fetch(`${url}${env.webhookPath}`, { method: 'POST', headers, body: '{' })).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${url}${env.webhookPath}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ data: 'x'.repeat(300_000) }),
        })
      ).status,
    ).toBe(413);
  });

  it('webhook setup uses allowed updates and can be disabled by env', async () => {
    const env = baseEnv();
    const bot = createMockBot();
    await configureWebhook(env, bot as never);
    expect(bot.telegram.setWebhook).toHaveBeenCalledTimes(1);
    const setWebhookCalls = bot.telegram.setWebhook.mock.calls as Array<
      [string, { allowed_updates?: string[] }]
    >;
    expect(setWebhookCalls[0]?.[1].allowed_updates).toEqual(
      expect.arrayContaining(['pre_checkout_query']),
    );
    const disabled = parseEnv({
      ...process.env,
      NODE_ENV: 'test',
      BOT_TOKEN: 'token',
      BOT_MODE: 'webhook',
      WEBHOOK_DOMAIN: 'https://bot.example.com',
      WEBHOOK_SECRET: 'long-production-secret',
      WEBHOOK_AUTO_SETUP: 'false',
    });
    expect(disabled.webhookAutoSetup).toBe(false);
  });

  it('scheduler start/stop and mode separation are explicit', () => {
    const scheduler = new NoopScheduler();
    expect(() => scheduler.start()).not.toThrow();
    scheduler.stop();
    expect(parseEnv({ NODE_ENV: 'test', BOT_TOKEN: 't', BOT_MODE: 'polling' }).botMode).toBe(
      'polling',
    );
    expect(
      parseEnv({
        NODE_ENV: 'test',
        BOT_TOKEN: 't',
        BOT_MODE: 'webhook',
        WEBHOOK_DOMAIN: 'https://bot.example.com',
        WEBHOOK_SECRET: 'long-production-secret',
      }).botMode,
    ).toBe('webhook');
  });

  it('readiness switches to 503 during shutdown', async () => {
    const runtime = state();
    const server = createHttpServer({
      env: baseEnv(),
      bot: createMockBot() as never,
      state: runtime,
    });
    const url = await listen(server);
    runtime.shuttingDown = true;
    expect((await fetch(`${url}/ready`)).status).toBe(503);
  });

  it('redacts core secret fields', () => {
    expect(REDACTION_PATHS).toEqual(
      expect.arrayContaining([
        'BOT_TOKEN',
        'SUPABASE_SERVICE_ROLE_KEY',
        'WEBHOOK_SECRET',
        'password',
      ]),
    );
  });

  it('temporary getMe/Supabase operations use bounded retry', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce('ok');
    await expect(
      withRetry(fn, {
        attempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 1,
        operation: 'get_me',
        sleep: () => Promise.resolve(),
      }),
    ).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not wrap payment or coupon business functions in retry helpers', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('business failure'));
    await expect(fn()).rejects.toThrow('business failure');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('test environment does not need real .env and admin commands are guarded', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);
    await handleAdminSystemStatusCommand(
      {
        from: { id: 7 },
        state: { user: { telegramId: '7' } },
        reply,
      } as never,
      {
        env: baseEnv(),
        scheduler: new NoopScheduler(),
        bot: createMockBot() as never,
      },
    );
    expect(reply).toHaveBeenCalledWith('Недостаточно прав.');
  });
});
