begin;

create table if not exists public.monthly_growth_challenge_settings (
  challenge_key text primary key,
  section text not null check (section in ('referral','affiliate')),
  title text not null,
  description text,
  metric_label text not null,
  enabled boolean not null default true,
  reward_currency text not null default 'NGN' check (reward_currency ~ '^[A-Z]{3}$'),
  reward_first numeric not null default 0 check (reward_first >= 0),
  reward_second numeric not null default 0 check (reward_second >= 0),
  reward_third numeric not null default 0 check (reward_third >= 0),
  display_limit integer not null default 25 check (display_limit between 3 and 200),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.monthly_growth_challenge_settings
(challenge_key,section,title,description,metric_label,sort_order)
values
  ('top_referrer','referral','Top Referrer of the Month',
   'Ranked by direct DRIGHT users referred during the current calendar month.',
   'referrals',10),
  ('top_buyer_referrer','referral','Top Buyer Referrer',
   'Ranked by unique directly referred users who completed a verified DRIGHT purchase during the month.',
   'referred buyers',20),
  ('top_seller','referral','Top Seller of the Month',
   'Ranked first by completed sales, then by approved listings uploaded during the month.',
   'sales',30),
  ('top_affiliate','affiliate','Top Affiliate of the Month',
   'Ranked by completed marketplace orders with an authoritative affiliate commission attribution.',
   'affiliate sales',10),
  ('starter_affiliate','affiliate','DRIGHT Starter Product Affiliate',
   'Ranked by verified DRIGHT Starter Access purchases attributed to the affiliate during the month.',
   'Starter sales',20)
on conflict (challenge_key) do nothing;

create table if not exists public.monthly_growth_challenge_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  challenge_key text not null references public.monthly_growth_challenge_settings(challenge_key) on delete restrict,
  entries jsonb not null default '[]'::jsonb,
  rewards jsonb not null default '{}'::jsonb,
  finalized_at timestamptz not null default now(),
  unique(period_start,challenge_key)
);

create table if not exists public.monthly_growth_challenge_awards (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  challenge_key text not null references public.monthly_growth_challenge_settings(challenge_key) on delete restrict,
  rank integer not null check (rank between 1 and 3),
  user_id uuid not null references public.users(id) on delete cascade,
  primary_metric numeric not null default 0,
  secondary_metric numeric not null default 0,
  reward_amount numeric not null default 0 check (reward_amount >= 0),
  reward_currency text not null default 'NGN' check (reward_currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  payout_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(period_start,challenge_key,rank)
);

alter table public.monthly_growth_challenge_settings enable row level security;
alter table public.monthly_growth_challenge_snapshots enable row level security;
alter table public.monthly_growth_challenge_awards enable row level security;

revoke all on public.monthly_growth_challenge_settings from anon,authenticated;
revoke all on public.monthly_growth_challenge_snapshots from anon,authenticated;
revoke all on public.monthly_growth_challenge_awards from anon,authenticated;

create index if not exists monthly_growth_awards_user_idx
  on public.monthly_growth_challenge_awards(user_id,period_start desc);
create index if not exists monthly_growth_snapshots_period_idx
  on public.monthly_growth_challenge_snapshots(period_start desc,challenge_key);

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
    with m as (
      select u.id user_id,
             count(rr.referred_id)::numeric primary_metric
      from public.users u
      left join public.referral_relationships rr
        on rr.referrer_id=u.id
       and rr.level=1
       and rr.created_at>=p_period_start::timestamptz
       and rr.created_at<p_period_end::timestamptz
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
    with m as (
      select u.id user_id,
             count(distinct rr.referred_id) filter (
               where rr.referred_id is not null and (
                 exists (
                   select 1 from public.orders o
                   where o.buyer_id=rr.referred_id
                     and o.status='COMPLETED'
                     and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
                     and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
                 )
                 or exists (
                   select 1 from public.dright_starter_purchases sp
                   where sp.buyer_user_id=rr.referred_id
                     and sp.payment_status='success'
                     and sp.processed_at is not null
                     and sp.processed_at>=p_period_start::timestamptz
                     and sp.processed_at<p_period_end::timestamptz
                 )
               )
             )::numeric primary_metric
      from public.users u
      left join public.referral_relationships rr
        on rr.referrer_id=u.id and rr.level=1
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
    with m as (
      select u.id user_id,
             count(distinct cs.order_id)::numeric sale_count,
             coalesce(sum(greatest(cs.amount-coalesce(cs.reversed_amount,0),0)),0)::numeric earning_value
      from public.users u
      left join public.commission_splits cs
        on cs.recipient_id=u.id
       and lower(cs.recipient_role)='affiliate'
       and cs.order_id is not null
      left join public.orders o
        on o.id=cs.order_id
       and o.status='COMPLETED'
       and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
       and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
      where coalesce(u.account_status,'ACTIVE')='ACTIVE'
        and coalesce(u.is_admin,false)=false
      group by u.id
    )
    select m.user_id,
           m.sale_count,
           m.earning_value,
           0::numeric,
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
    select m.user_id,
           m.sale_count,
           m.earning_value,
           0::numeric,
           jsonb_build_object('starter_sales',m.sale_count,'affiliate_earnings',m.earning_value)
    from m;
    return;
  end if;

  raise exception 'Unknown challenge key: %',p_challenge_key;
end;
$$;

revoke all on function public.compute_monthly_growth_leaderboard(text,date,date) from public,anon,authenticated;

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
  v_count integer:=0;
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
      with ranked as (
        select c.*,
               row_number() over (
                 order by c.primary_metric desc,c.secondary_metric desc,c.tertiary_metric desc,c.user_id
               ) rank
        from public.compute_monthly_growth_leaderboard(s.challenge_key,p_period_start,v_end) c
      ),
      enriched as (
        select r.rank,r.user_id,u.full_name,u.username,u.avatar_url,
               r.primary_metric,r.secondary_metric,r.tertiary_metric,r.detail
        from ranked r join public.users u on u.id=r.user_id
        where r.primary_metric>0 or r.secondary_metric>0
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
          on conflict(period_start,challenge_key,rank) do nothing;
        end if;
      end loop;
      v_count:=v_count+1;
    end if;
  end loop;

  return jsonb_build_object('period_start',p_period_start,'finalized_challenges',v_count);
end;
$$;

revoke all on function public.finalize_monthly_growth_challenge_period(date) from public,anon,authenticated;
grant execute on function public.finalize_monthly_growth_challenge_period(date) to service_role;

create or replace function public.get_public_monthly_growth_challenges(p_period text default 'current')
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_start date:=date_trunc('month',now() at time zone 'UTC')::date;
  v_previous date;
  v_end date;
  v_is_history boolean:=false;
  v_data jsonb;
begin
  if p_period='previous' then
    v_previous:=(v_start-interval '1 month')::date;
    v_start:=v_previous;
    v_is_history:=true;
    if not exists(select 1 from public.monthly_growth_challenge_snapshots where period_start=v_start) then
      perform public.finalize_monthly_growth_challenge_period(v_start);
    end if;
  elsif p_period<>'current' then
    raise exception 'Period must be current or previous';
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

  return jsonb_build_object(
    'period',p_period,
    'period_start',v_start,
    'period_end',v_end,
    'history',v_is_history,
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
    with ranked as (
      select c.*,
             row_number() over(
               order by c.primary_metric desc,c.secondary_metric desc,c.tertiary_metric desc,c.user_id
             ) rank
      from public.compute_monthly_growth_leaderboard(p_challenge_key,v_start,v_end) c
    ),
    enriched as (
      select r.rank,r.user_id,u.full_name,u.username,u.avatar_url,
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

create or replace function public.admin_get_monthly_growth_challenge_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or (
    public.is_super_admin() is not true
    and public.has_dright_permission('cms','manage') is not true
    and public.has_dright_permission('referrals','manage') is not true
  ) then
    raise exception 'Challenge management permission required';
  end if;

  return jsonb_build_object(
    'settings',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.section,s.sort_order)
      from public.monthly_growth_challenge_settings s
    ),'[]'::jsonb),
    'previous_awards',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'period_start',a.period_start,'challenge_key',a.challenge_key,
        'rank',a.rank,'user_id',a.user_id,'full_name',u.full_name,'username',u.username,
        'avatar_url',u.avatar_url,'primary_metric',a.primary_metric,
        'secondary_metric',a.secondary_metric,'reward_amount',a.reward_amount,
        'reward_currency',a.reward_currency,'status',a.status,'paid_at',a.paid_at
      ) order by a.challenge_key,a.rank)
      from public.monthly_growth_challenge_awards a
      join public.users u on u.id=a.user_id
      where a.period_start=(date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_monthly_growth_challenge_settings() from public,anon;
grant execute on function public.admin_get_monthly_growth_challenge_settings() to authenticated,service_role;

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
  if auth.uid() is null or (
    public.is_super_admin() is not true
    and public.has_dright_permission('cms','manage') is not true
    and public.has_dright_permission('referrals','manage') is not true
  ) then
    raise exception 'Challenge management permission required';
  end if;

  if upper(trim(p_reward_currency)) !~ '^[A-Z]{3}$' then raise exception 'Invalid reward currency'; end if;
  if least(coalesce(p_reward_first,0),coalesce(p_reward_second,0),coalesce(p_reward_third,0))<0 then
    raise exception 'Rewards cannot be negative';
  end if;

  update public.monthly_growth_challenge_settings
  set enabled=coalesce(p_enabled,enabled),
      title=coalesce(nullif(trim(p_title),''),title),
      description=nullif(trim(coalesce(p_description,'')),''),
      reward_currency=upper(trim(p_reward_currency)),
      reward_first=coalesce(p_reward_first,0),
      reward_second=coalesce(p_reward_second,0),
      reward_third=coalesce(p_reward_third,0),
      display_limit=least(greatest(coalesce(p_display_limit,25),3),200),
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

-- Finalize the just-ended month shortly after midnight UTC on the first day.
do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='dright_monthly_growth_challenge_finalize' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule(
    'dright_monthly_growth_challenge_finalize',
    '5 0 1 * *',
    $cron$select public.finalize_monthly_growth_challenge_period((date_trunc('month',now() at time zone 'UTC')-interval '1 month')::date);$cron$
  );
end $$;

commit;