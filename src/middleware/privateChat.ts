import { Markup } from 'telegraf';
import type { BotContext } from '../types/context.js';
import { MESSAGES } from '../utils/messages.js';

export const isPrivateChat = (ctx: BotContext): boolean => {
  const chat = ctx.chat as { type?: string } | undefined;
  return chat?.type === 'private';
};

export const requirePrivateChat = async (ctx: BotContext): Promise<boolean> => {
  if (isPrivateChat(ctx)) return true;
  const username = ctx.botInfo?.username;
  const keyboard = username
    ? Markup.inlineKeyboard([[Markup.button.url('Открыть личный чат', `https://t.me/${username}`)]])
    : undefined;
  await ctx.reply(MESSAGES.privateChatRequired, keyboard);
  return false;
};
