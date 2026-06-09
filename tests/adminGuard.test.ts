import { describe, expect, it } from 'vitest';
import { isAdminTelegramId } from '../src/middleware/adminGuard.js';

describe('admin guard', () => {
  it('uses telegram ID and configured admin list', () => {
    expect(isAdminTelegramId('123', ['123'])).toBe(true);
    expect(isAdminTelegramId('username', ['123'])).toBe(false);
    expect(isAdminTelegramId(undefined, ['123'])).toBe(false);
  });
});
