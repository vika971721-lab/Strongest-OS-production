import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubscriptionLifecycleRepository } from '../services/subscriptionLifecycleService.js';
import type { Database } from '../types/database.js';
import type { Subscription } from '../types/subscription.js';

export interface SubscriptionRepository extends SubscriptionLifecycleRepository {
  findByTelegramId(telegramId: string): Promise<Subscription | undefined>;
  save(subscription: Subscription): Promise<{ status: 'not_configured' }>;
}

type QueryResult<T> = { data: T | null; error: { message: string } | null };

type SubscriptionRow = {
  id: string;
  telegram_id: string;
  status: Subscription['status'];
  supabase_user_id: string | null;
  trial_used: boolean | null;
  login_email: string | null;
  expires_at: string | null;
  current_period_end: string | null;
  expired_at: string | null;
  delete_after: string | null;
  marked_for_deletion_at: string | null;
  deleted_at: string | null;
  first_payment_at: string | null;
  last_payment_at: string | null;
};

const date = (value: string | null): Date | null => (value ? new Date(value) : null);

const mapSubscription = (row: SubscriptionRow): Subscription => ({
  id: row.id,
  telegramId: row.telegram_id,
  status: row.status,
  supabaseUserId: row.supabase_user_id,
  trialUsed: row.trial_used ?? false,
  loginEmail: row.login_email,
  expiresAt: date(row.expires_at),
  currentPeriodEnd: date(row.current_period_end),
  expiredAt: date(row.expired_at),
  deleteAfter: date(row.delete_after),
  markedForDeletionAt: date(row.marked_for_deletion_at),
  deletedAt: date(row.deleted_at),
  firstPaymentAt: date(row.first_payment_at),
  lastPaymentAt: date(row.last_payment_at),
});

interface SupabaseLike {
  from(table: string): {
    select(columns?: string): unknown;
    update(values: Record<string, unknown>): unknown;
  };
}

export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  private readonly client: SupabaseLike;

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
  }

  save(_subscription: Subscription): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }

  async findByTelegramId(telegramId: string): Promise<Subscription | undefined> {
    const query = this.client.from('subscriptions').select('*') as {
      eq(column: string, value: string): { maybeSingle(): Promise<QueryResult<SubscriptionRow>> };
    };
    const { data, error } = await query.eq('telegram_id', telegramId).maybeSingle();
    if (error) throw new Error(`Subscription lookup failed: ${error.message}`);
    return data ? mapSubscription(data) : undefined;
  }

  async findById(id: string): Promise<Subscription | undefined> {
    const query = this.client.from('subscriptions').select('*') as {
      eq(column: string, value: string): { maybeSingle(): Promise<QueryResult<SubscriptionRow>> };
    };
    const { data, error } = await query.eq('id', id).maybeSingle();
    if (error) throw new Error(`Subscription lookup failed: ${error.message}`);
    return data ? mapSubscription(data) : undefined;
  }

  async listActiveCandidates(now: Date, batchSize: number): Promise<Subscription[]> {
    const query = this.client.from('subscriptions').select('*') as {
      eq(
        column: string,
        value: string,
      ): {
        lte(
          column: string,
          value: string,
        ): {
          order(column: string): { limit(count: number): Promise<QueryResult<SubscriptionRow[]>> };
        };
      };
    };
    const fiveDaysAhead = new Date(now.getTime() + 5 * 86_400_000).toISOString();
    const { data, error } = await query
      .eq('status', 'active')
      .lte('expires_at', fiveDaysAhead)
      .order('expires_at')
      .limit(batchSize);
    if (error) throw new Error(`Active subscriptions query failed: ${error.message}`);
    return (data ?? []).map(mapSubscription);
  }

  async listExpiredForWarning(
    now: Date,
    warningHours: number,
    batchSize: number,
  ): Promise<Subscription[]> {
    const query = this.client.from('subscriptions').select('*') as {
      eq(
        column: string,
        value: string,
      ): {
        gt(
          column: string,
          value: string,
        ): {
          lte(
            column: string,
            value: string,
          ): {
            order(column: string): {
              limit(count: number): Promise<QueryResult<SubscriptionRow[]>>;
            };
          };
        };
      };
    };
    const warningUntil = new Date(now.getTime() + warningHours * 3_600_000).toISOString();
    const { data, error } = await query
      .eq('status', 'expired')
      .gt('delete_after', now.toISOString())
      .lte('delete_after', warningUntil)
      .order('delete_after')
      .limit(batchSize);
    if (error) throw new Error(`Expired warning query failed: ${error.message}`);
    return (data ?? []).map(mapSubscription);
  }

  async listExpiredForDeletion(now: Date, batchSize: number): Promise<Subscription[]> {
    const query = this.client.from('subscriptions').select('*') as {
      eq(
        column: string,
        value: string,
      ): {
        lte(
          column: string,
          value: string,
        ): {
          order(column: string): { limit(count: number): Promise<QueryResult<SubscriptionRow[]>> };
        };
      };
    };
    const { data, error } = await query
      .eq('status', 'expired')
      .lte('delete_after', now.toISOString())
      .order('delete_after')
      .limit(batchSize);
    if (error) throw new Error(`Expired deletion query failed: ${error.message}`);
    return (data ?? []).map(mapSubscription);
  }

  async expireActiveSubscription(input: {
    subscriptionId: string;
    expiresAt: Date;
    retentionDays: number;
    now: Date;
  }): Promise<Subscription | undefined> {
    const deleteAfter = new Date(input.expiresAt.getTime() + input.retentionDays * 86_400_000);
    const updater = this.client.from('subscriptions').update({
      status: 'expired',
      expired_at: input.expiresAt.toISOString(),
      delete_after: deleteAfter.toISOString(),
      updated_at: input.now.toISOString(),
    }) as {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): {
          lte(
            column: string,
            value: string,
          ): { select(columns?: string): { maybeSingle(): Promise<QueryResult<SubscriptionRow>> } };
        };
      };
    };
    const { data, error } = await updater
      .eq('id', input.subscriptionId)
      .eq('status', 'active')
      .lte('expires_at', input.now.toISOString())
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Subscription expiration failed: ${error.message}`);
    return data ? mapSubscription(data) : undefined;
  }

  async repairExpiredRetention(input: {
    subscriptionId: string;
    expiredAt: Date;
    deleteAfter: Date;
    now: Date;
  }): Promise<Subscription | undefined> {
    return this.updateById(input.subscriptionId, {
      expired_at: input.expiredAt.toISOString(),
      delete_after: input.deleteAfter.toISOString(),
      updated_at: input.now.toISOString(),
    });
  }

  async markForDeletion(input: {
    subscriptionId: string;
    deleteAfter: Date;
    now: Date;
  }): Promise<Subscription | undefined> {
    const updater = this.client.from('subscriptions').update({
      status: 'marked_for_deletion',
      marked_for_deletion_at: input.now.toISOString(),
      updated_at: input.now.toISOString(),
    }) as {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): {
          lte(
            column: string,
            value: string,
          ): { select(columns?: string): { maybeSingle(): Promise<QueryResult<SubscriptionRow>> } };
        };
      };
    };
    const { data, error } = await updater
      .eq('id', input.subscriptionId)
      .eq('status', 'expired')
      .lte('delete_after', input.now.toISOString())
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Subscription mark deletion failed: ${error.message}`);
    return data ? mapSubscription(data) : undefined;
  }

  async markDeleted(input: {
    subscriptionId: string;
    now: Date;
  }): Promise<Subscription | undefined> {
    const updater = this.client.from('subscriptions').update({
      status: 'deleted',
      deleted_at: input.now.toISOString(),
      supabase_user_id: null,
      login_email: null,
      updated_at: input.now.toISOString(),
    }) as {
      eq(
        column: string,
        value: string,
      ): {
        eq(
          column: string,
          value: string,
        ): { select(columns?: string): { maybeSingle(): Promise<QueryResult<SubscriptionRow>> } };
      };
    };
    const { data, error } = await updater
      .eq('id', input.subscriptionId)
      .eq('status', 'marked_for_deletion')
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Subscription mark deleted failed: ${error.message}`);
    return data ? mapSubscription(data) : undefined;
  }

  private async updateById(
    id: string,
    values: Record<string, unknown>,
  ): Promise<Subscription | undefined> {
    const updater = this.client.from('subscriptions').update(values) as {
      eq(
        column: string,
        value: string,
      ): { select(columns?: string): { maybeSingle(): Promise<QueryResult<SubscriptionRow>> } };
    };
    const { data, error } = await updater.eq('id', id).select('*').maybeSingle();
    if (error) throw new Error(`Subscription update failed: ${error.message}`);
    return data ? mapSubscription(data) : undefined;
  }
}
