import { Telegraf } from 'telegraf';
import type { AppEnv } from './config/env.js';
import { handleAdminCommand } from './commands/adminCommand.js';
import { handleStartCommand } from './commands/startCommand.js';
import { handleCallbackQuery } from './handlers/callbackHandlers.js';
import { handleTextMessage } from './handlers/textHandler.js';
import { handleUnknownMessage } from './handlers/unknownHandler.js';
import {
  callbackRateLimitMiddleware,
  InMemoryCallbackRateLimiter,
} from './middleware/rateLimitMiddleware.js';
import { errorMiddleware } from './middleware/errorMiddleware.js';
import { userContextMiddleware } from './middleware/userContextMiddleware.js';
import { MockPaymentProvider } from './payments/mockPaymentProvider.js';
import { DefaultPaymentService } from './services/paymentService.js';
import { MockCouponService } from './services/couponService.js';
import { InMemoryConversationStore } from './state/inMemoryConversationStore.js';
import type { BotContext } from './types/context.js';
import { logger, normalizeError } from './utils/logger.js';
import { MESSAGES } from './utils/messages.js';

export interface BotDependencies {
  conversationStore?: InMemoryConversationStore;
  callbackRateLimiter?: InMemoryCallbackRateLimiter;
  paymentService?: DefaultPaymentService;
  couponService?: MockCouponService;
}

export const createBot = (
  env: AppEnv,
  dependencies: BotDependencies = {},
): Telegraf<BotContext> => {
  if (!env.botToken) throw new Error('Missing required configuration: BOT_TOKEN');

  const bot = new Telegraf<BotContext>(env.botToken);
  const conversationStore = dependencies.conversationStore ?? new InMemoryConversationStore();
  const callbackRateLimiter = dependencies.callbackRateLimiter ?? new InMemoryCallbackRateLimiter();
  const paymentService =
    dependencies.paymentService ?? new DefaultPaymentService(new MockPaymentProvider());
  const couponService = dependencies.couponService ?? new MockCouponService();

  bot.use(errorMiddleware());
  bot.use(userContextMiddleware());
  bot.use(async (ctx, next) => {
    logger.info(
      { updateType: ctx.updateType, telegramId: ctx.state.user?.telegramId },
      'telegram_update_received',
    );
    await next();
  });
  bot.use(callbackRateLimitMiddleware(callbackRateLimiter));

  bot.start(async (ctx) => handleStartCommand(ctx, conversationStore));
  bot.command('admin', async (ctx) => handleAdminCommand(ctx, env));
  bot.on('callback_query', async (ctx) => handleCallbackQuery(ctx, paymentService));
  bot.on('text', async (ctx) => handleTextMessage(ctx, { env, conversationStore, couponService }));
  bot.on('message', async (ctx) => handleUnknownMessage(ctx));

  bot.catch((error, ctx) => {
    const safeError = normalizeError(error);
    logger.error(
      { err: safeError, updateType: ctx.updateType, telegramId: ctx.state.user?.telegramId },
      'telegraf_catch',
    );
    if (ctx.chat) {
      void ctx.reply(MESSAGES.temporaryError).catch((replyError: unknown) => {
        logger.error({ err: normalizeError(replyError) }, 'telegraf_catch_reply_failed');
      });
    }
  });

  return bot;
};
