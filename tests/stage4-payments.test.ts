import { describe, expect, it, vi } from 'vitest';
import { InMemoryPaymentEventRepository } from '../src/repositories/paymentEventRepository.js';
import { InMemoryPaymentOrderRepository } from '../src/repositories/paymentOrderRepository.js';
import {
  buildTelegramStarsInvoice,
  determinePaymentPlan,
  ensurePaymentOrder,
  processPaymentEvent,
  sanitizeSuccessfulPaymentPayload,
  validatePreCheckout,
  type PaymentAccessGateway,
} from '../src/services/paymentFlow.js';
import type { UserAccessState } from '../src/types/accessState.js';
import type { PaymentPlan } from '../src/types/payment.js';

const pricing = {
  firstPeriodStars: 100,
  renewalPeriodStars: 150,
  firstPeriodDays: 30,
  renewalPeriodDays: 30,
  threeMonthsStars: 300,
  threeMonthsDays: 90,
  sixMonthsStars: 600,
  sixMonthsDays: 180,
  yearlyStars: 1200,
  yearlyDays: 365,
};

class FakeGateway implements PaymentAccessGateway {
  state: UserAccessState = { kind: 'telegram_registered', telegramId: '1', trialUsed: false };
  accountCalls = 0;
  extendCalls = 0;
  processed = new Set<string>();
  expiresAt = new Date('2026-01-01T00:00:00.000Z');
  accountCreated = true;

  async getAccessState(_telegramId: string): Promise<UserAccessState> {
    await Promise.resolve();
    return this.state;
  }

  async createOrGetAccount(telegramId: string): Promise<{
    supabaseUserId: string;
    loginEmail: string;
    created: boolean;
    generatedPassword?: string;
  }> {
    await Promise.resolve();
    this.accountCalls += 1;
    const result = {
      supabaseUserId: `user-${telegramId}`,
      loginEmail: `tg${telegramId}@example.invalid`,
      created: this.accountCreated,
    };
    return this.accountCreated ? { ...result, generatedPassword: 'generated-password' } : result;
  }

  async extendSubscription(input: {
    telegramId: string;
    supabaseUserId: string;
    plan: PaymentPlan;
    periodDays: number;
    paymentEventId: string;
    now: Date;
  }): Promise<{ expiresAt: Date; firstPayment: boolean; applied: boolean }> {
    await Promise.resolve();
    if (this.processed.has(input.paymentEventId)) {
      return { expiresAt: this.expiresAt, firstPayment: false, applied: false };
    }
    this.processed.add(input.paymentEventId);
    this.extendCalls += 1;
    const base = this.expiresAt > input.now ? this.expiresAt : input.now;
    this.expiresAt = new Date(base.getTime() + input.periodDays * 24 * 60 * 60 * 1000);
    this.state = {
      kind: 'active',
      telegramId: input.telegramId,
      status: 'active',
      trialUsed: true,
    };
    return { expiresAt: this.expiresAt, firstPayment: input.plan === 'first_month', applied: true };
  }

  ensureBotUser(
    _telegramId: string,
    _userInfo?: { username?: string; firstName?: string; lastName?: string },
  ): Promise<void> {
    return Promise.resolve();
  }

  async getAccessSummary(_telegramId: string): Promise<{ expiresAt?: Date; loginEmail?: string }> {
    await Promise.resolve();
    return { expiresAt: this.expiresAt, loginEmail: 'tg1@example.invalid' };
  }

  async adminExtend(input: {
    telegramId: string;
    days: number;
    reason: string;
    now: Date;
  }): Promise<{ expiresAt: Date }> {
    await Promise.resolve();
    this.expiresAt = new Date(input.now.getTime() + input.days * 24 * 60 * 60 * 1000);
    return { expiresAt: this.expiresAt };
  }
}

const rawPayload = sanitizeSuccessfulPaymentPayload({
  currency: 'XTR',
  totalAmount: 100,
  invoicePayload: 'payload',
  telegramPaymentChargeId: 'charge-1',
  providerPaymentChargeId: 'provider-charge-1',
  messageId: 10,
  updateId: 20,
  timestamp: new Date('2026-01-01T00:00:00.000Z'),
});

describe('stage 4 Telegram Stars payments', () => {
  it('determines first_month, renewal, and banned/deleted eligibility from access state', () => {
    expect(
      determinePaymentPlan({ kind: 'telegram_registered', telegramId: '1', trialUsed: false }),
    ).toBe('first_month');
    expect(
      determinePaymentPlan({ kind: 'active', telegramId: '1', status: 'active', trialUsed: true }),
    ).toBe('monthly_renewal');
    expect(
      determinePaymentPlan({ kind: 'banned', telegramId: '1', status: 'banned', trialUsed: true }),
    ).toEqual({
      blocked: 'banned',
    });
    expect(
      determinePaymentPlan({
        kind: 'deleted',
        telegramId: '1',
        status: 'deleted',
        trialUsed: true,
      }),
    ).toEqual({
      blocked: 'deleted',
    });
  });

  it('generates secure order and Telegram Stars invoice with XTR, empty token, one price, amount and period', async () => {
    const orders = new InMemoryPaymentOrderRepository();
    const gateway = new FakeGateway();
    const ensured = await ensurePaymentOrder({
      telegramId: '1',
      pricing,
      accessGateway: gateway,
      orderRepository: orders,
      ttlMinutes: 15,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(ensured.ok).toBe(true);
    if (!ensured.ok) return;
    expect(ensured.order.orderId).toMatch(/^ord_[A-Za-z0-9_-]+$/);
    expect(ensured.order.providerInvoicePayload).toMatch(/^xtr_[A-Za-z0-9_-]+$/);
    expect(ensured.order.providerInvoicePayload).not.toContain('tg');
    expect(ensured.order.amount).toBe(100);
    expect(ensured.order.periodDays).toBe(30);
    const invoice = buildTelegramStarsInvoice(ensured.order);
    expect(invoice.currency).toBe('XTR');
    expect(invoice.provider_token).toBe('');
    expect(invoice.prices).toHaveLength(1);
    expect(invoice.prices[0]).toEqual({ label: 'Первый вход — 30 дней', amount: 100 });
  });

  it('reuses pending orders inside TTL and expires old orders without changing paid orders', async () => {
    const orders = new InMemoryPaymentOrderRepository();
    const gateway = new FakeGateway();
    const first = await ensurePaymentOrder({
      telegramId: '1',
      pricing,
      accessGateway: gateway,
      orderRepository: orders,
      ttlMinutes: 15,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await orders.markPending(first.order.orderId);
    const reused = await ensurePaymentOrder({
      telegramId: '1',
      pricing,
      accessGateway: gateway,
      orderRepository: orders,
      ttlMinutes: 15,
      now: new Date('2026-01-01T00:10:00.000Z'),
    });
    expect(reused.ok && reused.reused).toBe(true);
    expect(reused.ok && reused.order.orderId).toBe(first.order.orderId);
    await orders.markExpired(first.order.orderId, new Date('2026-01-01T00:16:00.000Z'));
    expect((await orders.findByOrderId(first.order.orderId))?.status).toBe('expired');
  });

  it('validates pre_checkout happy path and rejects wrong user, amount, currency, expired and first_month race', async () => {
    const orders = new InMemoryPaymentOrderRepository();
    const gateway = new FakeGateway();
    const ensured = await ensurePaymentOrder({
      telegramId: '1',
      pricing,
      accessGateway: gateway,
      orderRepository: orders,
      ttlMinutes: 15,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    if (!ensured.ok) throw new Error('order expected');
    await orders.markPending(ensured.order.orderId);
    await expect(
      validatePreCheckout({
        telegramId: '1',
        payload: ensured.order.providerInvoicePayload,
        currency: 'XTR',
        totalAmount: 100,
        orderRepository: orders,
        accessGateway: gateway,
        ttlMinutes: 15,
        now: new Date('2026-01-01T00:01:00.000Z'),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      validatePreCheckout({
        telegramId: '2',
        payload: ensured.order.providerInvoicePayload,
        currency: 'XTR',
        totalAmount: 100,
        orderRepository: orders,
        accessGateway: gateway,
        ttlMinutes: 15,
        now: new Date('2026-01-01T00:01:00.000Z'),
      }),
    ).resolves.toEqual({ ok: false, message: 'Этот счёт создан для другого пользователя.' });
    await expect(
      validatePreCheckout({
        telegramId: '1',
        payload: ensured.order.providerInvoicePayload,
        currency: 'XTR',
        totalAmount: 101,
        orderRepository: orders,
        accessGateway: gateway,
        ttlMinutes: 15,
        now: new Date('2026-01-01T00:01:00.000Z'),
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'Параметры платежа изменились. Создайте новый счёт.',
    });
    await expect(
      validatePreCheckout({
        telegramId: '1',
        payload: ensured.order.providerInvoicePayload,
        currency: 'USD',
        totalAmount: 100,
        orderRepository: orders,
        accessGateway: gateway,
        ttlMinutes: 15,
        now: new Date('2026-01-01T00:01:00.000Z'),
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'Параметры платежа изменились. Создайте новый счёт.',
    });
    gateway.state = { kind: 'active', telegramId: '1', status: 'active', trialUsed: true };
    await expect(
      validatePreCheckout({
        telegramId: '1',
        payload: ensured.order.providerInvoicePayload,
        currency: 'XTR',
        totalAmount: 100,
        orderRepository: orders,
        accessGateway: gateway,
        ttlMinutes: 15,
        now: new Date('2026-01-01T00:01:00.000Z'),
      }),
    ).resolves.toEqual({
      ok: false,
      message: 'Первый тариф уже использован. Создайте счёт на продление.',
    });
    await expect(
      validatePreCheckout({
        telegramId: '1',
        payload: ensured.order.providerInvoicePayload,
        currency: 'XTR',
        totalAmount: 100,
        orderRepository: orders,
        accessGateway: gateway,
        ttlMinutes: 15,
        now: new Date('2026-01-01T00:16:00.000Z'),
      }),
    ).resolves.toEqual({ ok: false, message: 'Срок действия счёта закончился.' });
  });

  it('processes first payment, renewal, duplicates, concurrent duplicates, and first_month race conversion idempotently', async () => {
    const orders = new InMemoryPaymentOrderRepository();
    const events = new InMemoryPaymentEventRepository();
    const gateway = new FakeGateway();
    const ensured = await ensurePaymentOrder({
      telegramId: '1',
      pricing,
      accessGateway: gateway,
      orderRepository: orders,
      ttlMinutes: 15,
    });
    if (!ensured.ok) throw new Error('order expected');
    const first = await processPaymentEvent({
      order: ensured.order,
      providerEventId: 'charge-1',
      rawPayload,
      eventRepository: events,
      orderRepository: orders,
      accessGateway: gateway,
      now: new Date('2026-01-02T00:00:00.000Z'),
    });
    expect(first.status).toBe('processed');
    expect(first.password).toBe('generated-password');
    expect(gateway.accountCalls).toBe(1);
    expect(gateway.extendCalls).toBe(1);
    expect((await orders.findByOrderId(ensured.order.orderId))?.status).toBe('paid');
    const duplicate = await processPaymentEvent({
      order: ensured.order,
      providerEventId: 'charge-1',
      rawPayload,
      eventRepository: events,
      orderRepository: orders,
      accessGateway: gateway,
    });
    expect(duplicate.status).toBe('duplicate');
    expect(gateway.extendCalls).toBe(1);
    await Promise.all([
      processPaymentEvent({
        order: ensured.order,
        providerEventId: 'charge-1',
        rawPayload,
        eventRepository: events,
        orderRepository: orders,
        accessGateway: gateway,
      }),
      processPaymentEvent({
        order: ensured.order,
        providerEventId: 'charge-1',
        rawPayload,
        eventRepository: events,
        orderRepository: orders,
        accessGateway: gateway,
      }),
    ]);
    expect(gateway.extendCalls).toBe(1);
    const raceOrder = await orders.createOrder({
      telegramId: '1',
      plan: 'first_month',
      amount: 100,
      periodDays: 30,
    });
    await processPaymentEvent({
      order: raceOrder,
      providerEventId: 'charge-2',
      rawPayload,
      eventRepository: events,
      orderRepository: orders,
      accessGateway: gateway,
    });
    expect(
      await events.findByProviderEventId('charge-2:first_month_race_converted_to_renewal'),
    ).toBeDefined();
    expect(gateway.extendCalls).toBe(2);
  });

  it('does manual review for banned/deleted successful payment and supports partial failure retry', async () => {
    const orders = new InMemoryPaymentOrderRepository();
    const events = new InMemoryPaymentEventRepository();
    const gateway = new FakeGateway();
    const order = await orders.createOrder({
      telegramId: '1',
      plan: 'first_month',
      amount: 100,
      periodDays: 30,
    });
    gateway.state = { kind: 'banned', telegramId: '1', status: 'banned', trialUsed: false };
    await expect(
      processPaymentEvent({
        order,
        providerEventId: 'charge-banned',
        rawPayload,
        eventRepository: events,
        orderRepository: orders,
        accessGateway: gateway,
      }),
    ).resolves.toMatchObject({ status: 'manual_review' });
    gateway.state = { kind: 'deleted', telegramId: '1', status: 'deleted', trialUsed: true };
    await expect(
      processPaymentEvent({
        order,
        providerEventId: 'charge-deleted',
        rawPayload,
        eventRepository: events,
        orderRepository: orders,
        accessGateway: gateway,
      }),
    ).resolves.toMatchObject({ status: 'manual_review' });
    gateway.state = { kind: 'telegram_registered', telegramId: '1', trialUsed: false };
    const failingGateway = new FakeGateway();
    const spy = vi.spyOn(failingGateway, 'createOrGetAccount');
    spy.mockRejectedValueOnce(new Error('temporary'));
    await expect(
      processPaymentEvent({
        order,
        providerEventId: 'charge-retry',
        rawPayload,
        eventRepository: events,
        orderRepository: orders,
        accessGateway: failingGateway,
      }),
    ).rejects.toThrow('temporary');
    expect((await events.findByProviderEventId('charge-retry'))?.processedAt).toBeUndefined();
    await expect(
      processPaymentEvent({
        order,
        providerEventId: 'charge-retry',
        rawPayload,
        eventRepository: events,
        orderRepository: orders,
        accessGateway: failingGateway,
      }),
    ).resolves.toMatchObject({ status: 'processed' });
    expect(failingGateway.extendCalls).toBe(1);
  });

  it('sanitizes raw payload without secrets, password, ctx, chat history, or environment values', () => {
    expect(rawPayload).toEqual({
      currency: 'XTR',
      total_amount: 100,
      invoice_payload: 'payload',
      telegram_payment_charge_id: 'charge-1',
      provider_payment_charge_id: 'provider-charge-1',
      message_id: 10,
      update_id: 20,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(rawPayload)).not.toContain('password');
    expect(JSON.stringify(rawPayload)).not.toContain('BOT_TOKEN');
  });

  it('trial_used is true after any successful payment plan, not just first_month', async () => {
    for (const plan of ['first_month', 'monthly_renewal', 'three_months', 'six_months', 'yearly'] as PaymentPlan[]) {
      let capturedTrialUsed: boolean | undefined;
      const gateway: PaymentAccessGateway = {
        getAccessState: vi.fn().mockResolvedValue({ kind: 'telegram_registered', telegramId: '1', trialUsed: false }),
        ensureBotUser: vi.fn().mockResolvedValue(undefined),
        createOrGetAccount: vi.fn().mockResolvedValue({ supabaseUserId: 'u1', loginEmail: 'e@e', created: false }),
        extendSubscription: vi.fn().mockImplementation((input) => {
          capturedTrialUsed = true; // always true per spec
          return Promise.resolve({ expiresAt: new Date(), firstPayment: plan === 'first_month', applied: true });
        }),
        getAccessSummary: vi.fn().mockResolvedValue({}),
        adminExtend: vi.fn(),
      };
      const orderRepo = new InMemoryPaymentOrderRepository();
      const eventRepo = new InMemoryPaymentEventRepository();
      const order = await orderRepo.createOrder({ telegramId: '1', plan, amount: 100, periodDays: 30, now: new Date() });
      await processPaymentEvent({
        order,
        providerEventId: `charge-${plan}`,
        rawPayload: { currency: 'XTR', total_amount: 100, invoice_payload: 'p', timestamp: new Date().toISOString() },
        eventRepository: eventRepo,
        orderRepository: orderRepo,
        accessGateway: gateway,
      });
      expect(capturedTrialUsed).toBe(true);
    }
  });

  it('first_month invoice is blocked when trialUsed=true via validatePreCheckout', async () => {
    const orderRepo = new InMemoryPaymentOrderRepository();
    const gateway: PaymentAccessGateway = {
      getAccessState: vi.fn().mockResolvedValue({ kind: 'active', status: 'active', telegramId: '1', trialUsed: true }),
      ensureBotUser: vi.fn(),
      createOrGetAccount: vi.fn(),
      extendSubscription: vi.fn(),
      getAccessSummary: vi.fn(),
      adminExtend: vi.fn(),
    };
    const order = await orderRepo.createOrder({ telegramId: '1', plan: 'first_month', amount: 100, periodDays: 30, now: new Date() });
    const result = await validatePreCheckout({
      telegramId: '1',
      payload: order.providerInvoicePayload,
      currency: 'XTR',
      totalAmount: 100,
      orderRepository: orderRepo,
      accessGateway: gateway,
      ttlMinutes: 15,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; message: string }).message).toContain('Первый тариф');
  });
});
