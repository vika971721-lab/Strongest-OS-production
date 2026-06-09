import type { CouponRedemptionResult } from '../types/coupon.js';

export interface CouponRepository {
  redeem(code: string, telegramId: string): Promise<CouponRedemptionResult>;
}
