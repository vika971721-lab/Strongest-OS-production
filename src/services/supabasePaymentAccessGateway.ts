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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (client: SupabaseClient<Database>, table: string): any => client.from(table);

const generatePassword = (): string => randomBytes(16).toString('base64url').slice(0, 20);

type VoidResult = Promise<{ error: { message: string } | null }>;

export class SupabasePaymentAccessGateway implements PaymentAccessGateway {
  private readonly accessStateService: DefaultAccessStateService;

  constructor(private readonly client: SupabaseClient<Database>) {
    this.accessStateService = new DefaultAccessStateService(
      new SupabaseAccessStateSource(client),
    );
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
    const { data: existing, error: lookupErr } = await (q(this.client, 'bot_users')
      .select('supabase_user_id, login_email')
      .eq('telegram_id', telegramId)
      .maybeSingle() as Promise<{
      data: { supabase_user_id: string | null; login_email: string | null } | null;
      error: { message: string } | null;
    }>);
    if (lookupErr) throw new Error(`bot_users lookup failed: ${lookupErr.message}`);

    const now = new Date();

    if (existing?.supabase_user_id && existing.login_email) {
      // Update last_seen and optional user info
      await (q(this.client, 'bot_users')
        .update({
          last_seen_at: now.toISOString(),
          updated_at: now.toISOString(),
          ...(userInfo?.username !== undefined ? { telegram_username: userInfo.username } : {}),
          ...(userInfo?.firstName !== undefined ? { telegram_first_name: userInfo.firstName } : {}),
          ...(userInfo?.lastName !== undefined ? { telegram_last_name: userInfo.lastName } : {}),
        })
        .eq('telegram_id', telegramId) as VoidResult);

      return {
        supabaseUserId: existing.supabase_user_id,
        loginEmail: existing.login_email,
        created: false,
      };
    }

    // Create new Supabase Auth user
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

    const { error: upsertErr } = await (q(this.client, 'bot_users').upsert(
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
    ) as VoidResult);
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
    const { data: existing, error: lookupErr } = await (q(this.client, 'subscriptions')
      .select('id, status, expires_at, trial_used, first_payment_at')
      .eq('telegram_id', input.telegramId)
      .maybeSingle() as Promise<{
      data: {
        id: string;
        status: string;
        expires_at: string | null;
        trial_used: boolean | null;
        first_payment_at: string | null;
      } | null;
      error: { message: string } | null;
    }>);
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

    const { error: upsertErr } = await (q(this.client, 'subscriptions').upsert(
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
    ) as VoidResult);
    if (upsertErr) throw new Error(`Subscription upsert failed: ${upsertErr.message}`);

    return { expiresAt: newExpiresAt, firstPayment: isFirstPayment, applied: true };
  }

  async getAccessSummary(
    telegramId: string,
  ): Promise<{ expiresAt?: Date; loginEmail?: string }> {
    const [userRes, subRes] = await Promise.all([
      q(this.client, 'bot_users')
        .select('login_email')
        .eq('telegram_id', telegramId)
        .maybeSingle() as Promise<{
        data: { login_email: string | null } | null;
        error: { message: string } | null;
      }>,
      q(this.client, 'subscriptions')
        .select('expires_at')
        .eq('telegram_id', telegramId)
        .maybeSingle() as Promise<{
        data: { expires_at: string | null } | null;
        error: { message: string } | null;
      }>,
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
    const { data: existing, error } = await (q(this.client, 'subscriptions')
      .select('id, supabase_user_id, expires_at, status, trial_used, first_payment_at')
      .eq('telegram_id', input.telegramId)
      .maybeSingle() as Promise<{
      data: {
        id: string;
        supabase_user_id: string | null;
        expires_at: string | null;
        status: string;
        trial_used: boolean | null;
        first_payment_at: string | null;
      } | null;
      error: { message: string } | null;
    }>);
    if (error) throw new Error(`Subscription lookup failed: ${error.message}`);

    const currentExpires = existing?.expires_at ? new Date(existing.expires_at) : null;
    const base = currentExpires && currentExpires > input.now ? currentExpires : input.now;
    const newExpiresAt = addDays(base, input.days);

    if (existing) {
      const newStatus = existing.status === 'deleted' || existing.status === 'banned'
        ? existing.status
        : 'active';
      const { error: updateErr } = await (q(this.client, 'subscriptions')
        .update({
          expires_at: newExpiresAt.toISOString(),
          current_period_end: newExpiresAt.toISOString(),
          status: newStatus,
          updated_at: input.now.toISOString(),
        })
        .eq('telegram_id', input.telegramId) as VoidResult);
      if (updateErr) throw new Error(`Admin extend failed: ${updateErr.message}`);
    } else {
      const { data: botUser } = await (q(this.client, 'bot_users')
        .select('supabase_user_id')
        .eq('telegram_id', input.telegramId)
        .maybeSingle() as Promise<{
        data: { supabase_user_id: string | null } | null;
        error: { message: string } | null;
      }>);
      const { error: insertErr } = await (q(this.client, 'subscriptions').insert({
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
      }) as VoidResult);
      if (insertErr) throw new Error(`Admin extend insert failed: ${insertErr.message}`);
    }

    logger.info(
      { telegramId: input.telegramId, days: input.days, reason: input.reason },
      'admin_extended',
    );
    return { expiresAt: newExpiresAt };
  }
}
