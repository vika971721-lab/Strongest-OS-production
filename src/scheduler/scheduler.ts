import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../config/env.js';
import type { NotificationService } from '../services/notificationService.js';
import {
  getPeriodEnd,
  type SubscriptionLifecycleRepository,
  type SubscriptionLifecycleService,
} from '../services/subscriptionLifecycleService.js';
import type { AccountDeletionService } from '../services/accountDeletionService.js';
import type { Database } from '../types/database.js';
import { logger, normalizeError } from '../utils/logger.js';

export interface Scheduler {
  start(): void;
  stop(): void;
  runOnce(options?: { dryRun?: boolean }): Promise<SchedulerRunSummary>;
  getStatus(): SchedulerStatus;
  preview(): Promise<Record<string, number>>;
}

export interface SchedulerRunSummary {
  startedAt: Date;
  completedAt?: Date;
  processed: number;
  errors: number;
  skippedByLock: boolean;
  dryRun: boolean;
}

export interface SchedulerStatus {
  enabled: boolean;
  intervalSeconds: number;
  batchSize: number;
  retentionDays: number;
  warningHours: number;
  dryRun: boolean;
  lastStartedAt?: Date;
  lastSuccessfulCompletedAt?: Date;
  lastProcessed: number;
  lastErrors: number;
  running: boolean;
}

export class NoopScheduler implements Scheduler {
  start(): void {}
  stop(): void {}
  async runOnce(): Promise<SchedulerRunSummary> {
    const now = new Date();
    await Promise.resolve();
    return {
      startedAt: now,
      completedAt: now,
      processed: 0,
      errors: 0,
      skippedByLock: false,
      dryRun: true,
    };
  }
  getStatus(): SchedulerStatus {
    return {
      enabled: false,
      intervalSeconds: 0,
      batchSize: 0,
      retentionDays: 0,
      warningHours: 0,
      dryRun: true,
      lastProcessed: 0,
      lastErrors: 0,
      running: false,
    };
  }
  async preview(): Promise<Record<string, number>> {
    await Promise.resolve();
    return {};
  }
}

export interface SchedulerLockGateway {
  tryAcquire(): Promise<boolean>;
  release(): Promise<void>;
}

interface SupabaseLike {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export class SupabaseSchedulerLockGateway implements SchedulerLockGateway {
  private readonly client: SupabaseLike;

  constructor(client: SupabaseClient<Database>) {
    this.client = client as unknown as SupabaseLike;
  }

  async tryAcquire(): Promise<boolean> {
    const { data, error } = await this.client.rpc('try_acquire_subscription_scheduler_lock');
    if (error) throw new Error(`Scheduler lock failed: ${error.message}`);
    return data === true;
  }

  async release(): Promise<void> {
    const { error } = await this.client.rpc('release_subscription_scheduler_lock');
    if (error) throw new Error(`Scheduler lock release failed: ${error.message}`);
  }
}

export class SchedulerRunner implements Scheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private status: SchedulerStatus;

  constructor(
    private readonly env: AppEnv,
    private readonly lock: SchedulerLockGateway,
    private readonly subscriptions: SubscriptionLifecycleRepository,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly notifications: NotificationService,
    private readonly deletion: AccountDeletionService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.status = {
      enabled: env.schedulerEnabled ?? true,
      intervalSeconds: env.schedulerIntervalSeconds ?? 60,
      batchSize: env.schedulerBatchSize ?? 100,
      retentionDays: env.subscriptionRetentionDays ?? 60,
      warningHours: env.deletionWarningHours ?? 24,
      dryRun: env.schedulerDryRun ?? false,
      lastProcessed: 0,
      lastErrors: 0,
      running: false,
    };
  }

  start(): void {
    if (!(this.env.schedulerEnabled ?? true) || this.timer) return;
    this.timer = setInterval(
      () => {
        void this.runOnce().catch((error: unknown) => {
          logger.error({ err: normalizeError(error) }, 'scheduler_failed');
        });
      },
      (this.env.schedulerIntervalSeconds ?? 60) * 1000,
    );
    this.timer.unref();
    void this.runOnce().catch((error: unknown) => {
      logger.error({ err: normalizeError(error) }, 'scheduler_failed');
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  getStatus(): SchedulerStatus {
    return { ...this.status, running: this.running };
  }

  async preview(): Promise<Record<string, number>> {
    return { ...(await this.lifecycle.preview(this.now(), this.env.schedulerBatchSize ?? 100)) };
  }

  async runOnce(options: { dryRun?: boolean } = {}): Promise<SchedulerRunSummary> {
    const dryRun = options.dryRun ?? this.env.schedulerDryRun ?? false;
    const startedAt = this.now();
    const summary: SchedulerRunSummary = {
      startedAt,
      processed: 0,
      errors: 0,
      skippedByLock: false,
      dryRun,
    };
    this.status.lastStartedAt = startedAt;
    if (!(this.env.schedulerEnabled ?? true) && !options.dryRun)
      return { ...summary, completedAt: startedAt };
    if (this.running) {
      logger.info('scheduler_lock_skipped');
      return { ...summary, skippedByLock: true, completedAt: this.now() };
    }
    this.running = true;
    logger.info({ dryRun }, 'scheduler_started');
    let locked = false;
    try {
      locked = await this.lock.tryAcquire();
      if (!locked) {
        logger.info('scheduler_lock_skipped');
        return { ...summary, skippedByLock: true, completedAt: this.now() };
      }
      logger.info('scheduler_lock_acquired');
      const now = this.now();
      await this.processActive(now, dryRun, summary);
      await this.processWarnings(now, dryRun, summary);
      await this.processDeletion(now, dryRun, summary);
      summary.completedAt = this.now();
      this.status.lastSuccessfulCompletedAt = summary.completedAt;
      logger.info(
        { processed: summary.processed, errors: summary.errors, dryRun },
        'scheduler_completed',
      );
      return summary;
    } catch (error) {
      summary.errors += 1;
      logger.error({ err: normalizeError(error) }, 'scheduler_failed');
      return { ...summary, completedAt: this.now() };
    } finally {
      if (locked) {
        try {
          await this.lock.release();
        } catch (error) {
          logger.error({ err: normalizeError(error) }, 'scheduler_lock_release_failed');
        }
      }
      this.running = false;
      this.status.lastProcessed = summary.processed;
      this.status.lastErrors = summary.errors;
    }
  }

  private async processActive(
    now: Date,
    dryRun: boolean,
    summary: SchedulerRunSummary,
  ): Promise<void> {
    const subscriptions = await this.subscriptions.listActiveCandidates(
      now,
      this.env.schedulerBatchSize ?? 100,
    );
    for (const subscription of subscriptions) {
      try {
        const type = this.lifecycle.chooseActiveNotification(subscription, now);
        const periodEnd = getPeriodEnd(subscription);
        if (type && periodEnd) {
          summary.processed += 1;
          if (!dryRun) {
            await this.notifications.sendLifecycleNotification({
              subscriptionId: subscription.id ?? '',
              telegramId: subscription.telegramId,
              type,
              periodEnd,
              now,
            });
          }
        }
        if (type === 'expired') {
          summary.processed += 1;
          if (!dryRun) await this.lifecycle.expireActive(subscription, now);
        }
      } catch (error) {
        summary.errors += 1;
        logger.error(
          { err: normalizeError(error), telegramId: subscription.telegramId },
          'scheduler_user_failed',
        );
      }
    }
  }

  private async processWarnings(
    now: Date,
    dryRun: boolean,
    summary: SchedulerRunSummary,
  ): Promise<void> {
    const subscriptions = await this.subscriptions.listExpiredForWarning(
      now,
      this.env.deletionWarningHours ?? 24,
      this.env.schedulerBatchSize ?? 100,
    );
    for (const subscription of subscriptions) {
      try {
        const repaired = await this.lifecycle.repairExpiredIfNeeded(subscription, now);
        if (
          !repaired ||
          !this.lifecycle.shouldSendDeletionWarning(repaired, now) ||
          !repaired.deleteAfter
        )
          continue;
        summary.processed += 1;
        if (!dryRun) {
          await this.notifications.sendLifecycleNotification({
            subscriptionId: repaired.id ?? '',
            telegramId: repaired.telegramId,
            type: 'deletion_warning',
            periodEnd: repaired.deleteAfter,
            now,
          });
          logger.info({ telegramId: repaired.telegramId }, 'deletion_warning_sent');
        }
      } catch (error) {
        summary.errors += 1;
        logger.error(
          { err: normalizeError(error), telegramId: subscription.telegramId },
          'scheduler_user_failed',
        );
      }
    }
  }

  private async processDeletion(
    now: Date,
    dryRun: boolean,
    summary: SchedulerRunSummary,
  ): Promise<void> {
    const subscriptions = await this.subscriptions.listExpiredForDeletion(
      now,
      this.env.schedulerBatchSize ?? 100,
    );
    for (const subscription of subscriptions) {
      try {
        const repaired = await this.lifecycle.repairExpiredIfNeeded(subscription, now);
        if (!repaired) continue;
        summary.processed += 1;
        if (dryRun) continue;
        const marked = await this.lifecycle.markForDeletion(repaired, now);
        if (marked?.id) await this.deletion.cleanupSubscription({ subscriptionId: marked.id, now });
      } catch (error) {
        summary.errors += 1;
        logger.error(
          { err: normalizeError(error), telegramId: subscription.telegramId },
          'scheduler_user_failed',
        );
      }
    }
  }
}
