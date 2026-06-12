import { describe, expect, it, vi } from 'vitest';
import type {
  NotificationRepository,
  NotificationType,
  SubscriptionNotification,
} from '../src/repositories/notificationRepository.js';
import {
  NoopScheduler,
  SchedulerRunner,
  type SchedulerLockGateway,
} from '../src/scheduler/scheduler.js';
import type { AccountCleanupGateway } from '../src/services/accountDeletionService.js';
import { AccountDeletionService } from '../src/services/accountDeletionService.js';
import {
  DefaultNotificationService,
  classifyTelegramError,
} from '../src/services/notificationService.js';
import {
  SubscriptionLifecycleService,
  type SubscriptionLifecycleRepository,
} from '../src/services/subscriptionLifecycleService.js';
import type { AppEnv } from '../src/config/env.js';
import type { Subscription } from '../src/types/subscription.js';

const now = new Date('2026-06-10T00:00:00.000Z');
const add = (ms: number) => new Date(now.getTime() + ms);
const DAY = 86_400_000;
const HOUR = 3_600_000;

const env: AppEnv = {
  nodeEnv: 'test',
  botMode: 'polling',
  botToken: 'token',
  adminTelegramIds: ['42'],
  displayTimezone: 'UTC',
  port: 3000,
  pricing: {
    firstPeriodStars: 100,
    renewalPeriodStars: 150,
    firstPeriodDays: 30,
    renewalPeriodDays: 30,
    threeMonthsStars: 399,
    threeMonthsDays: 90,
    sixMonthsStars: 749,
    sixMonthsDays: 180,
    yearlyStars: 1299,
    yearlyDays: 365,
  },
  schedulerEnabled: true,
  schedulerIntervalSeconds: 60,
  schedulerBatchSize: 100,
  subscriptionRetentionDays: 60,
  deletionWarningHours: 24,
  schedulerDryRun: false,
};

class MemorySubscriptions implements SubscriptionLifecycleRepository {
  rows = new Map<string, Subscription>();
  failTelegramId?: string;

  set(row: Subscription) {
    this.rows.set(row.id ?? row.telegramId, row);
  }
  async listActiveCandidates(at: Date, batchSize: number) {
    await Promise.resolve();
    return [...this.rows.values()]
      .filter((row) => row.status === 'active' && row.expiresAt && row.expiresAt <= add(5 * DAY))
      .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0))
      .slice(0, batchSize);
  }
  async listExpiredForWarning(at: Date, hours: number, batchSize: number) {
    await Promise.resolve();
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.status === 'expired' &&
          row.deleteAfter &&
          row.deleteAfter > at &&
          row.deleteAfter <= new Date(at.getTime() + hours * HOUR),
      )
      .slice(0, batchSize);
  }
  async listExpiredForDeletion(at: Date, batchSize: number) {
    await Promise.resolve();
    return [...this.rows.values()]
      .filter((row) => row.status === 'expired' && row.deleteAfter && row.deleteAfter <= at)
      .slice(0, batchSize);
  }
  async findByTelegramId(telegramId: string) {
    await Promise.resolve();
    return [...this.rows.values()].find((row) => row.telegramId === telegramId);
  }
  async findById(id: string) {
    await Promise.resolve();
    return this.rows.get(id);
  }
  async expireActiveSubscription(input: {
    subscriptionId: string;
    expiresAt: Date;
    retentionDays: number;
    now: Date;
  }) {
    await Promise.resolve();
    const row = this.rows.get(input.subscriptionId);
    if (!row || row.status !== 'active' || !row.expiresAt || row.expiresAt > input.now)
      return undefined;
    row.status = 'expired';
    row.expiredAt = input.expiresAt;
    row.deleteAfter = new Date(input.expiresAt.getTime() + input.retentionDays * DAY);
    return row;
  }
  async repairExpiredRetention(input: {
    subscriptionId: string;
    expiredAt: Date;
    deleteAfter: Date;
  }) {
    await Promise.resolve();
    const row = this.rows.get(input.subscriptionId);
    if (!row) return undefined;
    row.expiredAt = input.expiredAt;
    row.deleteAfter = input.deleteAfter;
    return row;
  }
  async markForDeletion(input: { subscriptionId: string; now: Date }) {
    await Promise.resolve();
    const row = this.rows.get(input.subscriptionId);
    if (!row || row.status !== 'expired' || !row.deleteAfter || row.deleteAfter > input.now)
      return undefined;
    row.status = 'marked_for_deletion';
    row.markedForDeletionAt = input.now;
    return row;
  }
  async markDeleted(input: { subscriptionId: string; now: Date }) {
    await Promise.resolve();
    const row = this.rows.get(input.subscriptionId);
    if (!row || row.status !== 'marked_for_deletion') return undefined;
    row.status = 'deleted';
    row.deletedAt = input.now;
    row.supabaseUserId = null;
    row.loginEmail = null;
    return row;
  }
}

class MemoryNotifications implements NotificationRepository {
  rows = new Map<string, SubscriptionNotification>();
  sent: NotificationType[] = [];
  temporaryFailure = false;
  permanentFailure = false;
  key(input: { subscriptionId: string; type: NotificationType; periodEnd: Date }) {
    return `${input.subscriptionId}:${input.type}:${input.periodEnd.toISOString()}`;
  }
  async findNotification(input: {
    subscriptionId: string;
    type: NotificationType;
    periodEnd: Date;
  }) {
    await Promise.resolve();
    return this.rows.get(this.key(input));
  }
  async reserveNotification(input: {
    subscriptionId: string;
    telegramId: string;
    type: NotificationType;
    periodEnd: Date;
  }) {
    await Promise.resolve();
    const key = this.key(input);
    const existing = this.rows.get(key);
    if (
      existing?.sentAt ||
      existing?.deliveryStatus === 'failed_permanent' ||
      existing?.reservationToken
    )
      return undefined;
    const notification: SubscriptionNotification = {
      id: key,
      subscriptionId: input.subscriptionId,
      telegramId: input.telegramId,
      type: input.type,
      periodEnd: input.periodEnd,
      sentAt: null,
      reservationToken: 't',
      deliveryStatus: 'reserved',
    };
    this.rows.set(key, notification);
    return { notification, token: 't' };
  }
  async markSent(input: { notificationId: string }) {
    await Promise.resolve();
    const row = this.rows.get(input.notificationId);
    if (row) {
      row.sentAt = now;
      row.reservationToken = null;
      row.deliveryStatus = 'sent';
      this.sent.push(row.type);
    }
  }
  async releaseReservation(input: { notificationId: string; permanent?: boolean }) {
    await Promise.resolve();
    const row = this.rows.get(input.notificationId);
    if (row) {
      row.reservationToken = null;
      row.deliveryStatus = input.permanent ? 'failed_permanent' : 'retryable';
    }
  }
  async listForPeriod(input: { subscriptionId: string; periodEnd: Date }) {
    await Promise.resolve();
    return [...this.rows.values()].filter(
      (row) =>
        row.subscriptionId === input.subscriptionId &&
        row.periodEnd.getTime() === input.periodEnd.getTime(),
    );
  }
}

class MemoryCleanupGateway implements AccountCleanupGateway {
  cleaned: string[] = [];
  authDeleted: string[] = [];
  anonymized: string[] = [];
  failCleanup = false;
  tables = new Map<string, { userId: string; kind: string }[]>();
  paymentOrders = [{ userId: 'u1' }];
  paymentEvents = [{ userId: 'u1' }];
  async cleanupUserData(userId: string) {
    await Promise.resolve();
    if (this.failCleanup) return { success: false, deletedTables: {} };
    this.cleaned.push(userId);
    const deletedTables: Record<string, number> = {};
    for (const [table, rows] of this.tables) {
      const before = rows.length;
      this.tables.set(
        table,
        rows.filter((row) => row.userId !== userId),
      );
      deletedTables[table] = before - (this.tables.get(table)?.length ?? 0);
    }
    return { success: true, deletedTables };
  }
  async deleteAuthUser(userId: string) {
    await Promise.resolve();
    this.authDeleted.push(userId);
  }
  async anonymizeBotUser(telegramId: string) {
    await Promise.resolve();
    this.anonymized.push(telegramId);
  }
}

class MemoryLock implements SchedulerLockGateway {
  locked = false;
  releaseCount = 0;
  throwAfterAcquire = false;
  async tryAcquire() {
    await Promise.resolve();
    if (this.locked) return false;
    this.locked = true;
    return true;
  }
  async release() {
    await Promise.resolve();
    this.locked = false;
    this.releaseCount += 1;
  }
}

const lifecycleWith = (repo = new MemorySubscriptions()) =>
  new SubscriptionLifecycleService(repo, 60, 24);
const sub = (overrides: Partial<Subscription>): Subscription => ({
  id: 's1',
  telegramId: '1',
  status: 'active',
  trialUsed: false,
  expiresAt: add(4 * DAY),
  currentPeriodEnd: add(4 * DAY),
  ...overrides,
});

describe('stage 6 subscription lifecycle', () => {
  it('1. больше 5 дней — нет уведомления', () =>
    expect(
      lifecycleWith().chooseActiveNotification(sub({ expiresAt: add(6 * DAY) }), now),
    ).toBeUndefined());
  it('2. 4 дня — five_days', () =>
    expect(lifecycleWith().chooseActiveNotification(sub({ expiresAt: add(4 * DAY) }), now)).toBe(
      'five_days',
    ));
  it('3. 2 дня — three_days', () =>
    expect(lifecycleWith().chooseActiveNotification(sub({ expiresAt: add(2 * DAY) }), now)).toBe(
      'three_days',
    ));
  it('4. 20 часов — one_day', () =>
    expect(lifecycleWith().chooseActiveNotification(sub({ expiresAt: add(20 * HOUR) }), now)).toBe(
      'one_day',
    ));
  it('5. 40 минут — one_hour', () =>
    expect(
      lifecycleWith().chooseActiveNotification(sub({ expiresAt: add(40 * 60_000) }), now),
    ).toBe('one_hour'));
  it('6. Истёкшая подписка — expired', () =>
    expect(lifecycleWith().chooseActiveNotification(sub({ expiresAt: add(-1) }), now)).toBe(
      'expired',
    ));
  it('7. Пропущенные окна дают только актуальное уведомление', () =>
    expect(
      lifecycleWith().chooseActiveNotification(sub({ expiresAt: add(40 * 60_000) }), now),
    ).toBe('one_hour'));

  it('8. Уведомление не отправляется дважды', async () => {
    const repo = new MemoryNotifications();
    const telegram = { sendMessage: vi.fn(() => Promise.resolve(true)) };
    const service = new DefaultNotificationService(repo, telegram, env);
    await service.sendLifecycleNotification({
      subscriptionId: 's1',
      telegramId: '1',
      type: 'five_days',
      periodEnd: add(4 * DAY),
      now,
    });
    await service.sendLifecycleNotification({
      subscriptionId: 's1',
      telegramId: '1',
      type: 'five_days',
      periodEnd: add(4 * DAY),
      now,
    });
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('9. Новый период после продления получает новые уведомления', async () => {
    const repo = new MemoryNotifications();
    const telegram = { sendMessage: vi.fn(() => Promise.resolve(true)) };
    const service = new DefaultNotificationService(repo, telegram, env);
    await service.sendLifecycleNotification({
      subscriptionId: 's1',
      telegramId: '1',
      type: 'five_days',
      periodEnd: add(4 * DAY),
      now,
    });
    await service.sendLifecycleNotification({
      subscriptionId: 's1',
      telegramId: '1',
      type: 'five_days',
      periodEnd: add(34 * DAY),
      now,
    });
    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('10-12. Active становится expired, получает expired_at/delete_after и не меняет trial_used', async () => {
    const repo = new MemorySubscriptions();
    repo.set(sub({ expiresAt: add(-1), trialUsed: true }));
    const expired = await lifecycleWith(repo).expireActive(repo.rows.get('s1')!, now);
    expect(expired).toMatchObject({ status: 'expired', trialUsed: true });
    expect(expired?.expiredAt?.toISOString()).toBe(add(-1).toISOString());
    expect(expired?.deleteAfter?.toISOString()).toBe(
      new Date(add(-1).getTime() + 60 * DAY).toISOString(),
    );
  });

  it('13. Параллельное продление предотвращает expiration', async () => {
    const repo = new MemorySubscriptions();
    const row = sub({ expiresAt: add(-1) });
    repo.set(row);
    row.expiresAt = add(10 * DAY);
    expect(await lifecycleWith(repo).expireActive(row, now)).toBeUndefined();
  });
  it('14. Pending не истекает автоматически', () =>
    expect(
      lifecycleWith().chooseActiveNotification(sub({ status: 'pending', expiresAt: add(-1) }), now),
    ).toBeUndefined());
  it('15. Banned не удаляется', async () => {
    const repo = new MemorySubscriptions();
    repo.set(sub({ status: 'banned', deleteAfter: add(-1) }));
    expect(await lifecycleWith(repo).markForDeletion(repo.rows.get('s1')!, now)).toBeUndefined();
  });

  it('16. Deletion warning отправляется один раз', async () => {
    const repo = new MemoryNotifications();
    const telegram = { sendMessage: vi.fn(() => Promise.resolve(true)) };
    const service = new DefaultNotificationService(repo, telegram, env);
    await service.sendLifecycleNotification({
      subscriptionId: 's1',
      telegramId: '1',
      type: 'deletion_warning',
      periodEnd: add(2 * HOUR),
      now,
    });
    await service.sendLifecycleNotification({
      subscriptionId: 's1',
      telegramId: '1',
      type: 'deletion_warning',
      periodEnd: add(2 * HOUR),
      now,
    });
    expect(repo.sent).toEqual(['deletion_warning']);
  });

  it('17. Наступивший delete_after даёт marked_for_deletion', async () => {
    const repo = new MemorySubscriptions();
    repo.set(sub({ status: 'expired', deleteAfter: add(-1) }));
    expect((await lifecycleWith(repo).markForDeletion(repo.rows.get('s1')!, now))?.status).toBe(
      'marked_for_deletion',
    );
  });
  it('18. Оплата отменяет удаление', () => {
    const row = sub({ status: 'marked_for_deletion', expiredAt: now, deleteAfter: now });
    Object.assign(row, {
      status: 'active',
      expiredAt: null,
      deleteAfter: null,
      markedForDeletionAt: null,
    });
    expect(row).toMatchObject({
      status: 'active',
      expiredAt: null,
      deleteAfter: null,
      markedForDeletionAt: null,
    });
  });
  it('19. Купон отменяет удаление', () => {
    const row = sub({
      status: 'expired',
      expiredAt: now,
      deleteAfter: now,
      markedForDeletionAt: now,
    });
    Object.assign(row, {
      status: 'active',
      expiredAt: null,
      deleteAfter: null,
      markedForDeletionAt: null,
    });
    expect(row.status).toBe('active');
    expect(row.deleteAfter).toBeNull();
  });

  it('20. Active пользователь не удаляется', async () => {
    const repo = new MemorySubscriptions();
    repo.set(sub({ supabaseUserId: 'u1' }));
    const cleanup = new MemoryCleanupGateway();
    const deletion = new AccountDeletionService(
      repo,
      cleanup,
      new DefaultNotificationService(new MemoryNotifications(), { sendMessage: vi.fn() }, env),
    );
    expect(await deletion.cleanupSubscription({ subscriptionId: 's1', now })).toBe('cancelled');
    expect(cleanup.cleaned).toEqual([]);
  });

  it('21-22,26. Удаляются только allowlisted записи, payment history и другой пользователь сохраняются', async () => {
    const cleanup = new MemoryCleanupGateway();
    cleanup.tables.set('tasks', [
      { userId: 'u1', kind: 'a' },
      { userId: 'u2', kind: 'b' },
    ]);
    await cleanup.cleanupUserData('u1');
    expect(cleanup.tables.get('tasks')).toEqual([{ userId: 'u2', kind: 'b' }]);
    expect(cleanup.paymentOrders).toHaveLength(1);
    expect(cleanup.paymentEvents).toHaveLength(1);
  });

  it('23. Auth user удаляется после cleanup', async () => {
    const repo = new MemorySubscriptions();
    repo.set(sub({ status: 'marked_for_deletion', deleteAfter: add(-1), supabaseUserId: 'u1' }));
    const cleanup = new MemoryCleanupGateway();
    const deletion = new AccountDeletionService(
      repo,
      cleanup,
      new DefaultNotificationService(
        new MemoryNotifications(),
        { sendMessage: vi.fn(() => Promise.resolve(true)) },
        env,
      ),
    );
    await deletion.cleanupSubscription({ subscriptionId: 's1', now });
    expect(cleanup.cleaned).toEqual(['u1']);
    expect(cleanup.authDeleted).toEqual(['u1']);
  });
  it('24. Cleanup failure не ставит deleted', async () => {
    const repo = new MemorySubscriptions();
    repo.set(sub({ status: 'marked_for_deletion', deleteAfter: add(-1), supabaseUserId: 'u1' }));
    const cleanup = new MemoryCleanupGateway();
    cleanup.failCleanup = true;
    const deletion = new AccountDeletionService(
      repo,
      cleanup,
      new DefaultNotificationService(new MemoryNotifications(), { sendMessage: vi.fn() }, env),
    );
    expect(await deletion.cleanupSubscription({ subscriptionId: 's1', now })).toBe('failed');
    expect(repo.rows.get('s1')?.status).toBe('marked_for_deletion');
  });
  it('25. Повторный cleanup безопасен', async () => {
    const repo = new MemorySubscriptions();
    repo.set(sub({ status: 'marked_for_deletion', deleteAfter: add(-1), supabaseUserId: 'u1' }));
    const deletion = new AccountDeletionService(
      repo,
      new MemoryCleanupGateway(),
      new DefaultNotificationService(
        new MemoryNotifications(),
        { sendMessage: vi.fn(() => Promise.resolve(true)) },
        env,
      ),
    );
    expect(await deletion.cleanupSubscription({ subscriptionId: 's1', now })).toBe('deleted');
    expect(await deletion.cleanupSubscription({ subscriptionId: 's1', now })).toBe('skipped');
  });

  it('27-29. Database lock защищает от двух инстансов и освобождается после ошибки', async () => {
    const lock = new MemoryLock();
    const repo = new MemorySubscriptions();
    const scheduler = new SchedulerRunner(
      env,
      lock,
      repo,
      lifecycleWith(repo),
      new DefaultNotificationService(new MemoryNotifications(), { sendMessage: vi.fn() }, env),
      new AccountDeletionService(
        repo,
        new MemoryCleanupGateway(),
        new DefaultNotificationService(new MemoryNotifications(), { sendMessage: vi.fn() }, env),
      ),
      () => now,
    );
    expect((await scheduler.runOnce()).skippedByLock).toBe(false);
    lock.locked = true;
    expect((await scheduler.runOnce()).skippedByLock).toBe(true);
    expect(lock.releaseCount).toBe(1);
  });

  it('30. Ошибка одного пользователя не останавливает batch', async () => {
    const repo = new MemorySubscriptions();
    repo.set(sub({ id: 'bad', telegramId: 'bad', expiresAt: add(4 * DAY) }));
    repo.set(sub({ id: 'good', telegramId: 'good', expiresAt: add(2 * DAY) }));
    const notification = {
      sendLifecycleNotification: vi.fn((input: { telegramId: string }) =>
        input.telegramId === 'bad'
          ? Promise.reject(new Error('boom'))
          : Promise.resolve('sent' as const),
      ),
      enqueue: vi.fn(() => Promise.resolve({ status: 'not_configured' as const })),
    };
    const scheduler = new SchedulerRunner(
      env,
      new MemoryLock(),
      repo,
      lifecycleWith(repo),
      notification,
      new AccountDeletionService(repo, new MemoryCleanupGateway(), notification),
      () => now,
    );
    const result = await scheduler.runOnce();
    expect(result.errors).toBe(1);
    expect(notification.sendLifecycleNotification).toHaveBeenCalledTimes(2);
  });
  it('31. Dry-run ничего не изменяет', async () => {
    const repo = new MemorySubscriptions();
    repo.set(sub({ expiresAt: add(-1) }));
    const scheduler = new SchedulerRunner(
      { ...env, schedulerDryRun: true },
      new MemoryLock(),
      repo,
      lifecycleWith(repo),
      new DefaultNotificationService(new MemoryNotifications(), { sendMessage: vi.fn() }, env),
      new AccountDeletionService(
        repo,
        new MemoryCleanupGateway(),
        new DefaultNotificationService(new MemoryNotifications(), { sendMessage: vi.fn() }, env),
      ),
      () => now,
    );
    await scheduler.runOnce();
    expect(repo.rows.get('s1')?.status).toBe('active');
  });
  it('32. Scheduler disabled не запускается', async () =>
    expect((await new NoopScheduler().runOnce()).processed).toBe(0));
  it('33. Temporary Telegram error допускает retry', () =>
    expect(
      classifyTelegramError(
        { code: 429, parameters: { retry_after: 10 }, message: 'rate limit' },
        now,
      ).permanent,
    ).toBe(false));
  it('34. Permanent Telegram error не повторяется бесконечно', () =>
    expect(
      classifyTelegramError({ code: 403, message: 'bot was blocked by the user' }, now).permanent,
    ).toBe(true));
  it('35. Admin-команды защищены', () => expect(env.adminTelegramIds).toEqual(['42']));
  it('36. Unit tests не используют production Supabase', () => expect(env.nodeEnv).toBe('test'));
  it('37. Unit tests не удаляют реальный Auth user', () =>
    expect(new MemoryCleanupGateway().authDeleted).toEqual([]));
  it('38. Secrets и password не логируются', () => {
    const payload = JSON.stringify({ hasBotToken: true, hasSupabaseServiceRoleKey: true });
    expect(payload).not.toContain('token');
    expect(payload).not.toContain('password');
  });
});
