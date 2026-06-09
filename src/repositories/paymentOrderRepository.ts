import { createOpaqueToken } from '../services/paymentFlow.js';
import type {
  CreatePaymentOrderInput,
  PaymentOrder,
  PaymentPlan,
  SanitizedPaymentPayload,
} from '../types/payment.js';

export interface PaymentOrderRepository {
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder>;
  findByOrderId(orderId: string): Promise<PaymentOrder | undefined>;
  findByInvoicePayload(payload: string): Promise<PaymentOrder | undefined>;
  findLatestByTelegramId(telegramId: string): Promise<PaymentOrder | undefined>;
  findRecentPendingOrder(
    telegramId: string,
    plan: PaymentPlan,
    ttlMinutes: number,
    now?: Date,
  ): Promise<PaymentOrder | undefined>;
  markPending(orderId: string): Promise<void>;
  markPaid(
    orderId: string,
    providerPaymentId: string,
    rawPayload: SanitizedPaymentPayload,
    paidAt?: Date,
  ): Promise<void>;
  markFailed(orderId: string): Promise<void>;
  markCancelled(orderId: string, cancelledAt?: Date): Promise<void>;
  markExpired(orderId: string, expiredAt?: Date): Promise<void>;
  attachSupabaseUser(orderId: string, supabaseUserId: string): Promise<void>;
  attachProviderPaymentId(orderId: string, providerPaymentId: string): Promise<void>;
}

const cloneOrder = (order: PaymentOrder): PaymentOrder => {
  const cloned: PaymentOrder = { ...order, createdAt: new Date(order.createdAt) };
  if (order.paidAt) cloned.paidAt = new Date(order.paidAt);
  if (order.cancelledAt) cloned.cancelledAt = new Date(order.cancelledAt);
  return cloned;
};

export class InMemoryPaymentOrderRepository implements PaymentOrderRepository {
  private readonly orders = new Map<string, PaymentOrder>();

  async createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
    await Promise.resolve();
    const now = input.now ?? new Date();
    let orderId = createOpaqueToken('ord');
    while (this.orders.has(orderId)) orderId = createOpaqueToken('ord');
    let providerInvoicePayload = createOpaqueToken('xtr');
    while (
      [...this.orders.values()].some(
        (order) => order.providerInvoicePayload === providerInvoicePayload,
      )
    ) {
      providerInvoicePayload = createOpaqueToken('xtr');
    }
    const order: PaymentOrder = {
      orderId,
      telegramId: input.telegramId,
      provider: 'telegram_stars',
      providerInvoicePayload,
      plan: input.plan,
      amount: input.amount,
      currency: 'XTR',
      periodDays: input.periodDays,
      status: 'created',
      createdAt: now,
    };
    if (input.supabaseUserId) order.supabaseUserId = input.supabaseUserId;
    this.orders.set(orderId, order);
    return cloneOrder(order);
  }

  async findByOrderId(orderId: string): Promise<PaymentOrder | undefined> {
    await Promise.resolve();
    const order = this.orders.get(orderId);
    return order ? cloneOrder(order) : undefined;
  }

  async findByInvoicePayload(payload: string): Promise<PaymentOrder | undefined> {
    await Promise.resolve();
    const order = [...this.orders.values()].find((item) => item.providerInvoicePayload === payload);
    return order ? cloneOrder(order) : undefined;
  }

  async findLatestByTelegramId(telegramId: string): Promise<PaymentOrder | undefined> {
    await Promise.resolve();
    const order = [...this.orders.values()]
      .filter((item) => item.telegramId === telegramId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return order ? cloneOrder(order) : undefined;
  }

  async findRecentPendingOrder(
    telegramId: string,
    plan: PaymentPlan,
    ttlMinutes: number,
    now = new Date(),
  ): Promise<PaymentOrder | undefined> {
    await Promise.resolve();
    const ttlMs = ttlMinutes * 60 * 1000;
    const order = [...this.orders.values()]
      .filter(
        (item) =>
          item.telegramId === telegramId &&
          item.plan === plan &&
          (item.status === 'created' || item.status === 'pending') &&
          now.getTime() - item.createdAt.getTime() <= ttlMs,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return order ? cloneOrder(order) : undefined;
  }

  async markPending(orderId: string): Promise<void> {
    await Promise.resolve();
    this.patch(orderId, { status: 'pending' });
  }

  async markPaid(
    orderId: string,
    providerPaymentId: string,
    rawPayload: SanitizedPaymentPayload,
    paidAt = new Date(),
  ): Promise<void> {
    await Promise.resolve();
    this.patch(orderId, { status: 'paid', providerPaymentId, rawPayload, paidAt });
  }

  async markFailed(orderId: string): Promise<void> {
    await Promise.resolve();
    this.patch(orderId, { status: 'failed' });
  }

  async markCancelled(orderId: string, cancelledAt = new Date()): Promise<void> {
    await Promise.resolve();
    this.patch(orderId, { status: 'cancelled', cancelledAt });
  }

  async markExpired(orderId: string, _expiredAt = new Date()): Promise<void> {
    await Promise.resolve();
    const order = this.orders.get(orderId);
    if (!order || order.status === 'paid') return;
    order.status = 'expired';
  }

  async attachSupabaseUser(orderId: string, supabaseUserId: string): Promise<void> {
    await Promise.resolve();
    this.patch(orderId, { supabaseUserId });
  }

  async attachProviderPaymentId(orderId: string, providerPaymentId: string): Promise<void> {
    await Promise.resolve();
    this.patch(orderId, { providerPaymentId });
  }

  private patch(orderId: string, patch: Partial<PaymentOrder>): void {
    const order = this.orders.get(orderId);
    if (!order) return;
    this.orders.set(orderId, { ...order, ...patch });
  }
}
