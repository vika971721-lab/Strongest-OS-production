import { describe, expect, it, vi } from 'vitest';
import { CALLBACK_DATA, MENU_BUTTONS } from '../src/config/constants.js';
import {
  buildAccessMessage,
  buildPlanMessage,
  buildSupportMessage,
} from '../src/utils/messages.js';
import { escapeTelegramHtml } from '../src/utils/html.js';
import {
  formatDateTime,
  formatDeletionRemainingTime,
  formatRemainingTime,
} from '../src/utils/dates.js';
import { createMainMenuKeyboard } from '../src/keyboards/mainMenuKeyboard.js';
import { createPlanKeyboard } from '../src/keyboards/inlineKeyboards.js';
import { createSupportLink, normalizeSupportUsername } from '../src/utils/telegram.js';
import { editOrReply } from '../src/utils/delivery.js';
import { DefaultAccessStateService } from '../src/services/accessStateService.js';
import type { BotContext } from '../src/types/context.js';
import type { UserAccessState } from '../src/types/accessState.js';

const pricing = {
  firstPeriodStars: 111,
  renewalPeriodStars: 222,
  firstPeriodDays: 31,
  renewalPeriodDays: 32,
  threeMonthsStars: 399,
  threeMonthsDays: 90,
  sixMonthsStars: 749,
  sixMonthsDays: 180,
  yearlyStars: 1299,
  yearlyDays: 365,
};
const timezone = 'Asia/Almaty';
const nowMs = Date.parse('2026-06-09T00:00:00.000Z');

describe('stage 3 ui', () => {
  it('main menu contains required 8 buttons and no buy/renew duplicates', () => {
    const flat = createMainMenuKeyboard().reply_markup.keyboard.flat();
    expect(flat).toEqual(Object.values(MENU_BUTTONS));
    expect(flat).not.toContain('Купить подписку');
    expect(flat).not.toContain('Продлить доступ');
  });

  it('builds first plan from pricing config', () => {
    const text = buildPlanMessage(
      { kind: 'telegram_registered', telegramId: '1', trialUsed: false },
      pricing,
    );
    expect(text).toContain('Выбери режим доступа');
    expect(text).toContain('Первый вход доступен один раз за 111⭐');
    expect(text).toContain('Главный тариф');
  });

  it('builds renewal plan from trial_used=true and active state', () => {
    const text = buildPlanMessage(
      { kind: 'active', status: 'active', telegramId: '1', trialUsed: true },
      pricing,
    );
    expect(text).toContain('Выбери режим доступа');
    expect(text).toContain('Первый вход доступен один раз за 111⭐');
    expect(text).toContain('Главный тариф');
    expect(text).toContain('Главный тариф');
  });

  it('does not show tariff button for banned/deleted', () => {
    const banned = buildPlanMessage(
      { kind: 'banned', status: 'banned', telegramId: '1', trialUsed: true },
      pricing,
    );
    const deleted = buildPlanMessage(
      { kind: 'deleted', status: 'deleted', telegramId: '1', trialUsed: true },
      pricing,
    );
    expect(banned).not.toContain('Telegram Stars');
    expect(deleted).not.toContain('Telegram Stars');
    expect(JSON.stringify(createPlanKeyboard(false).reply_markup.inline_keyboard)).toContain(
      'Поддержка',
    );
  });

  it('renders active and expired access safely', () => {
    const active: UserAccessState = {
      kind: 'active',
      status: 'active',
      telegramId: '1',
      trialUsed: true,
      loginEmail: '<a@b.kz>',
      expiresAt: '2026-06-10T00:00:00.000Z',
    };
    expect(buildAccessMessage(active, timezone, nowMs)).toContain('&lt;a@b.kz&gt;');
    const expired: UserAccessState = {
      kind: 'expired',
      status: 'expired',
      telegramId: '1',
      trialUsed: true,
      expiresAt: 'bad',
      deleteAfter: undefined,
    };
    const text = buildAccessMessage(expired, timezone, nowMs);
    expect(text).toContain('Дата удаления пока не назначена');
    expect(text).not.toContain('undefined');
  });

  it('formats Russian date in Asia/Almaty timezone', () => {
    expect(formatDateTime('2026-07-25T10:00:00.000Z', timezone)).toBe('25 июля 2026, 15:00');
  });

  it.each([
    ['2026-06-10T02:00:00.000Z', '1 день 2 часа'],
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
  ])('formats remaining time %#', (date, expected) => {
    expect(formatRemainingTime(date, nowMs)).toBe(expected);
  });

  it('does not show negative deletion remaining time or invalid date internals', () => {
    expect(formatDeletionRemainingTime('2026-06-08T00:00:00.000Z', nowMs)).toBe(
      'Удаление может быть выполнено в ближайшее время.',
    );
    expect(formatRemainingTime('bad-date', nowMs)).toBe('срок указан некорректно');
  });

  it('escapes telegram html', () => {
    expect(escapeTelegramHtml('<Strong & "User">')).toBe('&lt;Strong &amp; &quot;User&quot;&gt;');
  });

  it('validates support username', () => {
    expect(normalizeSupportUsername(' @Support_User ')).toBe('Support_User');
    expect(createSupportLink('bad user')).toBeUndefined();
    expect(buildSupportMessage(false)).toContain('не настроен');
  });

  it('callback data are safe and short', () => {
    for (const value of Object.values(CALLBACK_DATA)) {
      expect(value.length).toBeLessThanOrEqual(64);
      expect(value).not.toMatch(/password|@|[0-9a-f]{8}-[0-9a-f]{4}/i);
    }
  });

  it('editOrReply ignores message is not modified and falls back on edit failure', async () => {
    const notModified = {
      callbackQuery: {},
      state: {},
      editMessageText: vi.fn().mockRejectedValue(new Error('Bad Request: message is not modified')),
      reply: vi.fn(),
    } as unknown as BotContext;
    await expect(editOrReply(notModified, 'same')).resolves.toBe('not_modified');
    const fallback = {
      callbackQuery: {},
      state: {},
      editMessageText: vi.fn().mockRejectedValue(new Error('other')),
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as BotContext;
    await expect(editOrReply(fallback, 'new')).resolves.toBe('sent');
  });

  it('access state fails closed on unknown status and database error', async () => {
    const unknown = new DefaultAccessStateService({
      findAccessStateRecord: vi.fn().mockResolvedValue({
        telegramId: '1',
        botUserExists: true,
        hasAuthAccount: true,
        status: 'weird',
      }),
    });
    await expect(unknown.getUserAccessState('1')).resolves.toMatchObject({
      kind: 'unknown_status',
    });
    const failed = new DefaultAccessStateService({
      findAccessStateRecord: vi.fn().mockRejectedValue(new Error('timeout')),
    });
    await expect(failed.getUserAccessState('1')).resolves.toMatchObject({
      kind: 'temporarily_unavailable',
    });
  });
});
