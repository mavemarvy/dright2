-- DRIGHT2 ST-9D: configurable 10/5/1 referral qualification, review states, idempotent pending rewards and canonical referral-wallet credit.

create table if not exists public.referral_program_config (
  singleton boolean primary key default true check (singleton=true),
  is_enabled boolean not null default true,
  level_1_percent numeric(8,4) not null default 10 check (level_1_percent between 0 and 100),
  level_2_percent numeric(8,4) not null default 5 check (level_2_percent between 0 and 100),
  level_3_percent numeric(8,4) not null default 1 check (level_3_percent between 0 and 100),
  qualification_event text not null default 'first_eligible_purchase',
  qualification_window_days integer not null default 14 check (qualification_window_days between 1 and 3650),
  minimum_reward numeric(18,4) not null default 0.05 check (minimum_reward >= 0),
  maximum_reward numeric(18,4) not null default 10000 check (maximum_reward >= minimum_reward),
  limit_currency text not null default 'USD',
  holding_period_days integer not null default 7 check (holding_period_days between 0 and 365),
  promotion_purchase_qualifies boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.referral_program_config(singleton) values(true) on conflict(singleton) do nothing;
alter table public.referral_program_config enable row level security;
drop policy if exists referral_program_config_read on public.referral_program_config;
create policy referral_program_config_read on public.referral_program_config for select to authenticated using (true);
drop policy if exists referral_program_config_admin_write on public.referral_program_config;
create policy referral_program_config_admin_write on public.referral_program_config for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
grant select on public.referral_program_config to authenticated;
grant update on public.referral_program_config to authenticated;

alter table public.referral_rewards
  add column if not exists currency text,
  add column if not exists percentage_snapshot numeric(8,4),
  add column if not exists qualification_event text,
  add column if not exists qualification_status text,
  add column if not exists pending_reason text,
  add column if not exists fraud_status text not null default 'normal',
  add column if not exists qualifying_transaction_id uuid,
  add column if not exists qualification_expires_at timestamptz,
  add column if not exists qualified_at timestamptz,
  add column if not exists hold_until timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists credited_at timestamptz,
  add column if not exists ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
  add column if not exists fx_to_limit_currency numeric(24,10),
  add column if not exists limit_equivalent_amount numeric(18,4),
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

alter table public.referral_rewards drop constraint if exists referral_rewards_fraud_status_check;
alter table public.referral_rewards add constraint referral_rewards_fraud_status_check check (fraud_status in ('normal','suspicious','under_review','confirmed_fraud','cleared'));
alter table public.referral_rewards drop constraint if exists referral_rewards_qualification_status_check;
alter table public.referral_rewards add constraint referral_rewards_qualification_status_check check (qualification_status is null or qualification_status in ('pending_review','pending_fx','qualified','expired','rejected','reversed'));
create unique index if not exists uq_referral_reward_qualification_event
on public.referral_rewards(referrer_id,referred_user_id,level,qualification_event)
where qualification_event is not null;
create unique index if not exists uq_referral_reward_ledger
on public.ledger_entries(reference_id,account)
where reference_type='referral_reward' and account='referral_balance';

create or replace function public.qualify_referral_event(
  p_referred_user_id uuid,
  p_event_type text,
  p_transaction_id uuid,
  p_amount numeric,
  p_currency text,
  p_fx_to_limit_currency numeric default null,
  p_event_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_cfg public.referral_program_config%rowtype;
  v_rel record;
  v_percent numeric;
  v_reward numeric;
  v_equiv numeric;
  v_status text;
  v_fraud text;
  v_reason text;
  v_created integer:=0;
  v_pending_fx integer:=0;
  v_currency text:=upper(btrim(coalesce(p_currency,'')));
begin
  if coalesce(auth.role(),'')<>'service_role' and pg_trigger_depth()=0 then raise exception 'Referral qualification is server-authoritative'; end if;
  if p_referred_user_id is null or p_transaction_id is null or p_amount is null or p_amount<=0 or v_currency='' then raise exception 'Invalid referral qualification event'; end if;
  select * into v_cfg from public.referral_program_config where singleton=true and is_enabled=true;
  if not found then return jsonb_build_object('success',false,'reason','referral_program_disabled'); end if;
  if lower(p_event_type)<>lower(v_cfg.qualification_event) and not(lower(p_event_type)='promotion_purchase' and v_cfg.promotion_purchase_qualifies) then
    return jsonb_build_object('success',false,'reason','event_not_eligible');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_referred_user_id::text||':'||lower(p_event_type),0));

  if exists(select 1 from public.referral_rewards rw where rw.referred_user_id=p_referred_user_id and rw.qualification_event=lower(p_event_type)) then
    return jsonb_build_object('success',true,'idempotent',true,'created',0);
  end if;

  for v_rel in
    select rr.* from public.referral_relationships rr
    where rr.referred_id=p_referred_user_id and rr.level between 1 and 3
      and rr.referrer_id<>p_referred_user_id
      and p_event_at<=rr.created_at+make_interval(days=>v_cfg.qualification_window_days)
    order by rr.level
  loop
    v_percent:=case v_rel.level when 1 then v_cfg.level_1_percent when 2 then v_cfg.level_2_percent else v_cfg.level_3_percent end;
    v_reward:=round(p_amount*v_percent/100,4);
    v_status:='pending_review';
    v_reason:='Holding period and fraud validation pending.';
    v_equiv:=null;

    if v_currency=upper(v_cfg.limit_currency) then
      v_reward:=greatest(v_cfg.minimum_reward,least(v_cfg.maximum_reward,v_reward));
      v_equiv:=v_reward;
    elsif p_fx_to_limit_currency is not null and p_fx_to_limit_currency>0 then
      v_equiv:=v_reward*p_fx_to_limit_currency;
      v_equiv:=greatest(v_cfg.minimum_reward,least(v_cfg.maximum_reward,v_equiv));
      v_reward:=round(v_equiv/p_fx_to_limit_currency,4);
    else
      v_status:='pending_fx';
      v_reason:='Waiting for an authoritative FX rate to validate the configured USD-equivalent reward limits.';
      v_pending_fx:=v_pending_fx+1;
    end if;

    if exists(select 1 from public.referral_fraud_logs fl where fl.referred_user_id=p_referred_user_id and (fl.referrer_id is null or fl.referrer_id=v_rel.referrer_id)) then
      v_fraud:='suspicious';
      if v_status<>'pending_fx' then v_status:='pending_review'; end if;
      v_reason:='Referral fraud review required before reward confirmation.';
    else
      v_fraud:='normal';
    end if;

    insert into public.referral_rewards(
      referrer_id,referred_user_id,level,transaction_id,reward_amount,reward_type,status,expires_at,
      currency,percentage_snapshot,qualification_event,qualification_status,pending_reason,fraud_status,qualifying_transaction_id,
      qualification_expires_at,qualified_at,hold_until,fx_to_limit_currency,limit_equivalent_amount
    ) values(
      v_rel.referrer_id,p_referred_user_id,v_rel.level,p_transaction_id,v_reward,lower(p_event_type),'pending',null,
      v_currency,v_percent,lower(p_event_type),v_status,v_reason,v_fraud,p_transaction_id,
      v_rel.created_at+make_interval(days=>v_cfg.qualification_window_days),p_event_at,p_event_at+make_interval(days=>v_cfg.holding_period_days),p_fx_to_limit_currency,v_equiv
    ) on conflict do nothing;
    if found then v_created:=v_created+1; end if;
  end loop;

  return jsonb_build_object('success',true,'idempotent',false,'created',v_created,'pending_fx',v_pending_fx,'event',lower(p_event_type));
end $$;
revoke all on function public.qualify_referral_event(uuid,text,uuid,numeric,text,numeric,timestamptz) from public,anon,authenticated;
grant execute on function public.qualify_referral_event(uuid,text,uuid,numeric,text,numeric,timestamptz) to service_role;

create or replace function public.qualify_referral_from_completed_order()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_tx public.paystack_transactions%rowtype; v_cfg public.referral_program_config%rowtype;
begin
  if new.status<>'COMPLETED' or coalesce(new.is_free_order,false) then return new; end if;
  if tg_op='UPDATE' and old.status='COMPLETED' then return new; end if;
  select * into v_cfg from public.referral_program_config where singleton=true and is_enabled=true;
  if not found or lower(v_cfg.qualification_event)<>'first_eligible_purchase' then return new; end if;
  select * into v_tx from public.paystack_transactions pt
  where pt.reference_id=new.id and pt.purpose in('product_purchase','escrow') and pt.status='success' and pt.processed_at is not null
  order by coalesce(pt.paid_at,pt.updated_at,pt.created_at) desc limit 1;
  if not found then return new; end if;
  perform public.qualify_referral_event(new.buyer_id,'first_eligible_purchase',new.id,v_tx.amount,v_tx.currency,null,coalesce(new.completed_at,now()));
  return new;
end $$;
drop trigger if exists trg_qualify_referral_from_completed_order on public.orders;
create trigger trg_qualify_referral_from_completed_order
after insert or update of status on public.orders
for each row execute function public.qualify_referral_from_completed_order();
revoke all on function public.qualify_referral_from_completed_order() from public,anon,authenticated;

create or replace function public.confirm_referral_reward(p_reward_id uuid,p_reason text default null,p_fx_to_limit_currency numeric default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role text:=coalesce(auth.role(),'');
  v_admin boolean:=false;
  v_rw public.referral_rewards%rowtype;
  v_cfg public.referral_program_config%rowtype;
  v_wallet public.cc_wallets%rowtype;
  v_ledger uuid;
  v_equiv numeric;
  v_reward numeric;
begin
  if auth.uid() is not null then select coalesce(u.is_admin,false) into v_admin from public.users u where u.id=auth.uid(); end if;
  if v_role<>'service_role' and not coalesce(v_admin,false) then raise exception 'Admin or service role required'; end if;
  select * into v_rw from public.referral_rewards where id=p_reward_id for update;
  if not found then raise exception 'Referral reward not found'; end if;
  if v_rw.status='confirmed' and v_rw.ledger_entry_id is not null then
    return jsonb_build_object('success',true,'idempotent',true,'reward_id',v_rw.id,'ledger_entry_id',v_rw.ledger_entry_id);
  end if;
  if v_rw.status<>'pending' then raise exception 'Referral reward is not pending confirmation'; end if;
  if v_rw.fraud_status not in('normal','cleared') then raise exception 'Referral reward is still under fraud review'; end if;
  if v_rw.hold_until is not null and v_rw.hold_until>now() then raise exception 'Referral reward holding period has not ended'; end if;
  select * into v_cfg from public.referral_program_config where singleton=true;
  v_reward:=v_rw.reward_amount;
  if v_rw.qualification_status='pending_fx' then
    if p_fx_to_limit_currency is null or p_fx_to_limit_currency<=0 then raise exception 'Authoritative FX rate is required before confirmation'; end if;
    v_equiv:=v_reward*p_fx_to_limit_currency;
    v_equiv:=greatest(v_cfg.minimum_reward,least(v_cfg.maximum_reward,v_equiv));
    v_reward:=round(v_equiv/p_fx_to_limit_currency,4);
  else
    v_equiv:=coalesce(v_rw.limit_equivalent_amount,v_reward);
  end if;

  select * into v_wallet from public.cc_wallets where user_id=v_rw.referrer_id for update;
  if not found then raise exception 'Canonical referral wallet not found'; end if;
  if coalesce(v_wallet.is_frozen,false) then raise exception 'Referral wallet is frozen'; end if;
  if upper(v_wallet.currency)<>upper(coalesce(v_rw.currency,v_wallet.currency)) then raise exception 'Reward currency does not match canonical wallet currency'; end if;

  select le.id into v_ledger from public.ledger_entries le where le.reference_type='referral_reward' and le.reference_id=v_rw.id and le.account='referral_balance' limit 1;
  if v_ledger is null then
    update public.cc_wallets set referral_balance=referral_balance+v_reward,updated_at=now() where id=v_wallet.id returning referral_balance into v_wallet.referral_balance;
    insert into public.ledger_entries(transaction_id,wallet_id,user_id,entry_type,account,amount,balance_after,description,reference_type,reference_id,metadata)
    values(v_rw.qualifying_transaction_id,v_wallet.id,v_rw.referrer_id,'credit','referral_balance',v_reward,v_wallet.referral_balance,
      'Confirmed DRIGHT referral reward','referral_reward',v_rw.id,
      jsonb_build_object('level',v_rw.level,'percentage',v_rw.percentage_snapshot,'qualification_event',v_rw.qualification_event,'currency',v_rw.currency,'reason',p_reason))
    returning id into v_ledger;
  end if;

  update public.referral_rewards
  set reward_amount=v_reward,fx_to_limit_currency=coalesce(p_fx_to_limit_currency,fx_to_limit_currency),limit_equivalent_amount=v_equiv,
      qualification_status='qualified',pending_reason=null,status='confirmed',confirmed_at=now(),credited_at=now(),ledger_entry_id=v_ledger
  where id=v_rw.id;
  perform public.refresh_referral_stats(v_rw.referrer_id);
  insert into public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
  values('referral_reward_confirmed','referral_reward',v_rw.id,v_rw.referrer_id,v_rw.referrer_id,jsonb_build_object('amount',v_reward,'currency',v_rw.currency,'level',v_rw.level));
  return jsonb_build_object('success',true,'idempotent',false,'reward_id',v_rw.id,'ledger_entry_id',v_ledger,'amount',v_reward,'currency',v_rw.currency);
end $$;
revoke all on function public.confirm_referral_reward(uuid,text,numeric) from public,anon;
grant execute on function public.confirm_referral_reward(uuid,text,numeric) to authenticated,service_role;

create or replace function public.get_referral_dashboard_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_uid uuid:=auth.uid(); v_cfg public.referral_program_config%rowtype; v_link record;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_cfg from public.referral_program_config where singleton=true;
  select rl.unique_code into v_link from public.referral_links rl where rl.user_id=v_uid and rl.product_id is null and rl.campaign_id is null and rl.sales_team_id is null order by rl.created_at asc limit 1;
  return jsonb_build_object(
    'referral_code',coalesce(v_link.unique_code,(select u.referral_code from public.users u where u.id=v_uid)),
    'levels',jsonb_build_object(
      'level_1',(select count(*) from public.referral_relationships rr where rr.referrer_id=v_uid and rr.level=1),
      'level_2',(select count(*) from public.referral_relationships rr where rr.referrer_id=v_uid and rr.level=2),
      'level_3',(select count(*) from public.referral_relationships rr where rr.referrer_id=v_uid and rr.level=3)),
    'qualification',jsonb_build_object(
      'qualified',(select count(distinct rw.referred_user_id) from public.referral_rewards rw where rw.referrer_id=v_uid and rw.status in('pending','confirmed','paid')),
      'pending',(select count(*) from public.referral_relationships rr where rr.referrer_id=v_uid and rr.level=1 and now()<=rr.created_at+make_interval(days=>v_cfg.qualification_window_days) and not exists(select 1 from public.referral_rewards rw where rw.referrer_id=v_uid and rw.referred_user_id=rr.referred_id)),
      'expired',(select count(*) from public.referral_relationships rr where rr.referrer_id=v_uid and rr.level=1 and now()>rr.created_at+make_interval(days=>v_cfg.qualification_window_days) and not exists(select 1 from public.referral_rewards rw where rw.referrer_id=v_uid and rw.referred_user_id=rr.referred_id))),
    'rewards',jsonb_build_object(
      'pending',coalesce((select sum(rw.reward_amount) from public.referral_rewards rw where rw.referrer_id=v_uid and rw.status='pending'),0),
      'confirmed',coalesce((select sum(rw.reward_amount) from public.referral_rewards rw where rw.referrer_id=v_uid and rw.status='confirmed'),0),
      'paid',coalesce((select sum(rw.reward_amount) from public.referral_rewards rw where rw.referrer_id=v_uid and rw.status='paid'),0),
      'total',coalesce((select sum(rw.reward_amount) from public.referral_rewards rw where rw.referrer_id=v_uid and rw.status in('pending','confirmed','paid')),0)),
    'pending_reasons',coalesce((select jsonb_agg(jsonb_build_object('reward_id',rw.id,'level',rw.level,'reason',rw.pending_reason,'fraud_status',rw.fraud_status,'qualification_status',rw.qualification_status,'hold_until',rw.hold_until) order by rw.created_at desc) from public.referral_rewards rw where rw.referrer_id=v_uid and rw.status='pending'),'[]'::jsonb),
    'config',jsonb_build_object('level_1_percent',v_cfg.level_1_percent,'level_2_percent',v_cfg.level_2_percent,'level_3_percent',v_cfg.level_3_percent,'qualification_event',v_cfg.qualification_event,'qualification_window_days',v_cfg.qualification_window_days,'holding_period_days',v_cfg.holding_period_days,'minimum_reward',v_cfg.minimum_reward,'maximum_reward',v_cfg.maximum_reward,'limit_currency',v_cfg.limit_currency)
  );
end $$;
revoke all on function public.get_referral_dashboard_v2() from public,anon;
grant execute on function public.get_referral_dashboard_v2() to authenticated;
