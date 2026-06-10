import type { Server } from 'node:http';
import type { Telegraf } from 'telegraf';
import { createBot } from './bot.js';
import { buildWebhookUrl, maskWebhookUrl, type AppEnv } from './config/env.js';
import { createHttpServer, closeHttpServer, type RuntimeState } from './httpServer.js';
import { getSupabaseAdminClient } from './integrations/supabaseAdmin.js';
import { SupabaseNotificationRepository } from './repositories/notificationRepository.js';
import { SupabaseSubscriptionRepository } from './repositories/subscriptionRepository.js';
import {
  SchedulerRunner,
  SupabaseSchedulerLockGateway,
  NoopScheduler,
  type Scheduler,
} from './scheduler/scheduler.js';
import { AccountDeletionService } from './services/accountDeletionService.js';
import { DefaultNotificationService } from './services/notificationService.js';
import { SubscriptionLifecycleService } from './services/subscriptionLifecycleService.js';
import { SupabaseAccountCleanupGateway } from './services/supabaseAccountCleanupGateway.js';
import type { BotContext } from './types/context.js';
import { logger, normalizeError } from './utils/logger.js';
import { withRetry } from './utils/retry.js';

export const TELEGRAM_ALLOWED_UPDATES = [
  'message',
  'callback_query',
  'pre_checkout_query',
] as const;

export interface Application {
  env: AppEnv;
  bot: Telegraf<BotContext>;
  scheduler: Scheduler;
  server: Server;
  state: RuntimeState;
  start(): Promise<void>;
  shutdown(signal: string, exitCode?: number): Promise<void>;
}

export const createApplication = (env: AppEnv): Application => {
  const supabaseClient = getSupabaseAdminClient(env);
  const schedulerDependencies = supabaseClient
    ? (() => {
        const subscriptions = new SupabaseSubscriptionRepository(supabaseClient);
        const notificationsRepository = new SupabaseNotificationRepository(supabaseClient);
        return { client: supabaseClient, subscriptions, notificationsRepository };
      })()
    : undefined;
  const botRef: { current?: Telegraf<BotContext> } = {};
  const scheduler = schedulerDependencies
    ? (() => {
        const notificationService = new DefaultNotificationService(
          schedulerDependencies.notificationsRepository,
          {
            sendMessage: (...args) => {
              if (!botRef.current) throw new Error('Bot is not initialized');
              return botRef.current.telegram.sendMessage(...args);
            },
          },
          env,
          env.schedulerDryRun ?? false,
        );
        const lifecycle = new SubscriptionLifecycleService(
          schedulerDependencies.subscriptions,
          env.subscriptionRetentionDays ?? 60,
          env.deletionWarningHours ?? 24,
        );
        const deletion = new AccountDeletionService(
          schedulerDependencies.subscriptions,
          new SupabaseAccountCleanupGateway(schedulerDependencies.client),
          notificationService,
          env.schedulerDryRun ?? false,
        );
        return new SchedulerRunner(
          env,
          new SupabaseSchedulerLockGateway(schedulerDependencies.client),
          schedulerDependencies.subscriptions,
          lifecycle,
          notificationService,
          deletion,
        );
      })()
    : new NoopScheduler();

  const state: RuntimeState = {
    envValid: true,
    compositionReady: false,
    botReady: false,
    httpServerStarted: false,
    ready: false,
    shuttingDown: false,
    scheduler,
  };

  const bot = createBot(
    env,
    schedulerDependencies
      ? {
          scheduler,
          subscriptionLifecycleRepository: schedulerDependencies.subscriptions,
          notificationRepository: schedulerDependencies.notificationsRepository,
          systemStatus: {
            isReady: () => state.ready && !state.shuttingDown,
            supabaseClient: supabaseClient ?? undefined,
          },
        }
      : {
          scheduler,
          systemStatus: {
            isReady: () => state.ready && !state.shuttingDown,
            supabaseClient: supabaseClient ?? undefined,
          },
        },
  );
  botRef.current = bot;
  state.compositionReady = true;

  const server = createHttpServer({
    env,
    bot,
    state,
    supabaseClient: supabaseClient ?? undefined,
  });

  let pollingStarted = false;
  let serverStarted = false;
  let shutdownStarted = false;

  const application: Application = {
    env,
    bot,
    scheduler,
    server,
    state,
    async start() {
      try {
        await withRetry(() => bot.telegram.getMe(), {
          attempts: env.nodeEnv === 'production' ? 3 : 1,
          baseDelayMs: 250,
          maxDelayMs: 2_000,
          operation: 'telegram_get_me',
          logger,
        });
        state.botReady = true;

        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(env.port, env.host ?? '0.0.0.0', () => {
            server.off('error', reject);
            serverStarted = true;
            state.httpServerStarted = true;
            logger.info({ host: env.host ?? '0.0.0.0', port: env.port }, 'http_server_started');
            resolve();
          });
        });

        if (env.botMode === 'polling') {
          await bot.launch({ dropPendingUpdates: false });
          pollingStarted = true;
          logger.info('polling_started');
        } else {
          if (env.webhookAutoSetup ?? true) await configureWebhook(env, bot);
        }

        scheduler.start();
        state.ready = true;
        logger.info('application_ready');
      } catch (error) {
        state.ready = false;
        logger.fatal({ err: normalizeError(error) }, 'application_crashed');
        await application.shutdown('startup_failed', 1);
        throw error;
      }
    },
    async shutdown(signal, exitCode = 0) {
      if (shutdownStarted) return;
      shutdownStarted = true;
      state.shuttingDown = true;
      state.ready = false;
      logger.info({ signal }, 'graceful_shutdown_started');
      const timeout = setTimeout(
        () => {
          logger.fatal({ signal }, 'graceful_shutdown_hard_timeout');
          process.exit(exitCode || 1);
        },
        (env.shutdownTimeoutSeconds ?? 15) * 1000,
      );
      timeout.unref();

      try {
        scheduler.stop();
        if (pollingStarted) bot.stop(signal);
        if (serverStarted) await closeHttpServer(server);
        logger.info({ signal }, 'graceful_shutdown_completed');
      } catch (error) {
        logger.error({ err: normalizeError(error), signal }, 'graceful_shutdown_failed');
      } finally {
        clearTimeout(timeout);
      }
    },
  };

  return application;
};

export const configureWebhook = async (env: AppEnv, bot: Telegraf<BotContext>): Promise<void> => {
  const webhookUrl = buildWebhookUrl(env);
  await withRetry(
    () =>
      bot.telegram.setWebhook(webhookUrl, {
        ...(env.webhookSecret ? { secret_token: env.webhookSecret } : {}),
        allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
      }),
    {
      attempts: 3,
      baseDelayMs: 250,
      maxDelayMs: 2_000,
      operation: 'telegram_set_webhook',
      logger,
    },
  );
  logger.info(
    { webhookUrl: maskWebhookUrl(webhookUrl), allowedUpdates: TELEGRAM_ALLOWED_UPDATES },
    'webhook_configured',
  );
};
