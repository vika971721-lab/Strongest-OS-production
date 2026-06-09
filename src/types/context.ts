import type { Context } from 'telegraf';

export interface TelegramUserContext {
  telegramId: string;
  chatId?: string | undefined;
  username?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  languageCode?: string | undefined;
}

export interface BotState {
  user?: TelegramUserContext | undefined;
}

export interface BotContext extends Context {
  state: BotState;
}
