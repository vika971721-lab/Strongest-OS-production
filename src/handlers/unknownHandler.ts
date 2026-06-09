import type { BotContext } from '../types/context.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenuKeyboard.js';
import { MESSAGES } from '../utils/messages.js';

export const handleUnknownMessage = async (ctx: BotContext): Promise<void> => {
  if (!ctx.message || !('text' in ctx.message)) return;
  await ctx.reply(MESSAGES.unknown, createMainMenuKeyboard());
};
