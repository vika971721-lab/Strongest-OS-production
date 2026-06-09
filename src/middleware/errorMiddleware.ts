import type { MiddlewareFn } from 'telegraf';
import { MESSAGES } from '../utils/messages.js';
import { logger, normalizeError } from '../utils/logger.js';
import type { BotContext } from '../types/context.js';

export const errorMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    const safeError = normalizeError(error);
    logger.error(
      {
        err: safeError,
        updateType: ctx.updateType,
        telegramId: ctx.state.user?.telegramId,
      },
      'telegram_handler_error',
    );
    if (ctx.chat) {
      await ctx.reply(MESSAGES.temporaryError).catch((replyError: unknown) => {
        logger.error({ err: normalizeError(replyError) }, 'telegram_error_reply_failed');
      });
    }
  }
};
