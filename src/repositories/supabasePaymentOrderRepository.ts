import type { SupabaseClient } from '@supabase/supabase-js';
import { createOpaqueToken } from '../services/paymentFlow.js';
import type { Database } from '../types/database.js';
import type {
  CreatePaymentOrderInput,
  PaymentOrder,
  PaymentPlan,
  SanitizedPaymentPayload,
} from '../types/payment.js';
import type { PaymentOrderRepository } from './paymentOrderRepository.js';

type OrderRow = {
  id: string;
  order_id: string;
  telegram_id: string;
  supabase_user_id: string | null;
  provider: string;
  provider_invoice_payload: string;
  plan: string;
  amount: number;
  currency: string;
  period_days: number;
  status: string;
  provider_payment_id: string | null;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  raw_payload: unknown;
};

type QR = Promise<{ data: OrderRow | null; error: { message: string } | null }>;
type ER = Promise<{ data: null; error: { message: string } | null }>;

type SelectChain = {
  eq(col: string, val: string): SelectChain;
  in(col: string, vals: string[]): SelectChain;
  gte(col: string, val: string): SelectChain;
  order(col: string, opts?: { ascending?: boolean }): SelectChain;
  limit(n: number): SelectChain;
  maybeSingle(): QR;
  single(): QR;
};

interface SupabaseLike {
  from(table: string): {
    select(columns?: string): unknown;
    insert(values: unknown): unknown;
    update(values: unknown): unknown;
  };
}

const mapOrder = (row: OrderRow): PaymentOrder => ({
  id: row.id,
  orderId: row.order_id,
  telegramId: row.telegram_id,
  supabaseUserId: row.supabase_user_id ?? undefined,
  provider: 'telegram_stars',
  providerInvoicePayload: row.provider_invoice_payload,
  plan: row.plan as PaymentPlan,
  amount: row.amount,
  currency: 'XTR',
  periodDays: row.period_days,
  status: row.status as PaymentOrder['status'],
  providerPaymentId: row.provider_payment_id ?? undefined,
  createdAt: new Date(row.created_at),
  paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
  cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
  rawPayload: row.raw_payload as SanitizedPaymentPayload | undefined,
});

export class SupabasePaymentOrderRepository implements PaymentOrderRepository {
  private readonly db: SupabaseLike;

  constructor(client: SupabaseClient<Database>) {
    this.db = client;
  }

  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    const now = input.now ?? new Date();
    const orderId = createOpaqueToken('ord');
    const providerInvoicePayload = createOpaqueToken('xtr');
    const { data, error } = await (
      this.db.from('payment_orders').insert({
        order_id: orderId,
        telegram_id: input.telegramId,
        supabase_user_id: input.supabaseUserId ?? null,
        provider: 'telegram_stars',
        provider_invoice_payload: providerInvoicePayload,
        plan: input.plan,
        amount: input.amount,
        currency: 'XTR',
        period_days: input.periodDays,
        status: 'created',
        created_at: now.toISOString(),
      }) as { select(cols?: string): { single(): QR } }
    )
      .select('*')
      .single();
    if (error || !data)
      throw new Error(`Failed to create payment order: ${error?.message ?? 'no data'}`);
    return mapOrder(data);
  }

  async findByOrderId(orderId: string): Promise<PaymentOrder | undefined> {
    const { data, error } = await (
      this.db.from('payment_orders').select('*') as {
        eq(col: string, val: string): { maybeSingle(): QR };
      }
    )
      .eq('order_id', orderId)
      .maybeSingle();
    if (error) throw new Error(`Payment order lookup failed: ${error.message}`);
    return data ? mapOrder(data) : undefined;
  }

  async findByInvoicePayload(payload: string): Promise<PaymentOrder | undefined> {
    const { data, error } = await (
      this.db.from('payment_orders').select('*') as {
        eq(col: string, val: string): { maybeSingle(): QR };
      }
    )
      .eq('provider_invoice_payload', payload)
      .maybeSingle();
    if (error) throw new Error(`Payment order lookup failed: ${error.message}`);
    return data ? mapOrder(data) : undefined;
  }

  async findLatestByTelegramId(telegramId: string): Promise<PaymentOrder | undefined> {
    const { data, error } = await (
      this.db.from('payment_orders').select('*') as {
        eq(
          col: string,
          val: string,
        ): {
          order(
            col: string,
            opts?: { ascending?: boolean },
          ): {
            limit(n: number): { maybeSingle(): QR };
          };
        };
      }
    )
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Payment order lookup failed: ${error.message}`);
    return data ? mapOrder(data) : undefined;
  }

  async findRecentPendingOrder(
    telegramId: string,
    plan: PaymentPlan,
    ttlMinutes: number,
    now = new Date(),
  ): Promise<PaymentOrder | undefined> {
    const since = new Date(now.getTime() - ttlMinutes * 60 * 1000).toISOString();
    const { data, error } = await (this.db.from('payment_orders').select('*') as SelectChain)
      .eq('telegram_id', telegramId)
      .eq('plan', plan)
      .in('status', ['created', 'pending'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Payment order lookup failed: ${error.message}`);
    return data ? mapOrder(data) : undefined;
  }

  async markPending(orderId: string): Promise<void> {
    await this.patch(orderId, { status: 'pending' });
  }

  async markPaid(
    orderId: string,
    providerPaymentId: string,
    rawPayload: SanitizedPaymentPayload,
    paidAt = new Date(),
  ): Promise<void> {
    await this.patch(orderId, {
      status: 'paid',
      provider_payment_id: providerPaymentId,
      raw_payload: rawPayload,
      paid_at: paidAt.toISOString(),
    });
  }

  async markFailed(orderId: string): Promise<void> {
    await this.patch(orderId, { status: 'failed' });
  }

  async markCancelled(orderId: string, cancelledAt = new Date()): Promise<void> {
    await this.patch(orderId, { status: 'cancelled', cancelled_at: cancelledAt.toISOString() });
  }

  async markExpired(orderId: string, _expiredAt = new Date()): Promise<void> {
    const { error } = await (
      this.db.from('payment_orders').update({ status: 'expired' }) as {
        eq(col: string, val: string): { neq(col: string, val: string): ER };
      }
    )
      .eq('order_id', orderId)
      .neq('status', 'paid');
    if (error) throw new Error(`Payment order update failed: ${error.message}`);
  }

  async attachSupabaseUser(orderId: string, supabaseUserId: string): Promise<void> {
    await this.patch(orderId, { supabase_user_id: supabaseUserId });
  }

  async attachProviderPaymentId(orderId: string, providerPaymentId: string): Promise<void> {
    await this.patch(orderId, { provider_payment_id: providerPaymentId });
  }

  private async patch(orderId: string, values: Record<string, unknown>): Promise<void> {
    const { error } = await (
      this.db.from('payment_orders').update(values) as {
        eq(col: string, val: string): ER;
      }
    ).eq('order_id', orderId);
    if (error) throw new Error(`Payment order update failed: ${error.message}`);
  }
}
