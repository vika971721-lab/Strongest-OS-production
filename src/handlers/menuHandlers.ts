import type { AppEnv } from '../config/env.js';
import { createMainMenuKeyboard } from '../keyboards/mainMenuKeyboard.js';
import {
  createAccessKeyboard,
  createCouponCancelKeyboard,
  createFeaturesKeyboard,
  createInstallationKeyboard,
  createPasswordRecoveryKeyboard,
  createPlanKeyboard,
  createRetryKeyboard,
  createSupportKeyboard,
  createTermsKeyboard,
} from '../keyboards/inlineKeyboards.js';
import { requirePrivateChat } from '../middleware/privateChat.js';
import type { AccountService } from '../services/accountService.js';
import type { PaymentEventRepository } from '../repositories/paymentEventRepository.js';
import type { PaymentOrderRepository } from '../repositories/paymentOrderRepository.js';
import type { PaymentAccessGateway } from '../services/paymentFlow.js';
import { createAwaitingCouponState, type ConversationStore } from '../state/conversationState.js';
import type { AccessStateProvider } from '../types/accessState.js';
import type { BotContext } from '../types/context.js';
import { logger } from '../utils/logger.js';
import {
  buildAccessMessage,
  buildAndroidInstallationMessage,
  buildCouponPromptMessage,
  buildDesktopInstallationMessage,
  buildFeaturesMessage,
  buildInstallationMessage,
  buildIphoneInstallationMessage,
  buildPasswordRecoveryMessage,
  buildPlanMessage,
  buildPrivacyMessage,
  buildSupportMessage,
  buildTermsMessage,
  MESSAGES,
} from '../utils/messages.js';
import { createSupportLink } from '../utils/telegram.js';

export interface UiDependencies {
  env: AppEnv;
  conversationStore: ConversationStore;
  accessStateProvider: AccessStateProvider;
  accountService: AccountService;
  paymentOrderRepository?: PaymentOrderRepository;
  paymentEventRepository?: PaymentEventRepository;
  paymentAccessGateway?: PaymentAccessGateway;
}

const telegramIdFromContext = (ctx: BotContext): string | undefined => ctx.state.user?.telegramId;

export const handleMainMenu = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  const telegramId = telegramIdFromContext(ctx);
  if (telegramId) await deps.conversationStore.clear(telegramId);
  logger.info({ telegramId }, 'menu_opened');
  await ctx.reply('Главное меню Strongest OS.', createMainMenuKeyboard());
};

export const handlePlanScreen = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  if (!(await requirePrivateChat(ctx))) return;
  const telegramId = telegramIdFromContext(ctx);
  if (!telegramId) return;
  logger.info({ telegramId }, 'plan_screen_opened');
  const state = await deps.accessStateProvider.getUserAccessState(telegramId);
  const canPay = ![
    'banned',
    'deleted',
    'broken_link',
    'unknown_status',
    'temporarily_unavailable',
  ].includes(state.kind);
  const keyboard =
    state.kind === 'temporarily_unavailable' ? createRetryKeyboard() : createPlanKeyboard(canPay);
  await ctx.reply(buildPlanMessage(state, deps.env.pricing), keyboard);
};

export const handleAccessScreen = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  if (!(await requirePrivateChat(ctx))) return;
  const telegramId = telegramIdFromContext(ctx);
  if (!telegramId) return;
  logger.info({ telegramId }, 'access_screen_opened');
  const state = await deps.accessStateProvider.getUserAccessState(telegramId);
  const keyboard =
    state.kind === 'temporarily_unavailable'
      ? createRetryKeyboard()
      : createAccessKeyboard(state.kind, deps.env.appUrl);
  await ctx.reply(buildAccessMessage(state, deps.env.displayTimezone), keyboard);
};

export const handleCouponStart = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  if (!(await requirePrivateChat(ctx))) return;
  const telegramId = telegramIdFromContext(ctx);
  if (!telegramId) return;
  const state = await deps.accessStateProvider.getUserAccessState(telegramId);
  if (state.kind === 'banned') {
    await ctx.reply(
      '⛔ Активация промокода недоступна — аккаунт ограничен.\n\nОбратись в поддержку.',
      createSupportKeyboard(deps.env.supportUsername),
    );
    return;
  }
  if (state.kind === 'deleted') {
    await ctx.reply(
      'Данные аккаунта удалены.\n\nОбратись в поддержку.',
      createSupportKeyboard(deps.env.supportUsername),
    );
    return;
  }
  await deps.conversationStore.set(telegramId, createAwaitingCouponState());
  logger.info({ telegramId }, 'coupon_flow_started');
  await ctx.reply(buildCouponPromptMessage(), createCouponCancelKeyboard());
};

export const handleCouponCancel = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  const telegramId = telegramIdFromContext(ctx);
  if (telegramId) await deps.conversationStore.clear(telegramId);
  logger.info({ telegramId }, 'coupon_flow_cancelled');
  await ctx.reply(MESSAGES.cancelled, createMainMenuKeyboard());
};

export const handlePasswordRecovery = async (
  ctx: BotContext,
  deps: UiDependencies,
): Promise<void> => {
  if (!(await requirePrivateChat(ctx, MESSAGES.passwordPrivateOnly))) return;
  const telegramId = telegramIdFromContext(ctx);
  if (!telegramId) return;
  logger.info({ telegramId }, 'password_recovery_opened');
  const state = await deps.accessStateProvider.getUserAccessState(telegramId);
  const allowReset = [
    'account_pending',
    'active',
    'expired',
    'cancelled',
    'marked_for_deletion',
    'banned',
  ].includes(state.kind);
  await ctx.reply(
    buildPasswordRecoveryMessage(state),
    allowReset ? createPasswordRecoveryKeyboard() : createSupportKeyboard(deps.env.supportUsername),
  );
};

export const handleFeatures = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  logger.info({ telegramId: telegramIdFromContext(ctx) }, 'features_opened');
  await ctx.reply(buildFeaturesMessage(), createFeaturesKeyboard(deps.env.appUrl));
};

export const handleInstallation = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  logger.info(
    { telegramId: telegramIdFromContext(ctx), hasAppUrl: Boolean(deps.env.appUrl) },
    'installation_opened',
  );
  const suffix = deps.env.appUrl ? '' : '\n\nАдрес Strongest OS временно не настроен.';
  await ctx.reply(
    `${buildInstallationMessage()}${suffix}`,
    createInstallationKeyboard(deps.env.appUrl),
  );
};

export const handleInstallationAndroid = async (ctx: BotContext): Promise<void> => {
  await ctx.reply(buildAndroidInstallationMessage());
};

export const handleInstallationIos = async (ctx: BotContext): Promise<void> => {
  await ctx.reply(buildIphoneInstallationMessage());
};

export const handleInstallationDesktop = async (ctx: BotContext): Promise<void> => {
  await ctx.reply(buildDesktopInstallationMessage());
};

export const handleTerms = async (ctx: BotContext): Promise<void> => {
  logger.info({ telegramId: telegramIdFromContext(ctx) }, 'terms_opened');
  await ctx.reply(buildTermsMessage(), createTermsKeyboard());
};

export const handlePrivacy = async (ctx: BotContext): Promise<void> => {
  logger.info({ telegramId: telegramIdFromContext(ctx) }, 'privacy_opened');
  await ctx.reply(buildPrivacyMessage());
};

export const handleSupport = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  const supportLink = createSupportLink(deps.env.supportUsername);
  logger.info(
    { telegramId: telegramIdFromContext(ctx), configured: Boolean(supportLink) },
    'support_opened',
  );
  await ctx.reply(
    buildSupportMessage(Boolean(supportLink)),
    createSupportKeyboard(deps.env.supportUsername),
  );
};
