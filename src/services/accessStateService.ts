import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '../types/subscription.js';
import type { AccessStateProvider, UserAccessState } from '../types/accessState.js';
import { logger, normalizeError } from '../utils/logger.js';

export interface AccessStateSourceRecord {
  telegramId: string;
  botUserExists: boolean;
  hasAuthAccount: boolean;
  loginEmail?: string | null;
  status?: string | null;
  trialUsed?: boolean | null;
  expiresAt?: string | Date | null;
  deleteAfter?: string | Date | null;
  brokenLinkReason?: string;
}

export interface AccessStateSource {
  findAccessStateRecord(telegramId: string): Promise<AccessStateSourceRecord | undefined>;
}

const isKnownStatus = (status: string): status is SubscriptionStatus =>
  (SUBSCRIPTION_STATUSES as readonly string[]).includes(status);

const normalizeDate = (value: string | Date | null | undefined): string | undefined => {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
};

const base = (telegramId: string, record?: AccessStateSourceRecord) => ({
  telegramId,
  loginEmail: record?.loginEmail ?? undefined,
  trialUsed: record?.trialUsed ?? false,
  expiresAt: normalizeDate(record?.expiresAt),
  deleteAfter: normalizeDate(record?.deleteAfter),
});

export class DefaultAccessStateService implements AccessStateProvider {
  constructor(private readonly source?: AccessStateSource) {}

  async getUserAccessState(telegramId: string): Promise<UserAccessState> {
    if (!this.source) return { kind: 'telegram_registered', ...base(telegramId) };

    try {
      const record = await this.source.findAccessStateRecord(telegramId);
      if (!record) return { kind: 'unregistered', ...base(telegramId) };
      if (record.brokenLinkReason) {
        return {
          kind: 'broken_link',
          reason: record.brokenLinkReason,
          ...base(telegramId, record),
        };
      }
      if (!record.hasAuthAccount)
        return { kind: 'telegram_registered', ...base(telegramId, record) };
      if (!record.status)
        return { kind: 'broken_link', reason: 'subscription_missing', ...base(telegramId, record) };
      if (!isKnownStatus(record.status)) {
        logger.warn({ telegramId }, 'unknown_status_received');
        return { kind: 'unknown_status', rawStatus: record.status, ...base(telegramId, record) };
      }

      const stateBase = base(telegramId, record);
      switch (record.status) {
        case 'pending':
          return { kind: 'account_pending', status: 'pending', ...stateBase };
        case 'active':
          return { kind: 'active', status: 'active', ...stateBase };
        case 'expired':
          return { kind: 'expired', status: 'expired', ...stateBase };
        case 'cancelled':
          return { kind: 'cancelled', status: 'cancelled', ...stateBase };
        case 'banned':
          return { kind: 'banned', status: 'banned', ...stateBase };
        case 'marked_for_deletion':
          return { kind: 'marked_for_deletion', status: 'marked_for_deletion', ...stateBase };
        case 'deleted':
          return { kind: 'deleted', status: 'deleted', ...stateBase };
      }
    } catch (error) {
      logger.error({ err: normalizeError(error), telegramId }, 'access_state_load_failed');
      return { kind: 'temporarily_unavailable', telegramId };
    }
  }
}
