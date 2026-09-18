-- DRIGHT finance/security authority follow-up:
-- one-time PIN authorizations, atomic withdrawal authorization, safe wallet reads,
-- and recovery-code-bound PIN reset.

begin;

-- ---------------------------------------------------------------------------
-- One-time transaction authorizations minted only after a successful PIN check.
-- Browser clients never get write/read access to this table.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  context text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists payment_authorizations_user_context_idx
  on public.payment_authorizations(user_id, context, expires_at desc);

alter table public.payment_authorizations enable row level security;
revoke all on table public.payment_authorizations from public, anon, authenticated;
grant all on table public.payment_authorizations to service_role;

-- ---------------------------------------------------------------------------
-- PIN verification now mints a short-lived, one-time authorization token.
-- ---------------------------------------------------------------------------
create or replace function public.verify_payment_pin(
  p_user_id uuid,
  p_pin_hash text,
  p_context text default 'transaction'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sec record;
  v_matched boolean;
  v_context text := coalesce(nullif(trim(p_context), ''), 'transaction');
  v_authorization_token text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;

  select * into v_sec
  from public.payment_security
  where user_id = p_user_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'PIN not set');
  end if;

  if coalesce((v_sec.auth_rules->>'force_reset_required')::boolean, false) then
    return jsonb_build_object('success', false, 'error', 'PIN reset required');
  end if;

  if v_sec.is_locked and (v_sec.locked_until is null or v_sec.locked_until > now()) then
    insert into public.payment_pin_attempts(user_id, success, context)
    values (p_user_id, false, 'locked_out');
    return jsonb_build_object('success', false, 'error', 'PIN is locked', 'locked_until', v_sec.locked_until);
  end if;

  if v_sec.is_locked and v_sec.locked_until is not null and v_sec.locked_until <= now() then
    update public.payment_security
    set is_locked = false, failed_attempts = 0, locked_until = null, updated_at = now()
    where user_id = p_user_id;
    v_sec.is_locked := false;
    v_sec.failed_attempts := 0;
  end if;

  v_matched := (v_sec.pin_hash = p_pin_hash);

  insert into public.payment_pin_attempts(user_id, success, context)
  values (p_user_id, v_matched, v_context);

  if v_matched then
    update public.payment_security
    set failed_attempts = 0, updated_at = now()
    where user_id = p_user_id;

    delete from public.payment_authorizations
    where user_id = p_user_id
      and (used_at is not null or expires_at <= now());

    v_authorization_token := encode(gen_random_bytes(32), 'hex');

    insert into public.payment_authorizations(user_id, context, token_hash, expires_at)
    values (
      p_user_id,
      v_context,
      encode(digest(v_authorization_token, 'sha256'), 'hex'),
      now() + interval '5 minutes'
    );

    insert into public.payment_security_logs(user_id, event_type, description)
    values (p_user_id, 'pin_verified', 'PIN verified for ' || v_context);

    return jsonb_build_object(
      'success', true,
      'authorization_token', v_authorization_token,
      'expires_in_seconds', 300
    );
  end if;

  update public.payment_security
  set failed_attempts = coalesce(failed_attempts, 0) + 1, updated_at = now()
  where user_id = p_user_id;

  v_sec.failed_attempts := coalesce(v_sec.failed_attempts, 0) + 1;

  if v_sec.failed_attempts >= 10 then
    update public.payment_security
    set is_locked = true,
        locked_until = now() + interval '24 hours',
        updated_at = now()
    where user_id = p_user_id;

    insert into public.payment_security_logs(user_id, event_type, description)
    values (p_user_id, 'pin_locked', 'PIN locked for 24 hours after failed attempts');

    return jsonb_build_object(
      'success', false,
      'error', 'PIN locked for 24 hours',
      'locked_until', now() + interval '24 hours'
    );
  elsif v_sec.failed_attempts >= 5 then
    update public.payment_security
    set is_locked = true,
        locked_until = now() + interval '15 minutes',
        updated_at = now()
    where user_id = p_user_id;

    insert into public.payment_security_logs(user_id, event_type, description)
    values (p_user_id, 'pin_locked', 'PIN locked for 15 minutes after failed attempts');

    return jsonb_build_object(
      'success', false,
      'error', 'PIN locked for 15 minutes',
      'locked_until', now() + interval '15 minutes'
    );
  end if;

  return jsonb_build_object(
    'success', false,
    'error', 'Incorrect PIN',
    'attempts_remaining', greatest(0, 5 - v_sec.failed_attempts)
  );
end;
$$;

revoke all on function public.verify_payment_pin(uuid,text,text) from public, anon;
grant execute on function public.verify_payment_pin(uuid,text,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Withdrawal authorization must be consumed in the same authoritative flow.
-- The old browser boolean overload is no longer executable by authenticated.
-- ---------------------------------------------------------------------------
revoke all on function public.create_withdrawal_request(uuid,numeric,uuid,boolean) from public, anon, authenticated;
grant execute on function public.create_withdrawal_request(uuid,numeric,uuid,boolean) to service_role;

create or replace function public.create_withdrawal_request(
  p_user_id uuid,
  p_amount numeric,
  p_bank_account_id uuid,
  p_authorization_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet public.cc_wallets%rowtype;
  v_bank_account public.bank_accounts%rowtype;
  v_auth public.payment_authorizations%rowtype;
  v_withdrawal_id uuid := gen_random_uuid();
  v_reference text;
  v_result jsonb;
  v_after numeric;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized: can only create withdrawals for your own account';
  end if;

  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Withdrawal amount must be greater than zero');
  end if;

  if p_amount < 100 then
    return jsonb_build_object('success', false, 'error', 'Minimum withdrawal amount is 100');
  end if;

  if p_authorization_token is null or length(p_authorization_token) < 32 then
    return jsonb_build_object('success', false, 'error', 'Fresh PIN authorization required');
  end if;

  select * into v_bank_account
  from public.bank_accounts
  where id = p_bank_account_id and user_id = p_user_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid or unowned bank account');
  end if;

  select * into v_wallet
  from public.cc_wallets
  where user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Wallet not found');
  end if;

  if v_wallet.is_frozen then
    return jsonb_build_object('success', false, 'error', 'Account is frozen. Contact support.');
  end if;

  if coalesce(v_wallet.balance, 0) < p_amount then
    return jsonb_build_object('success', false, 'error', 'Insufficient balance');
  end if;

  if exists (
    select 1
    from public.withdrawal_requests
    where user_id = p_user_id
      and status in ('pending', 'approved')
      and created_at > now() - interval '5 minutes'
  ) then
    return jsonb_build_object('success', false, 'error', 'You have a pending withdrawal request. Please wait for it to be processed.');
  end if;

  select * into v_auth
  from public.payment_authorizations
  where user_id = p_user_id
    and context = 'withdrawal'
    and token_hash = encode(digest(p_authorization_token, 'sha256'), 'hex')
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'PIN authorization expired or already used');
  end if;

  v_reference := 'WDL-' || upper(substring(encode(gen_random_bytes(8), 'hex') from 1 for 12));

  v_result := public.process_wallet_transaction(
    p_user_id,
    v_wallet.id,
    'debit',
    p_amount,
    'Withdrawal request: ' || v_reference,
    'withdrawal',
    v_withdrawal_id,
    jsonb_build_object(
      'withdrawal_id', v_withdrawal_id,
      'bank_account_id', p_bank_account_id,
      'reference', v_reference
    ),
    'balance'
  );

  if coalesce((v_result->>'success')::boolean, false) is not true then
    return v_result;
  end if;

  update public.payment_authorizations
  set used_at = now()
  where id = v_auth.id;

  v_after := (v_result->>'balance_after')::numeric;

  update public.users
  set balance = v_after,
      available_balance = v_after,
      updated_at = now()
  where id = p_user_id;

  insert into public.withdrawal_requests (
    id,
    user_id,
    amount,
    payment_method,
    account_details,
    status,
    pin_verified,
    bank_account_id,
    withdrawal_method,
    reference
  )
  values (
    v_withdrawal_id,
    p_user_id,
    p_amount,
    'bank_transfer',
    v_bank_account.bank_name || ' - ' || v_bank_account.account_number || ' (' || v_bank_account.account_name || ')',
    'pending',
    true,
    p_bank_account_id,
    'nigerian_bank',
    v_reference
  );

  insert into public.payment_security_logs(user_id, event_type, description)
  values (p_user_id, 'withdrawal_authorized', 'PIN-authorized withdrawal request ' || v_reference);

  return jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'reference', v_reference,
    'new_balance', v_after
  );
end;
$$;

revoke all on function public.create_withdrawal_request(uuid,numeric,uuid,text) from public, anon;
grant execute on function public.create_withdrawal_request(uuid,numeric,uuid,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Wallet read RPCs: owner or explicitly authorized finance/admin reviewer only.
-- ---------------------------------------------------------------------------
create or replace function public.can_read_wallet_for_user(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (
       auth.uid() = p_user_id
       or coalesce(public.is_super_admin(), false)
       or coalesce(public.has_dright_permission('payments','view'), false)
       or coalesce(public.has_dright_permission('payments','manage'), false)
       or coalesce(public.has_rbac_permission('wallets','view'), false)
       or coalesce(public.has_rbac_permission('wallets','manage'), false)
     );
$$;

revoke all on function public.can_read_wallet_for_user(uuid) from public, anon;
grant execute on function public.can_read_wallet_for_user(uuid) to authenticated, service_role;

create or replace function public.get_wallet_balances(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if public.can_read_wallet_for_user(p_user_id) is not true then
    raise exception 'Unauthorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'wallet_id', id,
    'balance', balance,
    'pending_balance', pending_balance,
    'locked_balance', locked_balance,
    'escrow_balance', escrow_balance,
    'referral_balance', referral_balance,
    'affiliate_balance', affiliate_balance,
    'creator_balance', creator_balance,
    'advertiser_budget', advertiser_budget,
    'seller_earnings', seller_earnings,
    'currency', currency,
    'is_frozen', is_frozen,
    'frozen_reason', frozen_reason
  )), '[]'::jsonb)
  into v_result
  from public.cc_wallets
  where user_id = p_user_id;

  return v_result;
end;
$$;

create or replace function public.get_wallet_summary(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if public.can_read_wallet_for_user(p_user_id) is not true then
    raise exception 'Unauthorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'wallet_id', id,
    'balance', balance,
    'pending_balance', pending_balance,
    'locked_balance', locked_balance,
    'escrow_balance', escrow_balance,
    'referral_balance', referral_balance,
    'affiliate_balance', affiliate_balance,
    'creator_balance', creator_balance,
    'advertiser_budget', advertiser_budget,
    'seller_earnings', seller_earnings,
    'currency', currency,
    'is_frozen', is_frozen,
    'frozen_reason', frozen_reason,
    'total_deposited', total_deposited,
    'total_withdrawn', total_withdrawn,
    'total_paid_out', total_paid_out
  )), '[]'::jsonb)
  into v_result
  from public.cc_wallets
  where user_id = p_user_id;

  return v_result;
end;
$$;

create or replace function public.get_wallet_transactions(
  p_user_id uuid default auth.uid(),
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if public.can_read_wallet_for_user(p_user_id) is not true then
    raise exception 'Unauthorized';
  end if;

  select coalesce(jsonb_agg(row_to_json(t.*) order by t.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select id, wallet_id, type, amount, balance_after, description, metadata, created_at
    from public.cc_transactions
    where user_id = p_user_id
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit,20), 100))
    offset greatest(coalesce(p_offset,0), 0)
  ) t;

  return v_result;
end;
$$;

revoke all on function public.get_wallet_balances(uuid) from public, anon;
revoke all on function public.get_wallet_summary(uuid) from public, anon;
revoke all on function public.get_wallet_transactions(uuid,integer,integer) from public, anon;
grant execute on function public.get_wallet_balances(uuid) to authenticated, service_role;
grant execute on function public.get_wallet_summary(uuid) to authenticated, service_role;
grant execute on function public.get_wallet_transactions(uuid,integer,integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Recovery codes are owner-only to generate/read. PIN reset consumes a code
-- atomically; legacy browser-visible reset-token endpoints are disabled.
-- ---------------------------------------------------------------------------
revoke all on table public.payment_recovery_codes from public, anon, authenticated;
grant all on table public.payment_recovery_codes to service_role;

create or replace function public.generate_recovery_codes(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codes text[] := array[]::text[];
  v_code text;
  v_hash text;
  i integer;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from public.payment_security
    where user_id = p_user_id and is_active = true
  ) then
    return jsonb_build_object('success', false, 'error', 'Set a payment PIN before generating recovery codes');
  end if;

  delete from public.payment_recovery_codes where user_id = p_user_id;

  for i in 1..10 loop
    v_code := upper(
      substring(encode(gen_random_bytes(5), 'hex') from 1 for 5)
      || '-' ||
      substring(encode(gen_random_bytes(5), 'hex') from 1 for 5)
    );
    v_hash := encode(digest(v_code || p_user_id::text || 'dright_rc_salt', 'sha256'), 'hex');
    v_codes := v_codes || v_code;

    insert into public.payment_recovery_codes(user_id, code_hash)
    values (p_user_id, v_hash);
  end loop;

  insert into public.payment_security_logs(user_id, event_type, description)
  values (p_user_id, 'recovery_codes_generated', '10 recovery codes generated');

  return jsonb_build_object('success', true, 'codes', to_jsonb(v_codes));
end;
$$;

create or replace function public.get_recovery_codes_status(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'remaining', count(*) filter (where used_at is null),
    'used', count(*) filter (where used_at is not null),
    'last_generated', min(created_at)
  )
  into v_result
  from public.payment_recovery_codes
  where user_id = p_user_id;

  return v_result;
end;
$$;

create or replace function public.reset_payment_pin_with_recovery_code(
  p_user_id uuid,
  p_code text,
  p_new_pin_hash text,
  p_pin_length integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_rec public.payment_recovery_codes%rowtype;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;

  if nullif(trim(p_code), '') is null then
    return jsonb_build_object('success', false, 'error', 'Recovery code is required');
  end if;

  if p_new_pin_hash is null or length(p_new_pin_hash) < 32 or p_pin_length < 4 or p_pin_length > 8 then
    return jsonb_build_object('success', false, 'error', 'Invalid PIN payload');
  end if;

  v_hash := encode(
    digest(upper(trim(p_code)) || p_user_id::text || 'dright_rc_salt', 'sha256'),
    'hex'
  );

  select * into v_rec
  from public.payment_recovery_codes
  where user_id = p_user_id
    and code_hash = v_hash
    and used_at is null
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid or already used recovery code');
  end if;

  update public.payment_security
  set pin_hash = p_new_pin_hash,
      pin_length = p_pin_length,
      is_locked = false,
      failed_attempts = 0,
      locked_until = null,
      last_pin_change = now(),
      updated_at = now(),
      auth_rules = coalesce(auth_rules, '{}'::jsonb) - 'force_reset_required'
  where user_id = p_user_id and is_active = true;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Payment security record not found');
  end if;

  delete from public.payment_recovery_codes where user_id = p_user_id;
  delete from public.payment_authorizations where user_id = p_user_id;

  insert into public.payment_security_logs(user_id, event_type, description)
  values (p_user_id, 'pin_recovered', 'Payment PIN reset with a one-time recovery code');

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.generate_recovery_codes(uuid) from public, anon;
revoke all on function public.get_recovery_codes_status(uuid) from public, anon;
revoke all on function public.reset_payment_pin_with_recovery_code(uuid,text,text,integer) from public, anon;
grant execute on function public.generate_recovery_codes(uuid) to authenticated, service_role;
grant execute on function public.get_recovery_codes_status(uuid) to authenticated, service_role;
grant execute on function public.reset_payment_pin_with_recovery_code(uuid,text,text,integer) to authenticated, service_role;

-- Legacy reset/token functions must not be browser-callable.
revoke all on function public.reset_payment_pin(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.create_pin_recovery_token(uuid) from public, anon, authenticated;
revoke all on function public.verify_pin_recovery_token(text) from public, anon, authenticated;
revoke all on function public.verify_recovery_code(uuid,text) from public, anon, authenticated;
grant execute on function public.reset_payment_pin(uuid,text,integer) to service_role;
grant execute on function public.create_pin_recovery_token(uuid) to service_role;
grant execute on function public.verify_pin_recovery_token(text) to service_role;
grant execute on function public.verify_recovery_code(uuid,text) to service_role;

commit;
