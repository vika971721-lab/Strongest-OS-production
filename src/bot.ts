import { Telegraf } from 'telegraf';
import type { AppEnv } from './config/env.js';
import { PUBLIC_BOT_COMMANDS } from './config/constants.js';
import { handleAdminCommand } from './commands/adminCommand.js';
import { handleAdminPreviewStatusCommand } from './commands/adminPreviewStatusCommand.js';
import { handleStartCommand } from './commands/startCommand.js';
import {
  handleCancelCommand,
  handleHelpCommand,
  handleMenuCommand,
  handleStatusCommand,
} from './commands/userCommands.js';
import { handleCallbackQuery } from './handlers/callbackHandlers.js';
import { handleTextMessage } from './handlers/textHandler.js';
import { handleUnknownMessage } from './handlers/unknownHandler.js';
import {
  callbackRateLimitMiddleware,
  InMemoryCallbackRateLimiter,
} from './middleware/rateLimitMiddleware.js';
import { errorMiddleware } from './middleware/errorMiddleware.js';
import { userContextMiddleware } from './middleware/userContextMiddleware.js';
import { MockCouponService } from './services/couponService.js';
import { MockAccountService, type AccountService } from './services/accountService.js';
import { DefaultAccessStateService } from './services/accessStateService.js';
import { InMemoryConversationStore } from './state/inMemoryConversationStore.js';
import type { AccessStateProvider } from './types/accessState.js';
import type { BotContext } from './types/context.js';
import { logger, normalizeError } from './utils/logger.js';
import { MESSAGES } from './utils/messages.js';

export interface BotDependencies {
  conversationStore?: InMemoryConversationStore;
  callbackRateLimiter?: InMemoryCallbackRateLimiter;
  couponService?: MockCouponService;
  accountService?: AccountService;
  accessStateProvider?: AccessStateProvider;
}

export const createBot = (
  env: AppEnv,
  dependencies: BotDependencies = {},
): Telegraf<BotContext> => {
  if (!env.botToken) throw new Error('Missing required configuration: BOT_TOKEN');

  const bot = new Telegraf<BotContext>(env.botToken);
  const conversationStore = dependencies.conversationStore ?? new InMemoryConversationStore();
  const callbackRateLimiter = dependencies.callbackRateLimiter ?? new InMemoryCallbackRateLimiter();
  const couponService = dependencies.couponService ?? new MockCouponService();
  const accountService = dependencies.accountService ?? new MockAccountService();
  const accessStateProvider = dependencies.accessStateProvider ?? new DefaultAccessStateService();
  const uiDeps = { env, conversationStore, accessStateProvider, accountService };

  bot.use(errorMiddleware());

  bot.use(async (ctx, next) => {
    const originalReply = ctx.reply.bind(ctx);
    ctx.reply = (text, extra) => originalReply(text, { parse_mode: 'HTML', ...extra });
    await next();
  });
  bot.use(userContextMiddleware());
  bot.use(async (ctx, next) => {
    logger.info(
      { updateType: ctx.updateType, telegramId: ctx.state.user?.telegramId },
      'telegram_update_received',
    );
    await next();
  });
  bot.use(callbackRateLimitMiddleware(callbackRateLimiter));

  if (env.nodeEnv === 'development') {
    void bot.telegram.setMyCommands([...PUBLIC_BOT_COMMANDS]).catch((error: unknown) => {
      logger.warn({ err: normalizeError(error) }, 'set_my_commands_failed');
    });
  }

  bot.start(async (ctx) => handleStartCommand(ctx, conversationStore, accessStateProvider));
  bot.command('menu', async (ctx) => handleMenuCommand(ctx, uiDeps));
  bot.command('status', async (ctx) => handleStatusCommand(ctx, uiDeps));
  bot.command('help', async (ctx) => handleHelpCommand(ctx, uiDeps));
  bot.command('cancel', async (ctx) => handleCancelCommand(ctx, uiDeps));
  bot.command('admin', async (ctx) => handleAdminCommand(ctx, env));
  bot.command('admin_preview_status', async (ctx) => handleAdminPreviewStatusCommand(ctx, env));
  bot.on('callback_query', async (ctx) => handleCallbackQuery(ctx, uiDeps));
  bot.on('text', async (ctx) => handleTextMessage(ctx, { ...uiDeps, couponService }));
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
