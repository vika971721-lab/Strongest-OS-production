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
  telegramId: string;
  status: SubscriptionStatus;
  expiresAt?: Date;
}
