import { logger } from '../utils/logger.js';
import type { NotificationType } from '../repositories/notificationRepository.js';
import type { Subscription } from '../types/subscription.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ReminderNotificationType =
  | 'five_days'
  | 'three_days'
  | 'one_day'
  | 'one_hour'
  | 'expired';

export interface SubscriptionLifecycleRepository {
  listActiveCandidates(now: Date, batchSize: number): Promise<Subscription[]>;
  listExpiredForWarning(
    now: Date,
    warningHours: number,
    batchSize: number,
  ): Promise<Subscription[]>;
  listExpiredForDeletion(now: Date, batchSize: number): Promise<Subscription[]>;
  findByTelegramId(telegramId: string): Promise<Subscription | undefined>;
  findById(id: string): Promise<Subscription | undefined>;
  expireActiveSubscription(input: {
    subscriptionId: string;
    expiresAt: Date;
    retentionDays: number;
    now: Date;
  }): Promise<Subscription | undefined>;
  repairExpiredRetention(input: {
    subscriptionId: string;
    expiredAt: Date;
    deleteAfter: Date;
    now: Date;
  }): Promise<Subscription | undefined>;
  markForDeletion(input: {
    subscriptionId: string;
    deleteAfter: Date;
    now: Date;
  }): Promise<Subscription | undefined>;
  markDeleted(input: { subscriptionId: string; now: Date }): Promise<Subscription | undefined>;
}

export interface LifecycleActionCounts {
  five_days: number;
  three_days: number;
  one_day: number;
  one_hour: number;
  expired: number;
  deletion_warning: number;
  marked_for_deletion: number;
  deletion: number;
}

export const emptyLifecycleActionCounts = (): LifecycleActionCounts => ({
  five_days: 0,
  three_days: 0,
  one_day: 0,
  one_hour: 0,
  expired: 0,
  deletion_warning: 0,
  marked_for_deletion: 0,
  deletion: 0,
});

export const getPeriodEnd = (subscription: Subscription): Date | undefined =>
  subscription.currentPeriodEnd ?? subscription.expiresAt ?? undefined;

export class SubscriptionLifecycleService {
  constructor(
    private readonly repository: SubscriptionLifecycleRepository,
    private readonly retentionDays: number,
    private readonly warningHours: number,
  ) {}

  chooseActiveNotification(
    subscription: Subscription,
    now: Date,
  ): ReminderNotificationType | undefined {
    if (subscription.status !== 'active' || !subscription.expiresAt) return undefined;
    const remainingMs = subscription.expiresAt.getTime() - now.getTime();
    if (Number.isNaN(remainingMs)) return undefined;
    if (remainingMs <= 0) return 'expired';
    if (remainingMs < HOUR_MS) return 'one_hour';
    if (remainingMs <= DAY_MS) return 'one_day';
    if (remainingMs <= 3 * DAY_MS) return 'three_days';
    if (remainingMs <= 5 * DAY_MS) return 'five_days';
    return undefined;
  }

  shouldSendDeletionWarning(subscription: Subscription, now: Date): boolean {
    if (subscription.status !== 'expired' || !subscription.deleteAfter) return false;
    const remainingMs = subscription.deleteAfter.getTime() - now.getTime();
    return remainingMs > 0 && remainingMs <= this.warningHours * HOUR_MS;
  }

  async expireActive(subscription: Subscription, now: Date): Promise<Subscription | undefined> {
    if (!subscription.id || subscription.status !== 'active' || !subscription.expiresAt)
      return undefined;
    if (subscription.expiresAt.getTime() > now.getTime()) return undefined;
    const expired = await this.repository.expireActiveSubscription({
      subscriptionId: subscription.id,
      expiresAt: subscription.expiresAt,
      retentionDays: this.retentionDays,
      now,
    });
    if (expired) logger.info({ telegramId: expired.telegramId }, 'subscription_expired');
    else
      logger.info(
        { telegramId: subscription.telegramId },
        'subscription_expiration_skipped_due_to_renewal',
      );
    return expired;
  }

  async repairExpiredIfNeeded(
    subscription: Subscription,
    now: Date,
  ): Promise<Subscription | undefined> {
    if (!subscription.id || subscription.status !== 'expired') return subscription;
    if (subscription.expiredAt && subscription.deleteAfter) return subscription;
    const expiresAt = subscription.expiresAt;
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      logger.warn(
        { telegramId: subscription.telegramId },
        'subscription_lifecycle_inconsistent_data',
      );
      return undefined;
    }
    const expiredAt = subscription.expiredAt ?? expiresAt;
    const deleteAfter = new Date(expiredAt.getTime() + this.retentionDays * DAY_MS);
    return this.repository.repairExpiredRetention({
      subscriptionId: subscription.id,
      expiredAt,
      deleteAfter,
      now,
    });
  }

  async markForDeletion(subscription: Subscription, now: Date): Promise<Subscription | undefined> {
    if (!subscription.id || subscription.status !== 'expired' || !subscription.deleteAfter)
      return undefined;
    if (subscription.deleteAfter.getTime() > now.getTime()) return undefined;
    const marked = await this.repository.markForDeletion({
      subscriptionId: subscription.id,
      deleteAfter: subscription.deleteAfter,
      now,
    });
    if (marked) logger.info({ telegramId: marked.telegramId }, 'subscription_marked_for_deletion');
    return marked;
  }

  async preview(now: Date, batchSize: number): Promise<LifecycleActionCounts> {
    const counts = emptyLifecycleActionCounts();
    for (const subscription of await this.repository.listActiveCandidates(now, batchSize)) {
      const type = this.chooseActiveNotification(subscription, now);
      if (type) counts[type] += 1;
    }
    for (const subscription of await this.repository.listExpiredForWarning(
      now,
      this.warningHours,
      batchSize,
    )) {
      if (this.shouldSendDeletionWarning(subscription, now)) counts.deletion_warning += 1;
    }
    for (const subscription of await this.repository.listExpiredForDeletion(now, batchSize)) {
      if (subscription.deleteAfter && subscription.deleteAfter <= now) {
        counts.marked_for_deletion += 1;
        counts.deletion += 1;
      }
    }
    return counts;
  }
}

export const isLifecycleNotificationType = (type: string): type is NotificationType =>
  [
    'five_days',
    'three_days',
    'one_day',
    'one_hour',
    'expired',
    'deletion_warning',
    'deleted',
  ].includes(type);
