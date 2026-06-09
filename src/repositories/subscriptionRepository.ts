import type { Subscription } from '../types/subscription.js';

export interface SubscriptionRepository {
  findByTelegramId(telegramId: string): Promise<Subscription | undefined>;
  save(subscription: Subscription): Promise<{ status: 'not_configured' }>;
}
