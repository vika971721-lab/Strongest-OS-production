import type { BotContext } from '../types/context.js';
import type { ConversationStore } from '../state/conversationState.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenuKeyboard.js';
import { MESSAGES } from '../utils/messages.js';

export const handleStartCommand = async (
  ctx: BotContext,
  conversationStore: ConversationStore,
): Promise<void> => {
  const telegramId = ctx.state.user?.telegramId;
  if (telegramId) await conversationStore.clear(telegramId);
  await ctx.reply(MESSAGES.welcome, createMainMenuKeyboard());
};
