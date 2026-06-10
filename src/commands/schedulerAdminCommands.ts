import type { AppEnv } from '../config/env.js';
import { isAdminContext } from '../middleware/adminGuard.js';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { SubscriptionLifecycleRepository } from '../services/subscriptionLifecycleService.js';
import type { BotContext } from '../types/context.js';
import { formatDateTime } from '../utils/dates.js';
import { MESSAGES } from '../utils/messages.js';

const requireAdmin = async (ctx: BotContext, env: AppEnv): Promise<boolean> => {
  if (isAdminContext(ctx, env.adminTelegramIds)) return true;
  await ctx.reply(MESSAGES.adminForbidden);
  return false;
};

const textOf = (ctx: BotContext): string => {
  const message = ctx.message;
  return message && 'text' in message ? message.text : '';
};

export const handleAdminSchedulerStatusCommand = async (
  ctx: BotContext,
  env: AppEnv,
  scheduler: Scheduler,
): Promise<void> => {
  if (!(await requireAdmin(ctx, env))) return;
  const status = scheduler.getStatus();
  await ctx.reply(
    [
      'Scheduler status',
      `enabled: ${status.enabled}`,
      `interval: ${status.intervalSeconds}s`,
      `batch size: ${status.batchSize}`,
      `retention days: ${status.retentionDays}`,
      `warning hours: ${status.warningHours}`,
      `dry-run: ${status.dryRun}`,
      `last started: ${formatDateTime(status.lastStartedAt, env.displayTimezone)}`,
      `last success: ${formatDateTime(status.lastSuccessfulCompletedAt, env.displayTimezone)}`,
      `processed: ${status.lastProcessed}`,
      `errors: ${status.lastErrors}`,
    ].join('\n'),
  );
};

export const handleAdminSchedulerPreviewCommand = async (
  ctx: BotContext,
  env: AppEnv,
  scheduler: Scheduler,
): Promise<void> => {
  if (!(await requireAdmin(ctx, env))) return;
  const preview = await scheduler.preview();
  await ctx.reply(
    [
      'Scheduler preview (dry-run)',
      `five_days: ${preview.five_days ?? 0}`,
      `three_days: ${preview.three_days ?? 0}`,
      `one_day: ${preview.one_day ?? 0}`,
      `one_hour: ${preview.one_hour ?? 0}`,
      `expired: ${preview.expired ?? 0}`,
      `deletion_warning: ${preview.deletion_warning ?? 0}`,
      `marked_for_deletion: ${preview.marked_for_deletion ?? 0}`,
      `deletion: ${preview.deletion ?? 0}`,
    ].join('\n'),
  );
};

export const handleAdminRunSchedulerCommand = async (
  ctx: BotContext,
  env: AppEnv,
  scheduler: Scheduler,
): Promise<void> => {
  if (!(await requireAdmin(ctx, env))) return;
  const text = textOf(ctx);
  const confirmed = text.includes('--confirm');
  if (env.nodeEnv === 'production' && !env.schedulerDryRun && !confirmed) {
    await ctx.reply('Production run requires /admin_run_scheduler --confirm');
    return;
  }
  const summary = await scheduler.runOnce();
  await ctx.reply(
    `Scheduler cycle completed. processed=${summary.processed}, errors=${summary.errors}, skippedByLock=${summary.skippedByLock}, dryRun=${summary.dryRun}`,
  );
};

export const handleAdminSubscriptionLifecycleCommand = async (
  ctx: BotContext,
  env: AppEnv,
  subscriptions: SubscriptionLifecycleRepository,
  notifications: NotificationRepository,
): Promise<void> => {
  if (!(await requireAdmin(ctx, env))) return;
  const [, telegramId] = textOf(ctx).trim().split(/\s+/);
  if (!telegramId) {
    await ctx.reply('Usage: /admin_subscription_lifecycle <telegram_id>');
    return;
  }
  const subscription = await subscriptions.findByTelegramId(telegramId);
  if (!subscription) {
    await ctx.reply('Subscription not found');
    return;
  }
  const periodEnd = subscription.currentPeriodEnd ?? subscription.expiresAt;
  const periodNotifications =
    subscription.id && periodEnd
      ? await notifications.listForPeriod({ subscriptionId: subscription.id, periodEnd })
      : [];
  await ctx.reply(
    [
      `telegram_id: ${subscription.telegramId}`,
      `status: ${subscription.status}`,
      `expires_at: ${formatDateTime(subscription.expiresAt, env.displayTimezone)}`,
      `expired_at: ${formatDateTime(subscription.expiredAt, env.displayTimezone)}`,
      `delete_after: ${formatDateTime(subscription.deleteAfter, env.displayTimezone)}`,
      `marked_for_deletion_at: ${formatDateTime(subscription.markedForDeletionAt, env.displayTimezone)}`,
      `deleted_at: ${formatDateTime(subscription.deletedAt, env.displayTimezone)}`,
      `notifications: ${periodNotifications.map((item) => item.type).join(', ') || 'none'}`,
    ].join('\n'),
  );
};
