export const MENU_BUTTONS = {
  buyAccess: '🚀 Оформить доступ',
  myAccess: '👤 Мой доступ',
  activateCoupon: '🎟 Активировать промокод',
  restoreAccess: '🔑 Восстановить доступ',
  features: '📦 Что входит',
  installation: '📲 Как установить приложение',
  terms: '📄 Условия',
  support: '🆘 Поддержка',
} as const;

export const CANCEL_BUTTON_TEXT = 'Отмена';

export const CALLBACK_DATA = {
  testPayment: 'payment:test',
  installAndroid: 'install:android',
  installIphone: 'install:iphone',
} as const;

export const COUPON_STATE_TTL_MS = 10 * 60 * 1000;
export const RATE_LIMIT_MESSAGE = 'Подождите несколько секунд';
