import { CANCEL_BUTTON_TEXT, MENU_BUTTONS } from '../config/constants.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenuKeyboard.js';
import { requirePrivateChat } from '../middleware/privateChat.js';
import type { CouponService } from '../services/couponService.js';
import { isConversationExpired } from '../state/conversationState.js';
import type { BotContext } from '../types/context.js';
import { logger } from '../utils/logger.js';
import { MESSAGES } from '../utils/messages.js';
import {
  handleAccessScreen,
  handleCouponStart,
  handleFeatures,
  handleInstallation,
  handleMainMenu,
  handlePasswordRecovery,
  handlePlanScreen,
  handleSupport,
  handleTerms,
  type UiDependencies,
} from './menuHandlers.js';
import { handleUnknownMessage } from './unknownHandler.js';

export const getTextMessage = (ctx: BotContext): string | undefined => {
  const message = ctx.message;
  if (!message || !('text' in message)) return undefined;
  return message.text;
};

export const handleTextMessage = async (
  ctx: BotContext,
  dependencies: UiDependencies & { couponService: CouponService },
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
      if (!(await requirePrivateChat(ctx))) return;
      await dependencies.conversationStore.clear(telegramId);
      if (isConversationExpired(state)) {
        await ctx.reply(
          'Время ввода промокода истекло. Попробуйте начать заново.',
          createMainMenuKeyboard(),
        );
        return;
      }
      logger.info({ telegramId }, 'coupon_code_received');
      await ctx.reply(MESSAGES.couponNotConfigured, createMainMenuKeyboard());
      return;
    }
  }

  switch (text) {
    case '/menu':
      await handleMainMenu(ctx, dependencies);
      return;
    case '/status':
      await handleAccessScreen(ctx, dependencies);
      return;
    case MENU_BUTTONS.buyAccess:
      await handlePlanScreen(ctx, dependencies);
      return;
    case MENU_BUTTONS.myAccess:
      await handleAccessScreen(ctx, dependencies);
      return;
    case MENU_BUTTONS.activateCoupon:
      await handleCouponStart(ctx, dependencies);
      return;
    case MENU_BUTTONS.restoreAccess:
      await handlePasswordRecovery(ctx, dependencies);
      return;
    case MENU_BUTTONS.features:
      await handleFeatures(ctx, dependencies);
      return;
    case MENU_BUTTONS.installation:
      await handleInstallation(ctx, dependencies);
      return;
    case MENU_BUTTONS.terms:
      await handleTerms(ctx);
      return;
    case MENU_BUTTONS.support:
      await handleSupport(ctx, dependencies);
      return;
    default:
      await handleUnknownMessage(ctx);
  }
};
