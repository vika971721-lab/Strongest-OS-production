import { describe, expect, it, vi, type Mock } from 'vitest';
import { handleAdminPreviewStatusCommand } from '../src/commands/adminPreviewStatusCommand.js';
import {
  handleCancelCommand,
  handleHelpCommand,
  handleStatusCommand,
} from '../src/commands/userCommands.js';
import { CALLBACK_DATA, MENU_BUTTONS, PUBLIC_BOT_COMMANDS } from '../src/config/constants.js';
import type { AppEnv } from '../src/config/env.js';
import { parseEnv } from '../src/config/env.js';
import {
  createAccessKeyboard,
  createInstallationKeyboard,
} from '../src/keyboards/inlineKeyboards.js';
import { requirePrivateChat } from '../src/middleware/privateChat.js';
import { InMemoryCallbackRateLimiter } from '../src/middleware/rateLimitMiddleware.js';
import { DefaultAccessStateService } from '../src/services/accessStateService.js';
import type { AccountService } from '../src/services/accountService.js';
import { createAwaitingCouponState } from '../src/state/conversationState.js';
import { InMemoryConversationStore } from '../src/state/inMemoryConversationStore.js';
import type { UserAccessState } from '../src/types/accessState.js';
import type { BotContext } from '../src/types/context.js';
import {
  buildAccessMessage,
  buildAndroidInstallationMessage,
  buildCouponPromptMessage,
  buildDesktopInstallationMessage,
  buildFeaturesMessage,
  buildHelpMessage,
  buildIphoneInstallationMessage,
  buildPasswordCreatedMessage,
  buildPasswordRecoveryMessage,
  buildPlanMessage,
  buildPrivacyMessage,
  buildSupportMessage,
  buildTermsMessage,
  MESSAGES,
} from '../src/utils/messages.js';
import { handleCallbackQuery } from '../src/handlers/callbackHandlers.js';
import { handleCouponStart, handlePlanScreen } from '../src/handlers/menuHandlers.js';
import { handleStartCommand } from '../src/commands/startCommand.js';
import { handleTextMessage } from '../src/handlers/textHandler.js';
import {
  formatDateTime,
  formatDeletionRemainingTime,
  formatRemainingTime,
} from '../src/utils/dates.js';
import { escapeTelegramHtml } from '../src/utils/html.js';
import { createSupportLink, normalizeSupportUsername } from '../src/utils/telegram.js';

const pricing = {
  firstPeriodStars: 100,
  renewalPeriodStars: 150,
  firstPeriodDays: 30,
  renewalPeriodDays: 30,
};

const env: AppEnv = {
  nodeEnv: 'development',
  botMode: 'polling',
  botToken: 'token',
  adminTelegramIds: ['1'],
  supportUsername: '@Support_User',
  appUrl: 'https://strongest.example/app',
  displayTimezone: 'Asia/Almaty',
  port: 3000,
  pricing,
};

const nowMs = Date.parse('2026-06-09T00:00:00.000Z');
const future = '2026-07-25T10:00:00.000Z';
const past = '2026-05-25T10:00:00.000Z';

const states = {
  unregistered: { kind: 'unregistered', telegramId: '1', trialUsed: false },
  telegram_registered: { kind: 'telegram_registered', telegramId: '1', trialUsed: false },
  pending: {
    kind: 'account_pending',
    status: 'pending',
    telegramId: '1',
    trialUsed: false,
    loginEmail: 'u@example.com',
  },
  active: {
    kind: 'active',
    status: 'active',
    telegramId: '1',
    trialUsed: true,
    loginEmail: 'u@example.com',
    expiresAt: future,
  },
  expired: {
    kind: 'expired',
    status: 'expired',
    telegramId: '1',
    trialUsed: true,
    loginEmail: 'u@example.com',
    expiresAt: past,
    deleteAfter: future,
  },
  cancelled: { kind: 'cancelled', status: 'cancelled', telegramId: '1', trialUsed: true },
  banned: { kind: 'banned', status: 'banned', telegramId: '1', trialUsed: true },
  marked_for_deletion: {
    kind: 'marked_for_deletion',
    status: 'marked_for_deletion',
    telegramId: '1',
    trialUsed: true,
    deleteAfter: future,
  },
  deleted: { kind: 'deleted', status: 'deleted', telegramId: '1', trialUsed: true },
  broken_link: { kind: 'broken_link', reason: 'missing', telegramId: '1', trialUsed: true },
  unknown_status: {
    kind: 'unknown_status',
    rawStatus: 'strange',
    telegramId: '1',
    trialUsed: true,
  },
  error: { kind: 'temporarily_unavailable', telegramId: '1' },
} satisfies Record<string, UserAccessState>;

const createCtx = (text = '', chatType = 'private') =>
  ({
    message: { text },
    chat: { id: 10, type: chatType },
    botInfo: { username: 'strongest_bot' },
    state: { user: { telegramId: '1', chatId: '10' } },
    reply: vi.fn().mockResolvedValue(undefined),
    answerCbQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
  }) as unknown as BotContext;

const replyMock = (ctx: BotContext): Mock => (ctx as unknown as { reply: Mock }).reply;
const answerMock = (ctx: BotContext): Mock =>
  (ctx as unknown as { answerCbQuery: Mock }).answerCbQuery;
const editMock = (ctx: BotContext): Mock =>
  (ctx as unknown as { editMessageText: Mock }).editMessageText;
const replyTexts = (ctx: BotContext): string[] =>
  replyMock(ctx).mock.calls.map((call: unknown[]) => String(call[0]));

const deps = (
  state: UserAccessState = states.telegram_registered,
  accountService?: AccountService,
) => ({
  env,
  conversationStore: new InMemoryConversationStore(),
  accessStateProvider: { getUserAccessState: vi.fn().mockResolvedValue(state) },
  accountService:
    accountService ??
    ({
      startPasswordRestore: vi.fn(),
      resetPassword: vi.fn().mockResolvedValue({ status: 'not_configured', message: 'mock' }),
    } satisfies AccountService),
  couponService: { redeem: vi.fn() },
});

const inlineLabels = (markup: ReturnType<typeof createAccessKeyboard>) =>
  markup.reply_markup.inline_keyboard.flat().map((button) => ('text' in button ? button.text : ''));

describe('stage 3 required scenario coverage', () => {
  it.each([
    ['new user', states.unregistered, 'Добро пожаловать'],
    ['active user', states.active, 'Ваш доступ активен'],
    ['expired user', states.expired, 'Срок доступа закончился'],
    ['banned user', states.banned, 'Доступ к аккаунту ограничен'],
    ['marked for deletion', states.marked_for_deletion, 'ожидает удаления'],
    ['deleted user', states.deleted, 'Данные аккаунта были удалены'],
  ])('/start welcome for %s', async (_name, state, expected) => {
    const store = new InMemoryConversationStore();
    await store.set('1', createAwaitingCouponState(100));
    const ctx = createCtx('/start');
    await handleStartCommand(ctx, store, { getUserAccessState: vi.fn().mockResolvedValue(state) });
    expect(replyMock(ctx)).toHaveBeenCalledWith(
      expect.stringContaining(expected),
      expect.any(Object),
    );
    await expect(store.get('1')).resolves.toBeUndefined();
  });

  it('group /start asks for private chat and hides account data', async () => {
    const ctx = createCtx('/start', 'group');
    await handleStartCommand(ctx, new InMemoryConversationStore(), {
      getUserAccessState: vi.fn().mockResolvedValue(states.active),
    });
    expect(replyMock(ctx)).toHaveBeenCalledWith(MESSAGES.privateChatRequired, expect.any(Object));
    expect(replyTexts(ctx).join('\n')).not.toContain('u@example.com');
  });

  it('/status delegates to common access handler', async () => {
    const ctx = createCtx('/status');
    await handleStatusCommand(ctx, deps(states.active));
    expect(replyMock(ctx)).toHaveBeenCalledWith(
      expect.stringContaining('Ваш доступ активен'),
      expect.any(Object),
    );
  });

  it('/help hides admin commands for regular users and mentions /admin for admins', async () => {
    expect(buildHelpMessage(false)).not.toContain('/admin');
    expect(buildHelpMessage(true)).toContain('/admin');
    const ctx = createCtx('/help');
    await handleHelpCommand(ctx, deps(states.active));
    expect(replyMock(ctx)).toHaveBeenCalledWith(expect.stringContaining('/admin'));
  });

  it('/cancel clears active state and reports no active action otherwise', async () => {
    const store = new InMemoryConversationStore();
    await store.set('1', createAwaitingCouponState());
    const ctx = createCtx('/cancel');
    await handleCancelCommand(ctx, { ...deps(states.active), conversationStore: store });
    expect(replyMock(ctx)).toHaveBeenCalledWith(MESSAGES.cancelled, expect.any(Object));
    const ctx2 = createCtx('/cancel');
    await handleCancelCommand(ctx2, deps(states.active));
    expect(replyMock(ctx2)).toHaveBeenCalledWith(MESSAGES.noActiveAction, expect.any(Object));
  });

  it.each([
    ['trial false', states.telegram_registered, 'Первый период', '100 Telegram Stars', '30 дней'],
    [
      'trial true active',
      states.active,
      'Продление Strongest OS',
      '150 Telegram Stars',
      'Оставшееся время не сгорает',
    ],
    [
      'trial true expired',
      states.expired,
      'Возобновление Strongest OS',
      'сохранённые данные',
      '150 Telegram Stars',
    ],
    [
      'cancelled',
      states.cancelled,
      'Возобновление Strongest OS',
      'После оплаты доступ будет восстановлен',
      '150 Telegram Stars',
    ],
    [
      'marked',
      states.marked_for_deletion,
      'Аккаунт ожидает удаления',
      'отменит удаление',
      '150 Telegram Stars',
    ],
    ['banned', states.banned, 'Оформление доступа недоступно', 'Обратитесь в поддержку', ''],
    ['deleted', states.deleted, 'Данные аккаунта удалены', 'перед созданием нового доступа', ''],
    ['broken', states.broken_link, 'Обнаружена проблема', 'Не создавайте повторный аккаунт', ''],
    ['database error', states.error, 'Не удалось загрузить данные аккаунта', 'Попробуйте', ''],
  ])('plan screen %s', (_name, state, a, b, c) => {
    const text = buildPlanMessage(state, pricing);
    expect(text).toContain(a);
    expect(text).toContain(b);
    if (c) expect(text).toContain(c);
    if (['banned', 'deleted', 'broken_link', 'temporarily_unavailable'].includes(state.kind)) {
      expect(text).not.toContain('Оплатить');
    }
  });

  it('plan UI does not create auth user, subscription, payment order, or invoice', async () => {
    const accountService = {
      startPasswordRestore: vi.fn(),
      resetPassword: vi.fn(),
    } satisfies AccountService;
    const ctx = createCtx(MENU_BUTTONS.buyAccess);
    await handlePlanScreen(ctx, deps(states.active, accountService));
    expect(accountService.resetPassword).not.toHaveBeenCalled();
    expect(accountService.startPasswordRestore).not.toHaveBeenCalled();
    expect(replyMock(ctx)).toHaveBeenCalledWith(
      expect.stringContaining('Продление Strongest OS'),
      expect.any(Object),
    );
  });

  it.each([
    ['no bot user', states.unregistered, 'У вас пока нет аккаунта'],
    ['no auth user', states.telegram_registered, 'аккаунт Strongest OS ещё не создан'],
    ['pending', states.pending, 'Аккаунт Strongest OS создан'],
    ['active', states.active, 'Действует до'],
    ['expired', states.expired, 'Доступ закончился'],
    ['cancelled', states.cancelled, 'Подписка отменена'],
    ['banned', states.banned, 'Доступ к аккаунту ограничен'],
    ['marked', states.marked_for_deletion, 'Запланированная дата удаления'],
    ['deleted', states.deleted, 'Данные аккаунта были удалены'],
    ['broken', states.broken_link, 'Не удалось корректно определить состояние аккаунта'],
    ['unknown', states.unknown_status, 'Не удалось определить состояние доступа'],
    ['timeout', states.error, 'Не удалось загрузить данные аккаунта'],
  ])('access message %s', (_name, state, expected) => {
    const text = buildAccessMessage(state, 'Asia/Almaty', nowMs);
    expect(text).toContain(expected);
    expect(text).not.toMatch(/undefined|\[object Object\]|[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it.each([
    [{ ...states.pending, loginEmail: undefined }, 'логин пока не указан'],
    [{ ...states.active, expiresAt: undefined }, 'дата не указана'],
    [{ ...states.expired, deleteAfter: undefined }, 'Дата удаления пока не назначена'],
    [{ ...states.marked_for_deletion, deleteAfter: past }, 'Удаление может быть выполнено'],
    [{ ...states.active, expiresAt: 'not-a-date' }, 'дата указана некорректно'],
  ])('broken or null fields are user-safe %#', (state, expected) => {
    const text = buildAccessMessage(state, 'Asia/Almaty', nowMs);
    expect(text).toContain(expected);
    expect(text).not.toMatch(/NaN|Invalid Date|undefined/);
  });

  it('APP_URL button is added only when configured', () => {
    expect(inlineLabels(createAccessKeyboard('active', 'https://example.com'))).toContain(
      'Открыть Strongest OS',
    );
    expect(inlineLabels(createAccessKeyboard('active'))).not.toContain('Открыть Strongest OS');
    expect(
      JSON.stringify(createInstallationKeyboard('https://example.com').reply_markup),
    ).toContain('Открыть Strongest OS');
    expect(JSON.stringify(createInstallationKeyboard(undefined).reply_markup)).not.toContain(
      'Открыть Strongest OS',
    );
  });

  it.each([
    ['2026-07-25T10:00:00.000Z', '25 июля 2026, 15:00'],
    [undefined, 'дата не указана'],
    ['bad', 'дата указана некорректно'],
  ])('date formatting %#', (value, expected) => {
    expect(formatDateTime(value, 'Asia/Almaty')).toBe(expected);
  });

  it.each([
    ['2026-06-10T00:00:00.000Z', '1 день'],
    ['2026-06-11T00:00:00.000Z', '2 дня'],
    ['2026-06-14T00:00:00.000Z', '5 дней'],
    ['2026-06-09T01:00:00.000Z', '1 час'],
    ['2026-06-09T02:00:00.000Z', '2 часа'],
    ['2026-06-09T05:00:00.000Z', '5 часов'],
    ['2026-06-09T00:01:00.000Z', '1 минута'],
    ['2026-06-09T00:02:00.000Z', '2 минуты'],
    ['2026-06-09T00:05:00.000Z', '5 минут'],
    ['2026-06-09T00:00:30.000Z', 'меньше минуты'],
    ['2026-06-08T00:00:00.000Z', 'срок закончился'],
    [undefined, 'срок не указан'],
    ['bad', 'срок указан некорректно'],
  ])('remaining time declension %#', (value, expected) => {
    expect(formatRemainingTime(value, nowMs)).toBe(expected);
  });

  it('deletion remaining time never displays negative values', () => {
    expect(formatDeletionRemainingTime(past, nowMs)).toBe(
      'Удаление может быть выполнено в ближайшее время.',
    );
    expect(formatDeletionRemainingTime(undefined, nowMs)).toBe('Дата удаления пока не назначена.');
  });

  it.each([
    [CALLBACK_DATA.navMain],
    [CALLBACK_DATA.navAccess],
    [CALLBACK_DATA.navPlans],
    [CALLBACK_DATA.navFeatures],
    [CALLBACK_DATA.navInstall],
    [CALLBACK_DATA.navInstallAndroid],
    [CALLBACK_DATA.navInstallIos],
    [CALLBACK_DATA.navInstallDesktop],
    [CALLBACK_DATA.navTerms],
    [CALLBACK_DATA.navPrivacy],
    [CALLBACK_DATA.navSupport],
    [CALLBACK_DATA.mockPaymentInfo],
  ])('callback %s answers callback query', async (data) => {
    const ctx = {
      ...createCtx(),
      callbackQuery: { data, from: { id: 1 } },
    } as unknown as BotContext;
    await handleCallbackQuery(ctx, deps(states.active));
    expect(answerMock(ctx)).toHaveBeenCalled();
  });

  it('unknown callback is safely rejected', async () => {
    const ctx = {
      ...createCtx(),
      callbackQuery: { data: 'old:button', from: { id: 1 } },
    } as unknown as BotContext;
    await handleCallbackQuery(ctx, deps(states.active));
    expect(answerMock(ctx)).toHaveBeenCalled();
    expect(editMock(ctx)).toHaveBeenCalledWith(
      expect.stringContaining('устарела'),
      expect.any(Object),
    );
  });

  it('stale plan callback refreshes state from provider', async () => {
    const accessStateProvider = { getUserAccessState: vi.fn().mockResolvedValue(states.banned) };
    const ctx = {
      ...createCtx(),
      callbackQuery: { data: CALLBACK_DATA.navPlans, from: { id: 1 } },
    } as unknown as BotContext;
    await handleCallbackQuery(ctx, { ...deps(states.active), accessStateProvider });
    expect(accessStateProvider.getUserAccessState).toHaveBeenCalledWith('1');
    expect(editMock(ctx)).toHaveBeenCalledWith(
      expect.stringContaining('недоступно'),
      expect.any(Object),
    );
  });

  it('callback data contains no secrets and fits Telegram limit', () => {
    for (const value of Object.values(CALLBACK_DATA)) {
      expect(value.length).toBeLessThanOrEqual(64);
      expect(value).not.toMatch(/token|password|service|role|@|[0-9a-f]{8}-[0-9a-f]{4}/i);
    }
  });

  it('coupon flow starts, can be cancelled, and entered code does not call redeem', async () => {
    const store = new InMemoryConversationStore();
    const couponService = { redeem: vi.fn() };
    const ctx = createCtx(MENU_BUTTONS.activateCoupon);
    await handleCouponStart(ctx, {
      ...deps(states.active),
      conversationStore: store,
    });
    expect(replyMock(ctx)).toHaveBeenCalledWith(buildCouponPromptMessage(), expect.any(Object));
    await expect(store.get('1')).resolves.toMatchObject({ name: 'awaiting_coupon' });
    const input = createCtx('STR-1M-K8X2PQ');
    await handleTextMessage(input, {
      ...deps(states.active),
      conversationStore: store,
      couponService,
    });
    expect(couponService.redeem).not.toHaveBeenCalled();
    expect(replyMock(input)).toHaveBeenCalledWith(MESSAGES.couponNotConfigured, expect.any(Object));
  });

  it.each([
    ['banned', states.banned, 'недоступна'],
    ['deleted', states.deleted, 'Данные аккаунта были удалены'],
  ])('coupon start is blocked for %s', async (_name, state, expected) => {
    const ctx = createCtx(MENU_BUTTONS.activateCoupon);
    await handleCouponStart(ctx, deps(state));
    expect(replyMock(ctx)).toHaveBeenCalledWith(
      expect.stringContaining(expected),
      expect.any(Object),
    );
  });

  it('ordinary text outside coupon state is not treated as coupon', async () => {
    const couponService = { redeem: vi.fn() };
    const ctx = createCtx('STR-1M-K8X2PQ');
    await handleTextMessage(ctx, { ...deps(states.active), couponService });
    expect(couponService.redeem).not.toHaveBeenCalled();
    expect(replyMock(ctx)).toHaveBeenCalledWith(MESSAGES.unknown, expect.any(Object));
  });

  it.each([
    ['no account', states.unregistered, 'У вас пока нет аккаунта'],
    ['active', states.active, 'Создать новый пароль?'],
    ['expired', states.expired, 'Создать новый пароль?'],
    ['banned', states.banned, 'останется ограничен'],
    ['deleted', states.deleted, 'Данные аккаунта были удалены'],
    ['broken', states.broken_link, 'Не удалось корректно определить'],
  ])('password recovery copy for %s', (_name, state, expected) => {
    expect(buildPasswordRecoveryMessage(state)).toContain(expected);
  });

  it('password reset requires confirmation and never runs from information screen', async () => {
    const accountService = {
      startPasswordRestore: vi.fn(),
      resetPassword: vi.fn(),
    } satisfies AccountService;
    const ctx = createCtx(MENU_BUTTONS.restoreAccess);
    await handleTextMessage(ctx, { ...deps(states.active, accountService), accountService });
    expect(accountService.resetPassword).not.toHaveBeenCalled();
    expect(replyMock(ctx)).toHaveBeenCalledWith(
      expect.stringContaining('Создать новый пароль?'),
      expect.any(Object),
    );
  });

  it('password credentials are escaped and private chats are required in groups', async () => {
    expect(buildPasswordCreatedMessage('<a@b.kz>', '<pass&word>')).toContain(
      '&lt;pass&amp;word&gt;',
    );
    const ctx = createCtx(MENU_BUTTONS.restoreAccess, 'group');
    await handleTextMessage(ctx, deps(states.active));
    expect(replyMock(ctx)).toHaveBeenCalledWith(MESSAGES.passwordPrivateOnly, expect.any(Object));
    expect(replyTexts(ctx).join('\n')).not.toContain('u@example.com');
  });

  it('reset callback performs reset only after confirmation', async () => {
    const accountService = {
      startPasswordRestore: vi.fn(),
      resetPassword: vi.fn().mockResolvedValue({
        status: 'created',
        loginEmail: 'u@example.com',
        password: 'Safe<Pass>',
        message: 'ok',
      }),
    } satisfies AccountService;
    const ctx = {
      ...createCtx(),
      callbackQuery: { data: CALLBACK_DATA.accountResetConfirm, from: { id: 1 } },
    } as unknown as BotContext;
    await handleCallbackQuery(ctx, { ...deps(states.active, accountService), accountService });
    expect(accountService.resetPassword).toHaveBeenCalledWith('1');
    expect(replyMock(ctx)).toHaveBeenCalledWith(
      expect.stringContaining('Safe&lt;Pass&gt;'),
      expect.any(Object),
    );
  });

  it.each([
    ['features', buildFeaturesMessage(), 'Квесты и главный квест дня'],
    ['android', buildAndroidInstallationMessage(), 'Android'],
    ['iphone', buildIphoneInstallationMessage(), 'Safari'],
    ['desktop', buildDesktopInstallationMessage(), 'Chrome или Edge'],
    ['terms', buildTermsMessage(), 'Telegram Stars'],
    ['privacy', buildPrivacyMessage(), 'Пароль не хранится'],
    ['support configured', buildSupportMessage(true), 'Никому не отправляйте пароль'],
    ['support missing', buildSupportMessage(false), 'не настроен'],
  ])('informational section %s', (_name, text, expected) => {
    expect(text).toContain(expected);
    expect(text).not.toMatch(/undefined|\[object Object\]/);
  });

  it.each([
    [' @Support_User ', 'Support_User', 'https://t.me/Support_User'],
    ['Support_User', 'Support_User', 'https://t.me/Support_User'],
    ['bad user', undefined, undefined],
    ['abcd', undefined, undefined],
  ])('support username normalization %#', (input, username, link) => {
    expect(normalizeSupportUsername(input)).toBe(username);
    expect(createSupportLink(input)).toBe(link);
  });

  it('APP_URL and DISPLAY_TIMEZONE are validated through env parsing', () => {
    expect(parseEnv({ BOT_TOKEN: 't', APP_URL: 'https://example.com' }).appUrl).toBe(
      'https://example.com',
    );
    expect(() => parseEnv({ BOT_TOKEN: 't', APP_URL: 'bad-url' })).toThrow('Invalid configuration');
    expect(parseEnv({ BOT_TOKEN: 't' }).displayTimezone).toBe('Asia/Almaty');
    expect(() => parseEnv({ BOT_TOKEN: 't', DISPLAY_TIMEZONE: 'Bad/Zone' })).toThrow(
      'Invalid configuration',
    );
  });

  it('development preview status is admin-only and production-disabled', async () => {
    const ctx = createCtx('/admin_preview_status active');
    await handleAdminPreviewStatusCommand(ctx, env);
    expect(replyMock(ctx)).toHaveBeenCalledWith(expect.stringContaining('Ваш доступ активен'));
    const denied = {
      ...createCtx('/admin_preview_status active'),
      state: { user: { telegramId: '2' } },
    } as unknown as BotContext;
    await handleAdminPreviewStatusCommand(denied, env);
    expect(replyMock(denied)).toHaveBeenCalledWith(MESSAGES.adminForbidden);
    const prod = createCtx('/admin_preview_status active');
    await handleAdminPreviewStatusCommand(prod, { ...env, nodeEnv: 'production' });
    expect(replyMock(prod)).not.toHaveBeenCalled();
  });

  it('private chat helper protects group actions without leaking private fields', async () => {
    const ctx = createCtx('', 'supergroup');
    await expect(requirePrivateChat(ctx)).resolves.toBe(false);
    expect(replyMock(ctx)).toHaveBeenCalledWith(MESSAGES.privateChatRequired, expect.any(Object));
  });

  it('rate limiter debounces critical callbacks and cleans entries', () => {
    const limiter = new InMemoryCallbackRateLimiter(100, 10);
    expect(limiter.check('1', CALLBACK_DATA.navPlans, 0).allowed).toBe(true);
    expect(limiter.check('1', CALLBACK_DATA.navPlans, 50).allowed).toBe(false);
    expect(limiter.check('1', CALLBACK_DATA.navFeatures, 50).allowed).toBe(true);
    expect(limiter.check('1', CALLBACK_DATA.navPlans, 101).allowed).toBe(true);
  });

  it('access state service maps records without masking broken data as no account', async () => {
    const service = new DefaultAccessStateService({
      findAccessStateRecord: vi.fn().mockResolvedValue({
        telegramId: '1',
        botUserExists: false,
        hasAuthAccount: true,
        status: 'active',
      }),
    });
    await expect(service.getUserAccessState('1')).resolves.toMatchObject({ kind: 'broken_link' });
  });

  it.each([
    ['pending', 'account_pending'],
    ['active', 'active'],
    ['expired', 'expired'],
    ['cancelled', 'cancelled'],
    ['banned', 'banned'],
    ['marked_for_deletion', 'marked_for_deletion'],
    ['deleted', 'deleted'],
  ])('access state maps database status %s', async (status, kind) => {
    const service = new DefaultAccessStateService({
      findAccessStateRecord: vi.fn().mockResolvedValue({
        telegramId: '1',
        botUserExists: true,
        hasAuthAccount: true,
        status,
        trialUsed: null,
      }),
    });
    await expect(service.getUserAccessState('1')).resolves.toMatchObject({
      kind,
      trialUsed: false,
    });
  });

  it('unknown status and database error fail closed', async () => {
    const unknown = new DefaultAccessStateService({
      findAccessStateRecord: vi.fn().mockResolvedValue({
        telegramId: '1',
        botUserExists: true,
        hasAuthAccount: true,
        status: 'other',
      }),
    });
    await expect(unknown.getUserAccessState('1')).resolves.toMatchObject({
      kind: 'unknown_status',
    });
    const error = new DefaultAccessStateService({
      findAccessStateRecord: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    await expect(error.getUserAccessState('1')).resolves.toMatchObject({
      kind: 'temporarily_unavailable',
    });
  });

  it('HTML escaping covers name, username, and email special characters', () => {
    expect(escapeTelegramHtml('<Name & "User">')).toBe('&lt;Name &amp; &quot;User&quot;&gt;');
    expect(escapeTelegramHtml('@bad<user>')).toBe('@bad&lt;user&gt;');
    expect(
      buildAccessMessage({ ...states.active, loginEmail: '<email&x>' }, 'Asia/Almaty', nowMs),
    ).toContain('&lt;email&amp;x&gt;');
  });

  it('public bot commands contain only user commands', () => {
    expect(PUBLIC_BOT_COMMANDS.map((command) => command.command)).toEqual([
      'start',
      'menu',
      'status',
      'help',
      'cancel',
    ]);
    expect(PUBLIC_BOT_COMMANDS.map((command) => command.command)).not.toContain('admin');
  });
});
