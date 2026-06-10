import 'dotenv/config';
import { createBot } from './bot.js';
import { parseEnv, toSafeEnvLogData } from './config/env.js';
import { getSupabaseAdminClient } from './integrations/supabaseAdmin.js';
import { SupabaseNotificationRepository } from './repositories/notificationRepository.js';
import { SupabaseSubscriptionRepository } from './repositories/subscriptionRepository.js';
import {
  SchedulerRunner,
  SupabaseSchedulerLockGateway,
  NoopScheduler,
} from './scheduler/scheduler.js';
import { AccountDeletionService } from './services/accountDeletionService.js';
import { DefaultNotificationService } from './services/notificationService.js';
import { SubscriptionLifecycleService } from './services/subscriptionLifecycleService.js';
import { SupabaseAccountCleanupGateway } from './services/supabaseAccountCleanupGateway.js';
import { logger, normalizeError } from './utils/logger.js';

const env = parseEnv(process.env);
const supabaseClient = getSupabaseAdminClient(env);
const schedulerDependencies = supabaseClient
  ? (() => {
      const subscriptions = new SupabaseSubscriptionRepository(supabaseClient);
      const notificationsRepository = new SupabaseNotificationRepository(supabaseClient);
      return { client: supabaseClient, subscriptions, notificationsRepository };
    })()
  : undefined;
const botRef: { current?: ReturnType<typeof createBot> } = {};
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
const bot = createBot(
  env,
  schedulerDependencies
    ? {
        scheduler,
        subscriptionLifecycleRepository: schedulerDependencies.subscriptions,
        notificationRepository: schedulerDependencies.notificationsRepository,
      }
    : {},
);
botRef.current = bot;

let isShuttingDown = false;

const shutdown = (signal: NodeJS.Signals): void => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'graceful_shutdown_started');
  scheduler.stop();
  bot.stop(signal);
  logger.info({ signal }, 'graceful_shutdown_completed');
};

process.once('SIGINT', (signal) => {
  void shutdown(signal);
});
process.once('SIGTERM', (signal) => {
  void shutdown(signal);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: normalizeError(reason) }, 'unhandled_rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: normalizeError(error) }, 'uncaught_exception');
  process.exit(1);
});

logger.info({ env: toSafeEnvLogData(env) }, 'application_starting');

if (env.botMode !== 'polling') {
  throw new Error('Only BOT_MODE=polling is supported in this foundation stage');
}

await bot.launch({ dropPendingUpdates: false });
scheduler.start();
logger.info('bot_initialized_polling');
