import { CANCEL_BUTTON_TEXT, MENU_BUTTONS } from '../config/constants.js';
import type { AppEnv } from '../config/env.js';
import type { CouponService } from '../services/couponService.js';
import type { ConversationStore } from '../state/conversationState.js';
import type { BotContext } from '../types/context.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenuKeyboard.js';
import { MESSAGES } from '../utils/messages.js';
import {
  handleActivateCoupon,
  handleBuyAccess,
  handleFeatures,
  handleInstallation,
  handleMyAccess,
  handleRestoreAccess,
  handleSupport,
  handleTerms,
} from './menuHandlers.js';
import { handleUnknownMessage } from './unknownHandler.js';

export const getTextMessage = (ctx: BotContext): string | undefined => {
  const message = ctx.message;
  if (!message || !('text' in message)) return undefined;
  return message.text;
};

export const handleTextMessage = async (
  ctx: BotContext,
  dependencies: {
    env: AppEnv;
    conversationStore: ConversationStore;
    couponService: CouponService;
  },
): Promise<void> => {
  const text = getTextMessage(ctx);
  if (!text) return;

  const telegramId = ctx.state.user?.telegramId;

  if (text === CANCEL_BUTTON_TEXT) {
    if (telegramId) await dependencies.conversationStore.clear(telegramId);
    await ctx.reply(MESSAGES.cancelled, createMainMenuKeyboard());
    return;
  }

  if (telegramId) {
    const state = await dependencies.conversationStore.get(telegramId);
    if (state?.name === 'awaiting_coupon') {
      await dependencies.conversationStore.clear(telegramId);
      await dependencies.couponService.redeem(text.trim(), telegramId);
      await ctx.reply(MESSAGES.couponNotConfigured, createMainMenuKeyboard());
      return;
    }
  }

  switch (text) {
    case MENU_BUTTONS.buyAccess:
      await handleBuyAccess(ctx);
      return;
    case MENU_BUTTONS.myAccess:
      await handleMyAccess(ctx);
      return;
    case MENU_BUTTONS.activateCoupon:
      await handleActivateCoupon(ctx, dependencies.conversationStore);
      return;
    case MENU_BUTTONS.restoreAccess:
      await handleRestoreAccess(ctx);
      return;
    case MENU_BUTTONS.features:
      await handleFeatures(ctx);
      return;
    case MENU_BUTTONS.installation:
      await handleInstallation(ctx, dependencies.env);
      return;
    case MENU_BUTTONS.terms:
      await handleTerms(ctx);
      return;
    case MENU_BUTTONS.support:
      await handleSupport(ctx, dependencies.env);
      return;
    default:
      await handleUnknownMessage(ctx);
  }
};
