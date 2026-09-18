-- DRIGHT: follow-up hardening for finance authorization and payment PIN changes.

begin;

-- A PIN may only be initially created through set_payment_pin. Existing PINs
-- must be changed by proving knowledge of the current PIN.
create or replace function public.set_payment_pin(
  p_user_id uuid,
  p_pin_hash text,
  p_pin_length integer default 4
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;
  if p_pin_hash is null or length(p_pin_hash) < 32 or p_pin_length < 4 or p_pin_length > 8 then
    raise exception 'Invalid PIN payload';
  end if;
  if exists (select 1 from public.payment_security where user_id = p_user_id) then
    raise exception 'Payment PIN already set; use change PIN';
  end if;

  insert into public.payment_security(
    user_id, pin_hash, pin_length, last_pin_change, updated_at,
    auth_rules, is_locked, failed_attempts, locked_until
  ) values (
    p_user_id, p_pin_hash, p_pin_length, now(), now(),
    '{}'::jsonb, false, 0, null
  );

  insert into public.payment_security_logs(user_id,event_type,description)
  values (p_user_id,'pin_set','Payment PIN set');
end;
$$;

create or replace function public.change_payment_pin(
  p_user_id uuid,
  p_current_pin_hash text,
  p_new_pin_hash text,
  p_pin_length integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sec public.payment_security%rowtype;
  v_force_reset boolean;
  v_failed integer;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;
  if p_current_pin_hash is null or length(p_current_pin_hash) < 32
     or p_new_pin_hash is null or length(p_new_pin_hash) < 32
     or p_pin_length < 4 or p_pin_length > 8 then
    raise exception 'Invalid PIN payload';
  end if;

  select * into v_sec
  from public.payment_security
  where user_id = p_user_id and is_active = true
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','PIN not set');
  end if;

  v_force_reset := coalesce((v_sec.auth_rules->>'force_reset_required')::boolean,false);

  if v_sec.is_locked
     and not v_force_reset
     and (v_sec.locked_until is null or v_sec.locked_until > now()) then
    return jsonb_build_object('success',false,'error','PIN is locked','locked_until',v_sec.locked_until);
  end if;

  if v_sec.pin_hash is distinct from p_current_pin_hash then
    v_failed := coalesce(v_sec.failed_attempts,0) + 1;
    update public.payment_security
    set failed_attempts = v_failed,
        is_locked = case when v_failed >= 5 then true else is_locked end,
        locked_until = case
          when v_failed >= 10 then now() + interval '24 hours'
          when v_failed >= 5 then now() + interval '15 minutes'
          else locked_until
        end,
        updated_at = now()
    where user_id = p_user_id;

    insert into public.payment_pin_attempts(user_id,success,context)
    values (p_user_id,false,'pin_change');

    return jsonb_build_object(
      'success',false,
      'error',case when v_failed >= 5 then 'PIN is locked after repeated failed attempts' else 'Incorrect current PIN' end,
      'attempts_remaining',greatest(0,5-v_failed)
    );
  end if;

  update public.payment_security
  set pin_hash = p_new_pin_hash,
      pin_length = p_pin_length,
      is_locked = false,
      failed_attempts = 0,
      locked_until = null,
      last_pin_change = now(),
      updated_at = now(),
      auth_rules = coalesce(auth_rules,'{}'::jsonb) - 'force_reset_required'
  where user_id = p_user_id;

  insert into public.payment_pin_attempts(user_id,success,context)
  values (p_user_id,true,'pin_change');
  insert into public.payment_security_logs(user_id,event_type,description)
  values (p_user_id,'pin_changed','Payment PIN changed');

  return jsonb_build_object('success',true);
end;
$$;

revoke all on function public.set_payment_pin(uuid,text,integer) from public, anon;
revoke all on function public.change_payment_pin(uuid,text,text,integer) from public, anon;
grant execute on function public.set_payment_pin(uuid,text,integer) to authenticated, service_role;
grant execute on function public.change_payment_pin(uuid,text,text,integer) to authenticated, service_role;

-- The legacy reset RPC accepted only a new hash and therefore did not prove
-- knowledge of the current PIN or a recovery credential. Keep it server-only.
revoke all on function public.reset_payment_pin(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.reset_payment_pin(uuid,text,integer) to service_role;

-- Correct authorization for withdrawal actions. The earlier expression used
-- mutually-exclusive AND branches, which could evaluate to false before the
-- permission requirement was enforced. This version explicitly grants access
-- only through a recognized management permission for the requested action.
create or replace function public.admin_manage_withdrawal(
  p_withdrawal_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_req public.withdrawal_requests%rowtype;
  v_wallet_id uuid;
  v_predebited boolean;
  v_result jsonb;
  v_after numeric;
  v_authorized boolean := false;
begin
  if v_admin is null then
    raise exception 'Unauthorized';
  end if;
  if p_action not in ('approve','reject','paid') then
    raise exception 'Invalid withdrawal action';
  end if;

  v_authorized :=
    public.is_super_admin() is true
    or public.has_dright_permission('payments','manage') is true
    or public.has_rbac_permission('withdrawals','manage') is true
    or (p_action in ('approve','paid') and public.has_dright_permission('finance','approve_withdrawals') is true)
    or (p_action = 'reject' and public.has_dright_permission('finance','reject_withdrawals') is true);

  if v_authorized is not true then
    raise exception 'Unauthorized: withdrawal management permission required';
  end if;

  select * into v_req
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if not found then raise exception 'Withdrawal not found'; end if;
  if v_req.amount <= 0 then raise exception 'Invalid withdrawal amount'; end if;

  v_predebited := coalesce(v_req.pin_verified,false)
                  and v_req.bank_account_id is not null
                  and v_req.reference is not null;

  if p_action = 'approve' then
    if v_req.status = 'approved' then
      return jsonb_build_object('success',true,'already_processed',true);
    end if;
    if v_req.status <> 'pending' then
      raise exception 'Only pending withdrawals can be approved';
    end if;
    update public.withdrawal_requests
    set status='approved', processed_by=v_admin, processed_at=now()
    where id=v_req.id;

  elsif p_action = 'reject' then
    if v_req.status = 'rejected' then
      return jsonb_build_object('success',true,'already_processed',true);
    end if;
    if v_req.status not in ('pending','approved') then
      raise exception 'This withdrawal can no longer be rejected';
    end if;
    if nullif(trim(p_reason),'') is null then
      raise exception 'Rejection reason is required';
    end if;

    if v_predebited then
      select id into v_wallet_id
      from public.cc_wallets
      where user_id = v_req.user_id;
      if v_wallet_id is null then
        raise exception 'Wallet not found for pre-debited withdrawal';
      end if;

      v_result := public.process_wallet_transaction(
        v_req.user_id,
        v_wallet_id,
        'credit',
        v_req.amount,
        'Refund rejected withdrawal '||coalesce(v_req.reference,v_req.id::text),
        'withdrawal',
        v_req.id,
        jsonb_build_object('withdrawal_id',v_req.id,'rejected_by',v_admin,'refund',true),
        'balance'
      );
      if coalesce((v_result->>'success')::boolean,false) is not true then
        raise exception '%',coalesce(v_result->>'error','Withdrawal refund failed');
      end if;
      v_after := (v_result->>'balance_after')::numeric;
      update public.users
      set balance=v_after, available_balance=v_after
      where id=v_req.user_id;
    end if;

    update public.withdrawal_requests
    set status='rejected', admin_notes=trim(p_reason), processed_by=v_admin, processed_at=now()
    where id=v_req.id;

  else
    if v_req.status = 'paid' then
      return jsonb_build_object('success',true,'already_processed',true);
    end if;
    if v_req.status <> 'approved' then
      raise exception 'Withdrawal must be approved before payment';
    end if;

    select id into v_wallet_id
    from public.cc_wallets
    where user_id = v_req.user_id;
    if v_wallet_id is null then raise exception 'Wallet not found'; end if;

    if not v_predebited then
      v_result := public.process_wallet_transaction(
        v_req.user_id,
        v_wallet_id,
        'debit',
        v_req.amount,
        'Paid legacy withdrawal '||coalesce(v_req.reference,v_req.id::text),
        'withdrawal',
        v_req.id,
        jsonb_build_object('withdrawal_id',v_req.id,'paid_by',v_admin,'legacy_debit',true),
        'balance'
      );
      if coalesce((v_result->>'success')::boolean,false) is not true then
        raise exception '%',coalesce(v_result->>'error','Withdrawal debit failed');
      end if;
      v_after := (v_result->>'balance_after')::numeric;
      update public.users
      set balance=v_after, available_balance=v_after
      where id=v_req.user_id;
    end if;

    update public.cc_wallets
    set total_withdrawn=coalesce(total_withdrawn,0)+v_req.amount,
        updated_at=now()
    where id=v_wallet_id;

    update public.withdrawal_requests
    set status='paid', processed_by=v_admin, processed_at=now()
    where id=v_req.id;
  end if;

  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values (
    v_admin,
    'withdrawal_'||p_action,
    v_req.id,
    'withdrawal_request',
    jsonb_build_object(
      'withdrawal_id',v_req.id,
      'amount',v_req.amount,
      'predebited',v_predebited,
      'reason',p_reason
    )
  );

  return jsonb_build_object('success',true,'action',p_action,'predebited',v_predebited);
end;
$$;

revoke all on function public.admin_manage_withdrawal(uuid,text,text) from public, anon;
grant execute on function public.admin_manage_withdrawal(uuid,text,text) to authenticated, service_role;

commit;
