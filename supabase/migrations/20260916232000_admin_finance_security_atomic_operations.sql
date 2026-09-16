-- DRIGHT: make admin finance/security actions authoritative and close direct wallet/PIN bypasses.

begin;

-- ---------------------------------------------------------------------------
-- Wallet creation must not allow a client to choose its own starting balances.
-- ---------------------------------------------------------------------------
drop policy if exists ins_own_cc_w on public.cc_wallets;
drop policy if exists upd_own_cc_w on public.cc_wallets;

create or replace function public.get_or_create_wallet(p_user_id uuid default auth.uid())
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_wallet_id uuid;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized: can only create your own wallet';
  end if;

  select id into v_wallet_id
  from public.cc_wallets
  where user_id = p_user_id;

  if v_wallet_id is null then
    insert into public.cc_wallets(user_id)
    values (p_user_id)
    on conflict (user_id) do nothing
    returning id into v_wallet_id;

    if v_wallet_id is null then
      select id into v_wallet_id from public.cc_wallets where user_id = p_user_id;
    end if;
  end if;

  return v_wallet_id;
end;
$$;

revoke all on function public.get_or_create_wallet(uuid) from public, anon;
grant execute on function public.get_or_create_wallet(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Prevent direct self-service changes to authoritative user/system fields.
-- Regular profile fields remain editable through the existing owner policy.
-- SECURITY DEFINER/server operations run as their function owner, not the
-- authenticated PostgREST role, so legitimate authoritative writes still work.
-- ---------------------------------------------------------------------------
create or replace function public.protect_user_authoritative_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' and auth.uid() = old.id then
    if new.balance is distinct from old.balance
       or new.available_balance is distinct from old.available_balance
       or new.locked_balance is distinct from old.locked_balance
       or new.affiliate_earnings is distinct from old.affiliate_earnings
       or new.is_admin is distinct from old.is_admin
       or new.admin_status is distinct from old.admin_status
       or new.admin_role is distinct from old.admin_role
       or new.rbac_role_id is distinct from old.rbac_role_id
       or new.account_status is distinct from old.account_status
       or new.is_verified is distinct from old.is_verified
       or new.verification_level is distinct from old.verification_level
       or new.verification_status is distinct from old.verification_status
       or new.admin_verification_status is distinct from old.admin_verification_status
       or new.admin_rejection_reason is distinct from old.admin_rejection_reason
       or new.marketer_level is distinct from old.marketer_level
       or new.marketer_status is distinct from old.marketer_status
       or new.advertiser_grade is distinct from old.advertiser_grade
       or new.advertiser_status is distinct from old.advertiser_status
       or new.weekly_sales_count is distinct from old.weekly_sales_count
       or new.total_sales_count is distinct from old.total_sales_count
       or new.account_locks_count is distinct from old.account_locks_count
       or new.referral_code is distinct from old.referral_code
       or new.referred_by is distinct from old.referred_by then
      raise exception 'Protected account fields can only be changed by authoritative DRIGHT operations';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_user_authoritative_fields on public.users;
create trigger trg_protect_user_authoritative_fields
before update on public.users
for each row execute function public.protect_user_authoritative_fields();

-- ---------------------------------------------------------------------------
-- Harden payment PIN APIs against cross-user calls.
-- ---------------------------------------------------------------------------
create or replace function public.set_payment_pin(p_user_id uuid, p_pin_hash text, p_pin_length integer default 4)
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

  insert into public.payment_security(user_id,pin_hash,pin_length,last_pin_change,updated_at,auth_rules,is_locked,failed_attempts,locked_until)
  values (p_user_id,p_pin_hash,p_pin_length,now(),now(),'{}'::jsonb,false,0,null)
  on conflict (user_id) do update
  set pin_hash=excluded.pin_hash,
      pin_length=excluded.pin_length,
      last_pin_change=now(),
      updated_at=now(),
      is_locked=false,
      failed_attempts=0,
      locked_until=null,
      auth_rules=coalesce(public.payment_security.auth_rules,'{}'::jsonb)-'force_reset_required';

  insert into public.payment_security_logs(user_id,event_type,description)
  values (p_user_id,'pin_set','Payment PIN set/updated');
end;
$$;

create or replace function public.reset_payment_pin(p_user_id uuid, p_new_pin_hash text, p_pin_length integer default 4)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;
  if p_new_pin_hash is null or length(p_new_pin_hash) < 32 or p_pin_length < 4 or p_pin_length > 8 then
    raise exception 'Invalid PIN payload';
  end if;

  update public.payment_security
  set pin_hash=p_new_pin_hash,
      pin_length=p_pin_length,
      is_locked=false,
      failed_attempts=0,
      locked_until=null,
      last_pin_change=now(),
      updated_at=now(),
      auth_rules=coalesce(auth_rules,'{}'::jsonb)-'force_reset_required'
  where user_id=p_user_id;
  if not found then raise exception 'Payment security record not found'; end if;

  insert into public.payment_security_logs(user_id,event_type,description)
  values (p_user_id,'pin_reset','Payment PIN reset');
end;
$$;

create or replace function public.verify_payment_pin(p_user_id uuid, p_pin_hash text, p_context text default 'transaction')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sec record;
  v_matched boolean;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'Unauthorized';
  end if;

  select * into v_sec from public.payment_security
  where user_id=p_user_id and is_active=true
  for update;
  if not found then return jsonb_build_object('success',false,'error','PIN not set'); end if;

  if coalesce((v_sec.auth_rules->>'force_reset_required')::boolean,false) then
    return jsonb_build_object('success',false,'error','PIN reset required');
  end if;

  if v_sec.is_locked and (v_sec.locked_until is null or v_sec.locked_until > now()) then
    insert into public.payment_pin_attempts(user_id,success,context) values (p_user_id,false,'locked_out');
    return jsonb_build_object('success',false,'error','PIN is locked','locked_until',v_sec.locked_until);
  end if;

  if v_sec.is_locked and v_sec.locked_until is not null and v_sec.locked_until <= now() then
    update public.payment_security set is_locked=false,failed_attempts=0,updated_at=now() where user_id=p_user_id;
    v_sec.is_locked:=false; v_sec.failed_attempts:=0;
  end if;

  v_matched := (v_sec.pin_hash = p_pin_hash);
  insert into public.payment_pin_attempts(user_id,success,context) values (p_user_id,v_matched,p_context);

  if v_matched then
    update public.payment_security set failed_attempts=0,updated_at=now() where user_id=p_user_id;
    insert into public.payment_security_logs(user_id,event_type,description) values (p_user_id,'pin_verified','PIN verified for '||p_context);
    return jsonb_build_object('success',true);
  end if;

  update public.payment_security set failed_attempts=failed_attempts+1,updated_at=now() where user_id=p_user_id;
  v_sec.failed_attempts:=v_sec.failed_attempts+1;
  if v_sec.failed_attempts >= 10 then
    update public.payment_security set is_locked=true,locked_until=now()+interval '24 hours',updated_at=now() where user_id=p_user_id;
    insert into public.payment_security_logs(user_id,event_type,description) values (p_user_id,'pin_locked','PIN locked for 24 hours after failed attempts');
    return jsonb_build_object('success',false,'error','PIN locked for 24 hours','locked_until',now()+interval '24 hours');
  elsif v_sec.failed_attempts >= 5 then
    update public.payment_security set is_locked=true,locked_until=now()+interval '15 minutes',updated_at=now() where user_id=p_user_id;
    insert into public.payment_security_logs(user_id,event_type,description) values (p_user_id,'pin_locked','PIN locked for 15 minutes after failed attempts');
    return jsonb_build_object('success',false,'error','PIN locked for 15 minutes','locked_until',now()+interval '15 minutes');
  end if;

  return jsonb_build_object('success',false,'error','Incorrect PIN','attempts_remaining',greatest(0,5-v_sec.failed_attempts));
end;
$$;

create or replace function public.get_payment_security_status(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if auth.uid() is distinct from p_user_id
     and public.is_super_admin() is not true
     and public.has_dright_permission('security','view') is not true then
    raise exception 'Unauthorized';
  end if;

  select jsonb_build_object(
    'has_pin',true,'pin_length',pin_length,'is_locked',is_locked,
    'failed_attempts',failed_attempts,'locked_until',locked_until,
    'last_pin_change',last_pin_change,'auth_rules',auth_rules,
    'recovery_email',recovery_email
  ) into v_result
  from public.payment_security where user_id=p_user_id and is_active=true;

  return coalesce(v_result,jsonb_build_object('has_pin',false));
end;
$$;

create or replace function public.update_payment_auth_rules(p_user_id uuid, p_rules jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then raise exception 'Unauthorized'; end if;
  update public.payment_security
  set auth_rules=coalesce(p_rules,'{}'::jsonb),updated_at=now()
  where user_id=p_user_id;
  if not found then raise exception 'Payment security record not found'; end if;
  insert into public.payment_security_logs(user_id,event_type,description)
  values (p_user_id,'auth_rules_updated','Transaction authorization rules updated');
end;
$$;

create or replace function public.create_pin_recovery_token(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_token text;
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then raise exception 'Unauthorized'; end if;
  v_token:=encode(gen_random_bytes(32),'hex');
  insert into public.payment_recovery_tokens(user_id,token,expires_at)
  values (p_user_id,v_token,now()+interval '1 hour');
  insert into public.payment_security_logs(user_id,event_type,description)
  values (p_user_id,'recovery_token_created','PIN recovery token generated');
  return v_token;
end;
$$;

create or replace function public.verify_pin_recovery_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rec record;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  select * into v_rec from public.payment_recovery_tokens
  where token=p_token and user_id=auth.uid() and used_at is null and expires_at>now()
  for update;
  if not found then return jsonb_build_object('success',false,'error','Invalid or expired token'); end if;
  update public.payment_recovery_tokens set used_at=now() where id=v_rec.id;
  insert into public.payment_security_logs(user_id,event_type,description)
  values (v_rec.user_id,'recovery_token_used','PIN recovery token verified');
  return jsonb_build_object('success',true,'user_id',v_rec.user_id);
end;
$$;

-- Users must use the RPCs above rather than directly changing security state.
drop policy if exists update_own_payment_security on public.payment_security;

-- ---------------------------------------------------------------------------
-- Harden existing admin wallet and PIN actions. The authenticated caller is
-- authoritative; a browser-supplied admin id is never trusted.
-- ---------------------------------------------------------------------------
create or replace function public.admin_freeze_wallet(p_admin_id uuid, p_wallet_id uuid, p_freeze boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_admin uuid:=auth.uid(); v_user_id uuid;
begin
  if v_admin is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('payments','manage') is not true
     and public.has_rbac_permission('wallets','manage') is not true then
    raise exception 'Unauthorized: wallet management permission required';
  end if;
  if p_admin_id is not null and p_admin_id is distinct from v_admin then raise exception 'Unauthorized admin id'; end if;

  update public.cc_wallets
  set is_frozen=p_freeze,
      frozen_reason=case when p_freeze then nullif(trim(p_reason),'') else null end,
      frozen_by=case when p_freeze then v_admin else null end,
      frozen_at=case when p_freeze then now() else null end,
      updated_at=now()
  where id=p_wallet_id
  returning user_id into v_user_id;
  if v_user_id is null then raise exception 'Wallet not found'; end if;

  insert into public.payment_security_logs(user_id,event_type,description,performed_by)
  values (v_user_id,case when p_freeze then 'wallet_frozen' else 'wallet_unfrozen' end,
          case when p_freeze then coalesce(nullif(trim(p_reason),''),'Wallet frozen by admin') else 'Wallet unfrozen by admin' end,v_admin);
end;
$$;

create or replace function public.admin_manual_adjustment(p_admin_id uuid, p_user_id uuid, p_wallet_id uuid, p_type text, p_amount numeric, p_description text, p_balance_field text default 'balance')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_admin uuid:=auth.uid(); v_result jsonb; v_after numeric;
begin
  if v_admin is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('payments','manage') is not true
     and public.has_rbac_permission('wallets','manage') is not true then
    raise exception 'Unauthorized: wallet management permission required';
  end if;
  if p_admin_id is not null and p_admin_id is distinct from v_admin then raise exception 'Unauthorized admin id'; end if;
  if p_type not in ('credit','debit') then raise exception 'Invalid adjustment type'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_balance_field not in ('balance','pending_balance','locked_balance','escrow_balance','referral_balance','affiliate_balance','creator_balance','seller_earnings') then raise exception 'Invalid balance field'; end if;
  if nullif(trim(p_description),'') is null then raise exception 'Adjustment reason is required'; end if;

  v_result:=public.process_wallet_transaction(p_user_id,p_wallet_id,p_type,p_amount,p_description,'manual_adjustment',null,
    jsonb_build_object('admin_id',v_admin,'admin_adjustment',true),p_balance_field);
  if coalesce((v_result->>'success')::boolean,false) is not true then raise exception '%',coalesce(v_result->>'error','Adjustment failed'); end if;

  if p_balance_field='balance' then
    v_after:=(v_result->>'balance_after')::numeric;
    update public.users set balance=v_after,available_balance=v_after where id=p_user_id;
  end if;

  insert into public.payment_security_logs(user_id,event_type,description,performed_by)
  values (p_user_id,'admin_adjustment',p_description,v_admin);
  return v_result;
end;
$$;

create or replace function public.unlock_payment_pin(p_user_id uuid, p_admin_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_admin uuid:=auth.uid();
begin
  if v_admin is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('security','manage') is not true
     and public.has_dright_permission('payments','manage') is not true then
    raise exception 'Unauthorized: security management permission required';
  end if;
  if p_admin_id is not null and p_admin_id is distinct from v_admin then raise exception 'Unauthorized admin id'; end if;

  update public.payment_security
  set is_locked=false,failed_attempts=0,locked_until=null,updated_at=now()
  where user_id=p_user_id;
  if not found then raise exception 'Payment security record not found'; end if;

  insert into public.payment_security_logs(user_id,event_type,description,performed_by)
  values (p_user_id,'admin_unlock','PIN unlocked by admin',v_admin);
end;
$$;

create or replace function public.admin_force_payment_pin_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_admin uuid:=auth.uid();
begin
  if v_admin is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('security','manage') is not true
     and public.has_dright_permission('payments','manage') is not true then
    raise exception 'Unauthorized: security management permission required';
  end if;

  update public.payment_security
  set is_locked=true,
      failed_attempts=0,
      locked_until=null,
      auth_rules=jsonb_set(coalesce(auth_rules,'{}'::jsonb),'{force_reset_required}','true'::jsonb,true),
      updated_at=now()
  where user_id=p_user_id;
  if not found then raise exception 'Payment security record not found'; end if;

  insert into public.payment_security_logs(user_id,event_type,description,performed_by)
  values (p_user_id,'admin_force_pin_reset','Admin required a payment PIN reset',v_admin);
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic payout review. Credit occurs once, inside the database transaction.
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_payout_record(p_payout_id uuid, p_approval_percentage numeric default 100, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid:=auth.uid(); v_payout public.payout_records%rowtype; v_wallet_id uuid;
  v_amount numeric; v_result jsonb; v_after numeric;
begin
  if v_admin is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('payments','manage') is not true
     and public.has_rbac_permission('payouts','manage') is not true then
    raise exception 'Unauthorized: payout management permission required';
  end if;
  if p_approval_percentage <= 0 or p_approval_percentage > 100 then raise exception 'Approval percentage must be between 0 and 100'; end if;

  select * into v_payout from public.payout_records where id=p_payout_id for update;
  if not found then raise exception 'Payout not found'; end if;
  if v_payout.status <> 'pending' then return jsonb_build_object('success',true,'already_processed',true,'status',v_payout.status); end if;
  if v_payout.amount <= 0 then raise exception 'Invalid payout amount'; end if;

  insert into public.cc_wallets(user_id) values (v_payout.user_id) on conflict (user_id) do nothing;
  select id into v_wallet_id from public.cc_wallets where user_id=v_payout.user_id;
  v_amount:=round(v_payout.amount*p_approval_percentage/100.0,2);

  v_result:=public.process_wallet_transaction(v_payout.user_id,v_wallet_id,'credit',v_amount,
    'Approved '||coalesce(v_payout.payout_type,'payout'),'affiliate_payout',v_payout.id,
    jsonb_build_object('payout_id',v_payout.id,'approved_by',v_admin,'approval_percentage',p_approval_percentage),'balance');
  if coalesce((v_result->>'success')::boolean,false) is not true then raise exception '%',coalesce(v_result->>'error','Payout credit failed'); end if;

  v_after:=(v_result->>'balance_after')::numeric;
  update public.users set balance=v_after,available_balance=v_after where id=v_payout.user_id;
  update public.payout_records
  set status='approved',admin_approval_percentage=p_approval_percentage,notes=nullif(trim(p_notes),''),processed_by=v_admin,processed_at=now()
  where id=v_payout.id;

  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values (v_admin,'approve_payout',v_payout.id,'payout_record',jsonb_build_object('payout_id',v_payout.id,'original_amount',v_payout.amount,'approved_amount',v_amount,'percentage',p_approval_percentage));

  return jsonb_build_object('success',true,'approved_amount',v_amount,'balance_after',v_after);
end;
$$;

create or replace function public.admin_mark_payout_paid(p_payout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_admin uuid:=auth.uid(); v_payout public.payout_records%rowtype;
begin
  if v_admin is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('payments','manage') is not true
     and public.has_rbac_permission('payouts','manage') is not true then raise exception 'Unauthorized'; end if;
  select * into v_payout from public.payout_records where id=p_payout_id for update;
  if not found then raise exception 'Payout not found'; end if;
  if v_payout.status='paid' then return jsonb_build_object('success',true,'already_processed',true); end if;
  if v_payout.status<>'approved' then raise exception 'Only approved payouts can be marked paid'; end if;
  update public.payout_records set status='paid',processed_by=v_admin,processed_at=now() where id=p_payout_id;
  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values (v_admin,'mark_paid',p_payout_id,'payout_record',jsonb_build_object('payout_id',p_payout_id));
  return jsonb_build_object('success',true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Withdrawal state machine. Canonical withdrawal creation pre-debits cc_wallets;
-- old legacy requests are detected and debited only at payment time.
-- ---------------------------------------------------------------------------
create or replace function public.admin_manage_withdrawal(p_withdrawal_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid:=auth.uid(); v_req public.withdrawal_requests%rowtype; v_wallet_id uuid;
  v_predebited boolean; v_result jsonb; v_after numeric;
begin
  if v_admin is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('payments','manage') is not true
     and public.has_rbac_permission('withdrawals','manage') is not true
     and (p_action in ('approve','paid') and public.has_dright_permission('finance','approve_withdrawals') is not true)
     and (p_action='reject' and public.has_dright_permission('finance','reject_withdrawals') is not true) then
    raise exception 'Unauthorized: withdrawal management permission required';
  end if;
  if p_action not in ('approve','reject','paid') then raise exception 'Invalid withdrawal action'; end if;

  select * into v_req from public.withdrawal_requests where id=p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if v_req.amount <= 0 then raise exception 'Invalid withdrawal amount'; end if;
  v_predebited:=coalesce(v_req.pin_verified,false) and v_req.bank_account_id is not null and v_req.reference is not null;

  if p_action='approve' then
    if v_req.status='approved' then return jsonb_build_object('success',true,'already_processed',true); end if;
    if v_req.status<>'pending' then raise exception 'Only pending withdrawals can be approved'; end if;
    update public.withdrawal_requests set status='approved',processed_by=v_admin,processed_at=now() where id=v_req.id;
  elsif p_action='reject' then
    if v_req.status='rejected' then return jsonb_build_object('success',true,'already_processed',true); end if;
    if v_req.status not in ('pending','approved') then raise exception 'This withdrawal can no longer be rejected'; end if;
    if nullif(trim(p_reason),'') is null then raise exception 'Rejection reason is required'; end if;

    if v_predebited then
      select id into v_wallet_id from public.cc_wallets where user_id=v_req.user_id;
      if v_wallet_id is null then raise exception 'Wallet not found for pre-debited withdrawal'; end if;
      v_result:=public.process_wallet_transaction(v_req.user_id,v_wallet_id,'credit',v_req.amount,
        'Refund rejected withdrawal '||coalesce(v_req.reference,v_req.id::text),'withdrawal',v_req.id,
        jsonb_build_object('withdrawal_id',v_req.id,'rejected_by',v_admin,'refund',true),'balance');
      if coalesce((v_result->>'success')::boolean,false) is not true then raise exception '%',coalesce(v_result->>'error','Withdrawal refund failed'); end if;
      v_after:=(v_result->>'balance_after')::numeric;
      update public.users set balance=v_after,available_balance=v_after where id=v_req.user_id;
    end if;
    update public.withdrawal_requests set status='rejected',admin_notes=trim(p_reason),processed_by=v_admin,processed_at=now() where id=v_req.id;
  else
    if v_req.status='paid' then return jsonb_build_object('success',true,'already_processed',true); end if;
    if v_req.status<>'approved' then raise exception 'Withdrawal must be approved before payment'; end if;

    select id into v_wallet_id from public.cc_wallets where user_id=v_req.user_id;
    if v_wallet_id is null then raise exception 'Wallet not found'; end if;
    if not v_predebited then
      v_result:=public.process_wallet_transaction(v_req.user_id,v_wallet_id,'debit',v_req.amount,
        'Paid legacy withdrawal '||coalesce(v_req.reference,v_req.id::text),'withdrawal',v_req.id,
        jsonb_build_object('withdrawal_id',v_req.id,'paid_by',v_admin,'legacy_debit',true),'balance');
      if coalesce((v_result->>'success')::boolean,false) is not true then raise exception '%',coalesce(v_result->>'error','Withdrawal debit failed'); end if;
      v_after:=(v_result->>'balance_after')::numeric;
      update public.users set balance=v_after,available_balance=v_after where id=v_req.user_id;
    end if;
    update public.cc_wallets set total_withdrawn=coalesce(total_withdrawn,0)+v_req.amount,updated_at=now() where id=v_wallet_id;
    update public.withdrawal_requests set status='paid',processed_by=v_admin,processed_at=now() where id=v_req.id;
  end if;

  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values (v_admin,'withdrawal_'||p_action,v_req.id,'withdrawal_request',jsonb_build_object('withdrawal_id',v_req.id,'amount',v_req.amount,'predebited',v_predebited,'reason',p_reason));
  return jsonb_build_object('success',true,'action',p_action,'predebited',v_predebited);
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal settlements use seller_id/sale_id in the live schema. Settle once
-- and credit the canonical wallet atomically.
-- ---------------------------------------------------------------------------
create or replace function public.admin_settle_internal_settlement(p_settlement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid:=auth.uid(); v_set public.internal_settlements%rowtype; v_wallet_id uuid;
  v_result jsonb; v_after numeric;
begin
  if v_admin is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('payments','manage') is not true
     and public.has_rbac_permission('settlements','manage') is not true then raise exception 'Unauthorized'; end if;

  select * into v_set from public.internal_settlements where id=p_settlement_id for update;
  if not found then raise exception 'Settlement not found'; end if;
  if v_set.status='settled' then return jsonb_build_object('success',true,'already_processed',true); end if;
  if v_set.status<>'pending' then raise exception 'Only pending settlements can be settled'; end if;
  if v_set.amount <= 0 then raise exception 'Invalid settlement amount'; end if;

  insert into public.cc_wallets(user_id) values (v_set.seller_id) on conflict (user_id) do nothing;
  select id into v_wallet_id from public.cc_wallets where user_id=v_set.seller_id;
  v_result:=public.process_wallet_transaction(v_set.seller_id,v_wallet_id,'credit',v_set.amount,
    'Internal settlement '||coalesce(v_set.settlement_type,'payment'),'purchase',v_set.sale_id,
    jsonb_build_object('settlement_id',v_set.id,'product_id',v_set.product_id,'settled_by',v_admin),'balance');
  if coalesce((v_result->>'success')::boolean,false) is not true then raise exception '%',coalesce(v_result->>'error','Settlement credit failed'); end if;
  v_after:=(v_result->>'balance_after')::numeric;
  update public.users set balance=v_after,available_balance=v_after where id=v_set.seller_id;
  update public.internal_settlements set status='settled',approved_by=v_admin,approved_at=now() where id=v_set.id;
  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values (v_admin,'settle_payment',v_set.id,'internal_settlement',jsonb_build_object('settlement_id',v_set.id,'amount',v_set.amount,'seller_id',v_set.seller_id));
  return jsonb_build_object('success',true,'balance_after',v_after);
end;
$$;

revoke all on function public.admin_force_payment_pin_reset(uuid) from public, anon;
revoke all on function public.admin_approve_payout_record(uuid,numeric,text) from public, anon;
revoke all on function public.admin_mark_payout_paid(uuid) from public, anon;
revoke all on function public.admin_manage_withdrawal(uuid,text,text) from public, anon;
revoke all on function public.admin_settle_internal_settlement(uuid) from public, anon;
grant execute on function public.admin_force_payment_pin_reset(uuid) to authenticated, service_role;
grant execute on function public.admin_approve_payout_record(uuid,numeric,text) to authenticated, service_role;
grant execute on function public.admin_mark_payout_paid(uuid) to authenticated, service_role;
grant execute on function public.admin_manage_withdrawal(uuid,text,text) to authenticated, service_role;
grant execute on function public.admin_settle_internal_settlement(uuid) to authenticated, service_role;

commit;
