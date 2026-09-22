begin;

create table if not exists public.monthly_growth_challenge_payout_settings (
  singleton boolean primary key default true check (singleton),
  auto_payout_enabled boolean not null default false,
  auto_payout_max_risk_score integer not null default 0 check (auto_payout_max_risk_score between 0 and 100),
  payout_destination text not null default 'wallet' check (payout_destination in ('wallet')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.monthly_growth_challenge_payout_settings(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.monthly_growth_challenge_payout_settings enable row level security;
revoke all on public.monthly_growth_challenge_payout_settings from anon, authenticated;

alter table public.monthly_growth_challenge_awards
  add column if not exists review_status text not null default 'pending',
  add column if not exists review_notes text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists risk_score integer not null default 0,
  add column if not exists fraud_flags jsonb not null default '[]'::jsonb,
  add column if not exists payout_transaction_id uuid references public.cc_transactions(id) on delete set null,
  add column if not exists payout_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.monthly_growth_challenge_awards'::regclass
      and conname='monthly_growth_awards_review_status_check'
  ) then
    alter table public.monthly_growth_challenge_awards
      add constraint monthly_growth_awards_review_status_check
      check (review_status in ('pending','flagged','approved','auto_approved','rejected','paid'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.monthly_growth_challenge_awards'::regclass
      and conname='monthly_growth_awards_payout_mode_check'
  ) then
    alter table public.monthly_growth_challenge_awards
      add constraint monthly_growth_awards_payout_mode_check
      check (payout_mode is null or payout_mode in ('manual','auto'));
  end if;
end $$;

create index if not exists monthly_growth_awards_review_idx
  on public.monthly_growth_challenge_awards(status,review_status,period_start desc);

create or replace function public.monthly_growth_competition_admin_allowed()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select auth.uid() is not null and (
    public.is_super_admin() is true
    or public.has_dright_permission('cms','manage') is true
    or public.has_dright_permission('referrals','manage') is true
    or public.has_dright_permission('payments','manage') is true
    or public.has_rbac_permission('payouts','manage') is true
  );
$$;

revoke all on function public.monthly_growth_competition_admin_allowed() from public,anon;
grant execute on function public.monthly_growth_competition_admin_allowed() to authenticated,service_role;

create or replace function public.assess_monthly_growth_award_fraud(
  p_user_id uuid,
  p_period_start date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_score integer:=0;
  v_flags jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_max integer:=0;
  v_status text;
  v_frozen boolean:=false;
  v_start timestamptz:=coalesce(p_period_start,date_trunc('month',now() at time zone 'UTC')::date)::timestamptz;
  v_end timestamptz:=(coalesce(p_period_start,date_trunc('month',now() at time zone 'UTC')::date)+interval '1 month')::timestamptz;
begin
  select coalesce(account_status,'ACTIVE') into v_status from public.users where id=p_user_id;
  if not found or upper(coalesce(v_status,'ACTIVE'))<>'ACTIVE' then
    v_score:=100;
    v_flags:=v_flags || jsonb_build_array('Account is not active');
  end if;

  select coalesce(bool_or(is_frozen),false) into v_frozen
  from public.cc_wallets where user_id=p_user_id;
  if v_frozen then
    v_score:=100;
    v_flags:=v_flags || jsonb_build_array('Wallet is frozen');
  end if;

  select count(*),coalesce(max(risk_score),0) into v_count,v_max
  from public.wallet_fraud_alerts
  where user_id=p_user_id and is_resolved=false;
  if v_count>0 then
    v_score:=greatest(v_score,least(100,greatest(v_max,60)));
    v_flags:=v_flags || jsonb_build_array(v_count::text || ' unresolved wallet fraud alert(s)');
  end if;

  select count(*),coalesce(max(risk_score),0) into v_count,v_max
  from public.fraud_cases
  where user_id=p_user_id and lower(coalesce(status,'')) not in ('resolved','closed','dismissed');
  if v_count>0 then
    v_score:=greatest(v_score,least(100,greatest(v_max,60)));
    v_flags:=v_flags || jsonb_build_array(v_count::text || ' open fraud case(s)');
  end if;

  select count(*) into v_count
  from public.fraud_events
  where user_id=p_user_id and lower(coalesce(status,'')) not in ('resolved','closed','dismissed');
  if v_count>0 then
    v_score:=greatest(v_score,55);
    v_flags:=v_flags || jsonb_build_array(v_count::text || ' unresolved fraud event(s)');
  end if;

  select count(*) into v_count
  from public.fraud_reports
  where reported_id=p_user_id and lower(coalesce(status,'')) in ('pending','open','under_review','reviewing');
  if v_count>0 then
    v_score:=greatest(v_score,45);
    v_flags:=v_flags || jsonb_build_array(v_count::text || ' pending fraud report(s)');
  end if;

  select count(*) into v_count
  from public.referral_fraud_logs
  where referrer_id=p_user_id
    and created_at>=v_start
    and created_at<v_end;
  if v_count>0 then
    v_score:=greatest(v_score,70);
    v_flags:=v_flags || jsonb_build_array(v_count::text || ' referral fraud signal(s) during competition period');
  end if;

  return jsonb_build_object(
    'risk_score',least(100,v_score),
    'flags',v_flags,
    'safe',v_score=0 and jsonb_array_length(v_flags)=0
  );
end;
$$;

revoke all on function public.assess_monthly_growth_award_fraud(uuid,date) from public,anon,authenticated;
grant execute on function public.assess_monthly_growth_award_fraud(uuid,date) to service_role;

create or replace function public.pay_monthly_growth_challenge_award_internal(
  p_award_id uuid,
  p_mode text default 'auto',
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  a public.monthly_growth_challenge_awards%rowtype;
  v_wallet public.cc_wallets%rowtype;
  v_result jsonb;
  v_tx uuid;
  v_after numeric;
begin
  if p_mode not in ('auto','manual') then raise exception 'Invalid payout mode'; end if;

  select * into a
  from public.monthly_growth_challenge_awards
  where id=p_award_id
  for update;

  if not found then raise exception 'Competition award not found'; end if;
  if a.status='paid' then
    return jsonb_build_object('success',true,'already_processed',true,'award_id',a.id,'status',a.status);
  end if;
  if a.status='cancelled' or a.review_status='rejected' then
    raise exception 'Rejected or cancelled awards cannot be paid';
  end if;
  if a.reward_amount<=0 then raise exception 'Award amount must be greater than zero'; end if;

  insert into public.cc_wallets(user_id,currency)
  values(a.user_id,a.reward_currency)
  on conflict(user_id) do nothing;

  select * into v_wallet from public.cc_wallets where user_id=a.user_id for update;
  if not found then raise exception 'Winner wallet could not be created'; end if;
  if v_wallet.is_frozen then raise exception 'Winner wallet is frozen'; end if;
  if upper(coalesce(v_wallet.currency,'NGN'))<>upper(a.reward_currency) then
    raise exception 'Wallet currency % does not match prize currency %',v_wallet.currency,a.reward_currency;
  end if;

  v_result:=public.process_wallet_transaction(
    a.user_id,
    v_wallet.id,
    'credit',
    a.reward_amount,
    'DRIGHT competition prize: ' || replace(a.challenge_key,'_',' '),
    'monthly_growth_challenge_award',
    a.id,
    jsonb_build_object(
      'award_id',a.id,
      'challenge_key',a.challenge_key,
      'period_start',a.period_start,
      'rank',a.rank,
      'payout_mode',p_mode
    ),
    'balance'
  );

  if coalesce((v_result->>'success')::boolean,false) is not true then
    raise exception '%',coalesce(v_result->>'error','Competition prize payment failed');
  end if;

  v_tx:=(v_result->>'transaction_id')::uuid;
  v_after:=(v_result->>'balance_after')::numeric;

  update public.cc_transactions
  set currency=a.reward_currency,
      category='competition_prize',
      reference='competition:'||a.id::text,
      status='completed',
      payment_provider='DRIGHT Wallet',
      balance_before=v_after-a.reward_amount
  where id=v_tx;

  update public.users
  set balance=v_after, available_balance=v_after
  where id=a.user_id;

  update public.monthly_growth_challenge_awards
  set status='paid',
      review_status=case when p_mode='auto' then 'auto_approved' else 'paid' end,
      payout_reference=v_tx::text,
      payout_transaction_id=v_tx,
      payout_mode=p_mode,
      paid_at=now(),
      reviewed_by=coalesce(p_actor,reviewed_by),
      reviewed_at=coalesce(reviewed_at,now())
  where id=a.id;

  if p_actor is not null then
    insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
    values(
      p_actor,
      'competition_prize_paid',
      a.id,
      'monthly_growth_challenge_award',
      jsonb_build_object(
        'challenge_key',a.challenge_key,
        'period_start',a.period_start,
        'rank',a.rank,
        'amount',a.reward_amount,
        'currency',a.reward_currency,
        'transaction_id',v_tx,
        'mode',p_mode
      )
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'award_id',a.id,
    'transaction_id',v_tx,
    'balance_after',v_after,
    'status','paid'
  );
end;
$$;

revoke all on function public.pay_monthly_growth_challenge_award_internal(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pay_monthly_growth_challenge_award_internal(uuid,text,uuid) to service_role;

create or replace function public.run_monthly_growth_auto_payouts()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.monthly_growth_challenge_payout_settings%rowtype;
  a public.monthly_growth_challenge_awards%rowtype;
  v_risk jsonb;
  v_paid integer:=0;
  v_held integer:=0;
begin
  select * into s
  from public.monthly_growth_challenge_payout_settings
  where singleton=true;

  if not found or s.auto_payout_enabled is not true then
    return jsonb_build_object('enabled',false,'paid',0,'held',0);
  end if;

  for a in
    select * from public.monthly_growth_challenge_awards
    where status='pending'
    order by period_start,challenge_key,rank
    for update skip locked
  loop
    v_risk:=public.assess_monthly_growth_award_fraud(a.user_id,a.period_start);

    update public.monthly_growth_challenge_awards
    set risk_score=coalesce((v_risk->>'risk_score')::integer,0),
        fraud_flags=coalesce(v_risk->'flags','[]'::jsonb),
        review_status=case
          when jsonb_array_length(coalesce(v_risk->'flags','[]'::jsonb))>0 then 'flagged'
          else 'pending'
        end
    where id=a.id;

    if coalesce((v_risk->>'risk_score')::integer,0)<=s.auto_payout_max_risk_score
       and jsonb_array_length(coalesce(v_risk->'flags','[]'::jsonb))=0 then
      begin
        perform public.pay_monthly_growth_challenge_award_internal(a.id,'auto',null);
        v_paid:=v_paid+1;
      exception when others then
        update public.monthly_growth_challenge_awards
        set review_status='flagged',
            review_notes=concat_ws(E'\n',nullif(review_notes,''),'Auto payout held: '||sqlerrm)
        where id=a.id;
        v_held:=v_held+1;
      end;
    else
      v_held:=v_held+1;
    end if;
  end loop;

  return jsonb_build_object('enabled',true,'paid',v_paid,'held',v_held);
end;
$$;

revoke all on function public.run_monthly_growth_auto_payouts() from public,anon,authenticated;
grant execute on function public.run_monthly_growth_auto_payouts() to service_role;

create or replace function public.admin_update_monthly_growth_payout_settings(
  p_auto_payout_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_admin uuid:=auth.uid();
  v_result jsonb;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  update public.monthly_growth_challenge_payout_settings
  set auto_payout_enabled=coalesce(p_auto_payout_enabled,false),
      updated_at=now(),
      updated_by=v_admin
  where singleton=true;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(
    v_admin,
    'competition_auto_payout_toggle',
    'monthly_growth_competition',
    jsonb_build_object('enabled',coalesce(p_auto_payout_enabled,false))
  );

  if coalesce(p_auto_payout_enabled,false) then
    v_result:=public.run_monthly_growth_auto_payouts();
  else
    v_result:=jsonb_build_object('enabled',false,'paid',0,'held',0);
  end if;

  return jsonb_build_object(
    'auto_payout_enabled',coalesce(p_auto_payout_enabled,false),
    'auto_payout_max_risk_score',0,
    'payout_destination','wallet',
    'processing',v_result
  );
end;
$$;

revoke all on function public.admin_update_monthly_growth_payout_settings(boolean) from public,anon;
grant execute on function public.admin_update_monthly_growth_payout_settings(boolean) to authenticated,service_role;

create or replace function public.admin_review_monthly_growth_award(
  p_award_id uuid,
  p_action text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_admin uuid:=auth.uid();
  a public.monthly_growth_challenge_awards%rowtype;
  v_risk jsonb;
  v_flags jsonb;
  v_result jsonb;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  select * into a from public.monthly_growth_challenge_awards where id=p_award_id for update;
  if not found then raise exception 'Competition award not found'; end if;

  v_risk:=public.assess_monthly_growth_award_fraud(a.user_id,a.period_start);
  v_flags:=coalesce(v_risk->'flags','[]'::jsonb);

  update public.monthly_growth_challenge_awards
  set risk_score=coalesce((v_risk->>'risk_score')::integer,0),
      fraud_flags=v_flags
  where id=a.id;

  if p_action='recheck' then
    update public.monthly_growth_challenge_awards
    set review_status=case when jsonb_array_length(v_flags)>0 then 'flagged' else 'pending' end,
        review_notes=nullif(trim(coalesce(p_notes,'')),''),
        reviewed_by=v_admin,
        reviewed_at=now()
    where id=a.id;
    return jsonb_build_object('success',true,'action','recheck','risk',v_risk);
  end if;

  if p_action='reject' then
    if nullif(trim(coalesce(p_notes,'')),'') is null then
      raise exception 'A rejection reason is required';
    end if;
    if a.status='paid' then raise exception 'A paid award cannot be rejected'; end if;

    update public.monthly_growth_challenge_awards
    set status='cancelled',
        review_status='rejected',
        review_notes=trim(p_notes),
        reviewed_by=v_admin,
        reviewed_at=now()
    where id=a.id;

    insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
    values(v_admin,'competition_award_rejected',a.id,'monthly_growth_challenge_award',
      jsonb_build_object('notes',trim(p_notes),'risk',v_risk));

    return jsonb_build_object('success',true,'action','reject','status','cancelled');
  end if;

  if p_action='approve_pay' then
    if a.status='paid' then
      return jsonb_build_object('success',true,'already_processed',true,'status','paid');
    end if;
    if jsonb_array_length(v_flags)>0 and nullif(trim(coalesce(p_notes,'')),'') is null then
      raise exception 'Review notes are required to override fraud flags';
    end if;

    update public.monthly_growth_challenge_awards
    set review_status='approved',
        review_notes=nullif(trim(coalesce(p_notes,'')),''),
        reviewed_by=v_admin,
        reviewed_at=now()
    where id=a.id;

    v_result:=public.pay_monthly_growth_challenge_award_internal(a.id,'manual',v_admin);
    return v_result || jsonb_build_object('risk',v_risk);
  end if;

  raise exception 'Action must be recheck, approve_pay, or reject';
end;
$$;

revoke all on function public.admin_review_monthly_growth_award(uuid,text,text) from public,anon;
grant execute on function public.admin_review_monthly_growth_award(uuid,text,text) to authenticated,service_role;

create or replace function public.admin_get_monthly_growth_competition_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_start date:=date_trunc('month',now() at time zone 'UTC')::date;
  v_end date:=(date_trunc('month',now() at time zone 'UTC')+interval '1 month')::date;
  v_active integer:=0;
  v_ranked integer:=0;
  v_pending integer:=0;
  v_flagged integer:=0;
  v_paid integer:=0;
  v_paid_total numeric:=0;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  select count(*) into v_active
  from public.monthly_growth_challenge_settings
  where enabled=true;

  select count(distinct c.user_id) into v_ranked
  from public.monthly_growth_challenge_settings s
  cross join lateral public.compute_monthly_growth_leaderboard(s.challenge_key,v_start,v_end) c
  where s.enabled=true
    and (c.primary_metric>0 or c.secondary_metric>0 or c.tertiary_metric>0);

  select count(*) filter(where status='pending'),
         count(*) filter(where status='pending' and review_status='flagged'),
         count(*) filter(where status='paid'),
         coalesce(sum(reward_amount) filter(where status='paid'),0)
  into v_pending,v_flagged,v_paid,v_paid_total
  from public.monthly_growth_challenge_awards
  where period_start>=v_start-interval '12 months';

  return jsonb_build_object(
    'current_period_start',v_start,
    'current_period_end',v_end,
    'stats',jsonb_build_object(
      'active_competitions',v_active,
      'ranked_users',v_ranked,
      'pending_review',v_pending,
      'flagged_awards',v_flagged,
      'paid_awards',v_paid,
      'paid_total',v_paid_total
    ),
    'payout_settings',coalesce((
      select to_jsonb(p) from public.monthly_growth_challenge_payout_settings p where singleton=true
    ),'{}'::jsonb),
    'settings',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.section,s.sort_order)
      from public.monthly_growth_challenge_settings s
    ),'[]'::jsonb),
    'awards',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,
        'period_start',a.period_start,
        'challenge_key',a.challenge_key,
        'rank',a.rank,
        'user_id',a.user_id,
        'full_name',u.full_name,
        'username',u.username,
        'avatar_url',u.avatar_url,
        'primary_metric',a.primary_metric,
        'secondary_metric',a.secondary_metric,
        'reward_amount',a.reward_amount,
        'reward_currency',a.reward_currency,
        'status',a.status,
        'review_status',a.review_status,
        'review_notes',a.review_notes,
        'risk_score',a.risk_score,
        'fraud_flags',a.fraud_flags,
        'payout_reference',a.payout_reference,
        'payout_mode',a.payout_mode,
        'paid_at',a.paid_at,
        'reviewed_at',a.reviewed_at
      ) order by a.period_start desc,a.challenge_key,a.rank)
      from (
        select *
        from public.monthly_growth_challenge_awards
        order by period_start desc,challenge_key,rank
        limit 100
      ) a
      join public.users u on u.id=a.user_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_monthly_growth_competition_dashboard() from public,anon;
grant execute on function public.admin_get_monthly_growth_competition_dashboard() to authenticated,service_role;

create or replace function public.get_public_monthly_growth_leaderboard(
  p_challenge_key text,
  p_period text default 'current',
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_start date:=date_trunc('month',now() at time zone 'UTC')::date;
  v_end date;
  v_total integer:=0;
  v_entries jsonb:='[]'::jsonb;
  v_snapshot jsonb;
begin
  p_limit:=least(greatest(coalesce(p_limit,25),3),200);
  p_offset:=greatest(coalesce(p_offset,0),0);

  if not exists(
    select 1 from public.monthly_growth_challenge_settings
    where challenge_key=p_challenge_key and enabled=true
  ) then
    raise exception 'Challenge is unavailable';
  end if;

  if p_period='previous' then
    v_start:=(v_start-interval '1 month')::date;
    if not exists(
      select 1 from public.monthly_growth_challenge_snapshots
      where period_start=v_start and challenge_key=p_challenge_key
    ) then
      perform public.finalize_monthly_growth_challenge_period(v_start);
    end if;

    select entries into v_snapshot
    from public.monthly_growth_challenge_snapshots
    where period_start=v_start and challenge_key=p_challenge_key;

    v_total:=jsonb_array_length(coalesce(v_snapshot,'[]'::jsonb));
    select coalesce(jsonb_agg(e order by ord),'[]'::jsonb)
    into v_entries
    from jsonb_array_elements(coalesce(v_snapshot,'[]'::jsonb)) with ordinality x(e,ord)
    where ord>p_offset and ord<=p_offset+p_limit;
  elsif p_period='current' then
    v_end:=(v_start+interval '1 month')::date;
    with scored as (
      select c.*
      from public.compute_monthly_growth_leaderboard(p_challenge_key,v_start,v_end) c
      where c.primary_metric>0 or c.secondary_metric>0 or c.tertiary_metric>0
    ),
    ranked as (
      select s.*,
             row_number() over(
               order by s.primary_metric desc,s.secondary_metric desc,s.tertiary_metric desc,s.user_id
             ) rank
      from scored s
    ),
    enriched as (
      select r.rank,r.user_id,
             case when coalesce(u.show_full_name,true)=true
                        and coalesce(u.privacy_full_name,'public')='public'
                  then u.full_name else null end as full_name,
             u.username,
             case when coalesce(u.privacy_profile,'public')='public' then u.avatar_url else null end as avatar_url,
             r.primary_metric,r.secondary_metric,r.tertiary_metric,r.detail
      from ranked r join public.users u on u.id=r.user_id
      order by r.rank
    )
    select count(*)::integer,
           coalesce(jsonb_agg(to_jsonb(enriched) order by rank)
             filter(where rank>p_offset and rank<=p_offset+p_limit),'[]'::jsonb)
    into v_total,v_entries
    from enriched;
  else
    raise exception 'Period must be current or previous';
  end if;

  return jsonb_build_object(
    'challenge_key',p_challenge_key,
    'period',p_period,
    'period_start',v_start,
    'total',v_total,
    'offset',p_offset,
    'limit',p_limit,
    'entries',coalesce(v_entries,'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_public_monthly_growth_leaderboard(text,text,integer,integer) from public;
grant execute on function public.get_public_monthly_growth_leaderboard(text,text,integer,integer) to anon,authenticated,service_role;

create or replace function public.finalize_monthly_growth_challenge_period(p_period_start date)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_end date;
  s public.monthly_growth_challenge_settings%rowtype;
  v_entries jsonb;
  v_rewards jsonb;
  v_rank integer;
  v_user uuid;
  v_primary numeric;
  v_secondary numeric;
  v_reward numeric;
  v_award_id uuid;
  v_risk jsonb;
  v_count integer:=0;
  v_auto jsonb;
begin
  if p_period_start <> date_trunc('month',p_period_start)::date then
    raise exception 'Period must start on the first day of a month';
  end if;
  if p_period_start >= date_trunc('month',now() at time zone 'UTC')::date then
    raise exception 'Only completed months can be finalized';
  end if;

  v_end:=(p_period_start+interval '1 month')::date;

  for s in
    select * from public.monthly_growth_challenge_settings
    where enabled=true order by section,sort_order
  loop
    if not exists (
      select 1 from public.monthly_growth_challenge_snapshots
      where period_start=p_period_start and challenge_key=s.challenge_key
    ) then
      with scored as (
        select c.*
        from public.compute_monthly_growth_leaderboard(s.challenge_key,p_period_start,v_end) c
        where c.primary_metric>0 or c.secondary_metric>0 or c.tertiary_metric>0
      ),
      ranked as (
        select c.*,
               row_number() over (
                 order by c.primary_metric desc,c.secondary_metric desc,c.tertiary_metric desc,c.user_id
               ) rank
        from scored c
      ),
      enriched as (
        select r.rank,r.user_id,
               case when coalesce(u.show_full_name,true)=true
                          and coalesce(u.privacy_full_name,'public')='public'
                    then u.full_name else null end as full_name,
               u.username,
               case when coalesce(u.privacy_profile,'public')='public' then u.avatar_url else null end as avatar_url,
               r.primary_metric,r.secondary_metric,r.tertiary_metric,r.detail
        from ranked r join public.users u on u.id=r.user_id
        order by r.rank
        limit 100
      )
      select coalesce(jsonb_agg(to_jsonb(enriched) order by rank),'[]'::jsonb)
      into v_entries from enriched;

      v_rewards:=jsonb_build_object(
        'currency',s.reward_currency,
        'first',s.reward_first,
        'second',s.reward_second,
        'third',s.reward_third
      );

      insert into public.monthly_growth_challenge_snapshots(
        period_start,challenge_key,entries,rewards
      ) values(p_period_start,s.challenge_key,v_entries,v_rewards)
      on conflict(period_start,challenge_key) do nothing;

      for v_rank in 1..3 loop
        v_user:=null;
        select (e->>'user_id')::uuid,
               coalesce((e->>'primary_metric')::numeric,0),
               coalesce((e->>'secondary_metric')::numeric,0)
        into v_user,v_primary,v_secondary
        from jsonb_array_elements(v_entries) with ordinality x(e,ord)
        where ord=v_rank;

        v_reward:=case v_rank when 1 then s.reward_first when 2 then s.reward_second else s.reward_third end;

        if v_user is not null and v_primary>0 and v_reward>0 then
          insert into public.monthly_growth_challenge_awards(
            period_start,challenge_key,rank,user_id,primary_metric,secondary_metric,
            reward_amount,reward_currency
          ) values(
            p_period_start,s.challenge_key,v_rank,v_user,v_primary,v_secondary,
            v_reward,s.reward_currency
          )
          on conflict(period_start,challenge_key,rank) do update
            set user_id=excluded.user_id,
                primary_metric=excluded.primary_metric,
                secondary_metric=excluded.secondary_metric
          returning id into v_award_id;

          v_risk:=public.assess_monthly_growth_award_fraud(v_user,p_period_start);
          update public.monthly_growth_challenge_awards
          set risk_score=coalesce((v_risk->>'risk_score')::integer,0),
              fraud_flags=coalesce(v_risk->'flags','[]'::jsonb),
              review_status=case when jsonb_array_length(coalesce(v_risk->'flags','[]'::jsonb))>0 then 'flagged' else 'pending' end
          where id=v_award_id and status='pending';
        end if;
      end loop;
      v_count:=v_count+1;
    end if;
  end loop;

  v_auto:=public.run_monthly_growth_auto_payouts();

  return jsonb_build_object(
    'period_start',p_period_start,
    'finalized_challenges',v_count,
    'auto_payout',v_auto
  );
end;
$$;

revoke all on function public.finalize_monthly_growth_challenge_period(date) from public,anon,authenticated;
grant execute on function public.finalize_monthly_growth_challenge_period(date) to service_role;

do $$
declare
  t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array[
      'monthly_growth_challenge_settings',
      'monthly_growth_challenge_snapshots',
      'monthly_growth_challenge_awards',
      'referral_relationships',
      'orders',
      'products',
      'commission_splits',
      'dright_starter_purchases'
    ]
    loop
      if not exists(
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=t
      ) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;

commit;
