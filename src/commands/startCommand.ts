import { createMainMenuKeyboard } from '../keyboards/mainMenuKeyboard.js';
import { requirePrivateChat } from '../middleware/privateChat.js';
import type { ConversationStore } from '../state/conversationState.js';
import type { AccessStateProvider } from '../types/accessState.js';
import type { BotContext } from '../types/context.js';
import { buildWelcomeMessage } from '../utils/messages.js';

export const handleStartCommand = async (
  ctx: BotContext,
  conversationStore: ConversationStore,
  accessStateProvider?: AccessStateProvider,
): Promise<void> => {
  if (!(await requirePrivateChat(ctx))) return;
  const telegramId = ctx.state.user?.telegramId;
  if (telegramId) await conversationStore.clear(telegramId);
  const state =
    accessStateProvider && telegramId
      ? await accessStateProvider.getUserAccessState(telegramId)
      : {
          kind: 'telegram_registered' as const,
          telegramId: telegramId ?? 'unknown',
          trialUsed: false,
        };
  await ctx.reply(buildWelcomeMessage(state), createMainMenuKeyboard());
};
