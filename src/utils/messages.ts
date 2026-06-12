import type { PricingConfig } from '../config/pricing.js';
import { getPaymentPlanMetadata } from '../config/pricing.js';
import type { UserAccessState } from '../types/accessState.js';
import type { PaymentPlan } from '../types/payment.js';
import { assertNever } from './assertNever.js';
import { formatDateTime, formatDeletionRemainingTime, formatRemainingTime } from './dates.js';
import { escapeTelegramHtml } from './html.js';

export const MESSAGES = {
  temporaryError: 'Временная ошибка.\n\nПопробуй ещё раз через несколько секунд.',
  dataLoadError:
    'Не удалось загрузить данные.\n\nПопробуй ещё раз. Если ошибка повторится — напиши в поддержку.',
  unknown: 'Используй кнопки меню — так бот быстрее приведёт тебя к нужному действию.',
  adminReady:
    'Панель администратора подключена.\n\nФункции управления пользователями, платежами и купонами доступны через команды.',
  adminForbidden: 'Недостаточно прав.',
  privateChatRequired:
    'Strongest OS работает только в личном чате с ботом.\n\nОткрой личный диалог с ботом и попробуй снова.',
  cancelled: 'Действие отменено.',
  noActiveAction: 'Нет активного действия для отмены.',
  staleButton: 'Эта кнопка устарела.\n\nОткрой главное меню и выбери действие заново.',
  paymentNextStage: 'Оплата через Telegram Stars будет подключена на следующем этапе.',
  couponNotConfigured: 'Не удалось проверить промокод. Попробуй ещё раз через несколько секунд.',
  couponTooManyAttempts: 'Слишком много попыток.\n\nПодожди несколько минут и попробуй снова.',
  couponInvalidInput: 'Отправь промокод одним сообщением без лишних строк.',
  passwordPrivateOnly: 'Новый пароль можно создать только в личном чате с ботом.',
} as const;

export const buildWelcomeMessage = (state: UserAccessState): string => {
  switch (state.kind) {
    case 'active':
      return '⚡ Система активна.\n\nДоступ открыт. Квесты ждут.\nЗаходи и продолжай держать режим.';
    case 'expired':
      return '⛔ Доступ закончился.\n\nАккаунт сохранён временно. Чтобы вернуться к квестам, XP, streak и истории прогресса — продли доступ или активируй промокод.';
    case 'banned':
      return '⛔ Аккаунт ограничен.\n\nДоступ к Strongest OS временно заблокирован.\nНапиши в поддержку, чтобы уточнить причину.';
    case 'marked_for_deletion':
      return '⚠️ Аккаунт ожидает удаления.\n\nПока данные не удалены — можно восстановить доступ через оплату или промокод.';
    case 'deleted':
      return 'Данные аккаунта удалены.\n\nЕсли нужен разбор ситуации — напиши в поддержку.';
    case 'temporarily_unavailable':
      return MESSAGES.dataLoadError;
    case 'unknown_status':
    case 'broken_link':
      return 'Не удалось определить состояние аккаунта.\n\nНапиши в поддержку. Не создавай новый аккаунт самостоятельно.';
    case 'unregistered':
    case 'telegram_registered':
    case 'account_pending':
    case 'cancelled':
      return '🚀 Strongest OS\n\nЛичная RPG-система для дисциплины и прогресса.\n\nВыполняй реальные задачи как квесты, получай XP, держи streak, прокачивай уровень и собирай свой день без хаоса.\n\nВыбери действие ниже.';
    default:
      return assertNever(state);
  }
};

const safeEmail = (email: string | undefined): string =>
  `<code>${escapeTelegramHtml(email || 'логин пока не указан')}</code>`;

export const buildAccessMessage = (
  state: UserAccessState,
  timeZone: string,
  nowMs = Date.now(),
): string => {
  switch (state.kind) {
    case 'unregistered':
    case 'telegram_registered':
      return 'Аккаунт ещё не создан.\n\nОн появится автоматически после оплаты или активации промокода.\nБот выдаст логин и пароль для входа в Strongest OS.';
    case 'account_pending':
    case 'cancelled':
      return `Аккаунт создан, но активного доступа нет.\n\n🔐 Логин: ${safeEmail(state.loginEmail)}\n\nЧтобы вернуться в систему — оформи доступ или активируй промокод.`;
    case 'active':
      return `✅ Доступ активен.\n\n📅 Действует до: ${formatDateTime(state.expiresAt, timeZone)}\n\n⏳ Осталось: ${formatRemainingTime(state.expiresAt, nowMs)}\n\n🔐 Логин: ${safeEmail(state.loginEmail)}\n\nСистема открыта. Держи режим.`;
    case 'expired': {
      const deletion = state.deleteAfter
        ? formatDeletionRemainingTime(state.deleteAfter, nowMs)
        : 'Дата удаления пока не назначена.';
      return `⛔ Доступ закончился.\n\nСистема закрыта, но данные ещё сохранены.\n\nДо удаления данных осталось: ${deletion}\n\nПродли доступ или активируй промокод, чтобы вернуть аккаунт.`;
    }
    case 'banned':
      return '⛔ Аккаунт ограничен.\n\nНапиши в поддержку, чтобы уточнить причину.';
    case 'marked_for_deletion':
      return `⚠️ Аккаунт ожидает удаления.\n\n📅 Дата удаления: ${formatDateTime(state.deleteAfter, timeZone)}\n\n⏳ Осталось: ${formatDeletionRemainingTime(state.deleteAfter, nowMs)}\n\nДо удаления можно восстановить доступ через оплату или промокод.`;
    case 'deleted':
      return 'Данные аккаунта удалены.\n\nВосстановить их через бота уже нельзя.\nЕсли нужен разбор ситуации — напиши в поддержку.';
    case 'broken_link':
    case 'unknown_status':
      return 'Не удалось определить состояние аккаунта.\n\nНапиши в поддержку. Не создавай новый аккаунт самостоятельно.';
    case 'temporarily_unavailable':
      return MESSAGES.dataLoadError;
    default:
      return assertNever(state);
  }
};

export const buildPlanMessage = (state: UserAccessState, pricing: PricingConfig): string => {
  const intro =
    '🚀 Выбери режим доступа\n\nStrongest OS — это система для ежедневной прокачки: квесты, XP, уровни, streak, цели и история прогресса.';

  const trialUsed = 'trialUsed' in state && state.trialUsed;

  if (trialUsed) {
    return `${intro}\n\nВыбери срок продления. Если доступ уже активен — новые дни добавятся сверху.`;
  }

  return `${intro}\n\nПервый вход доступен один раз за ${pricing.firstPeriodStars}⭐.\nГлавный тариф — 3 месяца за ${pricing.threeMonthsStars ?? 399}⭐.`;
};

export const buildFirstMonthUsedMessage = (): string =>
  'Первый вход за 100⭐ уже использован.\n\nВыбери обычный тариф для продления.';

export const buildPlanConfirmationMessage = (pricing: PricingConfig, plan: PaymentPlan): string => {
  const metadata = getPaymentPlanMetadata(pricing, plan);
  return `Ты выбрал: ${metadata.title}\n\nСрок: ${metadata.periodLabel}\nСтоимость: ${metadata.amount} Telegram Stars\n\nПосле оплаты бот откроет доступ к Strongest OS.\nЕсли аккаунта ещё нет — бот создаст его и выдаст логин с паролем.`;
};

export const buildCouponPromptMessage = (): string =>
  '🎟 Введи промокод\n\nОтправь код одним сообщением — без пробелов, лишних строк и символов.\n\nПромокод одноразовый.\nДоступ получает тот, кто активировал его первым.';

export const buildCouponSuccessMessage = (
  days: number,
  expiresAt: Date | undefined,
  timeZone: string,
): string =>
  `🎟 Промокод активирован.\n\nДобавлено: ${days} дней\n\n📅 Новый срок доступа: ${formatDateTime(expiresAt?.toISOString(), timeZone)}\n\nВремя добавлено к текущему доступу. Дни не сгорели.`;

export const buildCouponNewAccountSuccessMessage = (input: {
  days: number;
  expiresAt: Date | undefined;
  timeZone: string;
  appUrl: string;
  loginEmail: string;
  password: string;
}): string =>
  `🎟 Промокод активирован.\n\nДоступ к Strongest OS открыт.\n\nДобавлено: ${input.days} дней\n📅 Доступ до: ${formatDateTime(input.expiresAt?.toISOString(), input.timeZone)}\n\n🌐 Вход: ${escapeTelegramHtml(input.appUrl)}\n\n🔐 Логин: <code>${escapeTelegramHtml(input.loginEmail)}</code>\n\n🔑 Пароль: <code>${escapeTelegramHtml(input.password)}</code>\n\nСохрани пароль сейчас. Бот показывает его только один раз.`;

export const buildCouponAlreadyRedeemedByUserMessage = (
  expiresAt: Date | undefined,
  timeZone: string,
): string =>
  `Этот промокод уже был активирован тобой.\n\nТекущий срок доступа: ${formatDateTime(expiresAt?.toISOString(), timeZone)}`;

export const buildCouponAlreadyRedeemedMessage = (): string =>
  'Этот промокод уже использован.\n\nДоступ получил пользователь, который активировал код первым.';

export const buildCouponNotFoundMessage = (): string =>
  'Промокод не найден.\n\nПроверь код и отправь ещё раз одним сообщением.';

export const buildPasswordRecoveryMessage = (state: UserAccessState): string => {
  switch (state.kind) {
    case 'unregistered':
    case 'telegram_registered':
      return 'Аккаунт ещё не создан.\n\nСначала открой доступ через оплату или промокод.';
    case 'deleted':
      return 'Данные аккаунта удалены.\n\nЕсли нужен разбор ситуации — напиши в поддержку.';
    case 'broken_link':
    case 'unknown_status':
    case 'temporarily_unavailable':
      return 'Не удалось определить состояние аккаунта.\n\nНапиши в поддержку.';
    case 'banned':
      return `🔑 Новый пароль\n\n🔐 Логин: ${safeEmail(state.loginEmail)}\n\nБот создаст новый пароль.\nСтарый пароль перестанет работать.\n\nВнимание: аккаунт ограничен. Новый пароль не снимет блокировку доступа.\n\nПродолжить?`;
    case 'account_pending':
    case 'active':
    case 'expired':
    case 'cancelled':
    case 'marked_for_deletion':
      return `🔑 Новый пароль\n\n🔐 Логин: ${safeEmail(state.loginEmail)}\n\nБот создаст новый пароль.\nСтарый пароль перестанет работать.\n\nПродолжить?`;
    default:
      return assertNever(state);
  }
};

export const buildPasswordCreatedMessage = (loginEmail: string, password: string): string =>
  `🔑 Новый пароль создан.\n\n🔐 Логин: ${safeEmail(loginEmail)}\n\n🔑 Новый пароль: <code>${escapeTelegramHtml(password)}</code>\n\nСохрани его сейчас. Бот не покажет этот пароль повторно.`;

export const buildFeaturesMessage = (): string =>
  `🎮 Что внутри Strongest OS\n\n🎯 Квесты\nЗаписывай реальные задачи и выполняй их как квесты.\n\n🔥 Главный квест дня\nВыбирай одно главное действие, которое двигает день вперёд.\n\n📈 XP, уровни и ранги\nПолучай визуальный прогресс за выполненные действия.\n\n⚡ Streak\nДержи серию активных дней и не выпадай из режима.\n\n💰 Денежные цели\nФиксируй цель, срок и фактический прогресс.\n\n🧠 Разбор дня\nЗаписывай выводы, ошибки и сильные действия.\n\n📅 История и календарь\nВидь прошлые дни, результаты и динамику.\n\n📲 PWA-приложение\nДобавь Strongest OS на главный экран и используй как приложение.\n\nЭто не планер. Это система, которая помогает держать фокус и видеть прокачку каждый день.`;

export const buildInstallationMessage = (): string =>
  '📲 Установка Strongest OS\n\nВыбери устройство.\nПосле установки Strongest OS будет открываться как обычное приложение с главного экрана.';

export const buildAndroidInstallationMessage = (): string =>
  '🤖 Android / Chrome\n\n1. Открой Strongest OS в Chrome.\n2. Войди по логину и паролю.\n3. Нажми ⋮ в правом верхнем углу.\n4. Выбери “Установить приложение” или “Добавить на главный экран”.\n5. Подтверди установку.\n\nИконка Strongest OS появится на главном экране.';

export const buildIphoneInstallationMessage = (): string =>
  '🍏 iPhone / Safari\n\n1. Открой Strongest OS в Safari.\n2. Войди по логину и паролю.\n3. Нажми “Поделиться” внизу экрана.\n4. Выбери “На экран Домой”.\n5. Подтверди добавление.\n\nИконка Strongest OS появится на главном экране.\n\nВажно: используй Safari, не встроенный браузер Telegram.';

export const buildDesktopInstallationMessage = (): string =>
  '💻 Компьютер\n\n1. Открой Strongest OS в Chrome или Edge.\n2. Войди в аккаунт.\n3. Нажми значок установки в адресной строке или открой меню браузера.\n4. Выбери “Установить Strongest OS”.\n5. Подтверди установку.\n\nПосле этого Strongest OS можно запускать как отдельное приложение.';

export const buildTermsMessage = (): string =>
  `📄 Условия Strongest OS\n\n1. Доступ открывается на оплаченный период.\n2. Первый вход за 100⭐ доступен один раз на пользователя.\n3. Продление добавляется к текущему сроку. Оставшиеся дни не сгорают.\n4. После окончания периода доступ к приложению блокируется.\n5. Данные аккаунта могут храниться до 60 дней после окончания доступа.\n6. После срока хранения данные могут быть удалены без восстановления.\n7. Промокоды одноразовые.\n8. Доступ по промокоду получает тот, кто активировал его первым.\n9. Telegram Stars используются для оплаты цифрового доступа внутри Telegram.\n10. Нажимая кнопку оплаты, пользователь соглашается с этими условиями.\n11. Передавать логин и пароль третьим лицам запрещено.\n12. При злоупотреблениях доступ может быть ограничен.`;

export const buildPrivacyMessage = (): string =>
  '🔒 Конфиденциальность\n\nStrongest OS хранит только данные, нужные для работы аккаунта и доступа:\n\n— Telegram ID;\n— username, если он указан;\n— имя профиля Telegram;\n— технический логин Strongest OS;\n— статус и срок доступа;\n— историю оплат;\n— историю промокодов.\n\nПароль не хранится в открытом виде.\nЕсли доступ закончился, данные могут быть удалены после срока хранения.';

export const buildSupportMessage = (configured: boolean): string =>
  configured
    ? '🆘 Поддержка Strongest OS\n\nОпиши проблему одним сообщением.\nЕсли есть скриншот — приложи сразу.\n\nНе отправляй никому пароль от аккаунта.'
    : 'Контакт поддержки пока не настроен.';

export const buildHelpMessage = (isAdmin: boolean): string =>
  `/start — открыть бота\n/menu — главное меню\n/status — проверить доступ\n/help — эта справка\n/cancel — отменить текущее действие\n\nОстальные действия доступны через кнопки меню.${isAdmin ? '\n\nАдминистратору также доступна /admin.' : ''}`;
