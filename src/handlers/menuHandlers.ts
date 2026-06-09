import { Markup } from 'telegraf';
import { CALLBACK_DATA } from '../config/constants.js';
import type { AppEnv } from '../config/env.js';
import { createCancellationKeyboard } from '../keyboards/cancellationKeyboard.js';
import { createInstallationKeyboard } from '../keyboards/installationKeyboard.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenuKeyboard.js';
import { createAwaitingCouponState, type ConversationStore } from '../state/conversationState.js';
import type { BotContext } from '../types/context.js';
import { MESSAGES } from '../utils/messages.js';
import { createSupportLink } from '../utils/telegram.js';

export const handleBuyAccess = async (ctx: BotContext): Promise<void> => {
  await ctx.reply(
    MESSAGES.buyAccess,
    Markup.inlineKeyboard([[Markup.button.callback('Тестовая оплата', CALLBACK_DATA.testPayment)]]),
  );
};

export const handleMyAccess = async (ctx: BotContext): Promise<void> => {
  await ctx.reply(MESSAGES.myAccess, createMainMenuKeyboard());
};

export const handleActivateCoupon = async (
  ctx: BotContext,
  conversationStore: ConversationStore,
): Promise<void> => {
  const telegramId = ctx.state.user?.telegramId;
  if (telegramId) await conversationStore.set(telegramId, createAwaitingCouponState());
  await ctx.reply(MESSAGES.couponPrompt, createCancellationKeyboard());
};

export const handleRestoreAccess = async (ctx: BotContext): Promise<void> => {
  await ctx.reply(MESSAGES.restoreAccess, createMainMenuKeyboard());
};

export const handleFeatures = async (ctx: BotContext): Promise<void> => {
  await ctx.reply(MESSAGES.features, createMainMenuKeyboard());
};

export const handleInstallation = async (ctx: BotContext, env: AppEnv): Promise<void> => {
  const message = env.appUrl
    ? MESSAGES.installation
    : `${MESSAGES.installation}\n\n${MESSAGES.appUrlMissing}`;
  await ctx.reply(message, createInstallationKeyboard(env.appUrl));
};

export const handleTerms = async (ctx: BotContext): Promise<void> => {
  await ctx.reply(MESSAGES.terms, createMainMenuKeyboard());
};

export const handleSupport = async (ctx: BotContext, env: AppEnv): Promise<void> => {
  const supportLink = createSupportLink(env.supportUsername);
  if (!supportLink) {
    await ctx.reply(MESSAGES.supportMissing, createMainMenuKeyboard());
    return;
  }

  await ctx.reply(
    MESSAGES.supportReady,
    Markup.inlineKeyboard([[Markup.button.url('Написать в поддержку', supportLink)]]),
  );
};
