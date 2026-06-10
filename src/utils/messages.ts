import type { PricingConfig } from '../config/pricing.js';
import type { UserAccessState } from '../types/accessState.js';
import { assertNever } from './assertNever.js';
import { formatDateTime, formatDeletionRemainingTime, formatRemainingTime } from './dates.js';
import { escapeTelegramHtml } from './html.js';

export const MESSAGES = {
  temporaryError: 'Произошла временная ошибка. Попробуйте ещё раз через несколько секунд.',
  dataLoadError: 'Не удалось загрузить данные. Попробуйте ещё раз через несколько секунд.',
  unknown: 'Используйте кнопки меню для навигации.',
  adminReady:
    'Панель администратора подключена.\n\nФункции управления пользователями, платежами и купонами доступны через команды.',
  adminForbidden: 'Недостаточно прав.',
  privateChatRequired:
    'Strongest OS работает только в личном чате с ботом.\n\nОткройте диалог и попробуйте ещё раз.',
  cancelled: 'Действие отменено.',
  noActiveAction: 'Нет активного действия для отмены.',
  staleButton: 'Эта кнопка устарела. Откройте главное меню.',
  paymentNextStage: 'Оплата через Telegram Stars будет подключена на следующем этапе.',
  couponNotConfigured: 'Не удалось проверить промокод. Попробуйте ещё раз через несколько секунд.',
  couponTooManyAttempts: 'Слишком много попыток. Подождите несколько минут и попробуйте снова.',
  couponInvalidInput: 'Отправьте промокод одним сообщением без лишних строк.',
  passwordPrivateOnly: 'Восстановление пароля доступно только в личном чате с ботом.',
} as const;

export const buildWelcomeMessage = (state: UserAccessState): string => {
  switch (state.kind) {
    case 'active':
      return '⚡ С возвращением.\n\nДоступ активен. Квесты ждут. Продолжай двигаться вперёд.';
    case 'expired':
      return 'С возвращением в Strongest OS.\n\nСрок доступа закончился. Данные временно сохранены.\n\nОформи новый период или активируй промокод, чтобы вернуться в систему.';
    case 'banned':
      return '⛔ Доступ к аккаунту ограничен.\n\nОбратись в поддержку для уточнения причины.';
    case 'marked_for_deletion':
      return 'Аккаунт ожидает удаления.\n\nПока данные не удалены — можно восстановить доступ через оплату или промокод.';
    case 'deleted':
      return 'Данные аккаунта удалены.\n\nОбратись в поддержку.';
    case 'temporarily_unavailable':
      return MESSAGES.dataLoadError;
    case 'unknown_status':
      return 'Не удалось определить состояние доступа. Обратись в поддержку.';
    case 'broken_link':
      return 'Не удалось определить состояние аккаунта.\n\nОбратись в поддержку — не создавай новый аккаунт самостоятельно.';
    case 'unregistered':
    case 'telegram_registered':
    case 'account_pending':
    case 'cancelled':
      return '🚀 Strongest OS запущена.\n\nЭто твоя система дисциплины: квесты, цели, прогресс и личная прокачка в одном месте.\n\nВыбери действие ниже.';
    default:
      return assertNever(state);
  }
};

const safeEmail = (email: string | undefined): string =>
  escapeTelegramHtml(email || 'логин пока не указан');

export const buildAccessMessage = (
  state: UserAccessState,
  timeZone: string,
  nowMs = Date.now(),
): string => {
  switch (state.kind) {
    case 'unregistered':
    case 'telegram_registered':
      return 'Аккаунт Strongest OS ещё не создан.\n\nОн появится автоматически после успешной оплаты или активации промокода.\n\n🚀 Оформи доступ — и бот выдаст логин с паролем.';
    case 'account_pending':
      return `Аккаунт Strongest OS создан, но активного доступа пока нет.\n\n🔐 Логин:\n${safeEmail(state.loginEmail)}\n\nОформи доступ или активируй промокод.`;
    case 'active':
      return `✅ Доступ активен.\n\n📅 Действует до:\n${formatDateTime(state.expiresAt, timeZone)}\n\n⏳ Осталось:\n${formatRemainingTime(state.expiresAt, nowMs)}\n\n🔐 Логин:\n${safeEmail(state.loginEmail)}\n\nПродолжай держать систему. Один день — один шаг вперёд.`;
    case 'expired': {
      const deletion = state.deleteAfter
        ? `До удаления данных осталось:\n${formatDeletionRemainingTime(state.deleteAfter, nowMs)}`
        : 'Дата удаления пока не назначена.';
      return `⛔ Доступ закончился.\n\nСистема временно закрыта, но данные ещё сохранены.\n\n${deletion}\n\nЧтобы вернуться в Strongest OS, оформи новый период или активируй промокод.`;
    }
    case 'cancelled':
      return '⛔ Доступ отменён.\n\nДанные сохранены. Оформи новый период или активируй промокод, чтобы вернуться.';
    case 'banned':
      return '⛔ Доступ к аккаунту ограничен.\n\nОбратись в поддержку.';
    case 'marked_for_deletion':
      return `Аккаунт ожидает удаления.\n\n📅 Запланированная дата удаления:\n${formatDateTime(state.deleteAfter, timeZone)}\n\nОсталось:\n${formatDeletionRemainingTime(state.deleteAfter, nowMs)}\n\nДо удаления можно восстановить доступ через оплату или промокод.`;
    case 'deleted':
      return 'Данные аккаунта удалены.\n\nОбратись в поддержку.';
    case 'broken_link':
      return 'Не удалось определить состояние аккаунта.\n\nОбратись в поддержку — не создавай новый аккаунт самостоятельно.';
    case 'unknown_status':
      return 'Не удалось определить состояние доступа. Обратись в поддержку.';
    case 'temporarily_unavailable':
      return MESSAGES.dataLoadError;
    default:
      return assertNever(state);
  }
};

const firstPlan = (pricing: PricingConfig): string =>
  `🚀 Первый период Strongest OS\n\nСрок: ${pricing.firstPeriodDays} дней\nСтоимость: ${pricing.firstPeriodStars} Telegram Stars\n\nПосле оплаты бот автоматически создаст аккаунт и выдаст логин с паролем.`;

const renewalPlan = (pricing: PricingConfig): string =>
  `⚡ Продление Strongest OS\n\nСрок: +${pricing.renewalPeriodDays} дней\nСтоимость: ${pricing.renewalPeriodStars} Telegram Stars\n\nНовые дни добавятся к текущему сроку. Оставшееся время не сгорает.`;

export const buildPlanMessage = (state: UserAccessState, pricing: PricingConfig): string => {
  switch (state.kind) {
    case 'unregistered':
    case 'telegram_registered':
      return firstPlan(pricing);
    case 'account_pending':
      return state.trialUsed ? renewalPlan(pricing) : firstPlan(pricing);
    case 'active':
      return state.trialUsed ? renewalPlan(pricing) : firstPlan(pricing);
    case 'expired':
    case 'cancelled':
      return state.trialUsed
        ? `⚡ Возобновление Strongest OS\n\nСрок: +${pricing.renewalPeriodDays} дней\nСтоимость: ${pricing.renewalPeriodStars} Telegram Stars\n\nПосле оплаты доступ восстановится. Сохранённые данные снова станут доступны.`
        : firstPlan(pricing);
    case 'marked_for_deletion':
      return `Аккаунт ожидает удаления.\n\nОплата отменит удаление и восстановит доступ, если данные ещё не удалены.\n\n${state.trialUsed ? renewalPlan(pricing) : firstPlan(pricing)}`;
    case 'banned':
      return '⛔ Оформление доступа недоступно.\n\nАккаунт ограничен. Обратись в поддержку.';
    case 'deleted':
      return 'Данные аккаунта удалены.\n\nОбратись в поддержку перед созданием нового доступа.';
    case 'broken_link':
      return 'Обнаружена проблема со связью аккаунта.\n\nОбратись в поддержку. Не создавай повторный аккаунт самостоятельно.';
    case 'unknown_status':
      return 'Не удалось определить состояние доступа. Обратись в поддержку.';
    case 'temporarily_unavailable':
      return MESSAGES.dataLoadError;
    default:
      return assertNever(state);
  }
};

export const buildCouponPromptMessage = (): string =>
  '🎟 Активация промокода\n\nОтправь код одним сообщением — без пробелов и лишних символов.\n\nПромокод одноразовый. Доступ получает тот, кто первым успешно активировал код.';

export const buildCouponSuccessMessage = (
  days: number,
  expiresAt: Date | undefined,
  timeZone: string,
): string =>
  `🎟 Промокод активирован.\n\nДобавлено:\n<b>${days} дней</b>\n\nНовый срок:\n${formatDateTime(expiresAt?.toISOString(), timeZone)}\n\nИспользуй это время с умом.`;

export const buildCouponNewAccountSuccessMessage = (input: {
  days: number;
  expiresAt: Date | undefined;
  timeZone: string;
  appUrl: string;
  loginEmail: string;
  password: string;
}): string =>
  `🎟 Промокод активирован.\n\n🚀 Доступ к Strongest OS открыт.\n\nДобавлено: ${input.days} дней\n\n📅 Новый срок:\n${formatDateTime(input.expiresAt?.toISOString(), input.timeZone)}\n\n🌐 Ссылка:\n${escapeTelegramHtml(input.appUrl)}\n\n🔐 Логин:\n${escapeTelegramHtml(input.loginEmail)}\n\n🔑 Пароль:\n${escapeTelegramHtml(input.password)}\n\n<b>Сохрани пароль.</b> Бот показывает его только один раз.`;

export const buildCouponAlreadyRedeemedByUserMessage = (
  expiresAt: Date | undefined,
  timeZone: string,
): string =>
  `Этот промокод уже был активирован тобой.\n\nТекущий срок доступа:\n${formatDateTime(expiresAt?.toISOString(), timeZone)}`;

export const buildCouponAlreadyRedeemedMessage = (): string =>
  'Этот промокод уже использован.\n\nДоступ по нему получил пользователь, который активировал код первым.';

export const buildCouponNotFoundMessage = (): string =>
  'Промокод не найден.\n\nПроверь код и отправь его ещё раз одним сообщением.';

export const buildPasswordRecoveryMessage = (state: UserAccessState): string => {
  switch (state.kind) {
    case 'unregistered':
    case 'telegram_registered':
      return 'Аккаунт Strongest OS ещё не создан.\n\nСначала оформи доступ или активируй промокод.';
    case 'deleted':
      return 'Данные аккаунта удалены.\n\nОбратись в поддержку.';
    case 'broken_link':
    case 'unknown_status':
    case 'temporarily_unavailable':
      return 'Не удалось определить состояние аккаунта.\n\nОбратись в поддержку.';
    case 'banned':
      return `🔑 Восстановление доступа\n\n🔐 Логин:\n${safeEmail(state.loginEmail)}\n\nСейчас бот создаст новый пароль. Старый пароль перестанет работать.\n\nВнимание: аккаунт ограничен — доступ останется заблокирован до снятия блокировки.\n\nПродолжить?`;
    case 'account_pending':
    case 'active':
    case 'expired':
    case 'cancelled':
    case 'marked_for_deletion':
      return `🔑 Восстановление доступа\n\n🔐 Логин:\n${safeEmail(state.loginEmail)}\n\nСейчас бот создаст новый пароль. Старый пароль перестанет работать.\n\nПродолжить?`;
    default:
      return assertNever(state);
  }
};

export const buildPasswordCreatedMessage = (loginEmail: string, password: string): string =>
  `🔑 Новый пароль создан.\n\n🔐 Логин:\n${safeEmail(loginEmail)}\n\n🔑 Новый пароль:\n${escapeTelegramHtml(password)}\n\n<b>Сохрани его сразу.</b> Бот не хранит пароль и не сможет показать его повторно.`;

export const buildFeaturesMessage = (): string =>
  `📦 Что входит в Strongest OS\n\n🎯 Квесты и главный квест дня\nПланируй действия, выделяй одну главную задачу.\n\n📈 XP, уровни и ранги\nВизуальный прогресс за каждое выполненное действие.\n\n🏆 WSTшки и кейсы\nВнутренняя валюта за результаты, игровые награды.\n\n💪 Денежные цели\nФиксируй цель, срок и фактический прогресс.\n\n🧠 Шаблоны квестов\nГотовые задачи для продаж, спорта, обучения и здоровья.\n\n📅 Календарь и разбор дня\nИстория действий, сильные и слабые дни, личные выводы.\n\n🚀 PWA-приложение\nДобавь Strongest OS на главный экран и используй как приложение.`;

export const buildInstallationMessage = (): string => '📲 Выбери инструкцию для своей платформы.';

export const buildAndroidInstallationMessage = (): string =>
  'Как установить Strongest OS на Android\n\n1. Открой Strongest OS в Chrome.\n2. Войди по логину и паролю.\n3. Нажми меню браузера (три точки).\n4. Выбери «Установить приложение» или «Добавить на главный экран».\n5. Подтверди установку.\n\nИконка Strongest OS появится на главном экране.';

export const buildIphoneInstallationMessage = (): string =>
  'Как установить Strongest OS на iPhone\n\n1. Открой Strongest OS в Safari (именно в Safari).\n2. Войди по логину и паролю.\n3. Нажми кнопку «Поделиться» внизу экрана.\n4. Выбери «На экран Домой».\n5. Подтверди добавление.\n\nStrongest OS появится на главном экране.';

export const buildDesktopInstallationMessage = (): string =>
  'Как установить Strongest OS на компьютер\n\n1. Открой Strongest OS в Chrome или Edge.\n2. Войди в аккаунт.\n3. Найди значок установки в адресной строке или открой меню браузера.\n4. Выбери «Установить Strongest OS».\n5. Подтверди установку.';

export const buildTermsMessage = (): string =>
  `Условия использования Strongest OS\n\n1. Доступ предоставляется на оплаченный период.\n\n2. Первый льготный тариф используется один раз на одного пользователя.\n\n3. Один стандартный период — 30 дней, если в тарифе не указано иное.\n\n4. При досрочном продлении новые дни добавляются к текущей дате окончания. Оставшееся время не сгорает.\n\n5. После окончания оплаченного периода доступ к приложению блокируется.\n\n6. Пользовательские данные могут храниться ещё 60 дней после окончания доступа.\n\n7. По истечении срока хранения данные могут быть удалены без возможности восстановления.\n\n8. Промокоды являются одноразовыми.\n\n9. Промокод можно передать другому человеку.\n\n10. Доступ по промокоду получает тот пользователь, который первым успешно активировал код.\n\n11. Передача логина и пароля от аккаунта третьим лицам запрещена.\n\n12. Администрация может ограничить доступ при злоупотреблениях, попытках обхода оплаты или нарушении работы сервиса.\n\n13. Telegram Stars используются для оплаты цифрового доступа внутри Telegram.\n\n14. Нажимая кнопку оплаты, пользователь подтверждает согласие с условиями.`;

export const buildPrivacyMessage = (): string =>
  'Strongest OS обрабатывает только данные, необходимые для работы аккаунта и подписки:\n\n— Telegram ID;\n— Telegram username, если указан;\n— имя профиля Telegram;\n— технический логин Strongest OS;\n— статус и срок доступа;\n— история платёжных событий;\n— история использования промокодов.\n\nПароль не хранится в открытом виде.\n\nСервис использует Supabase для авторизации и хранения данных.\n\nДанные могут быть удалены по истечении срока хранения.';

export const buildSupportMessage = (configured: boolean): string =>
  configured
    ? '🆘 Поддержка Strongest OS\n\nОпиши проблему одним сообщением. Если есть скриншот — приложи его сразу.\n\nНе отправляй никому пароль от аккаунта.'
    : 'Контакт поддержки пока не настроен.';

export const buildHelpMessage = (isAdmin: boolean): string =>
  `/start — открыть бота\n/menu — главное меню\n/status — проверить доступ\n/help — эта справка\n/cancel — отменить текущее действие\n\nОстальные действия доступны через кнопки меню.${isAdmin ? '\n\nАдминистратору также доступна /admin.' : ''}`;
