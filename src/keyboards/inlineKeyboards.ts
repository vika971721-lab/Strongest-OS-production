import { Markup } from 'telegraf';
import { CALLBACK_DATA } from '../config/constants.js';
import { createSupportLink } from '../utils/telegram.js';

const urlButton = (label: string, url: string | undefined) =>
  url ? Markup.button.url(label, url) : undefined;
const compact = <T>(items: (T | undefined)[]): T[] =>
  items.filter((item): item is T => item !== undefined);

export const createPlanKeyboard = (canPay: boolean) =>
  Markup.inlineKeyboard(
    canPay
      ? [[Markup.button.callback('🚀 Оформить доступ', CALLBACK_DATA.createPayment)]]
      : [[Markup.button.callback('Поддержка', CALLBACK_DATA.navSupport)]],
  );

export const createAccessKeyboard = (kind: string, appUrl?: string) => {
  if (kind === 'active') {
    return Markup.inlineKeyboard(
      [
        compact([urlButton('Открыть Strongest OS', appUrl)]),
        [Markup.button.callback('Восстановить пароль', CALLBACK_DATA.navPasswordRecovery)],
        [Markup.button.callback('Оформить продление', CALLBACK_DATA.navPlans)],
      ].filter((row) => row.length > 0),
    );
  }
  if (
    kind === 'banned' ||
    kind === 'deleted' ||
    kind === 'broken_link' ||
    kind === 'unknown_status'
  ) {
    return Markup.inlineKeyboard([[Markup.button.callback('Поддержка', CALLBACK_DATA.navSupport)]]);
  }
  return Markup.inlineKeyboard([
    [Markup.button.callback('Оформить доступ', CALLBACK_DATA.navPlans)],
    [Markup.button.callback('Активировать промокод', CALLBACK_DATA.couponStart)],
  ]);
};

export const createFeaturesKeyboard = (appUrl?: string) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('Оформить доступ', CALLBACK_DATA.navPlans)],
    ...compact([urlButton('Открыть Strongest OS', appUrl)]).map((button) => [button]),
  ]);

export const createInstallationKeyboard = (appUrl: string | undefined) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('Android / Chrome', CALLBACK_DATA.navInstallAndroid)],
    [Markup.button.callback('iPhone / Safari', CALLBACK_DATA.navInstallIos)],
    [Markup.button.callback('Компьютер', CALLBACK_DATA.navInstallDesktop)],
    ...compact([urlButton('Открыть Strongest OS', appUrl)]).map((button) => [button]),
    [Markup.button.callback('Назад', CALLBACK_DATA.navMain)],
  ]);

export const createTermsKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('Оформить доступ', CALLBACK_DATA.navPlans)],
    [Markup.button.callback('Поддержка', CALLBACK_DATA.navSupport)],
    [Markup.button.callback('Конфиденциальность', CALLBACK_DATA.navPrivacy)],
  ]);

export const createSupportKeyboard = (supportUsername?: string) => {
  const link = createSupportLink(supportUsername);
  return link
    ? Markup.inlineKeyboard([[Markup.button.url('Написать в поддержку', link)]])
    : Markup.inlineKeyboard([[Markup.button.callback('Главное меню', CALLBACK_DATA.navMain)]]);
};

export const createPasswordRecoveryKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('Создать новый пароль', CALLBACK_DATA.accountResetConfirm)],
    [Markup.button.callback('Отмена', CALLBACK_DATA.accountResetCancel)],
  ]);

export const createPasswordCreatedKeyboard = (appUrl?: string) =>
  Markup.inlineKeyboard([
    ...compact([urlButton('Открыть Strongest OS', appUrl)]).map((button) => [button]),
    [Markup.button.callback('Главное меню', CALLBACK_DATA.navMain)],
  ]);

export const createCouponCancelKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('Отмена', CALLBACK_DATA.couponCancel)]]);

export const createRetryKeyboard = () =>
  Markup.inlineKeyboard([[Markup.button.callback('Повторить', CALLBACK_DATA.navRetryAccess)]]);

export const createPaymentSupportKeyboard = (supportUsername?: string) => {
  const link = createSupportLink(supportUsername);
  return Markup.inlineKeyboard([
    [Markup.button.callback('Проверить последнюю оплату', CALLBACK_DATA.checkLastPayment)],
    ...(link ? [[Markup.button.url('Написать в поддержку', link)]] : []),
  ]);
};
