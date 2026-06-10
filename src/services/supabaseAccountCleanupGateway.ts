import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountCleanupGateway, CleanupResult } from './accountDeletionService.js';
import type { Database } from '../types/database.js';

interface SupabaseLike {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  auth: { admin: { deleteUser(id: string): Promise<{ error: { message: string } | null }> } };
  from(table: string): { update(values: Record<string, unknown>): unknown };
}

const parseCleanupResult = (data: unknown): CleanupResult => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { success: false, deletedTables: {} };
  }
  const record = data as Record<string, unknown>;
  const deletedTablesRaw = record.deleted_tables;
  const deletedTables: Record<string, number> = {};
  if (
    deletedTablesRaw &&
    typeof deletedTablesRaw === 'object' &&
    !Array.isArray(deletedTablesRaw)
  ) {
    for (const [key, value] of Object.entries(deletedTablesRaw)) {
      if (typeof value === 'number') deletedTables[key] = value;
    }
  }
  return { success: record.status === 'success', deletedTables };
};

export class SupabaseAccountCleanupGateway implements AccountCleanupGateway {
  private readonly client: SupabaseLike;

  constructor(client: SupabaseClient<Database>) {
    this.client = client as unknown as SupabaseLike;
  }

  async cleanupUserData(supabaseUserId: string): Promise<CleanupResult> {
    const { data, error } = await this.client.rpc('cleanup_deleted_account_data', {
      p_supabase_user_id: supabaseUserId,
    });
    if (error) throw new Error(`Cleanup RPC failed: ${error.message}`);
    return parseCleanupResult(data);
  }

  async deleteAuthUser(supabaseUserId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(supabaseUserId);
    if (error) throw new Error(`Auth user deletion failed: ${error.message}`);
  }

  async anonymizeBotUser(telegramId: string, now: Date): Promise<void> {
    const updater = this.client.from('bot_users').update({
      login_email: null,
      supabase_user_id: null,
      deleted_at: now.toISOString(),
      updated_at: now.toISOString(),
    }) as { eq(column: string, value: string): Promise<{ error: { message: string } | null }> };
    const { error } = await updater.eq('telegram_id', telegramId);
    if (error) throw new Error(`Bot user anonymization failed: ${error.message}`);
  }
}
