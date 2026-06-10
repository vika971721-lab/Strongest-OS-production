import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.js';
import type { AccessStateSource, AccessStateSourceRecord } from './accessStateService.js';

type BotUserRow = {
  telegram_id: string;
  supabase_user_id: string | null;
  login_email: string | null;
};

type SubscriptionRow = {
  telegram_id: string;
  status: string;
  trial_used: boolean | null;
  expires_at: string | null;
  delete_after: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (client: SupabaseClient<Database>, table: string): any => client.from(table);

export class SupabaseAccessStateSource implements AccessStateSource {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async findAccessStateRecord(telegramId: string): Promise<AccessStateSourceRecord | undefined> {
    const [userRes, subRes] = await Promise.all([
      q(this.client, 'bot_users')
        .select('telegram_id, supabase_user_id, login_email')
        .eq('telegram_id', telegramId)
        .maybeSingle() as Promise<{
        data: BotUserRow | null;
        error: { message: string } | null;
      }>,
      q(this.client, 'subscriptions')
        .select('telegram_id, status, trial_used, expires_at, delete_after')
        .eq('telegram_id', telegramId)
        .maybeSingle() as Promise<{
        data: SubscriptionRow | null;
        error: { message: string } | null;
      }>,
    ]);

    if (userRes.error) throw new Error(`bot_users lookup failed: ${userRes.error.message}`);
    if (subRes.error) throw new Error(`subscriptions lookup failed: ${subRes.error.message}`);

    const user = userRes.data;
    const sub = subRes.data;

    if (!user && !sub) return undefined;

    return {
      telegramId,
      botUserExists: Boolean(user),
      hasAuthAccount: Boolean(user?.supabase_user_id),
      loginEmail: user?.login_email ?? undefined,
      status: sub?.status ?? undefined,
      trialUsed: sub?.trial_used ?? false,
      expiresAt: sub?.expires_at ?? undefined,
      deleteAfter: sub?.delete_after ?? undefined,
    };
  }
}
