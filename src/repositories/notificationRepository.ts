export interface NotificationRepository {
  enqueue(telegramId: string, message: string): Promise<{ status: 'not_configured' }>;
}
