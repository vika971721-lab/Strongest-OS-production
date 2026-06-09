import type { PricingConfig } from '../config/pricing.js';
import type { UserAccessState } from '../types/accessState.js';
import { assertNever } from './assertNever.js';
import { formatDateTime, formatDeletionRemainingTime, formatRemainingTime } from './dates.js';
import { escapeTelegramHtml } from './html.js';

export const MESSAGES = {
  temporaryError: 'Произошла временная ошибка. Попробуйте ещё раз через несколько секунд.',
  dataLoadError:
    'Не удалось загрузить данные аккаунта.\n\nПопробуйте ещё раз через несколько секунд.',
  unknown: 'Используйте кнопки меню, чтобы выбрать действие.',
  adminReady:
    'Панель администратора подключена.\n\nФункции управления пользователями, платежами и купонами будут добавлены на следующих этапах.',
  adminForbidden: 'Недостаточно прав.',
  privateChatRequired:
    'Strongest OS работает в личном чате.\n\nОткройте диалог с ботом, чтобы управлять доступом и аккаунтом.',
  cancelled: 'Текущее действие отменено.',
  noActiveAction: 'Активных действий нет.',
  staleButton: 'Эта кнопка устарела. Откройте главное меню.',
  paymentNextStage: 'Оплата через Telegram Stars будет подключена следующим этапом.',
  couponNotConfigured:
    'Проверка промокода будет подключена следующим этапом после платёжной системы.',
  passwordPrivateOnly: 'Для восстановления пароля откройте личный чат с ботом.',
} as const;

export const buildWelcomeMessage = (state: UserAccessState): string => {
  switch (state.kind) {
    case 'active':
      return 'С возвращением в Strongest OS.\n\nВаш доступ активен. Продолжайте двигаться к своим целям.';
    case 'expired':
      return 'С возвращением в Strongest OS.\n\nСрок доступа закончился, но ваши данные временно сохранены. Вы можете оформить новый период или активировать подарочный промокод.';
    case 'banned':
      return 'Доступ к аккаунту ограничен.\n\nДля уточнения причины обратитесь в поддержку.';
    case 'marked_for_deletion':
      return 'Ваш аккаунт ожидает удаления.\n\nДо даты удаления вы можете восстановить доступ оплатой или подарочным промокодом.';
    case 'deleted':
      return 'Данные аккаунта были удалены.\n\nДля уточнения информации обратитесь в поддержку.';
    case 'temporarily_unavailable':
      return MESSAGES.dataLoadError;
    case 'unknown_status':
      return 'Не удалось определить состояние доступа. Обратитесь в поддержку.';
    case 'broken_link':
      return 'Не удалось корректно определить состояние аккаунта.\n\nОбратитесь в поддержку, чтобы избежать создания дубликата.';
    case 'unregistered':
    case 'telegram_registered':
    case 'account_pending':
    case 'cancelled':
      return 'Добро пожаловать в Strongest OS.\n\nStrongest OS — это игровая система дисциплины, которая помогает превращать ежедневные задачи в квесты, видеть прогресс, повышать уровень и двигаться к своим целям.\n\nВыберите действие в меню ниже.';
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
      return 'У вас пока нет аккаунта Strongest OS.\n\nАккаунт будет создан автоматически после успешной оплаты или активации подарочного промокода.';
    case 'telegram_registered':
      return 'Ваш Telegram-профиль зарегистрирован, но аккаунт Strongest OS ещё не создан.\n\nАккаунт будет создан автоматически после успешной оплаты или активации подарочного промокода.';
    case 'account_pending':
      return `Аккаунт Strongest OS создан, но активного доступа пока нет.\n\nЛогин:\n${safeEmail(state.loginEmail)}\n\nОформите доступ или активируйте подарочный промокод.`;
    case 'active':
      return `Ваш доступ активен.\n\nДействует до:\n${formatDateTime(state.expiresAt, timeZone)}\n\nОсталось:\n${formatRemainingTime(state.expiresAt, nowMs)}\n\nЛогин:\n${safeEmail(state.loginEmail)}`;
    case 'expired': {
      const deletion = state.deleteAfter
        ? `До удаления данных осталось:\n${formatDeletionRemainingTime(state.deleteAfter, nowMs)}`
        : 'Дата удаления пока не назначена.';
      return `Доступ закончился:\n${formatDateTime(state.expiresAt, timeZone)}\n\nВаши данные временно сохранены.\n\n${deletion}\n\nОформите новый период или активируйте промокод, чтобы восстановить доступ.`;
    }
    case 'cancelled':
      return 'Подписка отменена.\n\nДоступ можно восстановить оформлением нового периода или подарочным промокодом.';
    case 'banned':
      return 'Доступ к аккаунту ограничен.\n\nОбратитесь в поддержку.';
    case 'marked_for_deletion':
      return `Аккаунт ожидает удаления.\n\nЗапланированная дата удаления:\n${formatDateTime(state.deleteAfter, timeZone)}\n\nДо удаления осталось:\n${formatDeletionRemainingTime(state.deleteAfter, nowMs)}\n\nДо удаления вы можете восстановить доступ оформлением нового периода или подарочным промокодом.`;
    case 'deleted':
      return 'Данные аккаунта были удалены.\n\nДля уточнения информации обратитесь в поддержку.';
    case 'broken_link':
      return 'Не удалось корректно определить состояние аккаунта.\n\nОбратитесь в поддержку, чтобы избежать создания дубликата.';
    case 'unknown_status':
      return 'Не удалось определить состояние доступа. Обратитесь в поддержку.';
    case 'temporarily_unavailable':
      return MESSAGES.dataLoadError;
    default:
      return assertNever(state);
  }
};

const firstPlan = (pricing: PricingConfig): string =>
  `Первый период Strongest OS\n\nСрок: ${pricing.firstPeriodDays} дней\nСтоимость: ${pricing.firstPeriodStars} Telegram Stars\n\nПосле успешной оплаты бот автоматически создаст аккаунт Strongest OS и отправит вам логин и пароль.\n\nОставшиеся дни при будущих продлениях не сгорают.`;

const renewalPlan = (pricing: PricingConfig, title: string, extra: string): string =>
  `${title}\n\nСрок: ${title.startsWith('Продление') ? 'ещё ' : ''}${pricing.renewalPeriodDays} дней\nСтоимость: ${pricing.renewalPeriodStars} Telegram Stars\n\n${extra}`;

export const buildPlanMessage = (state: UserAccessState, pricing: PricingConfig): string => {
  switch (state.kind) {
    case 'unregistered':
    case 'telegram_registered':
      return firstPlan(pricing);
    case 'account_pending':
      return `Ваш аккаунт создан, но активного доступа пока нет.\n\n${state.trialUsed ? renewalPlan(pricing, 'Возобновление Strongest OS', 'После оплаты доступ будет восстановлен.') : firstPlan(pricing)}\n\nОкончательная проверка тарифа будет выполнена в платёжном flow следующего этапа.`;
    case 'active':
      return state.trialUsed
        ? renewalPlan(
            pricing,
            'Продление Strongest OS',
            `Новые ${pricing.renewalPeriodDays} дней будут добавлены к текущей дате окончания. Оставшееся время не сгорает.`,
          )
        : firstPlan(pricing);
    case 'expired':
      return state.trialUsed
        ? renewalPlan(
            pricing,
            'Возобновление Strongest OS',
            'После оплаты доступ будет восстановлен, а ваши сохранённые данные снова станут доступны.',
          )
        : firstPlan(pricing);
    case 'cancelled':
      return state.trialUsed
        ? renewalPlan(
            pricing,
            'Возобновление Strongest OS',
            'После оплаты доступ будет восстановлен.',
          )
        : firstPlan(pricing);
    case 'marked_for_deletion':
      return `Аккаунт ожидает удаления.\n\nОформление нового периода отменит удаление и восстановит доступ, если данные ещё не были удалены.\n\n${state.trialUsed ? renewalPlan(pricing, 'Возобновление Strongest OS', 'После оплаты доступ будет восстановлен.') : firstPlan(pricing)}`;
    case 'banned':
      return 'Оформление доступа недоступно, пока аккаунт ограничен.\n\nОбратитесь в поддержку.';
    case 'deleted':
      return 'Данные аккаунта удалены.\n\nОбратитесь в поддержку перед созданием нового доступа.';
    case 'broken_link':
      return 'Обнаружена проблема со связью аккаунта.\n\nОбратитесь в поддержку. Не создавайте повторный аккаунт самостоятельно.';
    case 'unknown_status':
      return 'Не удалось определить состояние доступа. Обратитесь в поддержку.';
    case 'temporarily_unavailable':
      return MESSAGES.dataLoadError;
    default:
      return assertNever(state);
  }
};

export const buildCouponPromptMessage = (): string =>
  'Отправьте промокод одним сообщением.\n\nПример:\nSTR-1M-K8X2PQ\n\nПромокод является одноразовым. Доступ получает пользователь, который первым успешно активирует код.';

export const buildPasswordRecoveryMessage = (state: UserAccessState): string => {
  switch (state.kind) {
    case 'unregistered':
    case 'telegram_registered':
      return 'У вас пока нет аккаунта Strongest OS.\n\nАккаунт создаётся после успешной оплаты или активации промокода.';
    case 'deleted':
      return 'Данные аккаунта были удалены.\n\nОбратитесь в поддержку.';
    case 'broken_link':
    case 'unknown_status':
    case 'temporarily_unavailable':
      return 'Не удалось корректно определить состояние аккаунта.\n\nОбратитесь в поддержку.';
    case 'banned':
      return `Ваш логин:\n${safeEmail(state.loginEmail)}\n\nВы можете создать новый пароль, но доступ к Strongest OS останется ограничен до снятия блокировки.\n\nПосле создания нового пароля старый пароль перестанет работать.\n\nСоздать новый пароль?`;
    case 'account_pending':
    case 'active':
    case 'expired':
    case 'cancelled':
    case 'marked_for_deletion':
      return `Ваш логин:\n${safeEmail(state.loginEmail)}\n\nПосле создания нового пароля старый пароль перестанет работать.\n\nСоздать новый пароль?`;
    default:
      return assertNever(state);
  }
};

export const buildPasswordCreatedMessage = (loginEmail: string, password: string): string =>
  `Новый пароль создан.\n\nЛогин:\n${safeEmail(loginEmail)}\n\nНовый пароль:\n${escapeTelegramHtml(password)}\n\nСтарый пароль больше не действует.\n\nСохраните новый пароль. Бот не хранит его и не сможет показать повторно.`;

export const buildFeaturesMessage = (): string =>
  'Что входит в Strongest OS\n\nКвесты и главный квест дня\nПланируйте действия и выделяйте одну главную задачу, которая сильнее всего двигает вас вперёд.\n\nXP, уровни и ранги\nПолучайте визуальное подтверждение прогресса и наблюдайте, как развивается ваш игровой профиль.\n\nWSTшки и кейсы\nЗарабатывайте внутреннюю валюту за выполненные действия и открывайте игровые награды.\n\nДенежные цели\nФиксируйте финансовую цель, срок и фактический прогресс.\n\nШаблоны квестов\nИспользуйте готовые задачи для продаж, тренировок, обучения, здоровья и других направлений.\n\nКалендарь и разбор дня\nСмотрите историю действий, замечайте сильные и слабые дни и сохраняйте важные выводы.\n\nPWA-приложение\nДобавьте Strongest OS на главный экран телефона и используйте его как обычное приложение.';

export const buildInstallationMessage = (): string => 'Выберите инструкцию для вашей платформы.';
export const buildAndroidInstallationMessage = (): string =>
  'Как установить Strongest OS на Android\n\n1. Откройте Strongest OS в Chrome.\n2. Войдите по логину и паролю.\n3. Нажмите меню браузера.\n4. Выберите “Установить приложение” или “Добавить на главный экран”.\n5. Подтвердите установку.\n\nПосле этого иконка Strongest OS появится на главном экране.';
export const buildIphoneInstallationMessage = (): string =>
  'Как установить Strongest OS на iPhone\n\n1. Откройте Strongest OS именно в Safari.\n2. Войдите по логину и паролю.\n3. Нажмите кнопку “Поделиться”.\n4. Выберите “На экран Домой”.\n5. Подтвердите добавление.\n\nПосле этого Strongest OS появится на главном экране.';
export const buildDesktopInstallationMessage = (): string =>
  'Как установить Strongest OS на компьютер\n\n1. Откройте Strongest OS в Chrome или Edge.\n2. Войдите в аккаунт.\n3. Найдите значок установки в адресной строке или откройте меню браузера.\n4. Выберите “Установить Strongest OS”.\n5. Подтвердите установку.';

export const buildTermsMessage = (): string =>
  'Условия использования Strongest OS\n\n1. Доступ предоставляется на оплаченный период.\n\n2. Первый льготный тариф можно использовать только один раз на одного пользователя.\n\n3. Один стандартный период действует 30 дней, если в тарифе не указано иное.\n\n4. При досрочном продлении новые дни добавляются к текущей дате окончания. Оставшееся время не сгорает.\n\n5. После окончания оплаченного периода доступ к приложению блокируется.\n\n6. Пользовательские данные могут храниться ещё 60 дней после окончания доступа.\n\n7. После окончания срока хранения данные могут быть удалены без возможности восстановления.\n\n8. Подарочные промокоды являются одноразовыми.\n\n9. Промокод можно передать другому человеку.\n\n10. Доступ по промокоду получает тот пользователь, который первым успешно активировал код.\n\n11. Передача логина и пароля от аккаунта другим людям запрещена.\n\n12. Администрация может ограничить доступ при злоупотреблениях, попытках обхода оплаты или нарушении работы сервиса.\n\n13. Telegram Stars будут использоваться для оплаты цифрового доступа внутри Telegram.\n\n14. Нажимая кнопку оплаты, пользователь подтверждает согласие с условиями.';

export const buildPrivacyMessage = (): string =>
  'Strongest OS обрабатывает только данные, необходимые для работы аккаунта и подписки:\n\n— Telegram ID;\n— Telegram username, если он указан;\n— имя профиля Telegram;\n— технический логин Strongest OS;\n— статус и срок доступа;\n— история платежных событий после подключения оплаты;\n— история использования промокодов.\n\nПароль не хранится ботом в открытом виде.\n\nСервис использует Supabase для авторизации и хранения данных.\n\nДанные могут быть удалены после окончания срока хранения.';

export const buildSupportMessage = (configured: boolean): string =>
  configured
    ? 'Поддержка Strongest OS\n\nОпишите проблему одним сообщением и приложите скриншот, если он поможет разобраться.\n\nНикому не отправляйте пароль от аккаунта.'
    : 'Контакт поддержки пока не настроен.\n\nПопробуйте обратиться позже.';

export const buildHelpMessage = (isAdmin: boolean): string =>
  `Команды Strongest OS\n\n/start — открыть бота\n/menu — показать главное меню\n/status — проверить доступ\n/help — показать помощь\n\nОстальные действия доступны через кнопки меню.${isAdmin ? '\n\nАдминистратору также доступна /admin.' : ''}`;
