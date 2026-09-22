
begin;

create table if not exists public.monthly_growth_public_history_settings (
  singleton boolean primary key default true check (singleton = true),
  visible_months integer not null default 1 check (visible_months between 0 and 12),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.users(id) on delete set null
);
insert into public.monthly_growth_public_history_settings(singleton, visible_months)
values(true,1)
on conflict(singleton) do nothing;

create table if not exists public.monthly_growth_simulation_settings (
  singleton boolean primary key default true check (singleton = true),
  enabled boolean not null default false,
  public_label text not null default 'AI challenger',
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.users(id) on delete set null
);
insert into public.monthly_growth_simulation_settings(singleton, enabled, public_label)
values(true,false,'AI challenger')
on conflict(singleton) do nothing;

create table if not exists public.monthly_growth_simulated_competitors (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_monthly_growth_simulated_competitors_active
  on public.monthly_growth_simulated_competitors(active, created_at desc);
create unique index if not exists uq_monthly_growth_simulated_competitors_name_ci
  on public.monthly_growth_simulated_competitors(lower(trim(display_name)));

create table if not exists public.monthly_growth_simulated_scores (
  competitor_id uuid not null references public.monthly_growth_simulated_competitors(id) on delete cascade,
  challenge_key text not null references public.monthly_growth_challenge_settings(challenge_key) on delete cascade,
  period_start date not null,
  base_score numeric not null default 0 check (base_score >= 0),
  target_score numeric null check (target_score is null or target_score >= 0),
  increment_amount numeric not null default 0 check (increment_amount >= 0),
  increment_interval_seconds integer not null default 3600 check (increment_interval_seconds between 60 and 2592000),
  started_at timestamptz not null default now(),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.users(id) on delete set null,
  primary key(competitor_id, challenge_key, period_start)
);
create index if not exists idx_monthly_growth_simulated_scores_lookup
  on public.monthly_growth_simulated_scores(challenge_key, period_start, enabled);

alter table public.monthly_growth_public_history_settings enable row level security;
alter table public.monthly_growth_simulation_settings enable row level security;
alter table public.monthly_growth_simulated_competitors enable row level security;
alter table public.monthly_growth_simulated_scores enable row level security;

revoke all on public.monthly_growth_public_history_settings from public,anon,authenticated;
revoke all on public.monthly_growth_simulation_settings from public,anon,authenticated;
revoke all on public.monthly_growth_simulated_competitors from public,anon,authenticated;
revoke all on public.monthly_growth_simulated_scores from public,anon,authenticated;
grant all on public.monthly_growth_public_history_settings to service_role;
grant all on public.monthly_growth_simulation_settings to service_role;
grant all on public.monthly_growth_simulated_competitors to service_role;
grant all on public.monthly_growth_simulated_scores to service_role;

drop trigger if exists monthly_growth_signal_history_settings on public.monthly_growth_public_history_settings;
create trigger monthly_growth_signal_history_settings
after insert or update or delete on public.monthly_growth_public_history_settings
for each statement execute function public.bump_monthly_growth_realtime_signal();

drop trigger if exists monthly_growth_signal_simulation_settings on public.monthly_growth_simulation_settings;
create trigger monthly_growth_signal_simulation_settings
after insert or update or delete on public.monthly_growth_simulation_settings
for each statement execute function public.bump_monthly_growth_realtime_signal();

drop trigger if exists monthly_growth_signal_simulated_competitors on public.monthly_growth_simulated_competitors;
create trigger monthly_growth_signal_simulated_competitors
after insert or update or delete on public.monthly_growth_simulated_competitors
for each statement execute function public.bump_monthly_growth_realtime_signal();

drop trigger if exists monthly_growth_signal_simulated_scores on public.monthly_growth_simulated_scores;
create trigger monthly_growth_signal_simulated_scores
after insert or update or delete on public.monthly_growth_simulated_scores
for each statement execute function public.bump_monthly_growth_realtime_signal();

create or replace function public.compute_monthly_growth_leaderboard(
  p_challenge_key text,
  p_period_start date,
  p_period_end date
)
returns table(
  user_id uuid,
  primary_metric numeric,
  secondary_metric numeric,
  tertiary_metric numeric,
  detail jsonb
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'Invalid challenge period';
  end if;

  if p_challenge_key='top_referrer' then
    return query
    with direct_refs as (
      select rr.referrer_id, rr.referred_id, rr.created_at
      from public.referral_relationships rr
      where rr.level=1
      union
      select r.referrer_id, r.referred_user_id, r.created_at
      from public.referrals r
      where r.referrer_id is not null and r.referred_user_id is not null
      union
      select u.referred_by, u.id, u.created_at
      from public.users u
      where u.referred_by is not null
    ),
    m as (
      select u.id user_id,
             count(distinct d.referred_id) filter(
               where d.created_at>=p_period_start::timestamptz
                 and d.created_at<p_period_end::timestamptz
             )::numeric primary_metric
      from public.users u
      left join direct_refs d on d.referrer_id=u.id
      where coalesce(u.account_status,'ACTIVE')='ACTIVE'
        and coalesce(u.is_admin,false)=false
      group by u.id
    )
    select m.user_id,m.primary_metric,0::numeric,0::numeric,
           jsonb_build_object('referrals',m.primary_metric)
    from m;
    return;
  end if;

  if p_challenge_key='top_buyer_referrer' then
    return query
    with direct_refs as (
      select rr.referrer_id, rr.referred_id
      from public.referral_relationships rr
      where rr.level=1
      union
      select r.referrer_id, r.referred_user_id
      from public.referrals r
      where r.referrer_id is not null and r.referred_user_id is not null
      union
      select u.referred_by, u.id
      from public.users u
      where u.referred_by is not null
    ),
    m as (
      select u.id user_id,
             count(distinct d.referred_id) filter (
               where d.referred_id is not null and (
                 exists (
                   select 1 from public.orders o
                   where o.buyer_id=d.referred_id
                     and o.status='COMPLETED'
                     and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
                     and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
                 )
                 or exists (
                   select 1 from public.dright_starter_purchases sp
                   where sp.buyer_user_id=d.referred_id
                     and sp.payment_status='success'
                     and sp.processed_at is not null
                     and sp.processed_at>=p_period_start::timestamptz
                     and sp.processed_at<p_period_end::timestamptz
                 )
               )
             )::numeric primary_metric
      from public.users u
      left join direct_refs d on d.referrer_id=u.id
      where coalesce(u.account_status,'ACTIVE')='ACTIVE'
        and coalesce(u.is_admin,false)=false
      group by u.id
    )
    select m.user_id,m.primary_metric,0::numeric,0::numeric,
           jsonb_build_object('referred_buyers',m.primary_metric)
    from m;
    return;
  end if;

  if p_challenge_key='top_seller' then
    return query
    with sales as (
      select o.seller_id user_id,
             count(*)::numeric sales_count,
             coalesce(sum(o.final_price),0)::numeric sales_value
      from public.orders o
      join public.products p on p.id=o.product_id
      where o.status='COMPLETED'
        and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
        and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
        and coalesce(p.specifications->>'first_party','false')<>'true'
      group by o.seller_id
    ),
    listings as (
      select p.uploaded_by user_id,count(*)::numeric listing_count
      from public.products p
      where upper(coalesce(p.approval_status,''))='APPROVED'
        and p.is_active=true
        and p.created_at>=p_period_start::timestamptz
        and p.created_at<p_period_end::timestamptz
        and coalesce(p.specifications->>'first_party','false')<>'true'
      group by p.uploaded_by
    )
    select u.id,
           coalesce(s.sales_count,0),
           coalesce(l.listing_count,0),
           coalesce(s.sales_value,0),
           jsonb_build_object(
             'sales',coalesce(s.sales_count,0),
             'approved_uploads',coalesce(l.listing_count,0),
             'sales_value',coalesce(s.sales_value,0)
           )
    from public.users u
    left join sales s on s.user_id=u.id
    left join listings l on l.user_id=u.id
    where coalesce(u.account_status,'ACTIVE')='ACTIVE'
      and coalesce(u.is_admin,false)=false;
    return;
  end if;

  if p_challenge_key='top_affiliate' then
    return query
    with attributed_orders as (
      select distinct cs.recipient_id user_id, o.id order_id,
             greatest(cs.amount-coalesce(cs.reversed_amount,0),0)::numeric earning_value
      from public.commission_splits cs
      join public.orders o on o.id=cs.order_id
      where lower(cs.recipient_role)='affiliate'
        and cs.order_id is not null
        and o.status='COMPLETED'
        and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
        and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
      union
      select o.referrer_id user_id, o.id order_id,
             coalesce(o.affiliate_commission_amount,0)::numeric earning_value
      from public.orders o
      where o.referrer_id is not null
        and o.status='COMPLETED'
        and lower(coalesce(o.referrer_role,o.source_type,'')) like '%affiliate%'
        and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
        and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
    ),
    m as (
      select u.id user_id,
             count(distinct a.order_id)::numeric sale_count,
             coalesce(sum(a.earning_value),0)::numeric earning_value
      from public.users u
      left join attributed_orders a on a.user_id=u.id
      where coalesce(u.account_status,'ACTIVE')='ACTIVE'
        and coalesce(u.is_admin,false)=false
      group by u.id
    )
    select m.user_id,m.sale_count,m.earning_value,0::numeric,
           jsonb_build_object('affiliate_sales',m.sale_count,'affiliate_earnings',m.earning_value)
    from m;
    return;
  end if;

  if p_challenge_key='starter_affiliate' then
    return query
    with m as (
      select u.id user_id,
             count(sp.id)::numeric sale_count,
             coalesce(sum(sp.affiliate_commission_amount),0)::numeric earning_value
      from public.users u
      left join public.dright_starter_purchases sp
        on sp.referrer_id=u.id
       and sp.payment_status='success'
       and sp.processed_at is not null
       and sp.processed_at>=p_period_start::timestamptz
       and sp.processed_at<p_period_end::timestamptz
      where coalesce(u.account_status,'ACTIVE')='ACTIVE'
        and coalesce(u.is_admin,false)=false
      group by u.id
    )
    select m.user_id,m.sale_count,m.earning_value,0::numeric,
           jsonb_build_object('starter_sales',m.sale_count,'affiliate_earnings',m.earning_value)
    from m;
    return;
  end if;

  raise exception 'Unknown challenge key: %',p_challenge_key;
end;
$$;

create or replace function public.get_public_monthly_growth_challenges(
  p_period text default 'current'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_current_start date:=date_trunc('month',now() at time zone 'UTC')::date;
  v_start date:=v_current_start;
  v_end date;
  v_is_history boolean:=false;
  v_visible integer:=1;
  v_oldest date;
  v_data jsonb;
  v_history_periods jsonb:='[]'::jsonb;
  v_sim_enabled boolean:=false;
  v_sim_label text:='AI challenger';
begin
  select visible_months into v_visible
  from public.monthly_growth_public_history_settings
  where singleton=true;
  v_visible:=least(greatest(coalesce(v_visible,1),0),12);
  v_oldest:=(v_current_start-make_interval(months=>v_visible))::date;

  select enabled,public_label into v_sim_enabled,v_sim_label
  from public.monthly_growth_simulation_settings
  where singleton=true;

  if p_period='previous' then
    v_start:=(v_current_start-interval '1 month')::date;
    v_is_history:=true;
  elsif p_period like 'month:%' then
    begin
      v_start:=substring(p_period from 7)::date;
    exception when others then
      raise exception 'Invalid history period';
    end;
    if v_start<>date_trunc('month',v_start)::date or v_start>=v_current_start then
      raise exception 'Invalid history period';
    end if;
    v_is_history:=true;
  elsif p_period<>'current' then
    raise exception 'Period must be current, previous, or month:YYYY-MM-DD';
  end if;

  if v_is_history and (v_visible=0 or v_start<v_oldest) then
    raise exception 'That history month is not public';
  end if;

  v_end:=(v_start+interval '1 month')::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'challenge_key',s.challenge_key,
    'section',s.section,
    'title',s.title,
    'description',s.description,
    'metric_label',s.metric_label,
    'enabled',s.enabled,
    'reward_currency',s.reward_currency,
    'reward_first',s.reward_first,
    'reward_second',s.reward_second,
    'reward_third',s.reward_third,
    'display_limit',s.display_limit
  ) order by s.section,s.sort_order),'[]'::jsonb)
  into v_data
  from public.monthly_growth_challenge_settings s
  where s.enabled=true;

  if v_visible>0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'period','month:'||to_char(gs.d,'YYYY-MM-DD'),
      'period_start',gs.d,
      'label',to_char(gs.d,'FMMonth YYYY')
    ) order by gs.d desc),'[]'::jsonb)
    into v_history_periods
    from (
      select (v_current_start-make_interval(months=>n))::date d
      from generate_series(1,v_visible) n
    ) gs;
  end if;

  return jsonb_build_object(
    'period',p_period,
    'period_start',v_start,
    'period_end',v_end,
    'history',v_is_history,
    'history_periods',v_history_periods,
    'simulation_enabled',coalesce(v_sim_enabled,false),
    'simulation_label',coalesce(nullif(v_sim_label,''),'AI challenger'),
    'challenges',v_data
  );
end;
$$;

revoke all on function public.get_public_monthly_growth_challenges(text) from public;
grant execute on function public.get_public_monthly_growth_challenges(text) to anon,authenticated,service_role;

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
  v_current_start date:=date_trunc('month',now() at time zone 'UTC')::date;
  v_start date:=v_current_start;
  v_end date;
  v_total integer:=0;
  v_entries jsonb:='[]'::jsonb;
  v_snapshot jsonb;
  v_visible integer:=1;
  v_oldest date;
begin
  p_limit:=least(greatest(coalesce(p_limit,25),3),200);
  p_offset:=greatest(coalesce(p_offset,0),0);

  if not exists(
    select 1 from public.monthly_growth_challenge_settings
    where challenge_key=p_challenge_key and enabled=true
  ) then
    raise exception 'Challenge is unavailable';
  end if;

  select visible_months into v_visible
  from public.monthly_growth_public_history_settings
  where singleton=true;
  v_visible:=least(greatest(coalesce(v_visible,1),0),12);
  v_oldest:=(v_current_start-make_interval(months=>v_visible))::date;

  if p_period='previous' then
    v_start:=(v_current_start-interval '1 month')::date;
  elsif p_period like 'month:%' then
    begin
      v_start:=substring(p_period from 7)::date;
    exception when others then
      raise exception 'Invalid history period';
    end;
  elsif p_period<>'current' then
    raise exception 'Period must be current, previous, or month:YYYY-MM-DD';
  end if;

  if p_period<>'current' then
    if v_visible=0 or v_start<v_oldest or v_start>=v_current_start then
      raise exception 'That history month is not public';
    end if;
    select entries into v_snapshot
    from public.monthly_growth_challenge_snapshots
    where period_start=v_start and challenge_key=p_challenge_key;

    v_total:=jsonb_array_length(coalesce(v_snapshot,'[]'::jsonb));
    select coalesce(jsonb_agg(
      (e || jsonb_build_object(
        'is_simulated',false,
        'is_ranked',coalesce((e->>'rank')::integer,0)>0,
        'source_label','DRIGHT user'
      ))
      order by ord
    ),'[]'::jsonb)
    into v_entries
    from jsonb_array_elements(coalesce(v_snapshot,'[]'::jsonb)) with ordinality x(e,ord)
    where ord>p_offset and ord<=p_offset+p_limit;
  else
    v_end:=(v_start+interval '1 month')::date;

    with real_base as (
      select
        c.user_id as entry_id,
        c.user_id as real_user_id,
        case when coalesce(u.show_full_name,true)=true
                   and coalesce(u.privacy_full_name,'public')='public'
             then u.full_name else null end as full_name,
        u.username,
        case when coalesce(u.privacy_profile,'public')='public' then u.avatar_url else null end as avatar_url,
        c.primary_metric,c.secondary_metric,c.tertiary_metric,c.detail,
        false as is_simulated,
        'DRIGHT user'::text as source_label,
        greatest(coalesce(u.last_active_at,u.last_active,u.created_at),u.created_at) as activity_at
      from public.compute_monthly_growth_leaderboard(p_challenge_key,v_start,v_end) c
      join public.users u on u.id=c.user_id
    ),
    simulated_base as (
      select
        sc.competitor_id as entry_id,
        null::uuid as real_user_id,
        comp.display_name as full_name,
        null::text as username,
        null::text as avatar_url,
        greatest(
          0,
          case
            when sc.target_score is null then
              sc.base_score + floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount
            else least(
              sc.target_score,
              sc.base_score + floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount
            )
          end
        )::numeric as primary_metric,
        0::numeric as secondary_metric,
        0::numeric as tertiary_metric,
        jsonb_build_object(
          'simulated',true,
          'target_score',sc.target_score,
          'increment_amount',sc.increment_amount,
          'increment_interval_seconds',sc.increment_interval_seconds
        ) as detail,
        true as is_simulated,
        coalesce(ss.public_label,'AI challenger')::text as source_label,
        sc.updated_at as activity_at
      from public.monthly_growth_simulated_scores sc
      join public.monthly_growth_simulated_competitors comp
        on comp.id=sc.competitor_id and comp.active=true
      join public.monthly_growth_simulation_settings ss
        on ss.singleton=true and ss.enabled=true
      where sc.challenge_key=p_challenge_key
        and sc.period_start=v_start
        and sc.enabled=true
    ),
    combined as (
      select * from real_base
      union all
      select * from simulated_base
    ),
    ranked_positive as (
      select
        row_number() over(
          order by primary_metric desc,secondary_metric desc,tertiary_metric desc,entry_id
        )::integer as rank,
        *
      from combined
      where primary_metric>0 or secondary_metric>0 or tertiary_metric>0
    ),
    unranked_zero as (
      select
        0::integer as rank,
        *,
        row_number() over(order by activity_at desc nulls last,entry_id)::integer as idle_order
      from combined
      where primary_metric=0 and secondary_metric=0 and tertiary_metric=0
    ),
    ordered as (
      select
        rank,entry_id,real_user_id,full_name,username,avatar_url,
        primary_metric,secondary_metric,tertiary_metric,detail,is_simulated,source_label,
        rank::bigint as display_order
      from ranked_positive
      union all
      select
        rank,entry_id,real_user_id,full_name,username,avatar_url,
        primary_metric,secondary_metric,tertiary_metric,detail,is_simulated,source_label,
        (1000000+idle_order)::bigint as display_order
      from unranked_zero
    ),
    paged as (
      select *,
             row_number() over(order by display_order,entry_id) as row_index
      from ordered
    )
    select
      (select count(*)::integer from ordered),
      coalesce(jsonb_agg(jsonb_build_object(
        'rank',p.rank,
        'user_id',p.entry_id,
        'full_name',p.full_name,
        'username',p.username,
        'avatar_url',p.avatar_url,
        'primary_metric',p.primary_metric,
        'secondary_metric',p.secondary_metric,
        'tertiary_metric',p.tertiary_metric,
        'detail',p.detail,
        'is_simulated',p.is_simulated,
        'is_ranked',p.rank>0,
        'source_label',p.source_label
      ) order by p.row_index),'[]'::jsonb)
    into v_total,v_entries
    from paged p
    where p.row_index>p_offset and p.row_index<=p_offset+p_limit;
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

create or replace function public.admin_update_monthly_growth_challenge(
  p_challenge_key text,
  p_enabled boolean,
  p_title text,
  p_description text,
  p_reward_currency text,
  p_reward_first numeric,
  p_reward_second numeric,
  p_reward_third numeric,
  p_display_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  if upper(trim(coalesce(p_reward_currency,''))) !~ '^[A-Z]{3}$' then
    raise exception 'Invalid reward currency';
  end if;
  if least(coalesce(p_reward_first,0),coalesce(p_reward_second,0),coalesce(p_reward_third,0))<0 then
    raise exception 'Rewards cannot be negative';
  end if;

  update public.monthly_growth_challenge_settings
  set enabled=coalesce(p_enabled,enabled),
      title=coalesce(nullif(trim(p_title),''),title),
      description=nullif(trim(coalesce(p_description,'')),''),
      reward_currency=upper(trim(p_reward_currency)),
      reward_first=coalesce(p_reward_first,reward_first),
      reward_second=coalesce(p_reward_second,reward_second),
      reward_third=coalesce(p_reward_third,reward_third),
      display_limit=least(greatest(coalesce(p_display_limit,display_limit),3),200),
      updated_at=now(),
      updated_by=auth.uid()
  where challenge_key=p_challenge_key;

  if not found then raise exception 'Unknown challenge key'; end if;

  return (
    select to_jsonb(s) from public.monthly_growth_challenge_settings s
    where s.challenge_key=p_challenge_key
  );
end;
$$;

revoke all on function public.admin_update_monthly_growth_challenge(text,boolean,text,text,text,numeric,numeric,numeric,integer) from public,anon;
grant execute on function public.admin_update_monthly_growth_challenge(text,boolean,text,text,text,numeric,numeric,numeric,integer) to authenticated,service_role;

create or replace function public.admin_update_monthly_growth_history_settings(
  p_visible_months integer
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_admin uuid:=auth.uid();
  v_months integer:=least(greatest(coalesce(p_visible_months,1),0),12);
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  insert into public.monthly_growth_public_history_settings(singleton,visible_months,updated_at,updated_by)
  values(true,v_months,now(),v_admin)
  on conflict(singleton) do update
  set visible_months=excluded.visible_months,
      updated_at=excluded.updated_at,
      updated_by=excluded.updated_by;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(v_admin,'competition_history_visibility_update','monthly_growth_competition',
         jsonb_build_object('visible_months',v_months));

  return jsonb_build_object('visible_months',v_months);
end;
$$;
revoke all on function public.admin_update_monthly_growth_history_settings(integer) from public,anon;
grant execute on function public.admin_update_monthly_growth_history_settings(integer) to authenticated,service_role;

create or replace function public.admin_update_monthly_growth_simulation_settings(
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_admin uuid:=auth.uid();
  v_enabled boolean:=coalesce(p_enabled,false);
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  insert into public.monthly_growth_simulation_settings(singleton,enabled,public_label,updated_at,updated_by)
  values(true,v_enabled,'AI challenger',now(),v_admin)
  on conflict(singleton) do update
  set enabled=excluded.enabled,
      public_label='AI challenger',
      updated_at=excluded.updated_at,
      updated_by=excluded.updated_by;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(v_admin,'competition_simulation_toggle','monthly_growth_competition',
         jsonb_build_object('enabled',v_enabled,'public_label','AI challenger'));

  return jsonb_build_object('enabled',v_enabled,'public_label','AI challenger');
end;
$$;
revoke all on function public.admin_update_monthly_growth_simulation_settings(boolean) from public,anon;
grant execute on function public.admin_update_monthly_growth_simulation_settings(boolean) to authenticated,service_role;

create or replace function public.admin_import_monthly_growth_simulated_competitors(
  p_names text[]
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_admin uuid:=auth.uid();
  v_name text;
  v_inserted integer:=0;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  if coalesce(array_length(p_names,1),0)>20000 then
    raise exception 'Import is limited to 20,000 names per request';
  end if;

  foreach v_name in array coalesce(p_names,array[]::text[]) loop
    v_name:=trim(regexp_replace(coalesce(v_name,''),'\s+',' ','g'));
    if char_length(v_name) between 2 and 120
       and not exists(
         select 1 from public.monthly_growth_simulated_competitors c
         where lower(trim(c.display_name))=lower(v_name)
       ) then
      insert into public.monthly_growth_simulated_competitors(display_name)
      values(v_name);
      v_inserted:=v_inserted+1;
    end if;
  end loop;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(v_admin,'competition_simulated_competitors_import','monthly_growth_competition',
         jsonb_build_object('inserted',v_inserted));

  return jsonb_build_object(
    'inserted',v_inserted,
    'total',(select count(*) from public.monthly_growth_simulated_competitors)
  );
end;
$$;
revoke all on function public.admin_import_monthly_growth_simulated_competitors(text[]) from public,anon;
grant execute on function public.admin_import_monthly_growth_simulated_competitors(text[]) to authenticated,service_role;

create or replace function public.admin_get_monthly_growth_simulated_competitors(
  p_challenge_key text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_start date:=date_trunc('month',now() at time zone 'UTC')::date;
  v_total integer:=0;
  v_entries jsonb:='[]'::jsonb;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;
  p_limit:=least(greatest(coalesce(p_limit,50),1),200);
  p_offset:=greatest(coalesce(p_offset,0),0);

  if not exists(select 1 from public.monthly_growth_challenge_settings where challenge_key=p_challenge_key) then
    raise exception 'Unknown challenge key';
  end if;

  select count(*) into v_total
  from public.monthly_growth_simulated_competitors
  where active=true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,
    'display_name',q.display_name,
    'active',q.active,
    'base_score',coalesce(q.base_score,0),
    'target_score',q.target_score,
    'increment_amount',coalesce(q.increment_amount,0),
    'increment_interval_seconds',coalesce(q.increment_interval_seconds,3600),
    'enabled',coalesce(q.score_enabled,false),
    'effective_score',coalesce(q.effective_score,0)
  ) order by q.display_name,q.id),'[]'::jsonb)
  into v_entries
  from (
    select c.id,c.display_name,c.active,
           sc.base_score,sc.target_score,sc.increment_amount,sc.increment_interval_seconds,
           sc.enabled score_enabled,
           case
             when sc.competitor_id is null then 0::numeric
             when sc.target_score is null then
               sc.base_score + floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount
             else least(
               sc.target_score,
               sc.base_score + floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount
             )
           end::numeric effective_score
    from public.monthly_growth_simulated_competitors c
    left join public.monthly_growth_simulated_scores sc
      on sc.competitor_id=c.id
     and sc.challenge_key=p_challenge_key
     and sc.period_start=v_start
    where c.active=true
    order by c.display_name,c.id
    limit p_limit offset p_offset
  ) q;

  return jsonb_build_object(
    'challenge_key',p_challenge_key,
    'period_start',v_start,
    'total',v_total,
    'offset',p_offset,
    'limit',p_limit,
    'entries',v_entries
  );
end;
$$;
revoke all on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer) from public,anon;
grant execute on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer) to authenticated,service_role;

create or replace function public.admin_update_monthly_growth_simulated_score(
  p_competitor_id uuid,
  p_challenge_key text,
  p_base_score numeric,
  p_target_score numeric,
  p_increment_amount numeric,
  p_increment_interval_seconds integer,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_admin uuid:=auth.uid();
  v_start date:=date_trunc('month',now() at time zone 'UTC')::date;
  v_interval integer:=least(greatest(coalesce(p_increment_interval_seconds,3600),60),2592000);
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;
  if not exists(select 1 from public.monthly_growth_simulated_competitors where id=p_competitor_id and active=true) then
    raise exception 'Simulated competitor not found';
  end if;
  if not exists(select 1 from public.monthly_growth_challenge_settings where challenge_key=p_challenge_key) then
    raise exception 'Unknown challenge key';
  end if;
  if coalesce(p_base_score,0)<0 or coalesce(p_increment_amount,0)<0 or (p_target_score is not null and p_target_score<0) then
    raise exception 'Simulation scores cannot be negative';
  end if;

  insert into public.monthly_growth_simulated_scores(
    competitor_id,challenge_key,period_start,base_score,target_score,
    increment_amount,increment_interval_seconds,started_at,enabled,updated_at,updated_by
  )
  values(
    p_competitor_id,p_challenge_key,v_start,coalesce(p_base_score,0),p_target_score,
    coalesce(p_increment_amount,0),v_interval,now(),coalesce(p_enabled,true),now(),v_admin
  )
  on conflict(competitor_id,challenge_key,period_start) do update
  set base_score=excluded.base_score,
      target_score=excluded.target_score,
      increment_amount=excluded.increment_amount,
      increment_interval_seconds=excluded.increment_interval_seconds,
      started_at=now(),
      enabled=excluded.enabled,
      updated_at=now(),
      updated_by=v_admin;

  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values(v_admin,'competition_simulated_score_update',p_competitor_id,'monthly_growth_simulated_competitor',
         jsonb_build_object(
           'challenge_key',p_challenge_key,
           'period_start',v_start,
           'base_score',coalesce(p_base_score,0),
           'target_score',p_target_score,
           'increment_amount',coalesce(p_increment_amount,0),
           'increment_interval_seconds',v_interval,
           'enabled',coalesce(p_enabled,true)
         ));

  return (
    select jsonb_build_object(
      'competitor_id',sc.competitor_id,
      'challenge_key',sc.challenge_key,
      'period_start',sc.period_start,
      'base_score',sc.base_score,
      'target_score',sc.target_score,
      'increment_amount',sc.increment_amount,
      'increment_interval_seconds',sc.increment_interval_seconds,
      'enabled',sc.enabled
    )
    from public.monthly_growth_simulated_scores sc
    where sc.competitor_id=p_competitor_id and sc.challenge_key=p_challenge_key and sc.period_start=v_start
  );
end;
$$;
revoke all on function public.admin_update_monthly_growth_simulated_score(uuid,text,numeric,numeric,numeric,integer,boolean) from public,anon;
grant execute on function public.admin_update_monthly_growth_simulated_score(uuid,text,numeric,numeric,numeric,integer,boolean) to authenticated,service_role;

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
  v_active_users integer:=0;
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

  select count(*) into v_active_users
  from public.users
  where coalesce(account_status,'ACTIVE')='ACTIVE'
    and coalesce(is_admin,false)=false;

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
      'active_users',v_active_users,
      'ranked_users',v_ranked,
      'pending_review',v_pending,
      'flagged_awards',v_flagged,
      'paid_awards',v_paid,
      'paid_total',v_paid_total
    ),
    'payout_settings',coalesce((
      select to_jsonb(p) from public.monthly_growth_challenge_payout_settings p where singleton=true
    ),'{}'::jsonb),
    'history_settings',coalesce((
      select to_jsonb(h) from public.monthly_growth_public_history_settings h where singleton=true
    ),jsonb_build_object('visible_months',1)),
    'simulation_settings',coalesce((
      select to_jsonb(s) from public.monthly_growth_simulation_settings s where singleton=true
    ),jsonb_build_object('enabled',false,'public_label','AI challenger')),
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
        limit 200
      ) a
      join public.users u on u.id=a.user_id
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'period_start',x.period_start,
        'challenge_key',x.challenge_key,
        'entries',x.entries,
        'rewards',x.rewards,
        'finalized_at',x.finalized_at
      ) order by x.period_start desc,x.challenge_key)
      from (
        select *
        from public.monthly_growth_challenge_snapshots
        where period_start>=v_start-interval '12 months'
        order by period_start desc,challenge_key
        limit 120
      ) x
    ),'[]'::jsonb),
    'recent_activity',coalesce((
      with events as (
        select rr.created_at event_at,'referral_signup'::text event_type,rr.referrer_id actor_id,
               rr.referred_id target_user_id,1::numeric value,null::uuid order_id
        from public.referral_relationships rr
        where rr.level=1 and rr.created_at>=v_start
        union all
        select coalesce(o.completed_at,o.created_at),'seller_sale',o.seller_id,o.buyer_id,
               coalesce(o.final_price,0),o.id
        from public.orders o
        where o.status='COMPLETED' and coalesce(o.completed_at,o.created_at)>=v_start
        union all
        select coalesce(o.completed_at,o.created_at),'affiliate_sale',o.referrer_id,o.buyer_id,
               coalesce(o.affiliate_commission_amount,0),o.id
        from public.orders o
        where o.status='COMPLETED'
          and o.referrer_id is not null
          and coalesce(o.completed_at,o.created_at)>=v_start
        union all
        select p.created_at,'approved_listing',p.uploaded_by,null::uuid,1::numeric,null::uuid
        from public.products p
        where upper(coalesce(p.approval_status,''))='APPROVED' and p.created_at>=v_start
        union all
        select sp.processed_at,'starter_affiliate_sale',sp.referrer_id,sp.buyer_user_id,
               coalesce(sp.affiliate_commission_amount,0),null::uuid
        from public.dright_starter_purchases sp
        where sp.payment_status='success' and sp.processed_at>=v_start and sp.referrer_id is not null
      )
      select jsonb_agg(jsonb_build_object(
        'event_at',e.event_at,
        'event_type',e.event_type,
        'actor_id',e.actor_id,
        'actor_name',a.full_name,
        'actor_username',a.username,
        'target_user_id',e.target_user_id,
        'target_name',t.full_name,
        'value',e.value,
        'order_id',e.order_id
      ) order by e.event_at desc)
      from (
        select *
        from events
        where actor_id is not null
        order by event_at desc
        limit 100
      ) e
      left join public.users a on a.id=e.actor_id
      left join public.users t on t.id=e.target_user_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_monthly_growth_competition_dashboard() from public,anon;
grant execute on function public.admin_get_monthly_growth_competition_dashboard() to authenticated,service_role;

commit;
