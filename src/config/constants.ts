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
  navMain: 'nav:main',
  navAccess: 'nav:access',
  navPlans: 'nav:plans',
  navFeatures: 'nav:features',
  navInstall: 'nav:install',
  navInstallAndroid: 'nav:install:android',
  navInstallIos: 'nav:install:ios',
  navInstallDesktop: 'nav:install:desktop',
  navTerms: 'nav:terms',
  navPrivacy: 'nav:privacy',
  navSupport: 'nav:support',
  navRetryAccess: 'nav:retry:access',
  navPasswordRecovery: 'nav:reset',
  mockPaymentInfo: 'pay:next-stage',
  createPayment: 'pay:create',
  checkLastPayment: 'pay:check:last',
  accountResetConfirm: 'account:reset:confirm',
  accountResetCancel: 'account:reset:cancel',
  couponStart: 'coupon:start',
  couponCancel: 'coupon:cancel',
  // Backward-compatible aliases for older tests/messages.
  testPayment: 'pay:next-stage',
  installAndroid: 'nav:install:android',
  installIphone: 'nav:install:ios',
} as const;

export type CallbackData = (typeof CALLBACK_DATA)[keyof typeof CALLBACK_DATA];

export const PUBLIC_BOT_COMMANDS = [
  { command: 'start', description: 'Открыть бота' },
  { command: 'menu', description: 'Показать главное меню' },
  { command: 'status', description: 'Проверить доступ' },
  { command: 'help', description: 'Показать помощь' },
  { command: 'cancel', description: 'Отменить текущее действие' },
] as const;

export const COUPON_STATE_TTL_MS = 10 * 60 * 1000;
export const RATE_LIMIT_MESSAGE = 'Подождите несколько секунд';
export const TELEGRAM_HTML_PARSE_MODE = 'HTML' as const;
