export interface AccountService {
  startPasswordRestore(telegramId: string): Promise<{ status: 'not_configured'; message: string }>;
}

export class MockAccountService implements AccountService {
  async startPasswordRestore(
    _telegramId: string,
  ): Promise<{ status: 'not_configured'; message: string }> {
    return {
      status: 'not_configured',
      message: 'Восстановление будет подключено после интеграции с Supabase.',
    };
  }
}
