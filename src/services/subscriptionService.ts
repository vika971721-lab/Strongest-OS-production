import type { Subscription } from '../types/subscription.js';

export interface SubscriptionService {
  getByTelegramId(telegramId: string): Promise<Subscription | undefined>;
  getAccessSummary(telegramId: string): Promise<{ status: 'not_configured'; message: string }>;
  extend(telegramId: string, days: number): Promise<{ status: 'not_configured' }>;
  activate(telegramId: string): Promise<{ status: 'not_configured' }>;
  expire(telegramId: string): Promise<{ status: 'not_configured' }>;
  ban(telegramId: string): Promise<{ status: 'not_configured' }>;
  unban(telegramId: string): Promise<{ status: 'not_configured' }>;
  markForDeletion(telegramId: string): Promise<{ status: 'not_configured' }>;
}

export class MockSubscriptionService implements SubscriptionService {
  async getByTelegramId(_telegramId: string): Promise<Subscription | undefined> {
    return undefined;
  }

  async getAccessSummary(
    _telegramId: string,
  ): Promise<{ status: 'not_configured'; message: string }> {
    return {
      status: 'not_configured',
      message: 'Информация о вашем доступе станет доступна после подключения базы данных.',
    };
  }

  async extend(_telegramId: string, _days: number): Promise<{ status: 'not_configured' }> {
    return { status: 'not_configured' };
  }

  async activate(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return { status: 'not_configured' };
  }

  async expire(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return { status: 'not_configured' };
  }

  async ban(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return { status: 'not_configured' };
  }

  async unban(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return { status: 'not_configured' };
  }

  async markForDeletion(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return { status: 'not_configured' };
  }
}
