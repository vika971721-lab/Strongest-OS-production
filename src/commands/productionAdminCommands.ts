import type { Telegraf } from 'telegraf';
import { buildWebhookUrl, maskWebhookUrl, type AppEnv } from '../config/env.js';
import { checkSupabaseReadiness, type SupabaseReadinessClient } from '../httpServer.js';
import { isAdminContext } from '../middleware/adminGuard.js';
import type { CouponRepository } from '../repositories/couponRepository.js';
import type { PaymentOrderRepository } from '../repositories/paymentOrderRepository.js';
import type { Scheduler } from '../scheduler/scheduler.js';
import type { BotContext } from '../types/context.js';
import { normalizeError } from '../utils/logger.js';
import { MESSAGES } from '../utils/messages.js';

export interface SystemStatusDependencies {
  bot: Telegraf<BotContext>;
  env: AppEnv;
  scheduler: Scheduler;
  isReady?: () => boolean;
  supabaseClient?: SupabaseReadinessClient | undefined;
  paymentOrderRepository?: PaymentOrderRepository | undefined;
  couponRepository?: CouponRepository | undefined;
  version?: string | undefined;
}

const requireAdmin = async (ctx: BotContext, env: AppEnv): Promise<boolean> => {
  if (isAdminContext(ctx, env.adminTelegramIds)) return true;
  await ctx.reply(MESSAGES.adminForbidden);
  return false;
};

const safeMessage = (message: string | undefined): string => {
  if (!message) return 'none';
  return message.replace(/\d{6,}:[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 120);
};

export const handleAdminWebhookStatusCommand = async (
  ctx: BotContext,
  deps: SystemStatusDependencies,
): Promise<void> => {
  if (!(await requireAdmin(ctx, deps.env))) return;
  const info = await deps.bot.telegram.getWebhookInfo();
  const url = info.url ? maskWebhookUrl(info.url) : 'not_set';
  await ctx.reply(
    [
      'Webhook status',
      `installed: ${Boolean(info.url)}`,
      `url: ${url}`,
      `pending updates: ${info.pending_update_count}`,
      `last error date: ${info.last_error_date ?? 'none'}`,
      `last error message: ${safeMessage(info.last_error_message)}`,
      `allowed updates: ${(info.allowed_updates ?? []).join(', ') || 'default'}`,
    ].join('\n'),
  );
};

export const handleAdminSystemStatusCommand = async (
  ctx: BotContext,
  deps: SystemStatusDependencies,
): Promise<void> => {
  if (!(await requireAdmin(ctx, deps.env))) return;
  const schedulerStatus = deps.scheduler.getStatus();
  const webhookInstalled = await deps.bot.telegram
    .getWebhookInfo()
    .then((info) => String(Boolean(info.url)))
    .catch(() => 'unreachable');
  let supabaseReachable = 'disabled';
  if (deps.env.healthCheckSupabase ?? true) {
    try {
      supabaseReachable = String(await checkSupabaseReadiness(deps.supabaseClient));
    } catch {
      supabaseReachable = 'false';
    }
  }
  await ctx.reply(
    [
      'System status',
      `environment: ${deps.env.nodeEnv}`,
      `bot mode: ${deps.env.botMode}`,
      `uptime seconds: ${Math.floor(process.uptime())}`,
      `readiness: ${deps.isReady?.() ?? false}`,
      `webhook installed: ${webhookInstalled}`,
      `scheduler enabled: ${schedulerStatus.enabled}`,
      `scheduler dry-run: ${schedulerStatus.dryRun}`,
      `supabase reachable: ${supabaseReachable}`,
      `version: ${deps.version ?? process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? 'unknown'}`,
    ].join('\n'),
  );
};

export const handleAdminHealthCheckCommand = async (
  ctx: BotContext,
  deps: SystemStatusDependencies,
): Promise<void> => {
  if (!(await requireAdmin(ctx, deps.env))) return;
  const results: string[] = ['Admin health check'];
  try {
    await deps.bot.telegram.getMe();
    results.push('telegram_get_me: ok');
  } catch (error) {
    results.push(`telegram_get_me: failed:${normalizeError(error).code}`);
  }
  try {
    await checkSupabaseReadiness(deps.supabaseClient);
    results.push('supabase_read: ok');
  } catch (error) {
    results.push(`supabase_read: failed:${normalizeError(error).code}`);
  }
  results.push(`scheduler_state: ${deps.scheduler.getStatus().running ? 'running' : 'idle'}`);
  results.push(
    `payment_repository: ${deps.paymentOrderRepository ? 'configured' : 'not_configured'}`,
  );
  results.push(`coupon_repository: ${deps.couponRepository ? 'configured' : 'not_configured'}`);
  if (deps.env.webhookDomain)
    results.push(`webhook_url: ${maskWebhookUrl(buildWebhookUrl(deps.env))}`);
  await ctx.reply(results.join('\n'));
};
