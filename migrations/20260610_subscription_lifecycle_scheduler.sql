-- Stage 6 subscription lifecycle scheduler.
-- Safe migration: no DROP/TRUNCATE and no data deletion. Run diagnostics before relying on UNIQUE indexes.

-- Diagnostics for period-aware notification duplicates:
select subscription_id, type, period_end, count(*)
from subscription_notifications
where period_end is not null
group by subscription_id, type, period_end
having count(*) > 1;

alter table subscription_notifications
  add column if not exists period_end timestamptz,
  add column if not exists reservation_token text,
  add column if not exists reserved_until timestamptz,
  add column if not exists delivery_status text,
  add column if not exists failure_count integer not null default 0,
  add column if not exists updated_at timestamptz;

create unique index if not exists subscription_notifications_period_uidx
  on subscription_notifications (subscription_id, type, period_end)
  where period_end is not null;

create index if not exists subscriptions_status_expires_at_idx
  on subscriptions (status, expires_at);

create index if not exists subscriptions_status_delete_after_idx
  on subscriptions (status, delete_after);

create index if not exists subscription_notifications_period_idx
  on subscription_notifications (subscription_id, type, period_end);

create or replace function try_acquire_subscription_scheduler_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_try_advisory_lock(hashtextextended('strongest_os_subscription_scheduler', 0));
$$;

create or replace function release_subscription_scheduler_lock()
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_advisory_unlock(hashtextextended('strongest_os_subscription_scheduler', 0));
$$;

create or replace function reserve_subscription_notification(
  p_subscription_id uuid,
  p_telegram_id text,
  p_type text,
  p_period_end timestamptz,
  p_now timestamptz default now(),
  p_reservation_ttl_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification subscription_notifications%rowtype;
  v_token text;
begin
  if p_type not in ('five_days', 'three_days', 'one_day', 'one_hour', 'expired', 'deletion_warning', 'deleted') then
    raise exception 'unknown notification type';
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');

  insert into subscription_notifications (
    subscription_id, telegram_id, type, period_end, reservation_token, reserved_until, delivery_status, updated_at
  ) values (
    p_subscription_id, p_telegram_id, p_type, p_period_end, v_token,
    p_now + make_interval(secs => p_reservation_ttl_seconds), 'reserved', p_now
  )
  on conflict (subscription_id, type, period_end) where period_end is not null do update
  set reservation_token = case
        when subscription_notifications.sent_at is null
          and coalesce(subscription_notifications.delivery_status, '') <> 'failed_permanent'
          and (subscription_notifications.reservation_token is null or subscription_notifications.reserved_until <= p_now)
        then v_token
        else subscription_notifications.reservation_token
      end,
      reserved_until = case
        when subscription_notifications.sent_at is null
          and coalesce(subscription_notifications.delivery_status, '') <> 'failed_permanent'
          and (subscription_notifications.reservation_token is null or subscription_notifications.reserved_until <= p_now)
        then p_now + make_interval(secs => p_reservation_ttl_seconds)
        else subscription_notifications.reserved_until
      end,
      delivery_status = case
        when subscription_notifications.sent_at is null
          and coalesce(subscription_notifications.delivery_status, '') <> 'failed_permanent'
          and (subscription_notifications.reservation_token is null or subscription_notifications.reserved_until <= p_now)
        then 'reserved'
        else subscription_notifications.delivery_status
      end,
      updated_at = p_now
  returning * into v_notification;

  if v_notification.reservation_token <> v_token then
    return jsonb_build_object('status', 'skipped');
  end if;

  return jsonb_build_object(
    'status', 'reserved',
    'notification_id', v_notification.id,
    'subscription_id', v_notification.subscription_id,
    'telegram_id', v_notification.telegram_id,
    'type', v_notification.type,
    'period_end', v_notification.period_end,
    'reservation_token', v_token
  );
end;
$$;

create or replace function cleanup_deleted_account_data(p_supabase_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer;
begin
  if p_supabase_user_id is null then
    raise exception 'supabase user id is required';
  end if;

  -- Confirmed user-owned tables are deleted only when the table and exact user column exist.
  if to_regclass('public.daily_focus') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_focus' and column_name = 'user_id'
  ) then
    delete from daily_focus where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('daily_focus', v_deleted);
  end if;

  if to_regclass('public.daily_reviews') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_reviews' and column_name = 'user_id'
  ) then
    delete from daily_reviews where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('daily_reviews', v_deleted);
  end if;

  if to_regclass('public.cigarette_logs') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cigarette_logs' and column_name = 'user_id'
  ) then
    delete from cigarette_logs where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('cigarette_logs', v_deleted);
  end if;

  if to_regclass('public.daily_statuses') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_statuses' and column_name = 'user_id'
  ) then
    delete from daily_statuses where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('daily_statuses', v_deleted);
  end if;

  if to_regclass('public.daily_notes') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'daily_notes' and column_name = 'user_id'
  ) then
    delete from daily_notes where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('daily_notes', v_deleted);
  end if;

  if to_regclass('public.money_goals') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'money_goals' and column_name = 'user_id'
  ) then
    delete from money_goals where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('money_goals', v_deleted);
  end if;

  if to_regclass('public.bankrolls') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bankrolls' and column_name = 'user_id'
  ) then
    delete from bankrolls where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('bankrolls', v_deleted);
  end if;

  if to_regclass('public.incomes') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'incomes' and column_name = 'user_id'
  ) then
    delete from incomes where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('incomes', v_deleted);
  end if;

  if to_regclass('public.tasks') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'user_id'
  ) then
    delete from tasks where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('tasks', v_deleted);
  end if;

  if to_regclass('public.quest_templates') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quest_templates' and column_name = 'user_id'
  ) then
    delete from quest_templates where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('quest_templates', v_deleted);
  end if;

  if to_regclass('public.player_profile') is not null and exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_profile' and column_name = 'user_id'
  ) then
    delete from player_profile where user_id = p_supabase_user_id;
    get diagnostics v_deleted = row_count;
    v_counts := v_counts || jsonb_build_object('player_profile', v_deleted);
  end if;

  return jsonb_build_object('status', 'success', 'deleted_tables', v_counts);
end;
$$;

revoke all on function try_acquire_subscription_scheduler_lock() from public, anon, authenticated;
revoke all on function release_subscription_scheduler_lock() from public, anon, authenticated;
revoke all on function reserve_subscription_notification(uuid, text, text, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function cleanup_deleted_account_data(uuid) from public, anon, authenticated;
grant execute on function try_acquire_subscription_scheduler_lock() to service_role;
grant execute on function release_subscription_scheduler_lock() to service_role;
grant execute on function reserve_subscription_notification(uuid, text, text, timestamptz, timestamptz, integer) to service_role;
grant execute on function cleanup_deleted_account_data(uuid) to service_role;
