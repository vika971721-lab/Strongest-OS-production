import { createMainMenuKeyboard } from '../keyboards/mainMenuKeyboard.js';
import { isAdminContext } from '../middleware/adminGuard.js';
import type { UiDependencies } from '../handlers/menuHandlers.js';
import type { BotContext } from '../types/context.js';
import { buildHelpMessage, MESSAGES } from '../utils/messages.js';
import { handleAccessScreen } from '../handlers/menuHandlers.js';

export const handleMenuCommand = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  const telegramId = ctx.state.user?.telegramId;
  if (telegramId) await deps.conversationStore.clear(telegramId);
  await ctx.reply('Главное меню.', createMainMenuKeyboard());
};

export const handleStatusCommand = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  await handleAccessScreen(ctx, deps);
};

export const handleHelpCommand = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  await ctx.reply(buildHelpMessage(isAdminContext(ctx, deps.env.adminTelegramIds)));
};

export const handleCancelCommand = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  const telegramId = ctx.state.user?.telegramId;
  const state = telegramId ? await deps.conversationStore.get(telegramId) : undefined;
  if (telegramId) await deps.conversationStore.clear(telegramId);
  await ctx.reply(state ? MESSAGES.cancelled : MESSAGES.noActiveAction, createMainMenuKeyboard());
};
