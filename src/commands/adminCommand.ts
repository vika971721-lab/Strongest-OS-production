import type { AppEnv } from '../config/env.js';
import { isAdminContext } from '../middleware/adminGuard.js';
import type { BotContext } from '../types/context.js';
import { MESSAGES } from '../utils/messages.js';
import { createAdminKeyboard } from '../keyboards/adminKeyboard.js';

export const handleAdminCommand = async (ctx: BotContext, env: AppEnv): Promise<void> => {
  if (!isAdminContext(ctx, env.adminTelegramIds)) {
    await ctx.reply(MESSAGES.adminForbidden);
    return;
  }
  await ctx.reply(MESSAGES.adminReady, createAdminKeyboard());
};
