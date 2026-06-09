import type { TelegramAdminId } from '../config/env.js';
import type { BotContext } from '../types/context.js';

export const isAdminTelegramId = (
  telegramId: string | undefined,
  adminTelegramIds: readonly TelegramAdminId[],
): boolean => Boolean(telegramId && adminTelegramIds.includes(telegramId));

export const isAdminContext = (
  ctx: BotContext,
  adminTelegramIds: readonly TelegramAdminId[],
): boolean => isAdminTelegramId(ctx.state.user?.telegramId, adminTelegramIds);
