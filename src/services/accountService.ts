export interface PasswordResetResult {
  status: 'created' | 'not_configured';
  loginEmail?: string;
  password?: string;
  message: string;
}

export interface AccountService {
  startPasswordRestore(telegramId: string): Promise<{ status: 'not_configured'; message: string }>;
  resetPassword(telegramId: string): Promise<PasswordResetResult>;
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

  async resetPassword(_telegramId: string): Promise<PasswordResetResult> {
    return {
      status: 'not_configured',
      message: 'Создание нового пароля будет подключено после интеграции с Supabase.',
    };
  }
}
