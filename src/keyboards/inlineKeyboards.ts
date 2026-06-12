import { Markup } from 'telegraf';
import { CALLBACK_DATA } from '../config/constants.js';
import { getPaymentPlanMetadata, PAYMENT_PLANS, type PricingConfig } from '../config/pricing.js';
import type { PaymentPlan } from '../types/payment.js';
import { createSupportLink } from '../utils/telegram.js';

const urlButton = (label: string, url: string | undefined) =>
  url ? Markup.button.url(label, url) : undefined;
const compact = <T>(items: (T | undefined)[]): T[] =>
  items.filter((item): item is T => item !== undefined);

export const createPlanKeyboard = (canPay: boolean, pricing?: PricingConfig) => {
  if (!canPay || !pricing) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🆘 Поддержка', CALLBACK_DATA.navSupport)],
    ]);
  }
  const rows = [
    ['first_month'],
    ['three_months'],
    ['monthly_renewal'],
    ['six_months'],
    ['yearly'],
  ].map(([plan]) => {
    const metadata = getPaymentPlanMetadata(pricing, plan as PaymentPlan);
    return [Markup.button.callback(metadata.buttonLabel, `plan:${plan}`)];
  });
  rows.push([Markup.button.callback('🎮 Что внутри', CALLBACK_DATA.navFeatures)]);
  rows.push([Markup.button.callback('🆘 Поддержка', CALLBACK_DATA.navSupport)]);
  return Markup.inlineKeyboard(rows);
};

export const createPlanConfirmationKeyboard = (plan: PaymentPlan, price: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback(`💳 Оплатить ${price}⭐`, `pay:create:${plan}`)],
    [Markup.button.callback('↩️ Назад к тарифам', CALLBACK_DATA.navPlans)],
    [Markup.button.callback('🆘 Поддержка', CALLBACK_DATA.navSupport)],
  ]);

export const createAccessKeyboard = (kind: string, appUrl?: string) => {
  if (kind === 'active') {
    return Markup.inlineKeyboard(
      [
        compact([urlButton('🚀 Открыть Strongest OS', appUrl)]),
        [Markup.button.callback('⚡ Продлить доступ', CALLBACK_DATA.navPlans)],
        [Markup.button.callback('🔑 Новый пароль', CALLBACK_DATA.navPasswordRecovery)],
        [Markup.button.callback('📲 Установить приложение', CALLBACK_DATA.navInstall)],
      ].filter((row) => row.length > 0),
    );
  }
  if (kind === 'unregistered' || kind === 'telegram_registered') {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Запустить систему', CALLBACK_DATA.navPlans)],
      [Markup.button.callback('🎟 Промокод', CALLBACK_DATA.couponStart)],
      [Markup.button.callback('🎮 Что внутри', CALLBACK_DATA.navFeatures)],
    ]);
  }
  if (kind === 'account_pending' || kind === 'cancelled') {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Продлить доступ', CALLBACK_DATA.navPlans)],
      [Markup.button.callback('🎟 Промокод', CALLBACK_DATA.couponStart)],
      [Markup.button.callback('🔑 Новый пароль', CALLBACK_DATA.navPasswordRecovery)],
    ]);
  }
  if (kind === 'expired' || kind === 'marked_for_deletion') {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Продлить доступ', CALLBACK_DATA.navPlans)],
      [Markup.button.callback('🎟 Промокод', CALLBACK_DATA.couponStart)],
      [Markup.button.callback('🆘 Поддержка', CALLBACK_DATA.navSupport)],
    ]);
  }
  if (kind === 'deleted') {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🆘 Поддержка', CALLBACK_DATA.navSupport)],
      [Markup.button.callback('🚀 Создать новый доступ', CALLBACK_DATA.navPlans)],
      [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
    ]);
  }
  return Markup.inlineKeyboard([
    [Markup.button.callback('🆘 Поддержка', CALLBACK_DATA.navSupport)],
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);
};

export const createFeaturesKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Запустить систему', CALLBACK_DATA.navPlans)],
    [Markup.button.callback('📲 Установить приложение', CALLBACK_DATA.navInstall)],
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);

export const createInstallationKeyboard = (appUrl: string | undefined) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🤖 Android / Chrome', CALLBACK_DATA.navInstallAndroid)],
    [Markup.button.callback('🍏 iPhone / Safari', CALLBACK_DATA.navInstallIos)],
    [Markup.button.callback('💻 Компьютер', CALLBACK_DATA.navInstallDesktop)],
    ...compact([urlButton('🚀 Открыть Strongest OS', appUrl)]).map((button) => [button]),
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);

export const createInstallationBackKeyboard = (appUrl?: string) =>
  Markup.inlineKeyboard([
    ...compact([urlButton('🚀 Открыть Strongest OS', appUrl)]).map((button) => [button]),
    [Markup.button.callback('↩️ Назад к установке', CALLBACK_DATA.navInstall)],
  ]);

export const createTermsKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Запустить систему', CALLBACK_DATA.navPlans)],
    [Markup.button.callback('🔒 Конфиденциальность', CALLBACK_DATA.navPrivacy)],
    [Markup.button.callback('🆘 Поддержка', CALLBACK_DATA.navSupport)],
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);

export const createPrivacyKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📄 Условия', CALLBACK_DATA.navTerms)],
    [Markup.button.callback('🆘 Поддержка', CALLBACK_DATA.navSupport)],
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);

export const createSupportKeyboard = (supportUsername?: string) => {
  const link = createSupportLink(supportUsername);
  return Markup.inlineKeyboard([
    ...(link ? [[Markup.button.url('🆘 Написать в поддержку', link)]] : []),
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);
};

export const createPasswordRecoveryKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🔑 Создать новый пароль', CALLBACK_DATA.accountResetConfirm)],
    [Markup.button.callback('❌ Отмена', CALLBACK_DATA.accountResetCancel)],
  ]);

export const createPasswordNoAccountKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Запустить систему', CALLBACK_DATA.navPlans)],
    [Markup.button.callback('🎟 Промокод', CALLBACK_DATA.couponStart)],
  ]);

export const createPasswordCreatedKeyboard = (appUrl?: string) =>
  Markup.inlineKeyboard([
    ...compact([urlButton('🚀 Открыть Strongest OS', appUrl)]).map((button) => [button]),
    [Markup.button.callback('👤 Мой аккаунт', CALLBACK_DATA.navAccess)],
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);

export const createCouponCancelKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', CALLBACK_DATA.couponCancel)]]);

export const createCouponSuccessKeyboard = (appUrl?: string) =>
  Markup.inlineKeyboard([
    ...compact([urlButton('🚀 Открыть Strongest OS', appUrl)]).map((button) => [button]),
    [Markup.button.callback('📲 Установить приложение', CALLBACK_DATA.navInstall)],
    [Markup.button.callback('👤 Мой аккаунт', CALLBACK_DATA.navAccess)],
  ]);

export const createCouponRetryKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', CALLBACK_DATA.couponCancel)]]);

export const createCouponStartMainKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Запустить систему', CALLBACK_DATA.navPlans)],
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);

export const createRetryKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('🔄 Повторить', CALLBACK_DATA.navRetryAccess)]]);

export const createPaymentSupportKeyboard = (supportUsername?: string) => {
  const link = createSupportLink(supportUsername);
  return Markup.inlineKeyboard([
    ...(link ? [[Markup.button.url('🆘 Написать в поддержку', link)]] : []),
    [Markup.button.callback('🔄 Проверить оплату', CALLBACK_DATA.checkLastPayment)],
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);
};

export const createPaymentProblemKeyboard = (supportUsername?: string, includeMain = false) => {
  const link = createSupportLink(supportUsername);
  return Markup.inlineKeyboard([
    ...(link ? [[Markup.button.url('🆘 Написать в поддержку', link)]] : []),
    [Markup.button.callback('🔄 Проверить оплату', CALLBACK_DATA.checkLastPayment)],
    ...(includeMain ? [[Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)]] : []),
  ]);
};

export const createInvoiceFailedKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Повторить', CALLBACK_DATA.createPayment)],
    [Markup.button.callback('🆘 Поддержка', CALLBACK_DATA.navSupport)],
    [Markup.button.callback('↩️ Главное меню', CALLBACK_DATA.navMain)],
  ]);

export { PAYMENT_PLANS };
