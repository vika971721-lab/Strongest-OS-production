import type { PaymentPlan } from '../types/payment.js';

export interface PricingConfig {
  firstPeriodStars: number;
  renewalPeriodStars: number;
  firstPeriodDays: number;
  renewalPeriodDays: number;
  threeMonthsStars: number;
  threeMonthsDays: number;
  sixMonthsStars: number;
  sixMonthsDays: number;
  yearlyStars: number;
  yearlyDays: number;
}

export interface PaymentPlanMetadata {
  plan: PaymentPlan;
  title: string;
  buttonLabel: string;
  amount: number;
  periodDays: number;
  periodLabel: string;
  invoiceTitle: string;
  invoiceDescription: string;
  invoicePriceLabel: string;
  recommended?: boolean;
}

export const PAYMENT_PLANS: PaymentPlan[] = [
  'first_month',
  'monthly_renewal',
  'three_months',
  'six_months',
  'yearly',
];

export const isPaymentPlan = (value: string): value is PaymentPlan =>
  PAYMENT_PLANS.includes(value as PaymentPlan);

export const getPaymentPlanMetadata = (
  pricing: PricingConfig,
  plan: PaymentPlan,
): PaymentPlanMetadata => {
  switch (plan) {
    case 'first_month':
      return {
        plan,
        title: '🔥 Первый вход',
        buttonLabel: `🔥 Первый вход — ${pricing.firstPeriodStars}⭐`,
        amount: pricing.firstPeriodStars,
        periodDays: pricing.firstPeriodDays,
        periodLabel: `${pricing.firstPeriodDays} дней`,
        invoiceTitle: 'Strongest OS — первый вход',
        invoiceDescription:
          '30 дней доступа к Strongest OS: квесты, XP, уровни, streak, цели и история прогресса. После оплаты бот создаст аккаунт и выдаст логин с паролем.',
        invoicePriceLabel: 'Первый вход — 30 дней',
      };
    case 'monthly_renewal':
      return {
        plan,
        title: '⚡ 1 месяц режима',
        buttonLabel: `⚡ 1 месяц — ${pricing.renewalPeriodStars}⭐`,
        amount: pricing.renewalPeriodStars,
        periodDays: pricing.renewalPeriodDays,
        periodLabel: `${pricing.renewalPeriodDays} дней`,
        invoiceTitle: 'Strongest OS — 1 месяц режима',
        invoiceDescription:
          'Продление доступа к Strongest OS на 30 дней. Если доступ уже активен, новые дни добавятся сверху.',
        invoicePriceLabel: '1 месяц доступа',
      };
    case 'three_months':
      return {
        plan,
        title: '🎯 3 месяца прокачки',
        buttonLabel: `🎯 3 месяца — ${pricing.threeMonthsStars ?? 399}⭐ Рекомендуемый`,
        amount: pricing.threeMonthsStars ?? 399,
        periodDays: pricing.threeMonthsDays ?? 90,
        periodLabel: `${pricing.threeMonthsDays ?? 90} дней`,
        invoiceTitle: 'Strongest OS — 3 месяца прокачки',
        invoiceDescription:
          '90 дней доступа к Strongest OS. Рекомендуемый тариф для стабильного режима и отслеживания прогресса.',
        invoicePriceLabel: '3 месяца доступа',
        recommended: true,
      };
    case 'six_months':
      return {
        plan,
        title: '🛡 6 месяцев режима',
        buttonLabel: `🛡 6 месяцев — ${pricing.sixMonthsStars ?? 749}⭐`,
        amount: pricing.sixMonthsStars ?? 749,
        periodDays: pricing.sixMonthsDays ?? 180,
        periodLabel: `${pricing.sixMonthsDays ?? 180} дней`,
        invoiceTitle: 'Strongest OS — 6 месяцев режима',
        invoiceDescription:
          '180 дней доступа к Strongest OS без ежемесячного продления. Новые дни добавляются к текущему сроку.',
        invoicePriceLabel: '6 месяцев доступа',
      };
    case 'yearly':
      return {
        plan,
        title: '👑 Год Strongest',
        buttonLabel: `👑 12 месяцев — ${pricing.yearlyStars ?? 1299}⭐`,
        amount: pricing.yearlyStars ?? 1299,
        periodDays: pricing.yearlyDays ?? 365,
        periodLabel: `${pricing.yearlyDays ?? 365} дней`,
        invoiceTitle: 'Strongest OS — Год Strongest',
        invoiceDescription:
          '12 месяцев доступа к Strongest OS. Самый выгодный режим для постоянной прокачки.',
        invoicePriceLabel: '12 месяцев доступа',
      };
  }
};
