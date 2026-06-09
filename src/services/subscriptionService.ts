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
  getByTelegramId(_telegramId: string): Promise<Subscription | undefined> {
    return Promise.resolve(undefined);
  }

  getAccessSummary(_telegramId: string): Promise<{ status: 'not_configured'; message: string }> {
    return Promise.resolve({
      status: 'not_configured',
      message: 'Информация о вашем доступе станет доступна после подключения базы данных.',
    });
  }

  extend(_telegramId: string, _days: number): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }

  activate(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }

  expire(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }

  ban(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }

  unban(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }

  markForDeletion(_telegramId: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }
}
