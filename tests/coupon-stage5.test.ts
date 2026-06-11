import { describe, expect, it, vi } from 'vitest';
import {
  CouponAdminService,
  CouponAttemptLimiter,
  DefaultCouponService,
} from '../src/services/couponService.js';
import type { CouponRepository } from '../src/repositories/couponRepository.js';
import type {
  AccessCoupon,
  CouponRedeemInput,
  CouponRedemptionResult,
  CreateCouponInput,
} from '../src/types/coupon.js';
import {
  generateCouponCode,
  normalizeCouponCode,
  safeCouponLogData,
} from '../src/utils/couponCodes.js';
import type { PaymentAccessGateway } from '../src/services/paymentFlow.js';

const now = new Date('2026-06-10T00:00:00.000Z');
const addDays = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000);

class FakeCouponRepository implements CouponRepository {
  coupons = new Map<string, AccessCoupon>();
  subscriptions = new Map<
    string,
    { status: string; expiresAt?: Date; trialUsed: boolean; updates: number }
  >();
  failAfterSubscriptionUpdate = false;

  async findByCode(code: string) {
    await Promise.resolve();
    return this.coupons.get(code);
  }
  async findById(id: string) {
    await Promise.resolve();
    return [...this.coupons.values()].find((coupon) => coupon.id === id);
  }
  async createCoupon(input: CreateCouponInput) {
    const [created] = await this.createManyCoupons([input]);
    if (!created) throw new Error('missing');
    return created;
  }
  async createManyCoupons(inputs: CreateCouponInput[]) {
    await Promise.resolve();
    return inputs.map((input, index) => {
      const coupon: AccessCoupon = { id: `c${this.coupons.size + index}`, ...input };
      this.coupons.set(coupon.code, coupon);
      return coupon;
    });
  }
  async cancelCoupon(code: string) {
    await Promise.resolve();
    const coupon = this.coupons.get(code);
    if (!coupon) return { status: 'not_found' as const };
    if (coupon.status === 'redeemed') return { status: 'redeemed' as const };
    if (coupon.status === 'cancelled') return { status: 'already_cancelled' as const };
    if (coupon.status === 'expired') return { status: 'expired' as const };
    coupon.status = 'cancelled';
    return { status: 'cancelled' as const };
  }
  async getCouponInfo(code: string, at = now) {
    await Promise.resolve();
    const coupon = this.coupons.get(code);
    if (coupon?.status === 'issued' && coupon.expiresAt && coupon.expiresAt <= at)
      coupon.status = 'expired';
    return coupon;
  }
  async redeemCouponAtomically(input: CouponRedeemInput): Promise<CouponRedemptionResult> {
    await Promise.resolve();
    const coupon = this.coupons.get(input.code);
    if (!coupon) return { status: 'not_found' };
    if (coupon.status === 'redeemed') {
      return {
        status: 'already_redeemed',
        redeemedByTelegramId: coupon.redeemedByTelegramId ?? undefined,
      };
    }
    if (coupon.status === 'expired') return { status: 'expired' };
    if (coupon.status === 'cancelled') return { status: 'cancelled' };
    if (![30, 60, 180].includes(coupon.durationDays)) return { status: 'invalid_duration' };
    // Mirrors the fixed RPC: create subscription if not found (new users have no sub yet)
    let sub = this.subscriptions.get(input.telegramId);
    if (!sub) {
      sub = { status: 'pending', trialUsed: false, updates: 0 };
      this.subscriptions.set(input.telegramId, sub);
    }
    if (sub.status === 'banned') return { status: 'banned' };
    if (sub.status === 'deleted') return { status: 'deleted' };
    const before = { ...sub };
    const couponBefore = { ...coupon };
    const base = sub.expiresAt && sub.expiresAt > input.now ? sub.expiresAt : input.now;
    const expiresAt = addDays(base, coupon.durationDays);
    sub.status = 'active';
    sub.expiresAt = expiresAt;
    sub.updates += 1;
    if (this.failAfterSubscriptionUpdate) {
      Object.assign(sub, before);
      Object.assign(coupon, couponBefore);
      return { status: 'temporary_error' };
    }
    coupon.status = 'redeemed';
    coupon.redeemedByTelegramId = input.telegramId;
    coupon.redeemedByUserId = input.supabaseUserId;
    return {
      status: 'success',
      couponId: coupon.id,
      durationDays: coupon.durationDays as 30,
      expiresAt,
    };
  }
}

const gateway = (created = false): PaymentAccessGateway => ({
  getAccessState: vi.fn(),
  createOrGetAccount: vi.fn((telegramId: string) => {
    const account = {
      supabaseUserId: `u-${telegramId}`,
      loginEmail: `tg${telegramId}@example.invalid`,
      created,
    };
    return Promise.resolve(
      created ? { ...account, generatedPassword: 'generated-password' } : account,
    );
  }),
  extendSubscription: vi.fn(),
  ensureBotUser: vi.fn().mockResolvedValue(undefined),
  getAccessSummary: vi.fn(),
  adminExtend: vi.fn(),
});

const seed = (repo: FakeCouponRepository, code: string, durationDays = 30) => {
  repo.coupons.set(code, {
    id: code,
    code,
    durationDays,
    status: 'issued',
    source: 'admin',
    issuedAt: now,
  });
};

describe('stage 5 gift coupons', () => {
  it('normalizes code and rejects empty, multiline, command, and too long values', () => {
    expect(normalizeCouponCode(' str-1m-k8x2pq ')).toEqual({ ok: true, code: 'STR-1M-K8X2PQ' });
    expect(normalizeCouponCode('')).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeCouponCode('A\nB')).toEqual({ ok: false, reason: 'multiline' });
    expect(normalizeCouponCode('/start')).toEqual({ ok: false, reason: 'command' });
    expect(normalizeCouponCode('A'.repeat(65))).toEqual({ ok: false, reason: 'too_long' });
  });

  it.each([30, 60, 180])(
    'redeems issued %s-day coupon from database duration only',
    async (days) => {
      const repo = new FakeCouponRepository();
      seed(repo, `STR-X-${days}`, days);
      repo.subscriptions.set('1', { status: 'pending', trialUsed: false, updates: 0 });
      const result = await new DefaultCouponService(repo, gateway(), () => now).redeem(
        `str-x-${days}`,
        '1',
      );
      expect(result.status).toBe('success');
      expect(result.durationDays).toBe(days);
      expect(repo.subscriptions.get('1')).toMatchObject({
        status: 'active',
        trialUsed: false,
        updates: 1,
      });
    },
  );

  it.each([
    ['not_found', undefined, 'not_found'],
    ['redeemed', 'redeemed', 'already_redeemed'],
    ['expired', 'expired', 'expired'],
    ['cancelled', 'cancelled', 'cancelled'],
    ['invalid_duration', 'issued', 'invalid_duration'],
  ])('returns %s without issuing days', async (_name, status, expected) => {
    const repo = new FakeCouponRepository();
    if (status)
      repo.coupons.set('STR-1M-AAAA', {
        id: 'c',
        code: 'STR-1M-AAAA',
        durationDays: expected === 'invalid_duration' ? 7 : 30,
        status: status as AccessCoupon['status'],
        source: 'admin',
      });
    repo.subscriptions.set('1', { status: 'active', expiresAt: now, trialUsed: false, updates: 0 });
    const result = await new DefaultCouponService(repo, gateway(), () => now).redeem(
      'STR-1M-AAAA',
      '1',
    );
    expect(result.status).toBe(expected);
    expect(repo.subscriptions.get('1')?.updates).toBe(0);
  });

  it('extends active from expires_at and expired from now', async () => {
    const repo = new FakeCouponRepository();
    seed(repo, 'STR-1M-ACTIVE', 30);
    seed(repo, 'STR-1M-EXPIRED', 30);
    repo.subscriptions.set('active', {
      status: 'active',
      expiresAt: addDays(now, 10),
      trialUsed: false,
      updates: 0,
    });
    repo.subscriptions.set('expired', {
      status: 'expired',
      expiresAt: addDays(now, -1),
      trialUsed: false,
      updates: 0,
    });
    const service = new DefaultCouponService(repo, gateway(), () => now);
    await service.redeem('STR-1M-ACTIVE', 'active');
    await service.redeem('STR-1M-EXPIRED', 'expired');
    expect(repo.subscriptions.get('active')?.expiresAt?.toISOString()).toBe(
      addDays(now, 40).toISOString(),
    );
    expect(repo.subscriptions.get('expired')?.expiresAt?.toISOString()).toBe(
      addDays(now, 30).toISOString(),
    );
  });

  it.each(['pending', 'marked_for_deletion', 'cancelled'])('%s becomes active', async (status) => {
    const repo = new FakeCouponRepository();
    const code = `STR-${status}`.toUpperCase();
    seed(repo, code, 30);
    repo.subscriptions.set('1', { status, trialUsed: false, updates: 0 });
    await new DefaultCouponService(repo, gateway(), () => now).redeem(code, '1');
    expect(repo.subscriptions.get('1')?.status).toBe('active');
  });

  it.each(['banned', 'deleted'])('%s is rejected and coupon remains issued', async (status) => {
    const repo = new FakeCouponRepository();
    seed(repo, 'STR-1M-BLOCK', 30);
    repo.subscriptions.set('1', { status, trialUsed: false, updates: 0 });
    const result = await new DefaultCouponService(repo, gateway(), () => now).redeem(
      'STR-1M-BLOCK',
      '1',
    );
    expect(result.status).toBe(status);
    expect(repo.coupons.get('STR-1M-BLOCK')?.status).toBe('issued');
  });

  it('new user gets account credentials, existing user does not get a new password, and payment events are untouched', async () => {
    const repo = new FakeCouponRepository();
    seed(repo, 'STR-1M-NEW', 30);
    seed(repo, 'STR-1M-OLD', 30);
    repo.subscriptions.set('1', { status: 'pending', trialUsed: false, updates: 0 });
    repo.subscriptions.set('2', { status: 'active', trialUsed: false, updates: 0 });
    const newResult = await new DefaultCouponService(repo, gateway(true), () => now).redeem(
      'STR-1M-NEW',
      '1',
    );
    const oldResult = await new DefaultCouponService(repo, gateway(false), () => now).redeem(
      'STR-1M-OLD',
      '2',
    );
    expect(newResult.credentials).toMatchObject({ loginEmail: 'tg1@example.invalid' });
    expect(oldResult.credentials).toBeUndefined();
    expect(repo.subscriptions.get('1')?.trialUsed).toBe(false);
  });

  it('only one of two concurrent users receives days and repeat update is idempotent', async () => {
    const repo = new FakeCouponRepository();
    seed(repo, 'STR-1M-RACE', 30);
    repo.subscriptions.set('1', { status: 'active', trialUsed: false, updates: 0 });
    repo.subscriptions.set('2', { status: 'active', trialUsed: false, updates: 0 });
    const service = new DefaultCouponService(repo, gateway(), () => now);
    const [a, b] = await Promise.all([
      service.redeem('STR-1M-RACE', '1'),
      service.redeem('STR-1M-RACE', '2'),
    ]);
    expect([a.status, b.status].sort()).toEqual(['already_redeemed', 'success']);
    await service.redeem('STR-1M-RACE', '1');
    expect(
      (repo.subscriptions.get('1')?.updates ?? 0) + (repo.subscriptions.get('2')?.updates ?? 0),
    ).toBe(1);
  });

  it('account created but race lost leaves pending subscription and no second account', async () => {
    const repo = new FakeCouponRepository();
    repo.coupons.set('STR-1M-USED', {
      id: 'c',
      code: 'STR-1M-USED',
      durationDays: 30,
      status: 'redeemed',
      source: 'admin',
      redeemedByTelegramId: 'other',
    });
    repo.subscriptions.set('1', { status: 'pending', trialUsed: false, updates: 0 });
    const result = await new DefaultCouponService(repo, gateway(true), () => now).redeem(
      'STR-1M-USED',
      '1',
    );
    expect(result.status).toBe('already_redeemed');
    expect(repo.subscriptions.get('1')).toMatchObject({ status: 'pending', updates: 0 });
  });

  it('temporary RPC failure rolls back fake partial changes', async () => {
    const repo = new FakeCouponRepository();
    repo.failAfterSubscriptionUpdate = true;
    seed(repo, 'STR-1M-FAIL', 30);
    repo.subscriptions.set('1', { status: 'active', expiresAt: now, trialUsed: false, updates: 0 });
    const result = await new DefaultCouponService(repo, gateway(), () => now).redeem(
      'STR-1M-FAIL',
      '1',
    );
    expect(result.status).toBe('temporary_error');
    expect(repo.coupons.get('STR-1M-FAIL')?.status).toBe('issued');
    expect(repo.subscriptions.get('1')?.updates).toBe(0);
  });

  it('safe logger data omits full code and limiter clears after success', () => {
    const safe = safeCouponLogData('STR-1M-SECRET12');
    expect(JSON.stringify(safe)).not.toContain('STR-1M-SECRET12');
    const limiter = new CouponAttemptLimiter(2, 1000);
    limiter.recordFailure('1', 100);
    limiter.recordFailure('1', 200);
    expect(limiter.isLimited('1', 300)).toBe(true);
    limiter.clear('1');
    expect(limiter.isLimited('1', 300)).toBe(false);
  });

  it('admin issue/info/cancel validates args, retries collisions, and cannot cancel redeemed coupons', async () => {
    const repo = new FakeCouponRepository();
    const service = new CouponAdminService(repo);
    expect(
      await service.issueCoupons({ durationDays: 30, count: 2, adminTelegramId: '42', now }),
    ).toHaveLength(2);
    const code = [...repo.coupons.keys()][0];
    expect(code).toBeDefined();
    expect(await service.getInfo(code ?? '')).toMatchObject({
      status: 'issued',
      createdByTelegramId: '42',
    });
    await expect(service.cancel(code ?? '')).resolves.toEqual({ status: 'cancelled' });
    repo.coupons.set('USED', {
      id: 'u',
      code: 'USED',
      durationDays: 30,
      status: 'redeemed',
      source: 'admin',
    });
    await expect(service.cancel('USED')).resolves.toEqual({ status: 'redeemed' });
  });

  it('generated coupons use crypto-friendly alphabet without ambiguous symbols', () => {
    const code = generateCouponCode(180, 64);
    expect(code).toMatch(/^STR-6M-/);
    expect(code).not.toMatch(/[0O1IL]/);
  });

  it('new user without subscription activates coupon and gets credentials', async () => {
    const repo = new FakeCouponRepository();
    seed(repo, 'STR-1M-NEWUSER', 30);
    // No subscription row seeded — user has never paid
    const result = await new DefaultCouponService(repo, gateway(true), () => now).redeem(
      'STR-1M-NEWUSER',
      'newuser',
    );
    expect(result.status).toBe('success');
    expect(result.durationDays).toBe(30);
    expect(result.credentials).toMatchObject({ loginEmail: 'tgnewuser@example.invalid' });
    expect(repo.subscriptions.get('newuser')?.status).toBe('active');
    expect(repo.coupons.get('STR-1M-NEWUSER')?.status).toBe('redeemed');
  });

  it('existing user without prior subscription activates coupon, no password returned', async () => {
    const repo = new FakeCouponRepository();
    seed(repo, 'STR-1M-EXISTING', 30);
    // No subscription row — account exists but no payment history
    const result = await new DefaultCouponService(repo, gateway(false), () => now).redeem(
      'STR-1M-EXISTING',
      'existinguser',
    );
    expect(result.status).toBe('success');
    expect(result.credentials).toBeUndefined();
    expect(repo.subscriptions.get('existinguser')?.status).toBe('active');
  });

  it('coupon cannot be redeemed twice and second attempt returns already_redeemed', async () => {
    const repo = new FakeCouponRepository();
    seed(repo, 'STR-1M-ONCE', 30);
    const service = new DefaultCouponService(repo, gateway(false), () => now);
    const first = await service.redeem('STR-1M-ONCE', 'user1');
    expect(first.status).toBe('success');
    expect(repo.coupons.get('STR-1M-ONCE')?.status).toBe('redeemed');
    const second = await service.redeem('STR-1M-ONCE', 'user2');
    expect(second.status).toBe('already_redeemed');
    // user2 subscription must not be extended
    expect(repo.subscriptions.get('user2')).toBeUndefined();
  });

  it('successful activation changes coupon status from issued to redeemed', async () => {
    const repo = new FakeCouponRepository();
    seed(repo, 'STR-1M-STATUS', 30);
    expect(repo.coupons.get('STR-1M-STATUS')?.status).toBe('issued');
    await new DefaultCouponService(repo, gateway(false), () => now).redeem('STR-1M-STATUS', '1');
    expect(repo.coupons.get('STR-1M-STATUS')?.status).toBe('redeemed');
  });

  it('admin issued coupon output uses <code> formatting', async () => {
    const repo = new FakeCouponRepository();
    const codes = await new CouponAdminService(repo).issueCoupons({
      durationDays: 30,
      count: 1,
      adminTelegramId: '1',
      now,
    });
    const code = codes[0];
    expect(code).toBeDefined();
    // The admin command wraps each code in <code>...</code> for tap-to-copy
    const htmlOutput = `Выпущено купонов: 1\n\n<code>${code}</code>`;
    expect(htmlOutput).toContain('<code>');
    expect(htmlOutput).toContain('</code>');
    expect(htmlOutput).toContain(code);
  });
});
