import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.js';
import type { AccountService, PasswordResetResult } from './accountService.js';
import { logger } from '../utils/logger.js';

type BotUserRow = {
  supabase_user_id: string | null;
  login_email: string | null;
};

type QR<T> = Promise<{ data: T | null; error: { message: string } | null }>;

interface SupabaseLike {
  from(table: string): {
    select(columns?: string): unknown;
  };
}

const generatePassword = (): string => randomBytes(16).toString('base64url').slice(0, 20);

export class SupabaseAccountService implements AccountService {
  private readonly db: SupabaseLike;

  constructor(private readonly client: SupabaseClient<Database>) {
    this.db = client;
  }

  startPasswordRestore(
    _telegramId: string,
  ): Promise<{ status: 'not_configured'; message: string }> {
    return Promise.resolve({ status: 'not_configured', message: 'ok' });
  }

  async resetPassword(telegramId: string): Promise<PasswordResetResult> {
    const { data: user, error } = await (
      this.db.from('bot_users').select('supabase_user_id, login_email') as {
        eq(col: string, val: string): { maybeSingle(): QR<BotUserRow> };
      }
    )
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (error) throw new Error(`bot_users lookup failed: ${error.message}`);
    if (!user?.supabase_user_id || !user.login_email) {
      return {
        status: 'not_configured',
        message:
          'Аккаунт Strongest OS ещё не создан.\n\nАккаунт появится после первой оплаты или активации промокода.',
      };
    }

    const password = generatePassword();
    const { error: updateError } = await this.client.auth.admin.updateUserById(
      user.supabase_user_id,
      { password },
    );
    if (updateError) throw new Error(`Password reset failed: ${updateError.message}`);

    logger.info({ telegramId }, 'password_reset');
    return {
      status: 'created',
      loginEmail: user.login_email,
      password,
      message: 'ok',
    };
  }
}
