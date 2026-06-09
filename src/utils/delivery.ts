import type { BotContext } from '../types/context.js';
import { logger, normalizeError } from './logger.js';

export type DeliveryResult = 'sent' | 'edited' | 'not_modified' | 'delivery_failed';

const isBlockedByUser = (error: unknown): boolean =>
  error instanceof Error && error.message.toLowerCase().includes('bot was blocked by the user');

const isNotModified = (error: unknown): boolean =>
  error instanceof Error && error.message.toLowerCase().includes('message is not modified');

export const safeReply = async (
  ctx: BotContext,
  text: string,
  extra?: Parameters<BotContext['reply']>[1],
): Promise<DeliveryResult> => {
  try {
    await ctx.reply(text, extra);
    return 'sent';
  } catch (error) {
    if (isBlockedByUser(error)) {
      logger.warn({ telegramId: ctx.state.user?.telegramId }, 'delivery_failed_bot_blocked');
      return 'delivery_failed';
    }
    throw error;
  }
};

export const editOrReply = async (
  ctx: BotContext,
  text: string,
  extra?: Parameters<BotContext['editMessageText']>[1],
): Promise<DeliveryResult> => {
  if (typeof ctx.editMessageText === 'function' && ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra });
      return 'edited';
    } catch (error) {
      if (isNotModified(error)) return 'not_modified';
      logger.warn(
        { err: normalizeError(error), telegramId: ctx.state.user?.telegramId },
        'edit_message_failed',
      );
    }
  }
  return safeReply(ctx, text, extra);
};
