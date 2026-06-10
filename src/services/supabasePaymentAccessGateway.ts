import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.js';
import type { UserAccessState } from '../types/accessState.js';
import type { PaymentPlan } from '../types/payment.js';
import type { PaymentAccessGateway } from './paymentFlow.js';
import { DefaultAccessStateService } from './accessStateService.js';
import { SupabaseAccessStateSource } from './supabaseAccessStateSource.js';
import { addDays } from './paymentFlow.js';
import { logger } from '../utils/logger.js';

type ER = Promise<{ data: null; error: { message: string } | null }>;

type SubRow = {
  id: string;
  status: string;
  expires_at: string | null;
  trial_used: boolean | null;
  first_payment_at: string | null;
};

type SubAdminRow = SubRow & {
  supabase_user_id: string | null;
};

type BotUserExistingRow = {
  supabase_user_id: string | null;
  login_email: string | null;
};

type QR<T> = Promise<{ data: T | null; error: { message: string } | null }>;

interface SupabaseLike {
  from(table: string): {
    select(columns?: string): unknown;
    insert(values: unknown): unknown;
    update(values: unknown): unknown;
    upsert(values: unknown, opts?: unknown): unknown;
  };
}

const generatePassword = (): string => randomBytes(16).toString('base64url').slice(0, 20);

export class SupabasePaymentAccessGateway implements PaymentAccessGateway {
  private readonly db: SupabaseLike;
  private readonly accessStateService: DefaultAccessStateService;

  constructor(private readonly client: SupabaseClient<Database>) {
    this.db = client;
    this.accessStateService = new DefaultAccessStateService(new SupabaseAccessStateSource(client));
  }

  async getAccessState(telegramId: string): Promise<UserAccessState> {
    return this.accessStateService.getUserAccessState(telegramId);
  }

  async createOrGetAccount(
    telegramId: string,
    userInfo?: { username?: string; firstName?: string; lastName?: string },
  ): Promise<{
    supabaseUserId: string;
    loginEmail: string;
    created: boolean;
    generatedPassword?: string;
  }> {
    const { data: existing, error: lookupErr } = await (
      this.db.from('bot_users').select('supabase_user_id, login_email') as {
        eq(col: string, val: string): { maybeSingle(): QR<BotUserExistingRow> };
      }
    )
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (lookupErr) throw new Error(`bot_users lookup failed: ${lookupErr.message}`);

    const now = new Date();

    if (existing?.supabase_user_id && existing.login_email) {
      // Best-effort update of last_seen_at; non-critical, ignore error
      await (
        this.db.from('bot_users').update({
          last_seen_at: now.toISOString(),
          updated_at: now.toISOString(),
          ...(userInfo?.username !== undefined ? { telegram_username: userInfo.username } : {}),
          ...(userInfo?.firstName !== undefined ? { telegram_first_name: userInfo.firstName } : {}),
          ...(userInfo?.lastName !== undefined ? { telegram_last_name: userInfo.lastName } : {}),
        }) as { eq(col: string, val: string): ER }
      ).eq('telegram_id', telegramId);

      return {
        supabaseUserId: existing.supabase_user_id,
        loginEmail: existing.login_email,
        created: false,
      };
    }

    const loginEmail = `tg_${telegramId}@strongest.local`;
    const password = generatePassword();

    const { data: authData, error: authErr } = await this.client.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
    });
    if (authErr || !authData.user) {
      throw new Error(`Auth user creation failed: ${authErr?.message ?? 'no user returned'}`);
    }
    const supabaseUserId = authData.user.id;

    const { error: upsertErr } = await (this.db.from('bot_users').upsert(
      {
        telegram_id: telegramId,
        telegram_username: userInfo?.username ?? null,
        telegram_first_name: userInfo?.firstName ?? null,
        telegram_last_name: userInfo?.lastName ?? null,
        supabase_user_id: supabaseUserId,
        login_email: loginEmail,
        first_started_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'telegram_id' },
    ) as ER);
    if (upsertErr) throw new Error(`bot_users upsert failed: ${upsertErr.message}`);

    logger.info({ telegramId, supabaseUserId }, 'supabase_account_created');
    return { supabaseUserId, loginEmail, created: true, generatedPassword: password };
  }

  async extendSubscription(input: {
    telegramId: string;
    supabaseUserId: string;
    plan: PaymentPlan;
    periodDays: number;
    paymentEventId: string;
    now: Date;
  }): Promise<{ expiresAt: Date; firstPayment: boolean; applied: boolean }> {
    const { data: existing, error: lookupErr } = await (
      this.db
        .from('subscriptions')
        .select('id, status, expires_at, trial_used, first_payment_at') as {
        eq(col: string, val: string): { maybeSingle(): QR<SubRow> };
      }
    )
      .eq('telegram_id', input.telegramId)
      .maybeSingle();
    if (lookupErr) throw new Error(`Subscription lookup failed: ${lookupErr.message}`);

    if (existing?.status === 'banned' || existing?.status === 'deleted') {
      throw new Error(`Cannot extend subscription with status: ${existing.status}`);
    }

    const now = input.now;
    const currentExpires = existing?.expires_at ? new Date(existing.expires_at) : null;
    const base = currentExpires && currentExpires > now ? currentExpires : now;
    const newExpiresAt = addDays(base, input.periodDays);

    const isFirstPayment = !existing?.first_payment_at;
    const trialUsed = Boolean(existing?.trial_used) || input.plan === 'first_month';

    const { error: upsertErr } = await (this.db.from('subscriptions').upsert(
      {
        telegram_id: input.telegramId,
        supabase_user_id: input.supabaseUserId,
        status: 'active',
        plan: input.plan,
        trial_used: trialUsed,
        current_period_start: now.toISOString(),
        current_period_end: newExpiresAt.toISOString(),
        expires_at: newExpiresAt.toISOString(),
        first_payment_at: isFirstPayment
          ? now.toISOString()
          : (existing?.first_payment_at ?? now.toISOString()),
        last_payment_at: now.toISOString(),
        expired_at: null,
        delete_after: null,
        marked_for_deletion_at: null,
        deleted_at: null,
        updated_at: now.toISOString(),
        ...(existing ? {} : { created_at: now.toISOString() }),
      },
      { onConflict: 'telegram_id' },
    ) as ER);
    if (upsertErr) throw new Error(`Subscription upsert failed: ${upsertErr.message}`);

    return { expiresAt: newExpiresAt, firstPayment: isFirstPayment, applied: true };
  }

  async getAccessSummary(telegramId: string): Promise<{ expiresAt?: Date; loginEmail?: string }> {
    const [userRes, subRes] = await Promise.all([
      (
        this.db.from('bot_users').select('login_email') as {
          eq(
            col: string,
            val: string,
          ): {
            maybeSingle(): QR<{ login_email: string | null }>;
          };
        }
      )
        .eq('telegram_id', telegramId)
        .maybeSingle(),
      (
        this.db.from('subscriptions').select('expires_at') as {
          eq(
            col: string,
            val: string,
          ): {
            maybeSingle(): QR<{ expires_at: string | null }>;
          };
        }
      )
        .eq('telegram_id', telegramId)
        .maybeSingle(),
    ]);

    const result: { expiresAt?: Date; loginEmail?: string } = {};
    if (userRes.data?.login_email) result.loginEmail = userRes.data.login_email;
    if (subRes.data?.expires_at) result.expiresAt = new Date(subRes.data.expires_at);
    return result;
  }

  async adminExtend(input: {
    telegramId: string;
    days: number;
    reason: string;
    now: Date;
  }): Promise<{ expiresAt: Date }> {
    const { data: existing, error } = await (
      this.db
        .from('subscriptions')
        .select('id, supabase_user_id, expires_at, status, trial_used, first_payment_at') as {
        eq(col: string, val: string): { maybeSingle(): QR<SubAdminRow> };
      }
    )
      .eq('telegram_id', input.telegramId)
      .maybeSingle();
    if (error) throw new Error(`Subscription lookup failed: ${error.message}`);

    const currentExpires = existing?.expires_at ? new Date(existing.expires_at) : null;
    const base = currentExpires && currentExpires > input.now ? currentExpires : input.now;
    const newExpiresAt = addDays(base, input.days);

    if (existing) {
      const newStatus =
        existing.status === 'deleted' || existing.status === 'banned' ? existing.status : 'active';
      const { error: updateErr } = await (
        this.db.from('subscriptions').update({
          expires_at: newExpiresAt.toISOString(),
          current_period_end: newExpiresAt.toISOString(),
          status: newStatus,
          updated_at: input.now.toISOString(),
        }) as { eq(col: string, val: string): ER }
      ).eq('telegram_id', input.telegramId);
      if (updateErr) throw new Error(`Admin extend failed: ${updateErr.message}`);
    } else {
      const { data: botUser } = await (
        this.db.from('bot_users').select('supabase_user_id') as {
          eq(
            col: string,
            val: string,
          ): {
            maybeSingle(): QR<{ supabase_user_id: string | null }>;
          };
        }
      )
        .eq('telegram_id', input.telegramId)
        .maybeSingle();

      const { error: insertErr } = await (this.db.from('subscriptions').insert({
        telegram_id: input.telegramId,
        supabase_user_id: botUser?.supabase_user_id ?? null,
        status: 'active',
        plan: 'monthly_renewal',
        trial_used: false,
        current_period_start: input.now.toISOString(),
        current_period_end: newExpiresAt.toISOString(),
        expires_at: newExpiresAt.toISOString(),
        first_payment_at: input.now.toISOString(),
        last_payment_at: input.now.toISOString(),
        created_at: input.now.toISOString(),
        updated_at: input.now.toISOString(),
      }) as ER);
      if (insertErr) throw new Error(`Admin extend insert failed: ${insertErr.message}`);
    }

    logger.info(
      { telegramId: input.telegramId, days: input.days, reason: input.reason },
      'admin_extended',
    );
    return { expiresAt: newExpiresAt };
  }
}
