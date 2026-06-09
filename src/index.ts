import 'dotenv/config';
import { createBot } from './bot.js';
import { parseEnv, toSafeEnvLogData } from './config/env.js';
import { getSupabaseAdminClient } from './integrations/supabaseAdmin.js';
import { logger, normalizeError } from './utils/logger.js';

const env = parseEnv(process.env);
const bot = createBot(env);
getSupabaseAdminClient(env);

let isShuttingDown = false;

const shutdown = (signal: NodeJS.Signals): void => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'graceful_shutdown_started');
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
logger.info('bot_initialized_polling');
