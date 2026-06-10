import type { NotificationService } from './notificationService.js';
import type { SubscriptionLifecycleRepository } from './subscriptionLifecycleService.js';
import { logger, normalizeError } from '../utils/logger.js';

export interface CleanupResult {
  success: boolean;
  deletedTables: Record<string, number>;
}

export interface AccountCleanupGateway {
  cleanupUserData(supabaseUserId: string): Promise<CleanupResult>;
  deleteAuthUser(supabaseUserId: string): Promise<void>;
  anonymizeBotUser(telegramId: string, now: Date): Promise<void>;
}

export class AccountDeletionService {
  constructor(
    private readonly subscriptions: SubscriptionLifecycleRepository,
    private readonly cleanupGateway: AccountCleanupGateway,
    private readonly notificationService: NotificationService,
    private readonly dryRun = false,
  ) {}

  async cleanupSubscription(input: {
    subscriptionId: string;
    now: Date;
  }): Promise<'deleted' | 'cancelled' | 'skipped' | 'failed' | 'dry_run'> {
    const subscription = await this.subscriptions.findById(input.subscriptionId);
    if (!subscription) return 'skipped';
    if (subscription.status !== 'marked_for_deletion') {
      if (subscription.status === 'active') {
        logger.info(
          { telegramId: subscription.telegramId },
          'deletion_cancelled_due_to_reactivation',
        );
        return 'cancelled';
      }
      return 'skipped';
    }
    if (!subscription.deleteAfter || subscription.deleteAfter.getTime() > input.now.getTime())
      return 'skipped';
    if (!subscription.supabaseUserId) return 'skipped';
    if (this.dryRun) {
      logger.info({ telegramId: subscription.telegramId }, 'account_cleanup_dry_run');
      return 'dry_run';
    }

    try {
      logger.info({ telegramId: subscription.telegramId }, 'account_cleanup_started');
      const cleanup = await this.cleanupGateway.cleanupUserData(subscription.supabaseUserId);
      if (!cleanup.success) throw new Error('cleanup RPC returned unsuccessful result');
      logger.info({ telegramId: subscription.telegramId }, 'account_cleanup_completed');
      await this.cleanupGateway.deleteAuthUser(subscription.supabaseUserId);
      logger.info({ telegramId: subscription.telegramId }, 'auth_user_deleted');
      await this.cleanupGateway.anonymizeBotUser(subscription.telegramId, input.now);
      const deleted = await this.subscriptions.markDeleted({
        subscriptionId: input.subscriptionId,
        now: input.now,
      });
      if (!deleted) return 'failed';
      logger.info({ telegramId: subscription.telegramId }, 'subscription_marked_deleted');
      await this.notificationService.sendLifecycleNotification({
        subscriptionId: input.subscriptionId,
        telegramId: subscription.telegramId,
        type: 'deleted',
        periodEnd: subscription.deleteAfter,
        now: input.now,
      });
      return 'deleted';
    } catch (error) {
      logger.error(
        { err: normalizeError(error), telegramId: subscription.telegramId },
        'account_cleanup_failed',
      );
      return 'failed';
    }
  }
}
