import { CANCEL_BUTTON_TEXT, MENU_BUTTONS, MENU_BUTTON_ALIASES } from '../config/constants.js';
import {
  createCouponRetryKeyboard,
  createCouponStartMainKeyboard,
  createCouponSuccessKeyboard,
} from '../keyboards/inlineKeyboards.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenuKeyboard.js';
import { requirePrivateChat } from '../middleware/privateChat.js';
import {
  CouponAttemptLimiter,
  appUrlForCoupon,
  type CouponService,
} from '../services/couponService.js';
import { isConversationExpired } from '../state/conversationState.js';
import type { BotContext } from '../types/context.js';
import { normalizeCouponCode, safeCouponLogData } from '../utils/couponCodes.js';
import { logger } from '../utils/logger.js';
import {
  MESSAGES,
  buildCouponAlreadyRedeemedByUserMessage,
  buildCouponNewAccountSuccessMessage,
  buildCouponSuccessMessage,
} from '../utils/messages.js';
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

const defaultCouponLimiter = new CouponAttemptLimiter();

export const getTextMessage = (ctx: BotContext): string | undefined => {
  const message = ctx.message;
  if (!message || !('text' in message)) return undefined;
  return message.text;
};

export const handleTextMessage = async (
  ctx: BotContext,
  dependencies: UiDependencies & {
    couponService: CouponService;
    couponAttemptLimiter?: CouponAttemptLimiter;
  },
): Promise<void> => {
  const text = getTextMessage(ctx);
  if (!text) return;

  const telegramId = ctx.state.user?.telegramId;

  if (text === CANCEL_BUTTON_TEXT || text === 'Отмена') {
    if (telegramId) await dependencies.conversationStore.clear(telegramId);
    await ctx.reply(MESSAGES.cancelled, createMainMenuKeyboard());
    return;
  }

  if (telegramId) {
    const state = await dependencies.conversationStore.get(telegramId);
    if (state?.name === 'awaiting_coupon') {
      const menuButtonValues = new Set<string>([
        ...Object.values(MENU_BUTTONS),
        ...Object.keys(MENU_BUTTON_ALIASES),
      ]);
      if (menuButtonValues.has(text)) {
        await dependencies.conversationStore.clear(telegramId);
        // fall through to menu button handling below
      } else {
        if (!(await requirePrivateChat(ctx))) return;
        await dependencies.conversationStore.clear(telegramId);
        if (isConversationExpired(state)) {
          await ctx.reply(
            'Время ожидания закончилось. Нажми “🎟 Промокод” и попробуй снова.',
            createMainMenuKeyboard(),
          );
          return;
        }

        const normalized = normalizeCouponCode(text);
        if (!normalized.ok) {
          await ctx.reply(MESSAGES.couponInvalidInput, createMainMenuKeyboard());
          return;
        }
        const limiter = dependencies.couponAttemptLimiter ?? defaultCouponLimiter;
        if (limiter.isLimited(telegramId)) {
          await ctx.reply(MESSAGES.couponTooManyAttempts, createMainMenuKeyboard());
          return;
        }
        logger.info({ telegramId, ...safeCouponLogData(normalized.code) }, 'coupon_code_received');
        const result =
          (await dependencies.couponService.redeem(normalized.code, telegramId)) ??
          ({ status: 'temporary_error' } as const);
        if (result.status === 'success') {
          limiter.clear(telegramId);
          const keyboard = createCouponSuccessKeyboard(dependencies.env.appUrl);
          if (result.credentials) {
            await ctx.reply(
              buildCouponNewAccountSuccessMessage({
                days: result.durationDays ?? 0,
                expiresAt: result.expiresAt,
                timeZone: dependencies.env.displayTimezone,
                appUrl: appUrlForCoupon(dependencies.env),
                loginEmail: result.credentials.loginEmail,
                password: result.credentials.password,
              }),
              keyboard,
            );
            return;
          }
          await ctx.reply(
            buildCouponSuccessMessage(
              result.durationDays ?? 0,
              result.expiresAt,
              dependencies.env.displayTimezone,
            ),
            keyboard,
          );
          return;
        }

        limiter.recordFailure(telegramId);
        if (result.status === 'already_redeemed' && result.redeemedByTelegramId === telegramId) {
          await ctx.reply(
            buildCouponAlreadyRedeemedByUserMessage(
              result.expiresAt,
              dependencies.env.displayTimezone,
            ),
            createMainMenuKeyboard(),
          );
          return;
        }
        const replyByStatus: Record<typeof result.status, string> = {
          not_found: 'Промокод не найден.\n\nПроверь код и отправь ещё раз одним сообщением.',
          already_redeemed:
            'Этот промокод уже использован.\n\nДоступ получил пользователь, который активировал код первым.',
          expired:
            'Срок действия промокода закончился.\n\nМожно выбрать тариф и открыть доступ через Telegram Stars.',
          cancelled: 'Этот промокод отменён и больше не работает.',
          invalid_duration: 'Не удалось активировать промокод. Обратись в поддержку.',
          subscription_not_found: 'Не удалось активировать промокод. Обратись в поддержку.',
          banned: '⛔ Активация промокода недоступна — аккаунт ограничен. Обратись в поддержку.',
          deleted: 'Данные аккаунта удалены. Обратись в поддержку.',
          temporary_error: MESSAGES.couponNotConfigured,
        };
        const retryStatuses = ['not_found'] as const;
        const startStatuses = ['already_redeemed', 'expired', 'cancelled'] as const;
        const keyboard = retryStatuses.includes(result.status as 'not_found')
          ? createCouponRetryKeyboard()
          : startStatuses.includes(result.status as 'already_redeemed' | 'expired' | 'cancelled')
            ? createCouponStartMainKeyboard()
            : createMainMenuKeyboard();
        await ctx.reply(replyByStatus[result.status], keyboard);
        return;
      }
    }
  }

  const menuText = MENU_BUTTON_ALIASES[text] ? MENU_BUTTONS[MENU_BUTTON_ALIASES[text]] : text;

  switch (menuText) {
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
