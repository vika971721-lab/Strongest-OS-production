import type { AppEnv } from '../config/env.js';
import type { CouponRepository } from '../repositories/couponRepository.js';
import type { PaymentAccessGateway } from './paymentFlow.js';
import type {
  CouponDurationDays,
  CouponRedemptionResult,
  CreateCouponInput,
} from '../types/coupon.js';
import {
  generateCouponCode,
  isCouponDurationDays,
  normalizeCouponCode,
  safeCouponLogData,
} from '../utils/couponCodes.js';
import { logger, normalizeError } from '../utils/logger.js';

export interface CouponAccountCredentials {
  loginEmail: string;
  password: string;
}

export type CouponActivationResult = CouponRedemptionResult & {
  credentials?: CouponAccountCredentials;
};

export interface CouponService {
  redeem(code: string, telegramId: string): Promise<CouponActivationResult>;
}

export class MockCouponService implements CouponService {
  async redeem(_code: string, _telegramId: string): Promise<CouponActivationResult> {
    await Promise.resolve();
    return { status: 'temporary_error' };
  }
}

export class CouponAttemptLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts = 5,
    private readonly windowMs = 5 * 60 * 1000,
  ) {}

  isLimited(telegramId: string, nowMs = Date.now()): boolean {
    const since = nowMs - this.windowMs;
    const attempts = (this.attempts.get(telegramId) ?? []).filter((time) => time >= since);
    this.attempts.set(telegramId, attempts);
    return attempts.length >= this.maxAttempts;
  }

  recordFailure(telegramId: string, nowMs = Date.now()): void {
    const since = nowMs - this.windowMs;
    const attempts = (this.attempts.get(telegramId) ?? []).filter((time) => time >= since);
    attempts.push(nowMs);
    this.attempts.set(telegramId, attempts);
  }

  clear(telegramId: string): void {
    this.attempts.delete(telegramId);
  }
}

export class DefaultCouponService implements CouponService {
  constructor(
    private readonly repository: CouponRepository,
    private readonly accessGateway: PaymentAccessGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async redeem(code: string, telegramId: string): Promise<CouponActivationResult> {
    const normalized = normalizeCouponCode(code);
    if (!normalized.ok) return { status: 'not_found' };
    const safeCode = safeCouponLogData(normalized.code);

    const precheck = await this.repository.getCouponInfo(normalized.code, this.now());
    if (!precheck) {
      logger.info({ telegramId, ...safeCode }, 'coupon_not_found');
      return { status: 'not_found' };
    }
    if (!isCouponDurationDays(precheck.durationDays)) {
      logger.warn({ telegramId, couponId: precheck.id, ...safeCode }, 'coupon_activation_failed');
      return { status: 'invalid_duration' };
    }
    if (precheck.status === 'redeemed') {
      logger.info({ telegramId, couponId: precheck.id, ...safeCode }, 'coupon_already_redeemed');
      return {
        status: 'already_redeemed',
        couponId: precheck.id,
        durationDays: precheck.durationDays,
        redeemedByTelegramId: precheck.redeemedByTelegramId ?? undefined,
      };
    }
    if (precheck.status === 'expired') return { status: 'expired', couponId: precheck.id };
    if (precheck.status === 'cancelled') return { status: 'cancelled', couponId: precheck.id };

    const account = await this.accessGateway.createOrGetAccount(telegramId);
    if (account.created) logger.info({ telegramId }, 'coupon_account_created');

    const redeemed = await this.repository.redeemCouponAtomically({
      code: normalized.code,
      telegramId,
      supabaseUserId: account.supabaseUserId,
      now: this.now(),
    });

    if (redeemed.status === 'success') {
      logger.info({ telegramId, couponId: redeemed.couponId, ...safeCode }, 'coupon_redeemed');
      logger.info({ telegramId, couponId: redeemed.couponId }, 'coupon_subscription_extended');
      const result: CouponActivationResult = { ...redeemed };
      if (account.created && account.generatedPassword) {
        result.credentials = {
          loginEmail: account.loginEmail,
          password: account.generatedPassword,
        };
      }
      return result;
    }

    if (account.created && redeemed.status === 'already_redeemed') {
      logger.info({ telegramId, couponId: precheck.id, ...safeCode }, 'coupon_race_lost');
    }
    if (redeemed.status === 'expired')
      logger.info({ telegramId, couponId: precheck.id }, 'coupon_expired');
    if (redeemed.status === 'cancelled')
      logger.info({ telegramId, couponId: precheck.id }, 'coupon_cancelled');
    if (redeemed.status === 'temporary_error')
      logger.error({ telegramId, couponId: precheck.id }, 'coupon_activation_failed');
    return redeemed;
  }
}

export interface IssueCouponsInput {
  durationDays: CouponDurationDays;
  count: number;
  adminTelegramId: string;
  now: Date;
}

export class CouponAdminService {
  constructor(private readonly repository: CouponRepository) {}

  async issueCoupons(input: IssueCouponsInput): Promise<string[]> {
    const coupons: CreateCouponInput[] = [];
    for (let index = 0; index < input.count; index += 1) {
      let code = '';
      for (let attempt = 0; attempt < 20; attempt += 1) {
        code = generateCouponCode(input.durationDays);
        const existing = await this.repository.findByCode(code);
        if (!existing) break;
        code = '';
      }
      if (!code) throw new Error('Unable to generate unique coupon code');
      coupons.push({
        code,
        durationDays: input.durationDays,
        status: 'issued',
        source: 'admin',
        createdByTelegramId: input.adminTelegramId,
        issuedAt: input.now,
      });
    }
    const created = await this.repository.createManyCoupons(coupons);
    logger.info(
      { adminTelegramId: input.adminTelegramId, count: created.length },
      'admin_coupon_issued',
    );
    return created.map((coupon) => coupon.code);
  }

  async getInfo(code: string) {
    try {
      const coupon = await this.repository.getCouponInfo(code);
      logger.info('admin_coupon_lookup');
      return coupon;
    } catch (error) {
      logger.error({ err: normalizeError(error) }, 'admin_coupon_lookup_failed');
      throw error;
    }
  }

  async cancel(code: string) {
    const result = await this.repository.cancelCoupon(code);
    if (result.status === 'cancelled') logger.info('admin_coupon_cancelled');
    return result;
  }
}

export const parseCouponIssueArgs = (
  text: string,
): { ok: true; days: CouponDurationDays; count: number } | { ok: false } => {
  const [, daysRaw, countRaw] = text.trim().split(/\s+/);
  const days = Number(daysRaw);
  const count = countRaw ? Number(countRaw) : 1;
  if (!Number.isInteger(days) || !isCouponDurationDays(days)) return { ok: false };
  if (!Number.isInteger(count) || count < 1 || count > 100) return { ok: false };
  return { ok: true, days, count };
};

export const appUrlForCoupon = (env: AppEnv): string =>
  env.appUrl ?? 'https://strongest-os.example.invalid';
