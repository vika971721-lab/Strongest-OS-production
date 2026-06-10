export const SUBSCRIPTION_STATUSES = [
  'pending',
  'active',
  'expired',
  'cancelled',
  'banned',
  'marked_for_deletion',
  'deleted',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface Subscription {
  id?: string;
  telegramId: string;
  status: SubscriptionStatus;
  supabaseUserId?: string | null;
  trialUsed?: boolean;
  loginEmail?: string | null;
  expiresAt?: Date | null;
  currentPeriodEnd?: Date | null;
  expiredAt?: Date | null;
  deleteAfter?: Date | null;
  markedForDeletionAt?: Date | null;
  deletedAt?: Date | null;
  firstPaymentAt?: Date | null;
  lastPaymentAt?: Date | null;
}
