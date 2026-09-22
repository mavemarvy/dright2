begin;

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
  v_inserted integer:=0;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  if coalesce(array_length(p_names,1),0)>20000 then
    raise exception 'Import is limited to 20,000 names per request';
  end if;

  with cleaned as (
    select distinct trim(regexp_replace(coalesce(raw_name,''),'\s+',' ','g')) as display_name
    from unnest(coalesce(p_names,array[]::text[])) raw_name
  ),
  valid as (
    select display_name
    from cleaned
    where char_length(display_name) between 2 and 120
  )
  insert into public.monthly_growth_simulated_competitors(display_name)
  select display_name
  from valid
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

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

commit;