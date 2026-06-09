import { describe, expect, it } from 'vitest';
import { normalizeTelegramUserContext, createSupportLink } from '../src/utils/telegram.js';

describe('telegram helpers', () => {
  it('normalizes Telegram user context safely', () => {
    const ctx = {
      from: {
        id: 42,
        username: 'strong_user',
        first_name: 'Strong',
        last_name: 'User',
        language_code: 'ru',
      },
      chat: { id: 99 },
    };

    expect(normalizeTelegramUserContext(ctx as never)).toEqual({
      telegramId: '42',
      chatId: '99',
      username: 'strong_user',
      firstName: 'Strong',
      lastName: 'User',
      languageCode: 'ru',
    });
  });

  it('returns undefined without ctx.from', () => {
    expect(normalizeTelegramUserContext({} as never)).toBeUndefined();
  });

  it('creates safe support link', () => {
    expect(createSupportLink(' @Support_User ')).toBe('https://t.me/Support_User');
    expect(createSupportLink('bad user')).toBeUndefined();
  });
});
