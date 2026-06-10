import { Markup } from 'telegraf';
import type { Context } from 'telegraf';
import { randomBytes } from 'node:crypto';
import type { AppEnv } from '../config/env.js';
import type { PricingConfig } from '../config/pricing.js';
import { CALLBACK_DATA } from '../config/constants.js';
import type { PaymentEventRepository } from '../repositories/paymentEventRepository.js';
import type { PaymentOrderRepository } from '../repositories/paymentOrderRepository.js';
import type { UserAccessState } from '../types/accessState.js';
import type { BotContext } from '../types/context.js';
import type {
  CreatePaymentEventInput,
  PaymentOrder,
  PaymentPlan,
  SanitizedPaymentPayload,
} from '../types/payment.js';
import { formatDateTime } from '../utils/dates.js';
import { logger, normalizeError } from '../utils/logger.js';
import { escapeTelegramHtml } from '../utils/html.js';

export const TELEGRAM_STARS_PROVIDER = 'telegram_stars' as const;
export const TELEGRAM_STARS_CURRENCY = 'XTR' as const;
export const TELEGRAM_STARS_PROVIDER_TOKEN = '';
export const PAYMENT_ORDER_TTL_MS_DEFAULT = 15 * 60 * 1000;

export interface InvoiceSpec {
  title: string;
  description: string;
  payload: string;
  provider_token: '';
  currency: 'XTR';
  prices: [{ label: string; amount: number }];
}

export interface PlanConfig {
  plan: PaymentPlan;
  amount: number;
  periodDays: number;
}

export interface PaymentAccessGateway {
  getAccessState(telegramId: string): Promise<UserAccessState>;
  createOrGetAccount(
    telegramId: string,
    userInfo?: { username?: string; firstName?: string; lastName?: string },
  ): Promise<{
    supabaseUserId: string;
    loginEmail: string;
    created: boolean;
    generatedPassword?: string;
  }>;
  extendSubscription(input: {
    telegramId: string;
    supabaseUserId: string;
    plan: PaymentPlan;
    periodDays: number;
    paymentEventId: string;
    now: Date;
  }): Promise<{ expiresAt: Date; firstPayment: boolean; applied: boolean }>;
  getAccessSummary(telegramId: string): Promise<{ expiresAt?: Date; loginEmail?: string }>;
  adminExtend(input: {
    telegramId: string;
    days: number;
    reason: string;
    now: Date;
  }): Promise<{ expiresAt: Date }>;
}

export class NotConfiguredPaymentAccessGateway implements PaymentAccessGateway {
  async getAccessState(telegramId: string): Promise<UserAccessState> {
    await Promise.resolve();
    return { kind: 'telegram_registered', telegramId, trialUsed: false };
  }

  async createOrGetAccount(
    telegramId: string,
    _userInfo?: { username?: string; firstName?: string; lastName?: string },
  ): Promise<{
    supabaseUserId: string;
    loginEmail: string;
    created: boolean;
    generatedPassword?: string;
  }> {
    await Promise.resolve();
    return {
      supabaseUserId: `not-configured-${telegramId}`,
      loginEmail: `tg${telegramId}@example.invalid`,
      created: false,
    };
  }

  async extendSubscription(input: {
    telegramId: string;
    supabaseUserId: string;
    plan: PaymentPlan;
    periodDays: number;
    paymentEventId: string;
    now: Date;
  }): Promise<{ expiresAt: Date; firstPayment: boolean; applied: boolean }> {
    await Promise.resolve();
    return {
      expiresAt: addDays(input.now, input.periodDays),
      firstPayment: input.plan === 'first_month',
      applied: true,
    };
  }

  async getAccessSummary(_telegramId: string): Promise<{ expiresAt?: Date; loginEmail?: string }> {
    await Promise.resolve();
    return {};
  }

  async adminExtend(input: {
    telegramId: string;
    days: number;
    reason: string;
    now: Date;
  }): Promise<{ expiresAt: Date }> {
    await Promise.resolve();
    return { expiresAt: addDays(input.now, input.days) };
  }
}

export const createOpaqueToken = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString('base64url')}`;

export const addDays = (base: Date, days: number): Date =>
  new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

export const getPlanConfig = (pricing: PricingConfig, plan: PaymentPlan): PlanConfig =>
  plan === 'first_month'
    ? { plan, amount: pricing.firstPeriodStars, periodDays: pricing.firstPeriodDays }
    : { plan, amount: pricing.renewalPeriodStars, periodDays: pricing.renewalPeriodDays };

export const determinePaymentPlan = (state: UserAccessState): PaymentPlan | { blocked: string } => {
  if (state.kind === 'banned') return { blocked: 'banned' };
  if (state.kind === 'deleted') return { blocked: 'deleted' };
  if (state.kind === 'broken_link') return { blocked: 'broken_link' };
  if (state.kind === 'unknown_status') return { blocked: 'unknown_status' };
  if (state.kind === 'temporarily_unavailable') return { blocked: 'temporarily_unavailable' };
  return state.trialUsed ? 'monthly_renewal' : 'first_month';
};

export const buildTelegramStarsInvoice = (order: PaymentOrder): InvoiceSpec => {
  const first = order.plan === 'first_month';
  return {
    title: first ? 'Strongest OS — первый период' : 'Strongest OS — продление',
    description: first
      ? `Доступ к Strongest OS на ${order.periodDays} дней. После оплаты бот создаст аккаунт и отправит логин и пароль.`
      : `Продление доступа Strongest OS ещё на ${order.periodDays} дней. Оставшиеся дни не сгорают.`,
    payload: order.providerInvoicePayload,
    provider_token: TELEGRAM_STARS_PROVIDER_TOKEN,
    currency: TELEGRAM_STARS_CURRENCY,
    prices: [{ label: first ? 'Первый период' : 'Продление', amount: order.amount }],
  };
};

export const sanitizeSuccessfulPaymentPayload = (input: {
  currency: string;
  totalAmount: number;
  invoicePayload: string;
  telegramPaymentChargeId?: string;
  providerPaymentChargeId?: string;
  messageId?: number;
  updateId?: number;
  timestamp?: Date;
}): SanitizedPaymentPayload => {
  const payload: SanitizedPaymentPayload = {
    currency: input.currency,
    total_amount: input.totalAmount,
    invoice_payload: input.invoicePayload,
    timestamp: (input.timestamp ?? new Date()).toISOString(),
  };
  if (input.telegramPaymentChargeId) {
    payload.telegram_payment_charge_id = input.telegramPaymentChargeId;
  }
  if (input.providerPaymentChargeId) {
    payload.provider_payment_charge_id = input.providerPaymentChargeId;
  }
  if (input.messageId !== undefined) payload.message_id = input.messageId;
  if (input.updateId !== undefined) payload.update_id = input.updateId;
  return payload;
};

const isOrderExpired = (order: PaymentOrder, now: Date, ttlMs: number): boolean =>
  now.getTime() - order.createdAt.getTime() > ttlMs;

export const ensurePaymentOrder = async (input: {
  telegramId: string;
  pricing: PricingConfig;
  accessGateway: PaymentAccessGateway;
  orderRepository: PaymentOrderRepository;
  ttlMinutes: number;
  now?: Date;
}): Promise<
  { ok: true; order: PaymentOrder; reused: boolean } | { ok: false; message: string }
> => {
  const now = input.now ?? new Date();
  const state = await input.accessGateway.getAccessState(input.telegramId);
  const plan = determinePaymentPlan(state);
  if (typeof plan !== 'string') return { ok: false, message: paymentBlockedMessage(plan.blocked) };
  const planConfig = getPlanConfig(input.pricing, plan);
  const pending = await input.orderRepository.findRecentPendingOrder(
    input.telegramId,
    plan,
    input.ttlMinutes,
    now,
  );
  if (pending) {
    if (isOrderExpired(pending, now, input.ttlMinutes * 60 * 1000)) {
      await input.orderRepository.markExpired(pending.orderId, now);
      logger.info(
        { telegramId: input.telegramId, orderId: pending.orderId },
        'payment_order_expired',
      );
    } else {
      logger.info(
        { telegramId: input.telegramId, orderId: pending.orderId },
        'payment_order_reused',
      );
      return { ok: true, order: pending, reused: true };
    }
  }
  const order = await input.orderRepository.createOrder({
    telegramId: input.telegramId,
    plan,
    amount: planConfig.amount,
    periodDays: planConfig.periodDays,
    now,
  });
  logger.info(
    { telegramId: input.telegramId, orderId: order.orderId, plan },
    'payment_order_created',
  );
  return { ok: true, order, reused: false };
};

export const validatePreCheckout = async (input: {
  telegramId: string;
  payload: string;
  currency: string;
  totalAmount: number;
  orderRepository: PaymentOrderRepository;
  accessGateway: PaymentAccessGateway;
  ttlMinutes: number;
  now?: Date;
}): Promise<{ ok: true; order: PaymentOrder } | { ok: false; message: string }> => {
  const now = input.now ?? new Date();
  const order = await input.orderRepository.findByInvoicePayload(input.payload);
  if (!order) return { ok: false, message: 'Не удалось найти заказ. Создайте новый счёт.' };
  if (order.status !== 'created' && order.status !== 'pending') {
    return { ok: false, message: 'Срок действия счёта закончился.' };
  }
  if (isOrderExpired(order, now, input.ttlMinutes * 60 * 1000)) {
    await input.orderRepository.markExpired(order.orderId, now);
    return { ok: false, message: 'Срок действия счёта закончился.' };
  }
  if (order.telegramId !== input.telegramId) {
    return { ok: false, message: 'Этот счёт создан для другого пользователя.' };
  }
  if (input.currency !== TELEGRAM_STARS_CURRENCY || input.totalAmount !== order.amount) {
    return { ok: false, message: 'Параметры платежа изменились. Создайте новый счёт.' };
  }
  if (order.provider !== TELEGRAM_STARS_PROVIDER || order.currency !== TELEGRAM_STARS_CURRENCY) {
    return { ok: false, message: 'Параметры платежа изменились. Создайте новый счёт.' };
  }
  const state = await input.accessGateway.getAccessState(input.telegramId);
  const currentPlan = determinePaymentPlan(state);
  if (typeof currentPlan !== 'string')
    return { ok: false, message: paymentBlockedMessage(currentPlan.blocked) };
  if (order.plan === 'first_month' && currentPlan !== 'first_month') {
    return { ok: false, message: 'Первый тариф уже использован. Создайте счёт на продление.' };
  }
  return { ok: true, order };
};

export const processPaymentEvent = async (input: {
  order: PaymentOrder;
  providerEventId: string;
  providerPaymentChargeId?: string;
  rawPayload: SanitizedPaymentPayload;
  eventRepository: PaymentEventRepository;
  orderRepository: PaymentOrderRepository;
  accessGateway: PaymentAccessGateway;
  userInfo?: { username?: string; firstName?: string; lastName?: string };
  now?: Date;
}): Promise<{
  status: 'processed' | 'duplicate' | 'manual_review';
  expiresAt?: Date;
  loginEmail?: string;
  password?: string;
  accountCreated?: boolean;
}> => {
  const now = input.now ?? new Date();
  const existing = await input.eventRepository.findByProviderEventId(input.providerEventId);
  const event =
    existing ??
    (await input.eventRepository.createEventIfAbsent({
      providerEventId: input.providerEventId,
      orderId: input.order.orderId,
      telegramId: input.order.telegramId,
      eventType: 'successful_payment',
      amount: input.order.amount,
      currency: input.order.currency,
      plan: input.order.plan,
      periodDays: input.order.periodDays,
      rawPayload: input.rawPayload,
      now,
    }));
  if (!existing) logger.info({ orderId: input.order.orderId }, 'payment_event_created');
  if (event.processedAt) {
    logger.info({ orderId: input.order.orderId }, 'duplicate_payment_detected');
    const summary = await input.accessGateway.getAccessSummary(input.order.telegramId);
    const duplicateResult: { status: 'duplicate'; expiresAt?: Date; loginEmail?: string } = {
      status: 'duplicate',
    };
    if (summary.expiresAt) duplicateResult.expiresAt = summary.expiresAt;
    if (summary.loginEmail) duplicateResult.loginEmail = summary.loginEmail;
    return duplicateResult;
  }
  const state = await input.accessGateway.getAccessState(input.order.telegramId);
  if (state.kind === 'banned' || state.kind === 'deleted') {
    logger.warn(
      { orderId: input.order.orderId, telegramId: input.order.telegramId },
      'payment_manual_review',
    );
    return { status: 'manual_review' };
  }
  if (
    input.order.plan === 'first_month' &&
    state.kind !== 'temporarily_unavailable' &&
    state.trialUsed
  ) {
    const audit: CreatePaymentEventInput = {
      providerEventId: `${input.providerEventId}:first_month_race_converted_to_renewal`,
      orderId: input.order.orderId,
      telegramId: input.order.telegramId,
      eventType: 'first_month_race_converted_to_renewal',
      amount: input.order.amount,
      currency: input.order.currency,
      plan: input.order.plan,
      periodDays: input.order.periodDays,
      rawPayload: input.rawPayload,
      now,
    };
    await input.eventRepository.createEventIfAbsent(audit);
  }
  const account = await input.accessGateway.createOrGetAccount(
    input.order.telegramId,
    input.userInfo,
  );
  if (account.created) logger.info({ telegramId: input.order.telegramId }, 'account_created');
  await input.orderRepository.attachSupabaseUser(input.order.orderId, account.supabaseUserId);
  const extended = await input.accessGateway.extendSubscription({
    telegramId: input.order.telegramId,
    supabaseUserId: account.supabaseUserId,
    plan: input.order.plan,
    periodDays: input.order.periodDays,
    paymentEventId: input.providerEventId,
    now,
  });
  if (extended.applied) logger.info({ orderId: input.order.orderId }, 'subscription_extended');
  await input.orderRepository.attachProviderPaymentId(input.order.orderId, input.providerEventId);
  await input.orderRepository.markPaid(
    input.order.orderId,
    input.providerEventId,
    input.rawPayload,
    now,
  );
  await input.eventRepository.markProcessed(input.providerEventId, now);
  logger.info({ orderId: input.order.orderId }, 'payment_processed');
  const processedResult: {
    status: 'processed';
    expiresAt: Date;
    loginEmail: string;
    password?: string;
    accountCreated: boolean;
  } = {
    status: 'processed',
    expiresAt: extended.expiresAt,
    loginEmail: account.loginEmail,
    accountCreated: account.created,
  };
  if (account.created && account.generatedPassword) {
    processedResult.password = account.generatedPassword;
  }
  return processedResult;
};

const paymentBlockedMessage = (reason: string): string => {
  if (reason === 'banned' || reason === 'deleted')
    return 'Оплата недоступна. Обратитесь в поддержку.';
  if (reason === 'temporarily_unavailable') return 'Оплата временно недоступна. Попробуйте позже.';
  return 'Оплата недоступна. Обратитесь в поддержку.';
};

const successfulPaymentMessage = (input: {
  result: Awaited<ReturnType<typeof processPaymentEvent>>;
  order: PaymentOrder;
  appUrl?: string;
  timezone: string;
}): string => {
  const expires = input.result.expiresAt
    ? formatDateTime(input.result.expiresAt, input.timezone)
    : 'уточняется';
  if (input.result.status === 'manual_review') {
    return '⚠️ Оплата получена, но доступ требует ручной проверки.\n\nНапишите в поддержку и не оплачивайте повторно.';
  }
  if (input.result.status === 'duplicate') {
    return `✅ Эта оплата уже была обработана.\n\nТекущий доступ активен до:\n${expires}`;
  }
  if (input.result.accountCreated && input.result.password) {
    const appLine = input.appUrl ? `\n🌐 Ссылка:\n${escapeTelegramHtml(input.appUrl)}\n` : '';
    return `🚀 Доступ активирован.\n\nStrongest OS запущена. Теперь у тебя есть система: квесты, цели, прогресс и дисциплина в одном месте.\n\nЗаходи, собирай день и прокачивай себя без хаоса.\n${appLine}\n🔐 Логин:\n${input.result.loginEmail ? escapeTelegramHtml(input.result.loginEmail) : 'уточняется'}\n\n🔑 Пароль:\n${escapeTelegramHtml(input.result.password)}\n\n📅 Доступ активен до:\n${expires}\n\n<b>Сохрани пароль.</b> Бот показывает его только один раз.\n\nЕсли потеряешь — создай новый через «Восстановить доступ».`;
  }
  if (input.order.plan === 'monthly_renewal') {
    return `⚡ Доступ продлён.\n\nДобавлено: <b>${input.order.periodDays} дней</b>\n\nНовая дата окончания:\n${expires}\n\nОставшиеся дни сохранены. Продолжай двигаться вперёд. 💪`;
  }
  const appLine = input.appUrl ? `\n🌐 Ссылка:\n${escapeTelegramHtml(input.appUrl)}\n` : '';
  return `🚀 Доступ активирован.\n${appLine}\n🔐 Логин:\n${input.result.loginEmail ? escapeTelegramHtml(input.result.loginEmail) : 'уточняется'}\n\n📅 Доступ активен до:\n${expires}\n\nЕсли потерял пароль — создай новый через «Восстановить доступ».`;
};

export const createPaymentResultKeyboard = (appUrl?: string) => {
  const rows = [];
  if (appUrl) rows.push([Markup.button.url('Открыть Strongest OS', appUrl)]);
  rows.push([Markup.button.callback('Мой доступ', CALLBACK_DATA.navAccess)]);
  rows.push([Markup.button.callback('Как установить приложение', CALLBACK_DATA.navInstall)]);
  return Markup.inlineKeyboard(rows);
};

export const handleCreatePaymentInvoice = async (input: {
  ctx: BotContext;
  env: AppEnv;
  accessGateway: PaymentAccessGateway;
  orderRepository: PaymentOrderRepository;
}): Promise<void> => {
  if (input.ctx.chat?.type !== 'private') {
    await input.ctx.reply('Оплата доступна только в личном чате с ботом.');
    return;
  }
  const telegramId = input.ctx.state.user?.telegramId;
  if (!telegramId || !input.ctx.chat) return;
  const ensured = await ensurePaymentOrder({
    telegramId,
    pricing: input.env.pricing,
    accessGateway: input.accessGateway,
    orderRepository: input.orderRepository,
    ttlMinutes: input.env.paymentOrderTtlMinutes ?? 15,
  });
  if (!ensured.ok) {
    await input.ctx.reply(ensured.message);
    return;
  }
  const invoice = buildTelegramStarsInvoice(ensured.order);
  try {
    await input.ctx.telegram.sendInvoice(input.ctx.chat.id, invoice);
    await input.orderRepository.markPending(ensured.order.orderId);
    logger.info({ telegramId, orderId: ensured.order.orderId }, 'invoice_sent');
  } catch (error) {
    await input.orderRepository.markFailed(ensured.order.orderId);
    logger.error(
      { err: normalizeError(error), telegramId, orderId: ensured.order.orderId },
      'invoice_send_failed',
    );
    await input.ctx.reply('Не удалось отправить счёт. Попробуйте позже.');
  }
};

interface PreCheckoutQueryShape {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

const hasPreCheckoutQuery = (
  ctx: Context,
): ctx is Context & { preCheckoutQuery: PreCheckoutQueryShape } => {
  const value = ctx.preCheckoutQuery;
  return Boolean(value && typeof value.id === 'string');
};

export const handlePreCheckoutQuery = async (input: {
  ctx: BotContext;
  env: AppEnv;
  accessGateway: PaymentAccessGateway;
  orderRepository: PaymentOrderRepository;
}): Promise<void> => {
  if (!hasPreCheckoutQuery(input.ctx)) return;
  const query = input.ctx.preCheckoutQuery;
  const result = await validatePreCheckout({
    telegramId: String(query.from.id),
    payload: query.invoice_payload,
    currency: query.currency,
    totalAmount: query.total_amount,
    orderRepository: input.orderRepository,
    accessGateway: input.accessGateway,
    ttlMinutes: input.env.paymentOrderTtlMinutes ?? 15,
  });
  if (result.ok) {
    await input.ctx.answerPreCheckoutQuery(true);
    logger.info(
      { telegramId: String(query.from.id), orderId: result.order.orderId },
      'precheckout_approved',
    );
  } else {
    await input.ctx.answerPreCheckoutQuery(false, result.message);
    logger.warn(
      { telegramId: String(query.from.id), reason: result.message },
      'precheckout_rejected',
    );
  }
};

interface SuccessfulPaymentShape {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}

interface SuccessfulPaymentMessageShape {
  message_id: number;
  date: number;
  successful_payment: SuccessfulPaymentShape;
}

const getSuccessfulPaymentMessage = (
  ctx: BotContext,
): SuccessfulPaymentMessageShape | undefined => {
  const message = ctx.message;
  if (!message || !('successful_payment' in message)) return undefined;
  return message;
};

export const handleSuccessfulPayment = async (input: {
  ctx: BotContext;
  env: AppEnv;
  accessGateway: PaymentAccessGateway;
  orderRepository: PaymentOrderRepository;
  eventRepository: PaymentEventRepository;
}): Promise<void> => {
  if (input.ctx.chat?.type !== 'private') {
    logger.warn(
      { telegramId: input.ctx.state.user?.telegramId },
      'credentials_not_sent_non_private',
    );
    return;
  }
  const telegramId = input.ctx.state.user?.telegramId;
  const message = getSuccessfulPaymentMessage(input.ctx);
  if (!telegramId || !message) return;
  const userInfo = {
    username: input.ctx.state.user?.username,
    firstName: input.ctx.state.user?.firstName,
    lastName: input.ctx.state.user?.lastName,
  };
  const payment = message.successful_payment;
  logger.info({ telegramId }, 'successful_payment_received');
  const order = await input.orderRepository.findByInvoicePayload(payment.invoice_payload);
  if (!order || order.telegramId !== telegramId) {
    await input.ctx.reply(
      'Оплата получена, но заказ не найден. Напишите в поддержку и не оплачивайте повторно.',
    );
    return;
  }
  if (payment.currency !== TELEGRAM_STARS_CURRENCY || payment.total_amount !== order.amount) {
    await input.ctx.reply(
      'Оплата получена, но параметры платежа требуют ручной проверки. Напишите в поддержку.',
    );
    return;
  }
  const rawPayload = sanitizeSuccessfulPaymentPayload({
    currency: payment.currency,
    totalAmount: payment.total_amount,
    invoicePayload: payment.invoice_payload,
    telegramPaymentChargeId: payment.telegram_payment_charge_id,
    providerPaymentChargeId: payment.provider_payment_charge_id,
    messageId: message.message_id,
    updateId: input.ctx.update.update_id,
    timestamp: new Date(message.date * 1000),
  });
  const result = await processPaymentEvent({
    order,
    providerEventId: payment.telegram_payment_charge_id,
    providerPaymentChargeId: payment.provider_payment_charge_id,
    rawPayload,
    eventRepository: input.eventRepository,
    orderRepository: input.orderRepository,
    accessGateway: input.accessGateway,
    userInfo,
  });
  try {
    await input.ctx.reply(
      successfulPaymentMessage({
        result,
        order,
        ...(input.env.appUrl ? { appUrl: input.env.appUrl } : {}),
        timezone: input.env.displayTimezone,
      }),
      createPaymentResultKeyboard(input.env.appUrl),
    );
  } catch (error) {
    logger.error(
      { err: normalizeError(error), telegramId, orderId: order.orderId },
      'credentials_delivery_failed',
    );
  }
};
