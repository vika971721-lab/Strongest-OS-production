import type { Context } from 'telegraf';
import type { TelegramUserContext } from '../types/context.js';

interface TelegramFromLike {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

interface TelegramChatLike {
  id: number;
}

export const normalizeTelegramUserContext = (ctx: Context): TelegramUserContext | undefined => {
  const from = ctx.from as TelegramFromLike | undefined;
  if (!from) return undefined;
  const chat = ctx.chat as TelegramChatLike | undefined;

  const user: TelegramUserContext = {
    telegramId: String(from.id),
  };
  if (chat) user.chatId = String(chat.id);
  if (from.username) user.username = from.username;
  if (from.first_name) user.firstName = from.first_name;
  if (from.last_name) user.lastName = from.last_name;
  if (from.language_code) user.languageCode = from.language_code;
  return user;
};

export const normalizeSupportUsername = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const username = value.trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) return undefined;
  return username;
};

export const createSupportLink = (value: string | undefined): string | undefined => {
  const username = normalizeSupportUsername(value);
  return username ? `https://t.me/${username}` : undefined;
};
