export interface NotificationService {
  enqueue(telegramId: string, message: string): Promise<{ status: 'not_configured' }>;
}

export class MockNotificationService implements NotificationService {
  async enqueue(_telegramId: string, _message: string): Promise<{ status: 'not_configured' }> {
    return { status: 'not_configured' };
  }
}
