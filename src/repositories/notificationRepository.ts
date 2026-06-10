import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.js';

export const SUBSCRIPTION_NOTIFICATION_TYPES = [
  'five_days',
  'three_days',
  'one_day',
  'one_hour',
  'expired',
  'deletion_warning',
  'deleted',
] as const;

export type NotificationType = (typeof SUBSCRIPTION_NOTIFICATION_TYPES)[number];

export interface SubscriptionNotification {
  id: string;
  subscriptionId: string;
  telegramId: string;
  type: NotificationType;
  periodEnd: Date;
  sentAt?: Date | null;
  reservationToken?: string | null;
  deliveryStatus?: 'reserved' | 'sent' | 'failed_permanent' | 'retryable' | null;
}

export interface NotificationReservation {
  notification: SubscriptionNotification;
  token: string;
}

export interface NotificationRepository {
  enqueue?(telegramId: string, message: string): Promise<{ status: 'not_configured' }>;
  findNotification(input: {
    subscriptionId: string;
    type: NotificationType;
    periodEnd: Date;
  }): Promise<SubscriptionNotification | undefined>;
  reserveNotification(input: {
    subscriptionId: string;
    telegramId: string;
    type: NotificationType;
    periodEnd: Date;
    now: Date;
    reservationTtlSeconds: number;
  }): Promise<NotificationReservation | undefined>;
  markSent(input: { notificationId: string; token: string; sentAt: Date }): Promise<void>;
  releaseReservation(input: {
    notificationId: string;
    token: string;
    retryAfter?: Date;
    permanent?: boolean;
    now: Date;
  }): Promise<void>;
  listForPeriod(input: {
    subscriptionId: string;
    periodEnd: Date;
  }): Promise<SubscriptionNotification[]>;
}

type QueryResult<T> = { data: T | null; error: { message: string } | null };

type NotificationRow = {
  id: string;
  subscription_id: string;
  telegram_id: string;
  type: NotificationType;
  period_end: string;
  sent_at: string | null;
  reservation_token?: string | null;
  delivery_status?: SubscriptionNotification['deliveryStatus'];
};

const mapNotification = (row: NotificationRow): SubscriptionNotification => ({
  id: row.id,
  subscriptionId: row.subscription_id,
  telegramId: row.telegram_id,
  type: row.type,
  periodEnd: new Date(row.period_end),
  sentAt: row.sent_at ? new Date(row.sent_at) : null,
  reservationToken: row.reservation_token ?? null,
  deliveryStatus: row.delivery_status ?? null,
});

interface SupabaseLike {
  rpc(name: string, args: Record<string, unknown>): Promise<QueryResult<unknown>>;
  from(table: string): {
    select(columns?: string): unknown;
    update(values: Record<string, unknown>): unknown;
  };
}

const isNotificationType = (value: unknown): value is NotificationType =>
  typeof value === 'string' &&
  (SUBSCRIPTION_NOTIFICATION_TYPES as readonly string[]).includes(value);

const parseReservation = (value: unknown): NotificationReservation | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  if (data.status !== 'reserved') return undefined;
  const notificationId = data.notification_id;
  const token = data.reservation_token;
  const type = data.type;
  const subscriptionId = data.subscription_id;
  const telegramId = data.telegram_id;
  const periodEnd = data.period_end;
  if (
    typeof notificationId !== 'string' ||
    typeof token !== 'string' ||
    typeof subscriptionId !== 'string' ||
    typeof telegramId !== 'string' ||
    typeof periodEnd !== 'string' ||
    !isNotificationType(type)
  ) {
    return undefined;
  }
  return {
    token,
    notification: {
      id: notificationId,
      subscriptionId,
      telegramId,
      type,
      periodEnd: new Date(periodEnd),
      reservationToken: token,
      sentAt: null,
      deliveryStatus: 'reserved',
    },
  };
};

export class SupabaseNotificationRepository implements NotificationRepository {
  private readonly client: SupabaseLike;

  constructor(client: SupabaseClient<Database>) {
    this.client = client as unknown as SupabaseLike;
  }

  enqueue(_telegramId: string, _message: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }

  async findNotification(input: {
    subscriptionId: string;
    type: NotificationType;
    periodEnd: Date;
  }): Promise<SubscriptionNotification | undefined> {
    type Chain = {
      eq(column: string, value: string): Chain;
      maybeSingle(): Promise<QueryResult<NotificationRow>>;
    };
    const query = this.client.from('subscription_notifications').select('*') as Chain;
    const { data, error } = await query
      .eq('subscription_id', input.subscriptionId)
      .eq('type', input.type)
      .eq('period_end', input.periodEnd.toISOString())
      .maybeSingle();
    if (error) throw new Error(`Notification lookup failed: ${error.message}`);
    return data ? mapNotification(data) : undefined;
  }

  async reserveNotification(input: {
    subscriptionId: string;
    telegramId: string;
    type: NotificationType;
    periodEnd: Date;
    now: Date;
    reservationTtlSeconds: number;
  }): Promise<NotificationReservation | undefined> {
    const { data, error } = await this.client.rpc('reserve_subscription_notification', {
      p_subscription_id: input.subscriptionId,
      p_telegram_id: input.telegramId,
      p_type: input.type,
      p_period_end: input.periodEnd.toISOString(),
      p_now: input.now.toISOString(),
      p_reservation_ttl_seconds: input.reservationTtlSeconds,
    });
    if (error) throw new Error(`Notification reservation failed: ${error.message}`);
    return parseReservation(data);
  }

  async markSent(input: { notificationId: string; token: string; sentAt: Date }): Promise<void> {
    const updater = this.client.from('subscription_notifications').update({
      sent_at: input.sentAt.toISOString(),
      delivery_status: 'sent',
      reservation_token: null,
      reserved_until: null,
      updated_at: input.sentAt.toISOString(),
    }) as {
      eq(
        column: string,
        value: string,
      ): { eq(column: string, value: string): Promise<QueryResult<null>> };
    };
    const { error } = await updater
      .eq('id', input.notificationId)
      .eq('reservation_token', input.token);
    if (error) throw new Error(`Notification mark sent failed: ${error.message}`);
  }

  async releaseReservation(input: {
    notificationId: string;
    token: string;
    retryAfter?: Date;
    permanent?: boolean;
    now: Date;
  }): Promise<void> {
    const values: Record<string, unknown> = {
      reservation_token: null,
      reserved_until: input.retryAfter?.toISOString() ?? null,
      delivery_status: input.permanent ? 'failed_permanent' : 'retryable',
      updated_at: input.now.toISOString(),
    };
    const updater = this.client.from('subscription_notifications').update(values) as {
      eq(
        column: string,
        value: string,
      ): { eq(column: string, value: string): Promise<QueryResult<null>> };
    };
    const { error } = await updater
      .eq('id', input.notificationId)
      .eq('reservation_token', input.token);
    if (error) throw new Error(`Notification release failed: ${error.message}`);
  }

  async listForPeriod(input: {
    subscriptionId: string;
    periodEnd: Date;
  }): Promise<SubscriptionNotification[]> {
    const query = this.client.from('subscription_notifications').select('*') as {
      eq(
        column: string,
        value: string,
      ): { eq(column: string, value: string): Promise<QueryResult<NotificationRow[]>> };
    };
    const { data, error } = await query
      .eq('subscription_id', input.subscriptionId)
      .eq('period_end', input.periodEnd.toISOString());
    if (error) throw new Error(`Notification list failed: ${error.message}`);
    return (data ?? []).map(mapNotification);
  }
}
