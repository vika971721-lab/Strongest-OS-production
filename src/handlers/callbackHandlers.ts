import { CALLBACK_DATA, type CallbackData } from '../config/constants.js';
import {
  createFeaturesKeyboard,
  createInstallationKeyboard,
  createPasswordCreatedKeyboard,
  createPlanConfirmKeyboard,
  createPlanKeyboard,
  createPlanSelectionKeyboard,
  createRetryKeyboard,
  createSupportKeyboard,
  createTermsKeyboard,
} from '../keyboards/inlineKeyboards.js';
import type { PaymentPlan } from '../types/payment.js';
import { getPlanConfig } from '../services/paymentFlow.js';
import { requirePrivateChat } from '../middleware/privateChat.js';
import type { BotContext } from '../types/context.js';
import { editOrReply } from '../utils/delivery.js';
import { logger } from '../utils/logger.js';
import {
  buildAndroidInstallationMessage,
  buildDesktopInstallationMessage,
  buildFeaturesMessage,
  buildInstallationMessage,
  buildIphoneInstallationMessage,
  buildPasswordCreatedMessage,
  buildPlanMessage,
  buildPrivacyMessage,
  buildSupportMessage,
  buildTermsMessage,
  MESSAGES,
} from '../utils/messages.js';
import { handleCreatePaymentInvoice, processPaymentEvent } from '../services/paymentFlow.js';
import { formatDateTime } from '../utils/dates.js';
import {
  handleAccessScreen,
  handleCouponCancel,
  handleCouponStart,
  handleMainMenu,
  handlePasswordRecovery,
  handleSupport,
  type UiDependencies,
} from './menuHandlers.js';

const callbackValues = new Set<string>(Object.values(CALLBACK_DATA));
const isCallbackData = (value: string): value is CallbackData => callbackValues.has(value);

export const handleCallbackQuery = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !('data' in callbackQuery)) return;
  const data = callbackQuery.data;
  await ctx.answerCbQuery();

  if (!isCallbackData(data)) {
    logger.warn({ telegramId: ctx.state.user?.telegramId }, 'unknown_callback_received');
    await editOrReply(ctx, MESSAGES.staleButton);
    return;
  }

  switch (data) {
    case CALLBACK_DATA.navMain:
      await handleMainMenu(ctx, deps);
      return;
    case CALLBACK_DATA.navAccess:
    case CALLBACK_DATA.navRetryAccess:
      await handleAccessScreen(ctx, deps);
      return;
    case CALLBACK_DATA.navPlans: {
      if (!(await requirePrivateChat(ctx))) return;
      const telegramId = ctx.state.user?.telegramId;
      if (!telegramId) return;
      const state = await deps.accessStateProvider.getUserAccessState(telegramId);
      const blocked = [
        'banned',
        'deleted',
        'broken_link',
        'unknown_status',
        'temporarily_unavailable',
      ].includes(state.kind);
      const keyboard = blocked
        ? state.kind === 'temporarily_unavailable'
          ? createRetryKeyboard()
          : createPlanKeyboard(false)
        : createPlanSelectionKeyboard(
            'trialUsed' in state ? state.trialUsed : false,
            deps.env.pricing,
          );
      await editOrReply(ctx, buildPlanMessage(state, deps.env.pricing), keyboard);
      return;
    }
    case CALLBACK_DATA.planMonthly: {
      if (!(await requirePrivateChat(ctx))) return;
      const telegramId = ctx.state.user?.telegramId;
      if (!telegramId) return;
      const state = await deps.accessStateProvider.getUserAccessState(telegramId);
      const plan: PaymentPlan =
        'trialUsed' in state && state.trialUsed ? 'monthly_renewal' : 'first_month';
      const planConfig = getPlanConfig(deps.env.pricing, plan);
      await editOrReply(
        ctx,
        `Тариф: 1 месяц — ${planConfig.amount} ⭐\nСрок: ${planConfig.periodDays} дней`,
        createPlanConfirmKeyboard(CALLBACK_DATA.payCreateMonthly),
      );
      return;
    }
    case CALLBACK_DATA.planThreeMonths: {
      if (!(await requirePrivateChat(ctx))) return;
      const planConfig = getPlanConfig(deps.env.pricing, 'three_months');
      await editOrReply(
        ctx,
        `Тариф: 3 месяца — ${planConfig.amount} ⭐\nСрок: ${planConfig.periodDays} дней`,
        createPlanConfirmKeyboard(CALLBACK_DATA.payCreateThreeMonths),
      );
      return;
    }
    case CALLBACK_DATA.planSixMonths: {
      if (!(await requirePrivateChat(ctx))) return;
      const planConfig = getPlanConfig(deps.env.pricing, 'six_months');
      await editOrReply(
        ctx,
        `Тариф: 6 месяцев — ${planConfig.amount} ⭐\nСрок: ${planConfig.periodDays} дней`,
        createPlanConfirmKeyboard(CALLBACK_DATA.payCreateSixMonths),
      );
      return;
    }
    case CALLBACK_DATA.planYearly: {
      if (!(await requirePrivateChat(ctx))) return;
      const planConfig = getPlanConfig(deps.env.pricing, 'yearly');
      await editOrReply(
        ctx,
        `Тариф: 12 месяцев — ${planConfig.amount} ⭐\nСрок: ${planConfig.periodDays} дней`,
        createPlanConfirmKeyboard(CALLBACK_DATA.payCreateYearly),
      );
      return;
    }
    case CALLBACK_DATA.payCreateMonthly:
    case CALLBACK_DATA.payCreateThreeMonths:
    case CALLBACK_DATA.payCreateSixMonths:
    case CALLBACK_DATA.payCreateYearly: {
      if (!deps.paymentAccessGateway || !deps.paymentOrderRepository) {
        await editOrReply(ctx, MESSAGES.paymentNextStage);
        return;
      }
      if (!(await requirePrivateChat(ctx))) return;
      const telegramId = ctx.state.user?.telegramId;
      if (!telegramId || !ctx.chat) return;
      const state = await deps.accessStateProvider.getUserAccessState(telegramId);
      const trialUsed = 'trialUsed' in state ? state.trialUsed : false;
      const planForCallback = ((): PaymentPlan => {
        if (data === CALLBACK_DATA.payCreateThreeMonths) return 'three_months';
        if (data === CALLBACK_DATA.payCreateSixMonths) return 'six_months';
        if (data === CALLBACK_DATA.payCreateYearly) return 'yearly';
        return trialUsed ? 'monthly_renewal' : 'first_month';
      })();
      await handleCreatePaymentInvoice({
        ctx,
        env: deps.env,
        accessGateway: deps.paymentAccessGateway,
        orderRepository: deps.paymentOrderRepository,
        plan: planForCallback,
      });
      return;
    }
    case CALLBACK_DATA.navFeatures:
      await editOrReply(ctx, buildFeaturesMessage(), createFeaturesKeyboard(deps.env.appUrl));
      return;
    case CALLBACK_DATA.navInstall:
      await editOrReply(
        ctx,
        buildInstallationMessage(),
        createInstallationKeyboard(deps.env.appUrl),
      );
      return;
    case CALLBACK_DATA.navInstallAndroid:
      await editOrReply(ctx, buildAndroidInstallationMessage());
      return;
    case CALLBACK_DATA.navInstallIos:
      await editOrReply(ctx, buildIphoneInstallationMessage());
      return;
    case CALLBACK_DATA.navInstallDesktop:
      await editOrReply(ctx, buildDesktopInstallationMessage());
      return;
    case CALLBACK_DATA.navTerms:
      await editOrReply(ctx, buildTermsMessage(), createTermsKeyboard());
      return;
    case CALLBACK_DATA.navPrivacy:
      await editOrReply(ctx, buildPrivacyMessage());
      return;
    case CALLBACK_DATA.navSupport:
      await handleSupport(ctx, deps);
      return;
    case CALLBACK_DATA.navPasswordRecovery:
      await handlePasswordRecovery(ctx, deps);
      return;
    case CALLBACK_DATA.createPayment:
      if (!deps.paymentAccessGateway || !deps.paymentOrderRepository) {
        await editOrReply(ctx, MESSAGES.paymentNextStage);
        return;
      }
      await handleCreatePaymentInvoice({
        ctx,
        env: deps.env,
        accessGateway: deps.paymentAccessGateway,
        orderRepository: deps.paymentOrderRepository,
      });
      return;
    case CALLBACK_DATA.checkLastPayment:
      await handleCheckLastPayment(ctx, deps);
      return;
    case CALLBACK_DATA.mockPaymentInfo:
      await editOrReply(ctx, MESSAGES.paymentNextStage);
      return;
    case CALLBACK_DATA.couponStart:
      await handleCouponStart(ctx, deps);
      return;
    case CALLBACK_DATA.couponCancel:
    case CALLBACK_DATA.accountResetCancel:
      await handleCouponCancel(ctx, deps);
      return;
    case CALLBACK_DATA.accountResetConfirm: {
      if (!(await requirePrivateChat(ctx))) return;
      const telegramId = ctx.state.user?.telegramId;
      if (!telegramId) return;
      const state = await deps.accessStateProvider.getUserAccessState(telegramId);
      if (
        ![
          'account_pending',
          'active',
          'expired',
          'cancelled',
          'marked_for_deletion',
          'banned',
        ].includes(state.kind)
      ) {
        await editOrReply(
          ctx,
          buildSupportMessage(false),
          createSupportKeyboard(deps.env.supportUsername),
        );
        return;
      }
      const result = await deps.accountService.resetPassword(telegramId);
      if (result.status === 'created' && result.loginEmail && result.password) {
        await ctx.reply(
          buildPasswordCreatedMessage(result.loginEmail, result.password),
          createPasswordCreatedKeyboard(deps.env.appUrl),
        );
        return;
      }
      await ctx.reply(result.message);
      return;
    }
  }
};

const handleCheckLastPayment = async (ctx: BotContext, deps: UiDependencies): Promise<void> => {
  if (!(await requirePrivateChat(ctx))) return;
  const telegramId = ctx.state.user?.telegramId;
  if (!telegramId || !deps.paymentOrderRepository) return;
  const order = await deps.paymentOrderRepository.findLatestByTelegramId(telegramId);
  if (!order) {
    await ctx.reply('Последний счёт не найден. Создайте новый счёт.');
    return;
  }
  if (order.telegramId !== telegramId) {
    await ctx.reply('Этот счёт создан для другого пользователя.');
    return;
  }
  if (order.status === 'pending' || order.status === 'created') {
    await ctx.reply(
      'Подтверждение оплаты ещё не получено. Если Stars списаны, не оплачивайте повторно и попробуйте проверку позже.',
    );
    return;
  }
  if (order.status === 'failed' || order.status === 'expired' || order.status === 'cancelled') {
    await ctx.reply('Последний счёт не оплачен или устарел. Создайте новый счёт.');
    return;
  }
  const event = deps.paymentEventRepository
    ? (await deps.paymentEventRepository.findByOrderId(order.orderId))[0]
    : undefined;
  if (event && !event.processedAt && deps.paymentAccessGateway && deps.paymentEventRepository) {
    logger.info({ telegramId, orderId: order.orderId }, 'payment_retry_started');
    const result = await processPaymentEvent({
      order,
      providerEventId: event.providerEventId,
      rawPayload: event.rawPayload,
      eventRepository: deps.paymentEventRepository,
      orderRepository: deps.paymentOrderRepository,
      accessGateway: deps.paymentAccessGateway,
    });
    logger.info({ telegramId, orderId: order.orderId }, 'payment_retry_completed');
    await ctx.reply(
      result.expiresAt
        ? `Оплата обработана. Доступ активен до: ${formatDateTime(result.expiresAt, deps.env.displayTimezone)}`
        : 'Оплата отправлена на ручную проверку.',
    );
    return;
  }
  await ctx.reply(
    'Оплата обработана. Откройте раздел “Мой доступ”, чтобы увидеть актуальный срок.',
  );
};
