import type { TelegramUserContext } from '../types/context.js';

export interface BotUserRepository {
  upsertTelegramContext(user: TelegramUserContext): Promise<{ status: 'not_configured' }>;
}
