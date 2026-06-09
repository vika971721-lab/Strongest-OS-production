import type { CouponRedemptionResult } from '../types/coupon.js';

export interface CouponService {
  redeem(code: string, telegramId: string): Promise<CouponRedemptionResult>;
}

export class MockCouponService implements CouponService {
  redeem(_code: string, _telegramId: string): Promise<CouponRedemptionResult> {
    return Promise.resolve({
      status: 'not_configured',
      message: 'Проверка промокодов будет подключена после интеграции с Supabase.',
    });
  }
}
