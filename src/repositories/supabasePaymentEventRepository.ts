import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreatePaymentEventInput, PaymentEvent, PaymentPlan } from '../types/payment.js';
import type { Database } from '../types/database.js';
import type { PaymentEventRepository } from './paymentEventRepository.js';

type EventRow = {
  id: string;
  provider: string;
  provider_event_id: string;
  order_id: string;
  telegram_id: string;
  supabase_user_id: string | null;
  event_type: string;
  amount: number;
  currency: string;
  plan: string;
  period_days: number;
  raw_payload: unknown;
  processed_at: string | null;
  created_at: string;
};

type QR<T> = Promise<{ data: T | null; error: { message: string } | null }>;
type ER = Promise<{ data: null; error: { message: string } | null }>;

interface SupabaseLike {
  from(table: string): {
    select(columns?: string): unknown;
    update(values: unknown): unknown;
    upsert(values: unknown, opts?: unknown): unknown;
  };
}

const mapEvent = (row: EventRow): PaymentEvent => ({
  id: row.id,
  provider: 'telegram_stars',
  providerEventId: row.provider_event_id,
  orderId: row.order_id,
  telegramId: row.telegram_id,
  supabaseUserId: row.supabase_user_id ?? undefined,
  eventType: row.event_type as PaymentEvent['eventType'],
  amount: row.amount,
  currency: 'XTR',
  plan: row.plan as PaymentPlan,
  periodDays: row.period_days,
  rawPayload: row.raw_payload as PaymentEvent['rawPayload'],
  processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
  createdAt: new Date(row.created_at),
});

export class SupabasePaymentEventRepository implements PaymentEventRepository {
  private readonly db: SupabaseLike;

  constructor(client: SupabaseClient<Database>) {
    this.db = client;
  }

  async findByProviderEventId(providerEventId: string): Promise<PaymentEvent | undefined> {
    const { data, error } = await (
      this.db.from('payment_events').select('*') as {
        eq(col: string, val: string): { maybeSingle(): QR<EventRow> };
      }
    )
      .eq('provider_event_id', providerEventId)
      .maybeSingle();
    if (error) throw new Error(`Payment event lookup failed: ${error.message}`);
    return data ? mapEvent(data) : undefined;
  }

  async createEventIfAbsent(input: CreatePaymentEventInput): Promise<PaymentEvent> {
    const now = input.now ?? new Date();
    const { data, error } = await (
      this.db.from('payment_events').upsert(
        {
          provider: 'telegram_stars',
          provider_event_id: input.providerEventId,
          order_id: input.orderId,
          telegram_id: input.telegramId,
          supabase_user_id: input.supabaseUserId ?? null,
          event_type: input.eventType,
          amount: input.amount,
          currency: input.currency,
          plan: input.plan,
          period_days: input.periodDays,
          raw_payload: input.rawPayload,
          created_at: now.toISOString(),
        },
        { onConflict: 'provider_event_id', ignoreDuplicates: true },
      ) as { select(cols?: string): { maybeSingle(): QR<EventRow> } }
    )
      .select('*')
      .maybeSingle();
    if (error) throw new Error(`Payment event upsert failed: ${error.message}`);
    if (data) return mapEvent(data);
    // ignoreDuplicates returned no data — fetch the existing row
    const existing = await this.findByProviderEventId(input.providerEventId);
    if (!existing)
      throw new Error(`Payment event not found after upsert: ${input.providerEventId}`);
    return existing;
  }

  async findByOrderId(orderId: string): Promise<PaymentEvent[]> {
    const { data, error } = await (
      this.db.from('payment_events').select('*') as {
        eq(col: string, val: string): QR<EventRow[]>;
      }
    ).eq('order_id', orderId);
    if (error) throw new Error(`Payment event lookup failed: ${error.message}`);
    return (data ?? []).map(mapEvent);
  }

  async markProcessed(providerEventId: string, processedAt = new Date()): Promise<void> {
    const { error } = await (
      this.db.from('payment_events').update({ processed_at: processedAt.toISOString() }) as {
        eq(col: string, val: string): ER;
      }
    ).eq('provider_event_id', providerEventId);
    if (error) throw new Error(`Payment event update failed: ${error.message}`);
  }

  async findLatestByTelegramId(telegramId: string): Promise<PaymentEvent | undefined> {
    const { data, error } = await (
      this.db.from('payment_events').select('*') as {
        eq(
          col: string,
          val: string,
        ): {
          order(
            col: string,
            opts?: { ascending?: boolean },
          ): {
            limit(n: number): { maybeSingle(): QR<EventRow> };
          };
        };
      }
    )
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Payment event lookup failed: ${error.message}`);
    return data ? mapEvent(data) : undefined;
  }

  recordEvent(_eventName: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }
}
