import type { Context } from 'telegraf';

export interface TelegramUserContext {
  telegramId: string;
  chatId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
}

export interface BotState {
  user?: TelegramUserContext;
}

export interface BotContext extends Context {
  state: BotState;
}
