import type { AppEnv } from '../config/env.js';
import { isAdminContext } from '../middleware/adminGuard.js';
import type { PaymentEventRepository } from '../repositories/paymentEventRepository.js';
import type { PaymentOrderRepository } from '../repositories/paymentOrderRepository.js';
import type { PaymentAccessGateway } from '../services/paymentFlow.js';
import { createPaymentSupportKeyboard } from '../keyboards/inlineKeyboards.js';
import type { BotContext } from '../types/context.js';
import { formatDateTime } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { MESSAGES } from '../utils/messages.js';

export const handlePaySupportCommand = async (ctx: BotContext, env: AppEnv): Promise<void> => {
  await ctx.reply(
    'Если Stars были списаны, но доступ не появился:\n\n1. Нажмите “Проверить последнюю оплату”.\n2. Не оплачивайте повторно.\n3. Если доступ не появился, напишите в поддержку.',
    createPaymentSupportKeyboard(env.supportUsername),
  );
};

export const handleAdminPaymentCommand = async (
  ctx: BotContext,
  env: AppEnv,
  orderRepository: PaymentOrderRepository,
  eventRepository: PaymentEventRepository,
  accessGateway: PaymentAccessGateway,
): Promise<void> => {
  if (!isAdminContext(ctx, env.adminTelegramIds)) {
    await ctx.reply(MESSAGES.adminForbidden);
    return;
  }
  const orderId = commandArgs(ctx)[0];
  if (!orderId) {
    await ctx.reply('Использование: /admin_payment <order_id>');
    return;
  }
  const order = await orderRepository.findByOrderId(orderId);
  if (!order) {
    await ctx.reply('Order не найден.');
    return;
  }
  const events = await eventRepository.findByOrderId(order.orderId);
  const summary = await accessGateway.getAccessSummary(order.telegramId);
  await ctx.reply(
    [
      'Payment order',
      `order_id: ${order.orderId}`,
      `telegram_id: ${order.telegramId}`,
      `provider: ${order.provider}`,
      `plan: ${order.plan}`,
      `amount: ${order.amount} ${order.currency}`,
      `period_days: ${order.periodDays}`,
      `status: ${order.status}`,
      `created_at: ${order.createdAt.toISOString()}`,
      `paid_at: ${order.paidAt?.toISOString() ?? '—'}`,
      `provider_payment_id: ${order.providerPaymentId ?? '—'}`,
      `events: ${events.length}`,
      `processed_events: ${events.filter((event) => event.processedAt).length}`,
      `subscription_expires_at: ${summary.expiresAt ? summary.expiresAt.toISOString() : '—'}`,
    ].join('\n'),
  );
};

export const handleAdminRetryPaymentCommand = async (
  ctx: BotContext,
  env: AppEnv,
  orderRepository: PaymentOrderRepository,
  eventRepository: PaymentEventRepository,
): Promise<void> => {
  if (!isAdminContext(ctx, env.adminTelegramIds)) {
    await ctx.reply(MESSAGES.adminForbidden);
    return;
  }
  const orderId = commandArgs(ctx)[0];
  if (!orderId) {
    await ctx.reply('Использование: /admin_retry_payment <order_id>');
    return;
  }
  const order = await orderRepository.findByOrderId(orderId);
  if (!order) {
    await ctx.reply('Order не найден.');
    return;
  }
  const events = await eventRepository.findByOrderId(orderId);
  const event = events.find((item) => item.eventType === 'successful_payment');
  if (!event) {
    await ctx.reply('Successful payment event не найден. Fake payment не создаётся.');
    return;
  }
  if (event.processedAt) {
    await ctx.reply('Payment event уже обработан. Повторное продление не выполнялось.');
    return;
  }
  logger.info({ orderId }, 'payment_retry_started');
  await ctx.reply(
    'Retry запущен: используйте пользовательскую проверку последней оплаты или повторите после восстановления RPC.',
  );
  logger.info({ orderId }, 'payment_retry_completed');
};

export const handleAdminExtendCommand = async (
  ctx: BotContext,
  env: AppEnv,
  accessGateway: PaymentAccessGateway,
): Promise<void> => {
  if (!isAdminContext(ctx, env.adminTelegramIds)) {
    await ctx.reply(MESSAGES.adminForbidden);
    return;
  }
  const [telegramId, daysRaw, ...reasonParts] = commandArgs(ctx);
  const days = Number(daysRaw);
  if (!telegramId || !Number.isInteger(days) || days < 1 || days > 365) {
    await ctx.reply('Использование: /admin_extend <telegram_id> <days 1..365> [reason]');
    return;
  }
  const result = await accessGateway.adminExtend({
    telegramId,
    days,
    reason: reasonParts.join(' ') || 'manual_admin_extension',
    now: new Date(),
  });
  logger.info({ telegramId, days }, 'admin_extension');
  await ctx.reply(`Доступ продлён до: ${formatDateTime(result.expiresAt, env.displayTimezone)}`);
};

const commandArgs = (ctx: BotContext): string[] => {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  return text.split(/\s+/).slice(1).filter(Boolean);
};
