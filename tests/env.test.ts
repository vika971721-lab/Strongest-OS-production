import { describe, expect, it } from 'vitest';
import { parseAdminTelegramIds, parseEnv, toSafeEnvLogData } from '../src/config/env.js';

const baseEnv = {
  BOT_TOKEN: 'token',
  NODE_ENV: 'development',
  BOT_MODE: 'polling',
};

describe('env parsing', () => {
  it('parses environment variables and numeric pricing', () => {
    const env = parseEnv({
      ...baseEnv,
      APP_URL: 'https://strongest.sanau-ai.kz',
      PORT: '3000',
      FIRST_PERIOD_STARS: '100',
      RENEWAL_PERIOD_STARS: '150',
      FIRST_PERIOD_DAYS: '30',
      RENEWAL_PERIOD_DAYS: '30',
    });

    expect(env.port).toBe(3000);
    expect(env.appUrl).toBe('https://strongest.sanau-ai.kz');
    expect(env.displayTimezone).toBe('Asia/Almaty');
    expect(env.pricing).toEqual({
      firstPeriodStars: 100,
      renewalPeriodStars: 150,
      firstPeriodDays: 30,
      renewalPeriodDays: 30,
    });
  });

  it('parses ADMIN_TELEGRAM_IDS', () => {
    expect(parseAdminTelegramIds(' 123, -456 ,789 ')).toEqual(['123', '-456', '789']);
  });

  it('rejects invalid ADMIN_TELEGRAM_IDS', () => {
    expect(() => parseAdminTelegramIds('123, name')).toThrow('Invalid ADMIN_TELEGRAM_IDS');
  });

  it('rejects invalid DISPLAY_TIMEZONE', () => {
    expect(() => parseEnv({ ...baseEnv, DISPLAY_TIMEZONE: 'Invalid/Zone' })).toThrow(
      'Invalid configuration',
    );
  });

  it('does not serialize secrets into safe log data', () => {
    const env = parseEnv({ ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: 'dummy-value' });
    expect(toSafeEnvLogData(env)).not.toHaveProperty('supabaseServiceRoleKey');
    expect(toSafeEnvLogData(env).hasSupabaseServiceRoleKey).toBe(true);
  });
});
