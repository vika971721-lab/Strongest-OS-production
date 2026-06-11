-- Fix redeem_access_coupon to handle users without a pre-existing subscription row.
--
-- Root-cause: original function queried subscriptions with
--   WHERE telegram_id = p_telegram_id AND supabase_user_id = p_supabase_user_id
-- New users who have never paid have no subscription row at all, so the original
-- function returned 'subscription_not_found' and the coupon activation failed.
--
-- Fix: query subscriptions by telegram_id only; INSERT a new subscription row
-- when none exists so that coupon activation works for both new and existing users.
--
-- ⚠️  Must be run manually in Supabase SQL Editor.

create or replace function redeem_access_coupon(
  p_code text,
  p_telegram_id text,
  p_supabase_user_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon      access_coupons%rowtype;
  v_subscription subscriptions%rowtype;
  v_found_sub   boolean := false;
  v_base        timestamptz;
  v_new_expires timestamptz;
begin
  -- Lock coupon row to prevent concurrent double-redemption
  select * into v_coupon
  from access_coupons
  where code = upper(trim(p_code))
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_coupon.status = 'redeemed' then
    return jsonb_build_object(
      'status',                   'already_redeemed',
      'coupon_id',                v_coupon.id,
      'duration_days',            v_coupon.duration_days,
      'redeemed_by_telegram_id',  v_coupon.redeemed_by_telegram_id
    );
  end if;

  if v_coupon.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'coupon_id', v_coupon.id);
  end if;

  if v_coupon.status = 'expired'
    or (
      v_coupon.status = 'issued'
      and v_coupon.expires_at is not null
      and v_coupon.expires_at <= p_now
    )
  then
    update access_coupons
    set status = 'expired', updated_at = p_now
    where id = v_coupon.id and status = 'issued';
    return jsonb_build_object('status', 'expired', 'coupon_id', v_coupon.id);
  end if;

  if v_coupon.status <> 'issued' then
    return jsonb_build_object('status', 'temporary_error', 'coupon_id', v_coupon.id);
  end if;

  if v_coupon.duration_days not in (30, 60, 180) then
    return jsonb_build_object('status', 'invalid_duration', 'coupon_id', v_coupon.id);
  end if;

  -- Look up subscription by telegram_id only.
  -- supabase_user_id is NOT used in the filter: a brand-new user who has never
  -- paid will have no subscription row yet, and we create one below.
  select * into v_subscription
  from subscriptions
  where telegram_id = p_telegram_id
  for update;

  v_found_sub := found;

  -- Reject banned/deleted accounts
  if v_found_sub then
    if v_subscription.status = 'banned' then
      return jsonb_build_object('status', 'banned', 'coupon_id', v_coupon.id);
    end if;
    if v_subscription.status = 'deleted' then
      return jsonb_build_object('status', 'deleted', 'coupon_id', v_coupon.id);
    end if;
  end if;

  -- Calculate new expiry: stack on top of existing active period, otherwise start from now
  if v_found_sub
    and v_subscription.expires_at is not null
    and v_subscription.expires_at > p_now
  then
    v_base := v_subscription.expires_at;
  else
    v_base := p_now;
  end if;
  v_new_expires := v_base + make_interval(days => v_coupon.duration_days);

  -- Create or update subscription
  if v_found_sub then
    update subscriptions
    set status                  = 'active',
        supabase_user_id        = p_supabase_user_id,
        expires_at              = v_new_expires,
        current_period_start    = p_now,
        current_period_end      = v_new_expires,
        expired_at              = null,
        delete_after            = null,
        marked_for_deletion_at  = null,
        deleted_at              = null,
        updated_at              = p_now
    where id = v_subscription.id;
  else
    insert into subscriptions (
      telegram_id,
      supabase_user_id,
      status,
      plan,
      trial_used,
      expires_at,
      current_period_start,
      current_period_end,
      created_at,
      updated_at
    ) values (
      p_telegram_id,
      p_supabase_user_id,
      'active',
      'monthly_renewal',
      false,
      v_new_expires,
      p_now,
      v_new_expires,
      p_now,
      p_now
    );
  end if;

  -- Mark coupon redeemed (guard with status = 'issued' to be safe under concurrency)
  update access_coupons
  set status                  = 'redeemed',
      redeemed_by_user_id     = p_supabase_user_id,
      redeemed_by_telegram_id = p_telegram_id,
      redeemed_at             = p_now,
      updated_at              = p_now
  where id = v_coupon.id
    and status = 'issued';

  if not found then
    -- Concurrent transaction slipped in and redeemed it first
    return jsonb_build_object('status', 'temporary_error', 'coupon_id', v_coupon.id);
  end if;

  return jsonb_build_object(
    'status',        'success',
    'coupon_id',     v_coupon.id,
    'duration_days', v_coupon.duration_days,
    'expires_at',    v_new_expires
  );
exception
  when serialization_failure or deadlock_detected or lock_not_available then
    return jsonb_build_object('status', 'temporary_error');
end;
$$;

revoke all on function redeem_access_coupon(text, text, uuid, timestamptz) from public;
revoke all on function redeem_access_coupon(text, text, uuid, timestamptz) from anon;
revoke all on function redeem_access_coupon(text, text, uuid, timestamptz) from authenticated;
grant execute on function redeem_access_coupon(text, text, uuid, timestamptz) to service_role;
