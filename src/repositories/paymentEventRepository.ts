import type { CreatePaymentEventInput, PaymentEvent } from '../types/payment.js';

export interface PaymentEventRepository {
  findByProviderEventId(providerEventId: string): Promise<PaymentEvent | undefined>;
  createEventIfAbsent(input: CreatePaymentEventInput): Promise<PaymentEvent>;
  findByOrderId(orderId: string): Promise<PaymentEvent[]>;
  markProcessed(providerEventId: string, processedAt?: Date): Promise<void>;
  findLatestByTelegramId(telegramId: string): Promise<PaymentEvent | undefined>;
  recordEvent(eventName: string): Promise<{ status: 'not_configured' }>;
}

const cloneEvent = (event: PaymentEvent): PaymentEvent => {
  const cloned: PaymentEvent = { ...event, createdAt: new Date(event.createdAt) };
  if (event.processedAt) cloned.processedAt = new Date(event.processedAt);
  return cloned;
};

export class InMemoryPaymentEventRepository implements PaymentEventRepository {
  private readonly events = new Map<string, PaymentEvent>();

  async findByProviderEventId(providerEventId: string): Promise<PaymentEvent | undefined> {
    await Promise.resolve();
    const event = this.events.get(providerEventId);
    return event ? cloneEvent(event) : undefined;
  }

  async createEventIfAbsent(input: CreatePaymentEventInput): Promise<PaymentEvent> {
    await Promise.resolve();
    const existing = this.events.get(input.providerEventId);
    if (existing) return cloneEvent(existing);
    const event: PaymentEvent = {
      provider: 'telegram_stars',
      providerEventId: input.providerEventId,
      orderId: input.orderId,
      telegramId: input.telegramId,
      eventType: input.eventType,
      amount: input.amount,
      currency: input.currency,
      plan: input.plan,
      periodDays: input.periodDays,
      rawPayload: input.rawPayload,
      createdAt: input.now ?? new Date(),
    };
    if (input.supabaseUserId) event.supabaseUserId = input.supabaseUserId;
    this.events.set(event.providerEventId, event);
    return cloneEvent(event);
  }

  async findByOrderId(orderId: string): Promise<PaymentEvent[]> {
    await Promise.resolve();
    return [...this.events.values()]
      .filter((event) => event.orderId === orderId)
      .map((event) => cloneEvent(event));
  }

  async markProcessed(providerEventId: string, processedAt = new Date()): Promise<void> {
    await Promise.resolve();
    const event = this.events.get(providerEventId);
    if (!event) return;
    event.processedAt = processedAt;
  }

  async findLatestByTelegramId(telegramId: string): Promise<PaymentEvent | undefined> {
    await Promise.resolve();
    const event = [...this.events.values()]
      .filter((item) => item.telegramId === telegramId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return event ? cloneEvent(event) : undefined;
  }

  async recordEvent(_eventName: string): Promise<{ status: 'not_configured' }> {
    await Promise.resolve();
    return { status: 'not_configured' };
  }
}
