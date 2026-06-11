import { Markup } from 'telegraf';
import type { AppEnv } from '../config/env.js';
import type { CouponRepository } from '../repositories/couponRepository.js';
import { CouponAdminService, parseCouponIssueArgs } from '../services/couponService.js';
import type { AccessCoupon } from '../types/coupon.js';
import type { BotContext } from '../types/context.js';
import { formatDateTime } from '../utils/dates.js';
import { escapeTelegramHtml } from '../utils/html.js';
import { MESSAGES } from '../utils/messages.js';
import { isAdminContext } from '../middleware/adminGuard.js';
import { normalizeCouponCode } from '../utils/couponCodes.js';

const requireAdmin = async (ctx: BotContext, env: AppEnv): Promise<boolean> => {
  if (isAdminContext(ctx, env.adminTelegramIds)) return true;
  await ctx.reply(MESSAGES.adminForbidden);
  return false;
};

const commandText = (ctx: BotContext): string => {
  const message = ctx.message;
  return message && 'text' in message ? message.text : '';
};

const requireRepository = async (
  ctx: BotContext,
  repository: CouponRepository | undefined,
): Promise<CouponRepository | undefined> => {
  if (repository) return repository;
  await ctx.reply('CouponRepository не настроен для этого окружения.');
  return undefined;
};

const formatCouponInfo = (coupon: AccessCoupon, timeZone: string): string =>
  [
    'Информация о купоне',
    '',
    `code: <code>${escapeTelegramHtml(coupon.code)}</code>`,
    `duration_days: ${coupon.durationDays}`,
    `status: ${coupon.status}`,
    `source: ${escapeTelegramHtml(coupon.source)}`,
    `issued_at: ${formatDateTime(coupon.issuedAt?.toISOString(), timeZone)}`,
    `expires_at: ${formatDateTime(coupon.expiresAt?.toISOString(), timeZone)}`,
    `redeemed_at: ${formatDateTime(coupon.redeemedAt?.toISOString(), timeZone)}`,
    `redeemed_by_telegram_id: ${escapeTelegramHtml(coupon.redeemedByTelegramId ?? '—')}`,
    `created_by_telegram_id: ${escapeTelegramHtml(coupon.createdByTelegramId ?? '—')}`,
  ].join('\n');

export const handleAdminIssueCouponCommand = async (
  ctx: BotContext,
  env: AppEnv,
  repository: CouponRepository | undefined,
): Promise<void> => {
  if (!(await requireAdmin(ctx, env))) return;
  const repo = await requireRepository(ctx, repository);
  if (!repo) return;
  const parsed = parseCouponIssueArgs(commandText(ctx));
  if (!parsed.ok) {
    await ctx.reply('Использование: /admin_issue_coupon <30|60|180> [count 1..100]');
    return;
  }
  const telegramId = ctx.state.user?.telegramId;
  if (!telegramId) return;
  const service = new CouponAdminService(repo);
  const codes = await service.issueCoupons({
    durationDays: parsed.days,
    count: parsed.count,
    adminTelegramId: telegramId,
    now: new Date(),
  });
  const codeLines = codes.map((c) => `<code>${escapeTelegramHtml(c)}</code>`).join('\n');
  const htmlText = `Выпущено купонов: ${codes.length}\n\n${codeLines}`;
  if (htmlText.length <= 3900) {
    await ctx.reply(htmlText);
    return;
  }
  const plainText = `Выпущено купонов: ${codes.length}\n\n${codes.join('\n')}`;
  await ctx.replyWithDocument({
    source: Buffer.from(plainText, 'utf8'),
    filename: 'strongest-os-coupons.txt',
  });
};

export const handleAdminCouponInfoCommand = async (
  ctx: BotContext,
  env: AppEnv,
  repository: CouponRepository | undefined,
): Promise<void> => {
  if (!(await requireAdmin(ctx, env))) return;
  const repo = await requireRepository(ctx, repository);
  if (!repo) return;
  const [, rawCode] = commandText(ctx).trim().split(/\s+/, 2);
  const normalized = normalizeCouponCode(rawCode ?? '');
  if (!normalized.ok) {
    await ctx.reply('Использование: /admin_coupon_info <code>');
    return;
  }
  const coupon = await new CouponAdminService(repo).getInfo(normalized.code);
  await ctx.reply(coupon ? formatCouponInfo(coupon, env.displayTimezone) : 'Купон не найден.');
};

export const handleAdminCancelCouponCommand = async (
  ctx: BotContext,
  env: AppEnv,
  repository: CouponRepository | undefined,
): Promise<void> => {
  if (!(await requireAdmin(ctx, env))) return;
  const repo = await requireRepository(ctx, repository);
  if (!repo) return;
  const [, rawCode] = commandText(ctx).trim().split(/\s+/, 2);
  const normalized = normalizeCouponCode(rawCode ?? '');
  if (!normalized.ok) {
    await ctx.reply('Использование: /admin_cancel_coupon <code>');
    return;
  }
  const coupon = await repo.getCouponInfo(normalized.code);
  if (!coupon) {
    await ctx.reply('Купон не найден.');
    return;
  }
  if (coupon.status === 'redeemed') {
    await ctx.reply('Redeemed купон нельзя отменить.');
    return;
  }
  if (coupon.status === 'cancelled') {
    await ctx.reply('Купон уже отменён.');
    return;
  }
  await ctx.reply(
    `Подтвердите отмену купона ${escapeTelegramHtml(normalized.code)}.`,
    Markup.inlineKeyboard([
      [Markup.button.callback('Подтвердить отмену', `admin_coupon_cancel:${normalized.code}`)],
    ]),
  );
};

export const handleAdminCouponCancelCallback = async (
  ctx: BotContext,
  env: AppEnv,
  repository: CouponRepository | undefined,
): Promise<void> => {
  await ctx.answerCbQuery();
  if (!(await requireAdmin(ctx, env))) return;
  const repo = await requireRepository(ctx, repository);
  if (!repo) return;
  const callbackQuery = ctx.callbackQuery;
  const data = callbackQuery && 'data' in callbackQuery ? callbackQuery.data : '';
  const code = data.replace('admin_coupon_cancel:', '');
  const normalized = normalizeCouponCode(code);
  if (!normalized.ok) {
    await ctx.reply('Некорректный код купона.');
    return;
  }
  const result = await new CouponAdminService(repo).cancel(normalized.code);
  const messages: Record<typeof result.status, string> = {
    cancelled: 'Купон отменён.',
    already_cancelled: 'Купон уже отменён.',
    redeemed: 'Redeemed купон нельзя отменить.',
    expired: 'Истёкший купон нельзя отменить.',
    not_found: 'Купон не найден.',
  };
  await ctx.reply(messages[result.status]);
};
