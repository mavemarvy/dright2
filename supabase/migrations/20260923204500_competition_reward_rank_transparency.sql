begin;

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
        'reward_rank',coalesce((e->>'rank')::integer,0),
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
        sc.competitor_id as entry_id,
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
        sc.updated_at as activity_at,
        0::integer as reward_rank
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
        row_number() over(order by activity_at desc nulls last,entry_id)::integer as idle_order
      from combined
      where primary_metric=0 and secondary_metric=0 and tertiary_metric=0
    ),
    ordered as (
      select
        rank,entry_id,full_name,username,avatar_url,
        primary_metric,secondary_metric,tertiary_metric,detail,is_simulated,source_label,reward_rank,
        rank::bigint as display_order
      from ranked_positive
      union all
      select
        rank,entry_id,full_name,username,avatar_url,
        primary_metric,secondary_metric,tertiary_metric,detail,is_simulated,source_label,reward_rank,
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
        'reward_rank',p.reward_rank,
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

commit;