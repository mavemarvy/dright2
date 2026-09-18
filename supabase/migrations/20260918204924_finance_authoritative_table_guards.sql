-- DRIGHT finance/security: authoritative table boundaries and admin review operations.

begin;

-- ---------------------------------------------------------------------------
-- Authoritative money/state tables must not be mutated directly by authenticated
-- browser clients. SECURITY DEFINER domain RPCs and service_role remain the
-- write authority.
-- ---------------------------------------------------------------------------
drop policy if exists ins_own_cc_w on public.cc_wallets;
drop policy if exists upd_own_cc_w on public.cc_wallets;
drop policy if exists ins_own_cc_tx on public.cc_transactions;
drop policy if exists insert_own_ledger on public.ledger_entries;
drop policy if exists admin_insert_ledger on public.ledger_entries;

drop policy if exists "Users can create withdrawal requests" on public.withdrawal_requests;
drop policy if exists admin_update_withdrawals on public.withdrawal_requests;
drop policy if exists admin_delete_withdrawals on public.withdrawal_requests;

drop policy if exists admin_insert_payouts on public.payout_records;
drop policy if exists admin_update_payouts on public.payout_records;
drop policy if exists admin_delete_payouts on public.payout_records;

drop policy if exists finance_admin_all_settlements on public.internal_settlements;

revoke insert, update, delete on public.cc_wallets from authenticated;
revoke insert, update, delete on public.cc_transactions from authenticated;
revoke insert, update, delete on public.ledger_entries from authenticated;
revoke insert, update, delete on public.withdrawal_requests from authenticated;
revoke insert, update, delete on public.payout_records from authenticated;
revoke insert, update, delete on public.internal_settlements from authenticated;
revoke insert, update, delete on public.payment_security from authenticated;
revoke insert, update, delete on public.payment_pin_attempts from authenticated;
revoke insert, update, delete on public.payment_security_logs from authenticated;
revoke insert, update, delete on public.wallet_fraud_alerts from authenticated;
revoke insert, update, delete on public.user_risk_scores from authenticated;

-- Explicit finance read surfaces for authorized reviewers.
drop policy if exists admin_select_cc_wallets on public.cc_wallets;
create policy admin_select_cc_wallets on public.cc_wallets
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('payments','read')
  or public.has_dright_permission('payments','manage')
);

drop policy if exists admin_select_cc_transactions on public.cc_transactions;
create policy admin_select_cc_transactions on public.cc_transactions
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('payments','read')
  or public.has_dright_permission('payments','manage')
);

drop policy if exists admin_select_ledger on public.ledger_entries;
create policy admin_select_ledger on public.ledger_entries
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('payments','read')
  or public.has_dright_permission('payments','manage')
);

drop policy if exists finance_admin_select_settlements on public.internal_settlements;
create policy finance_admin_select_settlements on public.internal_settlements
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('payments','read')
  or public.has_dright_permission('payments','manage')
);

-- ---------------------------------------------------------------------------
-- Bank accounts: owners may edit normal details, but cannot self-verify,
-- mint recipient codes, or preserve verification after identity details change.
-- ---------------------------------------------------------------------------
create or replace function public.protect_bank_account_authoritative_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if auth.uid() is null or new.user_id is distinct from auth.uid() then
        raise exception 'Unauthorized bank account owner';
      end if;
      new.is_verified := false;
      new.verification_status := 'unverified';
      new.recipient_code := null;
    elsif auth.uid() = old.user_id then
      if new.user_id is distinct from old.user_id then
        raise exception 'Bank account ownership cannot be changed';
      end if;

      if new.is_verified is distinct from old.is_verified
         or new.verification_status is distinct from old.verification_status
         or new.recipient_code is distinct from old.recipient_code then
        raise exception 'Bank verification fields are server managed';
      end if;

      if new.bank_code is distinct from old.bank_code
         or new.bank_name is distinct from old.bank_name
         or new.account_number is distinct from old.account_number
         or new.account_name is distinct from old.account_name then
        new.is_verified := false;
        new.verification_status := 'unverified';
        new.recipient_code := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_bank_account_authoritative_fields on public.bank_accounts;
create trigger trg_protect_bank_account_authoritative_fields
before insert or update on public.bank_accounts
for each row execute function public.protect_bank_account_authoritative_fields();

create or replace function public.request_bank_account_verification(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_account public.bank_accounts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_account
  from public.bank_accounts
  where id = p_account_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Bank account not found';
  end if;

  if v_account.account_number !~ '^[0-9]{10}$' then
    return jsonb_build_object('success',false,'error','Account number must be exactly 10 digits');
  end if;

  if nullif(trim(v_account.bank_code),'') is null then
    return jsonb_build_object('success',false,'error','Bank code is required');
  end if;

  update public.bank_accounts
  set verification_status = 'pending',
      is_verified = false,
      recipient_code = null,
      updated_at = now()
  where id = p_account_id;

  return jsonb_build_object(
    'success',true,
    'verified',false,
    'status','pending',
    'message','Bank account verification is pending provider confirmation'
  );
end;
$$;

revoke all on function public.request_bank_account_verification(uuid) from public, anon;
grant execute on function public.request_bank_account_verification(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Legacy payout_accounts: verification is server-owned.
-- ---------------------------------------------------------------------------
create or replace function public.protect_payout_account_authoritative_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if auth.uid() is null or new.user_id is distinct from auth.uid() then
        raise exception 'Unauthorized payout account owner';
      end if;
      new.is_verified := false;
    elsif auth.uid() = old.user_id then
      if new.user_id is distinct from old.user_id then
        raise exception 'Payout account ownership cannot be changed';
      end if;

      if new.is_verified is distinct from old.is_verified then
        raise exception 'Payout verification is server managed';
      end if;

      if new.account_type is distinct from old.account_type
         or new.account_details is distinct from old.account_details then
        new.is_verified := false;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_payout_account_authoritative_fields on public.payout_accounts;
create trigger trg_protect_payout_account_authoritative_fields
before insert or update on public.payout_accounts
for each row execute function public.protect_payout_account_authoritative_fields();

-- ---------------------------------------------------------------------------
-- Current payout_methods: owners can maintain details/primary/deleted state but
-- cannot self-verify or self-assign a server status. Editing destination details
-- invalidates an existing verification.
-- ---------------------------------------------------------------------------
create or replace function public.protect_payout_method_authoritative_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if auth.uid() is null or new.user_id is distinct from auth.uid() then
        raise exception 'Unauthorized payout method owner';
      end if;
      new.is_verified := false;
      new.status := 'active';
      new.is_deleted := false;
    elsif auth.uid() = old.user_id then
      if new.user_id is distinct from old.user_id then
        raise exception 'Payout method ownership cannot be changed';
      end if;

      if new.is_verified is distinct from old.is_verified
         or new.status is distinct from old.status
         or new.created_by is distinct from old.created_by then
        raise exception 'Payout verification/status fields are server managed';
      end if;

      if new.method_type is distinct from old.method_type
         or new.account_holder_name is distinct from old.account_holder_name
         or new.bank_name is distinct from old.bank_name
         or new.account_number is distinct from old.account_number
         or new.bank_code is distinct from old.bank_code
         or new.paypal_email is distinct from old.paypal_email
         or new.payoneer_email is distinct from old.payoneer_email
         or new.crypto_currency is distinct from old.crypto_currency
         or new.crypto_network is distinct from old.crypto_network
         or new.crypto_wallet_address is distinct from old.crypto_wallet_address then
        new.is_verified := false;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_payout_method_authoritative_fields on public.payout_methods;
create trigger trg_protect_payout_method_authoritative_fields
before insert or update on public.payout_methods
for each row execute function public.protect_payout_method_authoritative_fields();

-- ---------------------------------------------------------------------------
-- Fraud review: read access may be delegated, state mutation is explicit,
-- permission-gated and audited.
-- ---------------------------------------------------------------------------
drop policy if exists trust_admin_all_fraud on public.fraud_reports;

drop policy if exists admin_select_fraud_reports on public.fraud_reports;
create policy admin_select_fraud_reports on public.fraud_reports
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('security','view')
  or public.has_dright_permission('security','view_fraud')
  or public.has_dright_permission('security','manage')
);

revoke update, delete on public.fraud_reports from authenticated;

create or replace function public.admin_update_fraud_report(
  p_report_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_admin uuid := auth.uid();
begin
  if v_admin is null then
    raise exception 'Unauthorized';
  end if;

  if public.is_super_admin() is not true
     and public.has_dright_permission('security','manage') is not true then
    raise exception 'Unauthorized: security management permission required';
  end if;

  if p_status not in ('pending','investigating','resolved','dismissed') then
    raise exception 'Invalid fraud report status';
  end if;

  update public.fraud_reports
  set status = p_status,
      reviewed_by = v_admin,
      reviewed_at = case when p_status in ('resolved','dismissed') then now() else reviewed_at end
  where id = p_report_id;

  if not found then
    raise exception 'Fraud report not found';
  end if;

  insert into public.admin_logs(admin_id, action_type, target_id, target_type, details)
  values (
    v_admin,
    'fraud_report_update',
    p_report_id,
    'fraud_report',
    jsonb_build_object('report_id',p_report_id,'status',p_status)
  );
end;
$$;

revoke all on function public.admin_update_fraud_report(uuid,text) from public, anon;
grant execute on function public.admin_update_fraud_report(uuid,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Account status changes use explicit user/security permissions. The wallet is
-- synchronized so LOCKED/BANNED actually prevents withdrawal/payment movement.
-- ---------------------------------------------------------------------------
create or replace function public.sync_wallet_freeze_with_account_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.account_status is not distinct from old.account_status then
    return new;
  end if;

  if new.account_status in ('LOCKED','BANNED') then
    update public.cc_wallets
    set is_frozen = true,
        frozen_reason = '[ACCOUNT_STATUS] ' || new.account_status,
        frozen_by = auth.uid(),
        frozen_at = now(),
        updated_at = now()
    where user_id = new.id;
  elsif new.account_status = 'ACTIVE' then
    update public.cc_wallets
    set is_frozen = false,
        frozen_reason = null,
        frozen_by = null,
        frozen_at = null,
        updated_at = now()
    where user_id = new.id
      and frozen_reason like '[ACCOUNT_STATUS]%';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_wallet_freeze_with_account_status on public.users;
create trigger trg_sync_wallet_freeze_with_account_status
after update of account_status on public.users
for each row execute function public.sync_wallet_freeze_with_account_status();

create or replace function public.admin_set_user_account_status(
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_admin uuid := auth.uid();
begin
  if v_admin is null then
    raise exception 'Unauthorized';
  end if;

  if p_status not in ('ACTIVE','LOCKED','BANNED') then
    raise exception 'Invalid account status';
  end if;

  if p_user_id = v_admin and p_status <> 'ACTIVE' then
    raise exception 'Admins cannot lock or ban their own active session through this operation';
  end if;

  if p_status = 'LOCKED'
     and public.is_super_admin() is not true
     and public.has_dright_permission('users','suspend') is not true
     and public.has_dright_permission('security','manage') is not true then
    raise exception 'Unauthorized: user suspension permission required';
  end if;

  if p_status = 'BANNED'
     and public.is_super_admin() is not true
     and public.has_dright_permission('users','ban') is not true
     and public.has_dright_permission('security','manage') is not true then
    raise exception 'Unauthorized: user ban permission required';
  end if;

  if p_status = 'ACTIVE'
     and public.is_super_admin() is not true
     and public.has_dright_permission('users','restore') is not true
     and public.has_dright_permission('security','manage') is not true then
    raise exception 'Unauthorized: user restore permission required';
  end if;

  if p_status in ('LOCKED','BANNED') and nullif(trim(p_reason),'') is null then
    raise exception 'Reason is required';
  end if;

  update public.users
  set account_status = p_status,
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;

  insert into public.admin_logs(admin_id, action_type, target_id, target_type, details)
  values (
    v_admin,
    'set_account_status',
    p_user_id,
    'user',
    jsonb_build_object('user_id',p_user_id,'status',p_status,'reason',nullif(trim(p_reason),''))
  );
end;
$$;

revoke all on function public.admin_set_user_account_status(uuid,text,text) from public, anon;
grant execute on function public.admin_set_user_account_status(uuid,text,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Payment analytics: one permission-gated platform aggregation avoids direct
-- browser access to multiple financial tables and uses the canonical
-- cc_transactions source for refunds.
-- ---------------------------------------------------------------------------
create or replace function public.get_admin_payment_analytics(p_start timestamptz)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := coalesce(p_start, date_trunc('day', now()));
  v_success_count bigint;
  v_failed_count bigint;
  v_gateway_abandoned_count bigint;
  v_abandoned_rows bigint;
  v_total_revenue numeric;
  v_failed_amount numeric;
  v_wallet_funding numeric;
  v_subscription_revenue numeric;
  v_escrow numeric;
  v_refunds numeric;
  v_withdrawals numeric;
  v_abandoned_value numeric;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if public.is_super_admin() is not true
     and public.has_dright_permission('payments','read') is not true
     and public.has_dright_permission('payments','manage') is not true then
    raise exception 'Unauthorized: payment analytics permission required';
  end if;

  select
    count(*) filter (where status='success'),
    count(*) filter (where status='failed'),
    count(*) filter (where status='abandoned'),
    coalesce(sum(amount) filter (where status='success'),0) / 100.0,
    coalesce(sum(amount) filter (where status='failed'),0) / 100.0,
    coalesce(sum(amount) filter (where status='success' and purpose='wallet_funding'),0) / 100.0,
    coalesce(sum(amount) filter (where status='success' and purpose='subscription'),0) / 100.0
  into
    v_success_count,
    v_failed_count,
    v_gateway_abandoned_count,
    v_total_revenue,
    v_failed_amount,
    v_wallet_funding,
    v_subscription_revenue
  from public.paystack_transactions
  where created_at >= v_start;

  select coalesce(sum(amount),0)
  into v_escrow
  from public.escrow_payments
  where created_at >= v_start;

  select coalesce(sum(amount),0)
  into v_refunds
  from public.cc_transactions
  where created_at >= v_start
    and (
      lower(coalesce(category,''))='refund'
      or lower(coalesce(type,''))='refund'
      or lower(coalesce(description,'')) like '%refund%'
    );

  select coalesce(sum(amount),0)
  into v_withdrawals
  from public.withdrawal_requests
  where created_at >= v_start;

  select coalesce(sum(amount),0), count(*)
  into v_abandoned_value, v_abandoned_rows
  from public.abandoned_payments
  where created_at >= v_start;

  return jsonb_build_object(
    'totalRevenue',v_total_revenue,
    'totalEscrow',v_escrow,
    'totalFailed',v_failed_amount,
    'totalRefunds',v_refunds,
    'totalAbandoned',v_abandoned_value,
    'totalWithdrawals',v_withdrawals,
    'totalWalletFunding',v_wallet_funding,
    'totalSubscriptionRevenue',v_subscription_revenue,
    'paymentCount',v_success_count,
    'failedCount',v_failed_count,
    'abandonedCount',v_gateway_abandoned_count + v_abandoned_rows,
    'successRate',case
      when (v_success_count + v_failed_count + v_gateway_abandoned_count) > 0
        then (v_success_count::numeric * 100.0) /
             (v_success_count + v_failed_count + v_gateway_abandoned_count)
      else 0
    end,
    'avgProcessingTime',null
  );
end;
$$;

revoke all on function public.get_admin_payment_analytics(timestamptz) from public, anon;
grant execute on function public.get_admin_payment_analytics(timestamptz) to authenticated, service_role;

commit;
