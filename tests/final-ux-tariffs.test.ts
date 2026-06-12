import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MENU_BUTTONS } from '../src/config/constants.js';
import { getPaymentPlanMetadata, PAYMENT_PLANS } from '../src/config/pricing.js';
import { createPlanKeyboard } from '../src/keyboards/inlineKeyboards.js';
import { createMainMenuKeyboard } from '../src/keyboards/mainMenuKeyboard.js';
import { buildTelegramStarsInvoice, getPlanConfig } from '../src/services/paymentFlow.js';
import type { PaymentOrder, PaymentPlan } from '../src/types/payment.js';
import { buildFeaturesMessage } from '../src/utils/messages.js';

const pricing = {
  firstPeriodStars: 100,
  firstPeriodDays: 30,
  renewalPeriodStars: 150,
  renewalPeriodDays: 30,
  threeMonthsStars: 399,
  threeMonthsDays: 90,
  sixMonthsStars: 749,
  sixMonthsDays: 180,
  yearlyStars: 1299,
  yearlyDays: 365,
};

const expectedPlanConfig: Record<PaymentPlan, { amount: number; periodDays: number }> = {
  first_month: { amount: 100, periodDays: 30 },
  monthly_renewal: { amount: 150, periodDays: 30 },
  three_months: { amount: 399, periodDays: 90 },
  six_months: { amount: 749, periodDays: 180 },
  yearly: { amount: 1299, periodDays: 365 },
};

const order = (plan: PaymentPlan): PaymentOrder => {
  const config = getPlanConfig(pricing, plan);
  return {
    orderId: `order-${plan}`,
    telegramId: '1',
    provider: 'telegram_stars',
    providerInvoicePayload: `payload-${plan}`,
    plan,
    amount: config.amount,
    currency: 'XTR',
    periodDays: config.periodDays,
    status: 'created',
    createdAt: new Date('2026-06-12T00:00:00.000Z'),
  };
};

describe('final UX and tariffs', () => {
  it('renders final main menu layout without old visible labels', () => {
    expect(createMainMenuKeyboard().reply_markup.keyboard).toEqual([
      [MENU_BUTTONS.buyAccess, MENU_BUTTONS.myAccess],
      [MENU_BUTTONS.features, MENU_BUTTONS.installation],
      [MENU_BUTTONS.activateCoupon, MENU_BUTTONS.restoreAccess],
      [MENU_BUTTONS.terms, MENU_BUTTONS.support],
    ]);
    expect(createMainMenuKeyboard().reply_markup.keyboard.flat()).not.toEqual(
      expect.arrayContaining([
        '🚀 Оформить доступ',
        '👤 Мой доступ',
        '🎟 Активировать промокод',
        '🔑 Восстановить доступ',
        '📦 Что входит',
        '📲 Как установить приложение',
      ]),
    );
  });

  it('exposes all five payment plans with final prices and periods', () => {
    expect(PAYMENT_PLANS).toEqual([
      'first_month',
      'monthly_renewal',
      'three_months',
      'six_months',
      'yearly',
    ]);
    for (const plan of PAYMENT_PLANS)
      expect(getPlanConfig(pricing, plan)).toEqual({ plan, ...expectedPlanConfig[plan] });
  });

  it('renders plan screen buttons with recommended three-month tariff', () => {
    const labels = createPlanKeyboard(true, pricing)
      .reply_markup.inline_keyboard.flat()
      .map((button) => ('text' in button ? button.text : ''));
    expect(labels).toEqual(
      expect.arrayContaining([
        '🔥 Первый вход — 100⭐',
        '🎯 3 месяца — 399⭐ Рекомендуемый',
        '⚡ 1 месяц — 150⭐',
        '🛡 6 месяцев — 749⭐',
        '👑 12 месяцев — 1299⭐',
      ]),
    );
    expect(getPaymentPlanMetadata(pricing, 'three_months').recommended).toBe(true);
  });

  it('uses selected-plan invoice titles, descriptions, and labels', () => {
    const invoices = Object.fromEntries(
      PAYMENT_PLANS.map((plan) => [plan, buildTelegramStarsInvoice(order(plan), pricing)]),
    ) as Record<PaymentPlan, ReturnType<typeof buildTelegramStarsInvoice>>;
    expect(invoices.first_month.title).toBe('Strongest OS — первый вход');
    expect(invoices.monthly_renewal.title).toBe('Strongest OS — 1 месяц режима');
    expect(invoices.three_months.title).toBe('Strongest OS — 3 месяца прокачки');
    expect(invoices.six_months.title).toBe('Strongest OS — 6 месяцев режима');
    expect(invoices.yearly.title).toBe('Strongest OS — Год Strongest');
    expect(invoices.three_months.description).toContain('Рекомендуемый тариф');
    expect(invoices.yearly.prices[0]).toEqual({ label: '12 месяцев доступа', amount: 1299 });
  });

  it('keeps first-month one-time guard and marks any paid plan as trial used in Supabase gateway code', () => {
    expect(readFileSync('src/services/paymentFlow.ts', 'utf8')).toContain(
      'Первый вход за 100⭐ уже использован',
    );
    expect(readFileSync('src/services/supabasePaymentAccessGateway.ts', 'utf8')).toContain(
      'const trialUsed = true;',
    );
  });

  it('keeps public features copy free from internal WST terminology', () => {
    expect(buildFeaturesMessage()).not.toContain('WSTшки');
  });
});
