export type CouponRedemptionStatus =
  | 'not_configured'
  | 'redeemed'
  | 'invalid'
  | 'expired'
  | 'already_used';

export interface CouponRedemptionResult {
  status: CouponRedemptionStatus;
  message: string;
}
