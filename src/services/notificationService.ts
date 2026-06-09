export interface NotificationService {
  enqueue(telegramId: string, message: string): Promise<{ status: 'not_configured' }>;
}

export class MockNotificationService implements NotificationService {
  enqueue(_telegramId: string, _message: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }
}
