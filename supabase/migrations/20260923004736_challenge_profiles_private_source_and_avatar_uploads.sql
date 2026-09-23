alter table public.monthly_growth_simulated_competitors
  add column if not exists avatar_url text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'competition-avatars',
  'competition-avatars',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public=true,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Competition avatars public read" on storage.objects;
create policy "Competition avatars public read"
on storage.objects for select
to anon, authenticated
using (bucket_id='competition-avatars');

drop policy if exists "Competition avatars admin insert" on storage.objects;
create policy "Competition avatars admin insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id='competition-avatars'
  and public.monthly_growth_competition_admin_allowed() is true
);

drop policy if exists "Competition avatars admin update" on storage.objects;
create policy "Competition avatars admin update"
on storage.objects for update
to authenticated
using (
  bucket_id='competition-avatars'
  and public.monthly_growth_competition_admin_allowed() is true
)
with check (
  bucket_id='competition-avatars'
  and public.monthly_growth_competition_admin_allowed() is true
);

drop policy if exists "Competition avatars admin delete" on storage.objects;
create policy "Competition avatars admin delete"
on storage.objects for delete
to authenticated
using (
  bucket_id='competition-avatars'
  and public.monthly_growth_competition_admin_allowed() is true
);

create or replace function public.admin_update_monthly_growth_simulated_competitor_avatar(
  p_competitor_id uuid,
  p_avatar_url text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_avatar text:=nullif(trim(coalesce(p_avatar_url,'')),'');
  v_row public.monthly_growth_simulated_competitors%rowtype;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  if v_avatar is not null and v_avatar !~* '^https?://' then
    raise exception 'Avatar URL must be an HTTP(S) URL';
  end if;

  update public.monthly_growth_simulated_competitors
  set avatar_url=v_avatar,
      updated_at=now()
  where id=p_competitor_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Simulated competitor not found';
  end if;

  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values(
    auth.uid(),
    'competition_simulated_avatar_update',
    p_competitor_id,
    'monthly_growth_simulated_competitor',
    jsonb_build_object('avatar_url',v_avatar)
  );

  return jsonb_build_object(
    'id',v_row.id,
    'display_name',v_row.display_name,
    'avatar_url',v_row.avatar_url
  );
end;
$$;

revoke all on function public.admin_update_monthly_growth_simulated_competitor_avatar(uuid,text) from public,anon;
grant execute on function public.admin_update_monthly_growth_simulated_competitor_avatar(uuid,text) to authenticated,service_role;

create or replace function public.admin_get_monthly_growth_simulated_competitors(
  p_challenge_key text,
  p_limit integer,
  p_offset integer,
  p_search text
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
  v_search text:=nullif(trim(coalesce(p_search,'')),'');
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
  from public.monthly_growth_simulated_competitors c
  where c.active=true
    and (v_search is null or c.display_name ilike '%'||v_search||'%');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,
    'display_name',q.display_name,
    'avatar_url',q.avatar_url,
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
    select c.id,c.display_name,c.avatar_url,c.active,
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
      and (v_search is null or c.display_name ilike '%'||v_search||'%')
    order by c.display_name,c.id
    limit p_limit offset p_offset
  ) q;

  return jsonb_build_object(
    'challenge_key',p_challenge_key,
    'period_start',v_start,
    'total',v_total,
    'offset',p_offset,
    'limit',p_limit,
    'search',v_search,
    'entries',v_entries
  );
end;
$$;

revoke all on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer,text) from public,anon;
grant execute on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer,text) to authenticated,service_role;

create or replace function public.admin_get_monthly_growth_simulated_competitors(
  p_challenge_key text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select public.admin_get_monthly_growth_simulated_competitors(
    p_challenge_key,p_limit,p_offset,null::text
  );
$$;

revoke all on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer) from public,anon;
grant execute on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer) to authenticated,service_role;

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
begin
  select visible_months into v_visible
  from public.monthly_growth_public_history_settings
  where singleton=true;
  v_visible:=least(greatest(coalesce(v_visible,1),0),12);
  v_oldest:=(v_current_start-make_interval(months=>v_visible))::date;

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
    select coalesce(jsonb_agg(e order by ord),'[]'::jsonb)
    into v_entries
    from jsonb_array_elements(coalesce(v_snapshot,'[]'::jsonb)) with ordinality x(e,ord)
    where ord>p_offset and ord<=p_offset+p_limit;
  else
    v_end:=(v_start+interval '1 month')::date;

    with real_base as (
      select
        c.user_id as entry_id,
        case when coalesce(u.show_full_name,true)=true
                   and coalesce(u.privacy_full_name,'public')='public'
             then u.full_name else null end as full_name,
        u.username,
        case when coalesce(u.privacy_profile,'public')='public' then u.avatar_url else null end as avatar_url,
        c.primary_metric,c.secondary_metric,c.tertiary_metric,c.detail,
        false as is_synthetic,
        greatest(coalesce(u.last_active_at,u.last_active,u.created_at),u.created_at) as activity_at
      from public.compute_monthly_growth_leaderboard(p_challenge_key,v_start,v_end) c
      join public.users u on u.id=c.user_id
    ),
    real_prize_ranks as (
      select entry_id,
             row_number() over(
               order by primary_metric desc,secondary_metric desc,tertiary_metric desc,entry_id
             )::integer as reward_rank
      from real_base
      where primary_metric>0 or secondary_metric>0 or tertiary_metric>0
    ),
    real_with_reward_rank as (
      select r.*,coalesce(p.reward_rank,0)::integer as reward_rank
      from real_base r
      left join real_prize_ranks p on p.entry_id=r.entry_id
    ),
    simulated_base as (
      select
        comp.id as entry_id,
        comp.display_name as full_name,
        null::text as username,
        comp.avatar_url,
        greatest(
          0,
          case
            when sc.competitor_id is null then 0
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
        '{}'::jsonb as detail,
        true as is_synthetic,
        coalesce(sc.updated_at,comp.updated_at,comp.created_at) as activity_at,
        0::integer as reward_rank
      from public.monthly_growth_simulated_competitors comp
      join public.monthly_growth_simulation_settings ss
        on ss.singleton=true and ss.enabled=true
      left join public.monthly_growth_simulated_scores sc
        on sc.competitor_id=comp.id
       and sc.challenge_key=p_challenge_key
       and sc.period_start=v_start
       and sc.enabled=true
      where comp.active=true
    ),
    combined as (
      select * from real_with_reward_rank
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
        row_number() over(
          order by activity_at desc nulls last, entry_id
        )::integer as idle_order
      from combined
      where primary_metric=0 and secondary_metric=0 and tertiary_metric=0
    ),
    ordered as (
      select
        rank,entry_id,full_name,username,avatar_url,
        primary_metric,secondary_metric,tertiary_metric,detail,
        is_synthetic,reward_rank,
        rank::bigint as display_order
      from ranked_positive
      union all
      select
        rank,entry_id,full_name,username,avatar_url,
        primary_metric,secondary_metric,tertiary_metric,detail,
        is_synthetic,reward_rank,
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
        'is_ranked',p.rank>0
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
