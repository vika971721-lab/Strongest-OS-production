import type { SubscriptionStatus } from './subscription.js';

export type KnownAccessStatus = SubscriptionStatus;

export interface AccessStateBase {
  telegramId: string;
  loginEmail?: string;
  trialUsed: boolean;
  expiresAt?: string;
  deleteAfter?: string;
}

export type UserAccessState =
  | ({ kind: 'unregistered' } & AccessStateBase)
  | ({ kind: 'telegram_registered' } & AccessStateBase)
  | ({ kind: 'account_pending'; status: 'pending' } & AccessStateBase)
  | ({ kind: 'active'; status: 'active' } & AccessStateBase)
  | ({ kind: 'expired'; status: 'expired' } & AccessStateBase)
  | ({ kind: 'cancelled'; status: 'cancelled' } & AccessStateBase)
  | ({ kind: 'banned'; status: 'banned' } & AccessStateBase)
  | ({ kind: 'marked_for_deletion'; status: 'marked_for_deletion' } & AccessStateBase)
  | ({ kind: 'deleted'; status: 'deleted' } & AccessStateBase)
  | ({ kind: 'broken_link'; reason: string } & AccessStateBase)
  | ({ kind: 'unknown_status'; rawStatus: string } & AccessStateBase)
  | { kind: 'temporarily_unavailable'; telegramId: string };

export interface AccessStateProvider {
  getUserAccessState(telegramId: string): Promise<UserAccessState>;
}
