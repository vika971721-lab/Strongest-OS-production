-- Stage 5 gift coupon atomic redemption.
-- Safe migration: does not delete data, does not rename columns, and does not drop/truncate objects.

-- Diagnostics to run before relying on the unique index:
select code, count(*)
from access_coupons
group by code
having count(*) > 1;

create unique index if not exists access_coupons_code_uidx
  on access_coupons (code);

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
  v_coupon access_coupons%rowtype;
  v_subscription subscriptions%rowtype;
  v_base timestamptz;
  v_new_expires timestamptz;
begin
  select * into v_coupon
  from access_coupons
  where code = upper(trim(p_code))
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_coupon.status = 'redeemed' then
    return jsonb_build_object(
      'status', 'already_redeemed',
      'coupon_id', v_coupon.id,
      'duration_days', v_coupon.duration_days,
      'redeemed_by_telegram_id', v_coupon.redeemed_by_telegram_id
    );
  end if;

  if v_coupon.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'coupon_id', v_coupon.id);
  end if;

  if v_coupon.status = 'expired' or (v_coupon.status = 'issued' and v_coupon.expires_at is not null and v_coupon.expires_at <= p_now) then
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

  select * into v_subscription
  from subscriptions
  where telegram_id = p_telegram_id
    and supabase_user_id = p_supabase_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'subscription_not_found', 'coupon_id', v_coupon.id);
  end if;

  if v_subscription.status = 'banned' then
    return jsonb_build_object('status', 'banned', 'coupon_id', v_coupon.id);
  end if;

  if v_subscription.status = 'deleted' then
    return jsonb_build_object('status', 'deleted', 'coupon_id', v_coupon.id);
  end if;

  v_base := coalesce(greatest(v_subscription.expires_at, p_now), p_now);
  v_new_expires := v_base + make_interval(days => v_coupon.duration_days);

  update subscriptions
  set status = 'active',
      expires_at = v_new_expires,
      current_period_end = v_new_expires,
      expired_at = null,
      delete_after = null,
      marked_for_deletion_at = null,
      updated_at = p_now
  where id = v_subscription.id;

  update access_coupons
  set status = 'redeemed',
      redeemed_by_user_id = p_supabase_user_id,
      redeemed_by_telegram_id = p_telegram_id,
      redeemed_at = p_now,
      updated_at = p_now
  where id = v_coupon.id
    and status = 'issued';

  if not found then
    return jsonb_build_object('status', 'temporary_error', 'coupon_id', v_coupon.id);
  end if;

  return jsonb_build_object(
    'status', 'success',
    'coupon_id', v_coupon.id,
    'duration_days', v_coupon.duration_days,
    'expires_at', v_new_expires
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
