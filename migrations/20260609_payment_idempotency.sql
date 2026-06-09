-- Stage 4 Telegram Stars payment idempotency safeguards.
-- Safe migration: it does not delete data and surfaces duplicates before UNIQUE constraints are added.

-- Diagnostics to run before applying the indexes below:
select order_id, count(*)
from payment_orders
group by order_id
having count(*) > 1;

select provider_invoice_payload, count(*)
from payment_orders
group by provider_invoice_payload
having count(*) > 1;

select provider_event_id, count(*)
from payment_events
group by provider_event_id
having count(*) > 1;

select provider_payment_id, count(*)
from payment_orders
where provider_payment_id is not null
group by provider_payment_id
having count(*) > 1;

create unique index if not exists payment_orders_order_id_uidx
  on payment_orders (order_id);

create unique index if not exists payment_orders_provider_invoice_payload_uidx
  on payment_orders (provider_invoice_payload);

create unique index if not exists payment_events_provider_event_id_uidx
  on payment_events (provider_event_id);

create unique index if not exists payment_orders_provider_payment_id_uidx
  on payment_orders (provider_payment_id)
  where provider_payment_id is not null;

-- Optional RPC/transaction helper for production Supabase.
-- The application is written to be idempotent without fake payments, but production should apply
-- an atomic function that extends subscriptions and marks payment_events.processed_at in one tx.
create or replace function process_telegram_stars_subscription_payment(
  p_provider_event_id text,
  p_telegram_id text,
  p_supabase_user_id uuid,
  p_plan text,
  p_period_days integer,
  p_now timestamptz default now()
)
returns table (expires_at timestamptz, applied boolean)
language plpgsql
security definer
as $$
declare
  v_current_expires timestamptz;
  v_new_expires timestamptz;
begin
  if p_period_days < 1 then
    raise exception 'period_days must be positive';
  end if;

  update payment_events
  set processed_at = p_now
  where provider_event_id = p_provider_event_id
    and processed_at is null;

  if not found then
    select s.expires_at into v_current_expires
    from subscriptions s
    where s.telegram_id = p_telegram_id
    limit 1;
    return query select v_current_expires, false;
    return;
  end if;

  select s.expires_at into v_current_expires
  from subscriptions s
  where s.telegram_id = p_telegram_id
  for update;

  v_new_expires := coalesce(greatest(v_current_expires, p_now), p_now)
    + make_interval(days => p_period_days);

  update subscriptions
  set status = 'active',
      expires_at = v_new_expires,
      current_period_end = v_new_expires,
      last_payment_at = p_now,
      first_payment_at = coalesce(first_payment_at, p_now),
      trial_used = true,
      expired_at = null,
      delete_after = null,
      marked_for_deletion_at = null,
      plan = p_plan
  where telegram_id = p_telegram_id
    and supabase_user_id = p_supabase_user_id;

  return query select v_new_expires, true;
end;
$$;
