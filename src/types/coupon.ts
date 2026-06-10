export const COUPON_DURATIONS = [30, 60, 180] as const;
export type CouponDurationDays = (typeof COUPON_DURATIONS)[number];
export const COUPON_STATUSES = ['issued', 'redeemed', 'expired', 'cancelled'] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];
export type CouponSource = string;

export interface AccessCoupon {
  id: string;
  code: string;
  durationDays: number;
  status: CouponStatus;
  source: CouponSource;
  sourceCaseId?: string | null | undefined;
  sourceOpeningId?: string | null | undefined;
  createdByUserId?: string | null | undefined;
  createdByTelegramId?: string | null | undefined;
  redeemedByUserId?: string | null | undefined;
  redeemedByTelegramId?: string | null | undefined;
  issuedAt?: Date | null | undefined;
  redeemedAt?: Date | null | undefined;
  expiresAt?: Date | null | undefined;
  createdAt?: Date | null | undefined;
  updatedAt?: Date | null | undefined;
}

export interface CreateCouponInput {
  code: string;
  durationDays: CouponDurationDays;
  status: 'issued';
  source: CouponSource;
  createdByUserId?: string | null;
  createdByTelegramId?: string | null;
  issuedAt: Date;
  expiresAt?: Date | null;
}

export type CouponNormalizeResult =
  | { ok: true; code: string }
  | { ok: false; reason: 'empty' | 'multiline' | 'too_long' | 'command' };

export type CouponRedemptionStatus =
  | 'success'
  | 'not_found'
  | 'already_redeemed'
  | 'expired'
  | 'cancelled'
  | 'invalid_duration'
  | 'subscription_not_found'
  | 'banned'
  | 'deleted'
  | 'temporary_error';

export interface CouponRedemptionResult {
  status: CouponRedemptionStatus;
  couponId?: string | undefined;
  durationDays?: CouponDurationDays | undefined;
  expiresAt?: Date | undefined;
  redeemedByTelegramId?: string | undefined;
}

export interface CouponRedeemInput {
  code: string;
  telegramId: string;
  supabaseUserId: string;
  now: Date;
}
