-- DRIGHT challenge ranking automation v2.
-- Final validated feature state. Later same-day migrations are retained as history markers.

update public.monthly_growth_simulated_competitors
set display_name = trim(
  regexp_replace(
    regexp_replace(display_name, '[-‐‑‒–—−]+', ' ', 'g'),
    '[[:space:]]+',
    ' ',
    'g'
  )
)
where display_name ~ '[-‐‑‒–—−]';

alter table public.monthly_growth_simulated_scores
  add column if not exists managed_by_automation boolean not null default false,
  add column if not exists automation_generated_at timestamptz;

create table if not exists public.monthly_growth_simulation_automation_settings (
  challenge_key text primary key references public.monthly_growth_challenge_settings(challenge_key) on delete cascade,
  enabled boolean not null default false,
  active_competitor_count integer not null default 10000 check (active_competitor_count>=0 and active_competitor_count<=20000),
  min_target integer not null default 0 check (min_target>=0),
  max_target integer not null default 100 check (max_target>=0),
  top_target_count integer not null default 3 check (top_target_count>=0 and top_target_count<=20),
  allow_repeat_winners boolean not null default false,
  total_target_records bigint,
  exact_distribution jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.monthly_growth_simulation_automation_settings enable row level security;
revoke all on table public.monthly_growth_simulation_automation_settings from public,anon,authenticated;
grant select,insert,update,delete on table public.monthly_growth_simulation_automation_settings to service_role;

insert into public.monthly_growth_simulation_automation_settings(challenge_key)
select challenge_key from public.monthly_growth_challenge_settings
on conflict(challenge_key) do nothing;

CREATE OR REPLACE FUNCTION public.admin_import_monthly_growth_simulated_competitors(p_names text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select distinct trim(
      regexp_replace(
        regexp_replace(coalesce(raw_name,''),'[-‐‑‒–—−]+',' ','g'),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ) as display_name
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
$function$

revoke all on function public.admin_import_monthly_growth_simulated_competitors(text[]) from public,anon;
grant execute on function public.admin_import_monthly_growth_simulated_competitors(text[]) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_update_monthly_growth_simulated_score(p_competitor_id uuid, p_challenge_key text, p_base_score numeric, p_target_score numeric, p_increment_amount numeric, p_increment_interval_seconds integer, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    increment_amount,increment_interval_seconds,started_at,enabled,updated_at,updated_by,
    managed_by_automation,automation_generated_at
  )
  values(
    p_competitor_id,p_challenge_key,v_start,coalesce(p_base_score,0),p_target_score,
    coalesce(p_increment_amount,0),v_interval,now(),coalesce(p_enabled,true),now(),v_admin,
    false,null
  )
  on conflict(competitor_id,challenge_key,period_start) do update
  set base_score=excluded.base_score,
      target_score=excluded.target_score,
      increment_amount=excluded.increment_amount,
      increment_interval_seconds=excluded.increment_interval_seconds,
      started_at=now(),
      enabled=excluded.enabled,
      updated_at=now(),
      updated_by=v_admin,
      managed_by_automation=false,
      automation_generated_at=null;

  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values(v_admin,'competition_simulated_score_update',p_competitor_id,'monthly_growth_simulated_competitor',
         jsonb_build_object(
           'challenge_key',p_challenge_key,
           'period_start',v_start,
           'base_score',coalesce(p_base_score,0),
           'target_score',p_target_score,
           'increment_amount',coalesce(p_increment_amount,0),
           'increment_interval_seconds',v_interval,
           'enabled',coalesce(p_enabled,true),
           'managed_by_automation',false
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
      'enabled',sc.enabled,
      'managed_by_automation',sc.managed_by_automation
    )
    from public.monthly_growth_simulated_scores sc
    where sc.competitor_id=p_competitor_id and sc.challenge_key=p_challenge_key and sc.period_start=v_start
  );
end;
$function$

revoke all on function public.admin_update_monthly_growth_simulated_score(uuid,text,numeric,numeric,numeric,integer,boolean) from public,anon;
grant execute on function public.admin_update_monthly_growth_simulated_score(uuid,text,numeric,numeric,numeric,integer,boolean) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_assign_monthly_growth_simulated_avatars(p_avatar_urls text[], p_replace_existing boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin uuid:=auth.uid();
  v_requested integer:=coalesce(array_length(p_avatar_urls,1),0);
  v_assigned integer:=0;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;
  if v_requested<1 or v_requested>100 then
    raise exception 'Choose between 1 and 100 profile pictures per batch';
  end if;
  if exists(
    select 1 from unnest(p_avatar_urls) u
    where nullif(trim(coalesce(u,'')),'') is null or u !~* '^https?://'
  ) then
    raise exception 'Every avatar must be a valid HTTP(S) URL';
  end if;

  with input_urls as (
    select trim(url) as avatar_url, ordinality::integer as rn
    from unnest(p_avatar_urls) with ordinality x(url,ordinality)
  ),
  candidates as (
    select id,row_number() over(order by random())::integer as rn
    from (
      select id
      from public.monthly_growth_simulated_competitors
      where active=true
        and (coalesce(p_replace_existing,true)=true or avatar_url is null)
      order by random()
      limit v_requested
    ) c
  ),
  paired as (
    select c.id,u.avatar_url
    from candidates c
    join input_urls u using(rn)
  )
  update public.monthly_growth_simulated_competitors c
  set avatar_url=p.avatar_url,
      updated_at=now()
  from paired p
  where c.id=p.id;

  get diagnostics v_assigned = row_count;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(v_admin,'competition_simulated_avatar_batch_assign','monthly_growth_simulated_competitor',
         jsonb_build_object('requested',v_requested,'assigned',v_assigned,'replace_existing',coalesce(p_replace_existing,true)));

  return jsonb_build_object('requested',v_requested,'assigned',v_assigned);
end;
$function$

revoke all on function public.admin_assign_monthly_growth_simulated_avatars(text[],boolean) from public,anon;
grant execute on function public.admin_assign_monthly_growth_simulated_avatars(text[],boolean) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_get_monthly_growth_simulation_automation(p_challenge_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_start date:=date_trunc('month',now() at time zone 'UTC')::date;
  v_row public.monthly_growth_simulation_automation_settings%rowtype;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  insert into public.monthly_growth_simulation_automation_settings(challenge_key)
  values(p_challenge_key)
  on conflict(challenge_key) do nothing;

  select * into v_row
  from public.monthly_growth_simulation_automation_settings
  where challenge_key=p_challenge_key;

  return jsonb_build_object(
    'challenge_key',v_row.challenge_key,
    'enabled',v_row.enabled,
    'active_competitor_count',v_row.active_competitor_count,
    'min_target',v_row.min_target,
    'max_target',v_row.max_target,
    'top_target_count',v_row.top_target_count,
    'allow_repeat_winners',v_row.allow_repeat_winners,
    'total_target_records',v_row.total_target_records,
    'exact_distribution',v_row.exact_distribution,
    'updated_at',v_row.updated_at,
    'current_plan',jsonb_build_object(
      'automated_profiles',(
        select count(*) from public.monthly_growth_simulated_scores
        where challenge_key=p_challenge_key and period_start=v_start and managed_by_automation=true
      ),
      'manual_profiles',(
        select count(*) from public.monthly_growth_simulated_scores
        where challenge_key=p_challenge_key and period_start=v_start and managed_by_automation=false
      ),
      'highest_target',(
        select max(target_score) from public.monthly_growth_simulated_scores
        where challenge_key=p_challenge_key and period_start=v_start and enabled=true
      ),
      'zero_targets',(
        select count(*) from public.monthly_growth_simulated_scores
        where challenge_key=p_challenge_key and period_start=v_start and managed_by_automation=true
          and coalesce(target_score,0)=0
      )
    )
  );
end;
$function$

revoke all on function public.admin_get_monthly_growth_simulation_automation(text) from public,anon;
grant execute on function public.admin_get_monthly_growth_simulation_automation(text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_update_monthly_growth_simulation_automation(p_challenge_key text, p_enabled boolean, p_active_competitor_count integer, p_min_target integer, p_max_target integer, p_top_target_count integer, p_allow_repeat_winners boolean, p_total_target_records bigint, p_exact_distribution jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin uuid:=auth.uid();
  v_distribution jsonb:=coalesce(p_exact_distribution,'{}'::jsonb);
  v_score integer;
  v_count integer;
  v_dist_count bigint:=0;
  v_non_top_max integer;
  v_top_sum bigint:=0;
  v_min_total bigint;
  v_max_total bigint;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;
  if not exists(select 1 from public.monthly_growth_challenge_settings where challenge_key=p_challenge_key) then
    raise exception 'Unknown challenge key';
  end if;
  if coalesce(p_active_competitor_count,0)<0 or p_active_competitor_count>20000 then
    raise exception 'Active automated profile count must be between 0 and 20,000';
  end if;
  if coalesce(p_min_target,0)<0 or coalesce(p_max_target,0)<0 or p_min_target>p_max_target then
    raise exception 'Minimum and maximum targets are invalid';
  end if;
  if coalesce(p_top_target_count,0)<0 or p_top_target_count>20 or p_top_target_count>p_active_competitor_count then
    raise exception 'Top target count must fit inside the active automated profile count';
  end if;
  if jsonb_typeof(v_distribution)<>'object' then
    raise exception 'Exact distribution must be a JSON object';
  end if;

  if p_top_target_count>0 then
    if p_max_target < p_top_target_count-1 then
      raise exception 'Maximum target is too small for unique top positions';
    end if;
    select coalesce(sum(p_max_target-g),0)
      into v_top_sum
    from generate_series(0,p_top_target_count-1) g;
  end if;

  v_non_top_max:=case when p_top_target_count>0 then p_max_target-p_top_target_count else p_max_target end;
  if p_active_competitor_count>p_top_target_count and p_min_target>v_non_top_max then
    raise exception 'Minimum target must be below the reserved top-target range';
  end if;

  for v_score,v_count in
    select key::integer, value::text::integer
    from jsonb_each(v_distribution)
  loop
    if v_score<0 or v_count<0 then
      raise exception 'Distribution scores and counts cannot be negative';
    end if;
    if p_top_target_count>0 and v_score>v_non_top_max then
      raise exception 'Distribution score % overlaps the reserved unique top positions',v_score;
    end if;
    if p_top_target_count=0 and v_score>p_max_target then
      raise exception 'Distribution score % exceeds the maximum target',v_score;
    end if;
    if v_score<p_min_target then
      raise exception 'Distribution score % is below the minimum target',v_score;
    end if;
    v_dist_count:=v_dist_count+v_count;
  end loop;

  if v_dist_count + p_top_target_count > p_active_competitor_count then
    raise exception 'Distribution counts plus top positions exceed the active automated profile count';
  end if;

  if p_total_target_records is not null and v_distribution='{}'::jsonb then
    if p_total_target_records<0 then
      raise exception 'Total target records cannot be negative';
    end if;
    v_min_total:=v_top_sum + (p_active_competitor_count-p_top_target_count)::bigint*p_min_target;
    v_max_total:=v_top_sum + (p_active_competitor_count-p_top_target_count)::bigint*greatest(v_non_top_max,p_min_target);
    if p_total_target_records<v_min_total or p_total_target_records>v_max_total then
      raise exception 'Total target records must be between % and % for these settings',v_min_total,v_max_total;
    end if;
  end if;

  insert into public.monthly_growth_simulation_automation_settings(
    challenge_key,enabled,active_competitor_count,min_target,max_target,top_target_count,
    allow_repeat_winners,total_target_records,exact_distribution,updated_at,updated_by
  )
  values(
    p_challenge_key,coalesce(p_enabled,false),p_active_competitor_count,p_min_target,p_max_target,p_top_target_count,
    coalesce(p_allow_repeat_winners,false),p_total_target_records,v_distribution,now(),v_admin
  )
  on conflict(challenge_key) do update
  set enabled=excluded.enabled,
      active_competitor_count=excluded.active_competitor_count,
      min_target=excluded.min_target,
      max_target=excluded.max_target,
      top_target_count=excluded.top_target_count,
      allow_repeat_winners=excluded.allow_repeat_winners,
      total_target_records=excluded.total_target_records,
      exact_distribution=excluded.exact_distribution,
      updated_at=now(),
      updated_by=v_admin;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(v_admin,'competition_simulation_automation_settings_update','monthly_growth_competition',
         jsonb_build_object(
           'challenge_key',p_challenge_key,
           'enabled',coalesce(p_enabled,false),
           'active_competitor_count',p_active_competitor_count,
           'min_target',p_min_target,
           'max_target',p_max_target,
           'top_target_count',p_top_target_count,
           'allow_repeat_winners',coalesce(p_allow_repeat_winners,false),
           'total_target_records',p_total_target_records,
           'exact_distribution',v_distribution
         ));

  return public.admin_get_monthly_growth_simulation_automation(p_challenge_key);
end;
$function$

revoke all on function public.admin_update_monthly_growth_simulation_automation(text,boolean,integer,integer,integer,integer,boolean,bigint,jsonb) from public,anon;
grant execute on function public.admin_update_monthly_growth_simulation_automation(text,boolean,integer,integer,integer,integer,boolean,bigint,jsonb) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.generate_monthly_growth_simulation_plan_internal(p_challenge_key text, p_period_start date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_setting public.monthly_growth_simulation_automation_settings%rowtype;
  v_start date:=coalesce(p_period_start,date_trunc('month',now() at time zone 'UTC')::date);
  v_end date;
  v_candidates uuid[]:=array[]::uuid[];
  v_top_pool uuid[]:=array[]::uuid[];
  v_top_ids uuid[]:=array[]::uuid[];
  v_prev_winners uuid[]:=array[]::uuid[];
  v_manual_ids uuid[]:=array[]::uuid[];
  v_candidate uuid;
  v_active integer:=0;
  v_top integer:=0;
  v_non_top_max integer:=0;
  v_idx integer:=1;
  v_i integer;
  v_target integer;
  v_score integer;
  v_count integer;
  v_j integer;
  v_increment integer;
  v_steps integer;
  v_interval integer;
  v_remaining_seconds numeric;
  v_started_at timestamptz;
  v_distribution jsonb;
  v_assigned integer:=0;
  v_budget bigint:=0;
  v_slots integer:=0;
  v_low bigint;
  v_high bigint;
  v_top_sum bigint:=0;
begin
  select * into v_setting
  from public.monthly_growth_simulation_automation_settings
  where challenge_key=p_challenge_key;

  if not found or v_setting.enabled is not true then
    return jsonb_build_object('challenge_key',p_challenge_key,'period_start',v_start,'generated',0,'enabled',false);
  end if;

  v_end:=(v_start+interval '1 month')::date;
  v_distribution:=coalesce(v_setting.exact_distribution,'{}'::jsonb);

  delete from public.monthly_growth_simulated_scores
  where challenge_key=p_challenge_key
    and period_start=v_start
    and managed_by_automation=true;

  select coalesce(array_agg(competitor_id),array[]::uuid[])
    into v_manual_ids
  from public.monthly_growth_simulated_scores
  where challenge_key=p_challenge_key
    and period_start=v_start
    and managed_by_automation=false;

  select coalesce(array_agg(competitor_id order by coalesce(target_score,base_score) desc,competitor_id),array[]::uuid[])
    into v_prev_winners
  from (
    select competitor_id,target_score,base_score
    from public.monthly_growth_simulated_scores
    where challenge_key=p_challenge_key
      and period_start=(v_start-interval '1 month')::date
      and enabled=true
    order by coalesce(target_score,base_score) desc,competitor_id
    limit greatest(v_setting.top_target_count,1)
  ) p;

  select coalesce(array_agg(id order by random()),array[]::uuid[])
    into v_candidates
  from public.monthly_growth_simulated_competitors
  where active=true
    and not(id=any(v_manual_ids));

  v_active:=least(v_setting.active_competitor_count,cardinality(v_candidates));
  v_top:=least(v_setting.top_target_count,v_active);
  v_non_top_max:=case when v_top>0 then v_setting.max_target-v_top else v_setting.max_target end;

  if v_active<=0 then
    return jsonb_build_object('challenge_key',p_challenge_key,'period_start',v_start,'generated',0,'enabled',true);
  end if;

  select coalesce(array_agg(id order by random()),array[]::uuid[])
    into v_top_pool
  from public.monthly_growth_simulated_competitors
  where active=true
    and not(id=any(v_manual_ids))
    and (
      v_setting.allow_repeat_winners
      or not(id=any(v_prev_winners))
    );

  if cardinality(v_top_pool)<v_top then
    select coalesce(array_agg(id order by random()),array[]::uuid[])
      into v_top_pool
    from public.monthly_growth_simulated_competitors
    where active=true and not(id=any(v_manual_ids));
  end if;

  if v_top>0 then
    for v_i in 1..v_top loop
      v_candidate:=v_top_pool[v_i];
      exit when v_candidate is null;
      v_top_ids:=array_append(v_top_ids,v_candidate);
      v_target:=greatest(0,v_setting.max_target-(v_i-1));
      v_top_sum:=v_top_sum+v_target;

      if v_target<=0 then
        v_increment:=0;
        v_interval:=3600;
        v_started_at:=now();
      else
        v_increment:=greatest(1,least(v_target,1+floor(random()*greatest(1,ceil(v_target/250.0)))::integer));
        v_steps:=greatest(1,ceil(v_target::numeric/v_increment)::integer);
        v_remaining_seconds:=greatest(extract(epoch from (v_end::timestamptz-now())),3600);
        v_interval:=greatest(60,least(2592000,floor((v_remaining_seconds*(0.82+random()*0.15))/v_steps)::integer));
        v_started_at:=now()-make_interval(secs=>floor(random()*v_interval)::integer);
      end if;

      insert into public.monthly_growth_simulated_scores(
        competitor_id,challenge_key,period_start,base_score,target_score,increment_amount,
        increment_interval_seconds,started_at,enabled,updated_at,updated_by,
        managed_by_automation,automation_generated_at
      )
      values(
        v_candidate,p_challenge_key,v_start,0,v_target,v_increment,v_interval,
        v_started_at,true,now(),null,true,now()
      )
      on conflict(competitor_id,challenge_key,period_start) do update
      set base_score=0,target_score=excluded.target_score,increment_amount=excluded.increment_amount,
          increment_interval_seconds=excluded.increment_interval_seconds,started_at=excluded.started_at,
          enabled=true,updated_at=now(),updated_by=null,managed_by_automation=true,automation_generated_at=now();

      v_assigned:=v_assigned+1;
    end loop;
  end if;

  select coalesce(array_agg(id order by random()),array[]::uuid[])
    into v_candidates
  from public.monthly_growth_simulated_competitors
  where active=true
    and not(id=any(v_manual_ids))
    and not(id=any(v_top_ids));

  v_idx:=1;

  if v_distribution<>'{}'::jsonb then
    for v_score,v_count in
      select key::integer,value::text::integer
      from jsonb_each(v_distribution)
      order by key::integer
    loop
      if v_count>0 then
        for v_j in 1..v_count loop
          exit when v_assigned>=v_active or v_idx>cardinality(v_candidates);
          v_candidate:=v_candidates[v_idx];
          v_idx:=v_idx+1;
          v_target:=v_score;

          if v_target<=0 then
            v_increment:=0;
            v_interval:=3600;
            v_started_at:=now();
          else
            v_increment:=greatest(1,least(v_target,1+floor(random()*greatest(1,ceil(v_target/250.0)))::integer));
            v_steps:=greatest(1,ceil(v_target::numeric/v_increment)::integer);
            v_remaining_seconds:=greatest(extract(epoch from (v_end::timestamptz-now())),3600);
            v_interval:=greatest(60,least(2592000,floor((v_remaining_seconds*(0.82+random()*0.15))/v_steps)::integer));
            v_started_at:=now()-make_interval(secs=>floor(random()*v_interval)::integer);
          end if;

          insert into public.monthly_growth_simulated_scores(
            competitor_id,challenge_key,period_start,base_score,target_score,increment_amount,
            increment_interval_seconds,started_at,enabled,updated_at,updated_by,
            managed_by_automation,automation_generated_at
          )
          values(v_candidate,p_challenge_key,v_start,0,v_target,v_increment,v_interval,v_started_at,true,now(),null,true,now())
          on conflict(competitor_id,challenge_key,period_start) do update
          set base_score=0,target_score=excluded.target_score,increment_amount=excluded.increment_amount,
              increment_interval_seconds=excluded.increment_interval_seconds,started_at=excluded.started_at,
              enabled=true,updated_at=now(),updated_by=null,managed_by_automation=true,automation_generated_at=now();

          v_assigned:=v_assigned+1;
        end loop;
      end if;
    end loop;
  end if;

  if v_setting.total_target_records is not null and v_distribution='{}'::jsonb then
    v_budget:=greatest(v_setting.total_target_records-v_top_sum,0);
    v_slots:=v_active-v_assigned;
    while v_assigned<v_active and v_idx<=cardinality(v_candidates) loop
      v_candidate:=v_candidates[v_idx];
      v_idx:=v_idx+1;
      if v_slots<=1 then
        v_target:=v_budget::integer;
      else
        v_low:=greatest(v_setting.min_target::bigint,v_budget-v_non_top_max::bigint*(v_slots-1));
        v_high:=least(v_non_top_max::bigint,v_budget-v_setting.min_target::bigint*(v_slots-1));
        if v_high<v_low then
          v_target:=v_low::integer;
        else
          v_target:=(v_low+floor(random()*(v_high-v_low+1)))::integer;
        end if;
      end if;
      v_budget:=v_budget-v_target;
      v_slots:=v_slots-1;

      if v_target<=0 then
        v_increment:=0;
        v_interval:=3600;
        v_started_at:=now();
      else
        v_increment:=greatest(1,least(v_target,1+floor(random()*greatest(1,ceil(v_target/250.0)))::integer));
        v_steps:=greatest(1,ceil(v_target::numeric/v_increment)::integer);
        v_remaining_seconds:=greatest(extract(epoch from (v_end::timestamptz-now())),3600);
        v_interval:=greatest(60,least(2592000,floor((v_remaining_seconds*(0.82+random()*0.15))/v_steps)::integer));
        v_started_at:=now()-make_interval(secs=>floor(random()*v_interval)::integer);
      end if;

      insert into public.monthly_growth_simulated_scores(
        competitor_id,challenge_key,period_start,base_score,target_score,increment_amount,
        increment_interval_seconds,started_at,enabled,updated_at,updated_by,
        managed_by_automation,automation_generated_at
      )
      values(v_candidate,p_challenge_key,v_start,0,v_target,v_increment,v_interval,v_started_at,true,now(),null,true,now())
      on conflict(competitor_id,challenge_key,period_start) do update
      set base_score=0,target_score=excluded.target_score,increment_amount=excluded.increment_amount,
          increment_interval_seconds=excluded.increment_interval_seconds,started_at=excluded.started_at,
          enabled=true,updated_at=now(),updated_by=null,managed_by_automation=true,automation_generated_at=now();

      v_assigned:=v_assigned+1;
    end loop;
  else
    while v_assigned<v_active and v_idx<=cardinality(v_candidates) loop
      v_candidate:=v_candidates[v_idx];
      v_idx:=v_idx+1;
      if v_distribution<>'{}'::jsonb then
        select gs
          into v_target
        from generate_series(v_setting.min_target,v_non_top_max) gs
        where not(v_distribution ? gs::text)
        order by random()
        limit 1;
        if v_target is null then
          raise exception 'Exact distribution uses every available non-top score. Increase the max score, lower the minimum, or assign exact counts for every active profile.';
        end if;
      elsif v_non_top_max<=v_setting.min_target then
        v_target:=v_setting.min_target;
      else
        v_target:=floor(v_setting.min_target+random()*(v_non_top_max-v_setting.min_target+1))::integer;
      end if;

      if v_target<=0 then
        v_increment:=0;
        v_interval:=3600;
        v_started_at:=now();
      else
        v_increment:=greatest(1,least(v_target,1+floor(random()*greatest(1,ceil(v_target/250.0)))::integer));
        v_steps:=greatest(1,ceil(v_target::numeric/v_increment)::integer);
        v_remaining_seconds:=greatest(extract(epoch from (v_end::timestamptz-now())),3600);
        v_interval:=greatest(60,least(2592000,floor((v_remaining_seconds*(0.82+random()*0.15))/v_steps)::integer));
        v_started_at:=now()-make_interval(secs=>floor(random()*v_interval)::integer);
      end if;

      insert into public.monthly_growth_simulated_scores(
        competitor_id,challenge_key,period_start,base_score,target_score,increment_amount,
        increment_interval_seconds,started_at,enabled,updated_at,updated_by,
        managed_by_automation,automation_generated_at
      )
      values(v_candidate,p_challenge_key,v_start,0,v_target,v_increment,v_interval,v_started_at,true,now(),null,true,now())
      on conflict(competitor_id,challenge_key,period_start) do update
      set base_score=0,target_score=excluded.target_score,increment_amount=excluded.increment_amount,
          increment_interval_seconds=excluded.increment_interval_seconds,started_at=excluded.started_at,
          enabled=true,updated_at=now(),updated_by=null,managed_by_automation=true,automation_generated_at=now();

      v_assigned:=v_assigned+1;
    end loop;
  end if;

  update public.monthly_growth_realtime_signal
  set version=version+1,pulse_at=now(),source_table='monthly_growth_simulated_scores'
  where singleton=true;

  return jsonb_build_object(
    'challenge_key',p_challenge_key,
    'period_start',v_start,
    'generated',v_assigned,
    'top_target_count',v_top,
    'highest_target',v_setting.max_target,
    'total_target_records',v_setting.total_target_records,
    'repeat_winners',v_setting.allow_repeat_winners
  );
end;
$function$

revoke all on function public.generate_monthly_growth_simulation_plan_internal(text,date) from public,anon,authenticated;
grant execute on function public.generate_monthly_growth_simulation_plan_internal(text,date) to service_role;

CREATE OR REPLACE FUNCTION public.admin_generate_monthly_growth_simulation_plan(p_challenge_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  v_result:=public.generate_monthly_growth_simulation_plan_internal(
    p_challenge_key,
    date_trunc('month',now() at time zone 'UTC')::date
  );

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(auth.uid(),'competition_simulation_plan_generate','monthly_growth_competition',v_result);

  return v_result;
end;
$function$

revoke all on function public.admin_generate_monthly_growth_simulation_plan(text) from public,anon;
grant execute on function public.admin_generate_monthly_growth_simulation_plan(text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.run_monthly_growth_simulation_automation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_results jsonb:='[]'::jsonb;
  v_result jsonb;
begin
  for v_row in
    select challenge_key
    from public.monthly_growth_simulation_automation_settings
    where enabled=true
    order by challenge_key
  loop
    v_result:=public.generate_monthly_growth_simulation_plan_internal(
      v_row.challenge_key,
      date_trunc('month',now() at time zone 'UTC')::date
    );
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;
  return jsonb_build_object('generated_at',now(),'plans',v_results);
end;
$function$

revoke all on function public.run_monthly_growth_simulation_automation() from public,anon,authenticated;
grant execute on function public.run_monthly_growth_simulation_automation() to service_role;

CREATE OR REPLACE FUNCTION public.compute_monthly_growth_leaderboard(p_challenge_key text, p_period_start date, p_period_end date)
 RETURNS TABLE(user_id uuid, primary_metric numeric, secondary_metric numeric, tertiary_metric numeric, detail jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'Invalid challenge period';
  end if;

  if p_challenge_key='top_referrer' then
    return query
    with raw_direct_refs as (
      select rr.referrer_id,rr.referred_id,rr.created_at
      from public.referral_relationships rr
      where rr.level=1
      union all
      select r.referrer_id,r.referred_user_id,r.created_at
      from public.referrals r
      where r.referrer_id is not null and r.referred_user_id is not null
      union all
      select u.referred_by,u.id,u.created_at
      from public.users u
      where u.referred_by is not null
    ),
    direct_refs as (
      select referrer_id,referred_id,min(created_at) as created_at
      from raw_direct_refs
      group by referrer_id,referred_id
    ),
    m as (
      select u.id user_id,
             count(distinct d.referred_id) filter(
               where d.created_at>=p_period_start::timestamptz
                 and d.created_at<p_period_end::timestamptz
             )::numeric primary_metric,
             max(d.created_at) filter(
               where d.created_at>=p_period_start::timestamptz
                 and d.created_at<p_period_end::timestamptz
             ) as achieved_at
      from public.users u
      left join direct_refs d on d.referrer_id=u.id
      where coalesce(u.account_status,'ACTIVE')='ACTIVE'
        and coalesce(u.is_admin,false)=false
      group by u.id
    )
    select m.user_id,m.primary_metric,0::numeric,0::numeric,
           jsonb_build_object('referrals',m.primary_metric,'achieved_at',m.achieved_at)
    from m;
    return;
  end if;

  if p_challenge_key='top_buyer_referrer' then
    return query
    with direct_refs as (
      select rr.referrer_id,rr.referred_id
      from public.referral_relationships rr
      where rr.level=1
      union
      select r.referrer_id,r.referred_user_id
      from public.referrals r
      where r.referrer_id is not null and r.referred_user_id is not null
      union
      select u.referred_by,u.id
      from public.users u
      where u.referred_by is not null
    ),
    buyer_events as (
      select o.buyer_id buyer_id,coalesce(o.completed_at,o.created_at) event_at
      from public.orders o
      where o.status='COMPLETED'
        and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
        and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
      union all
      select sp.buyer_user_id,sp.processed_at
      from public.dright_starter_purchases sp
      where sp.payment_status='success'
        and sp.buyer_user_id is not null
        and sp.processed_at is not null
        and sp.processed_at>=p_period_start::timestamptz
        and sp.processed_at<p_period_end::timestamptz
    ),
    qualified_buyers as (
      select buyer_id,min(event_at) as qualified_at
      from buyer_events
      where buyer_id is not null
      group by buyer_id
    ),
    m as (
      select u.id user_id,
             count(distinct d.referred_id) filter(where q.buyer_id is not null)::numeric primary_metric,
             max(q.qualified_at) as achieved_at
      from public.users u
      left join direct_refs d on d.referrer_id=u.id
      left join qualified_buyers q on q.buyer_id=d.referred_id
      where coalesce(u.account_status,'ACTIVE')='ACTIVE'
        and coalesce(u.is_admin,false)=false
      group by u.id
    )
    select m.user_id,m.primary_metric,0::numeric,0::numeric,
           jsonb_build_object('referred_buyers',m.primary_metric,'achieved_at',m.achieved_at)
    from m;
    return;
  end if;

  if p_challenge_key='top_seller' then
    return query
    with sales as (
      select o.seller_id user_id,
             count(*)::numeric sales_count,
             coalesce(sum(o.final_price),0)::numeric sales_value,
             max(coalesce(o.completed_at,o.created_at)) as sales_achieved_at
      from public.orders o
      join public.products p on p.id=o.product_id
      where o.status='COMPLETED'
        and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
        and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
        and coalesce(p.specifications->>'first_party','false')<>'true'
      group by o.seller_id
    ),
    listings as (
      select p.uploaded_by user_id,
             count(*)::numeric listing_count,
             max(p.created_at) as listing_achieved_at
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
             'sales_value',coalesce(s.sales_value,0),
             'achieved_at',greatest(s.sales_achieved_at,l.listing_achieved_at)
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
    with attributed_orders_raw as (
      select cs.recipient_id user_id,o.id order_id,
             greatest(cs.amount-coalesce(cs.reversed_amount,0),0)::numeric earning_value,
             coalesce(o.completed_at,o.created_at) event_at
      from public.commission_splits cs
      join public.orders o on o.id=cs.order_id
      where lower(cs.recipient_role)='affiliate'
        and cs.order_id is not null
        and o.status='COMPLETED'
        and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
        and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
      union all
      select o.referrer_id,o.id,
             coalesce(o.affiliate_commission_amount,0)::numeric,
             coalesce(o.completed_at,o.created_at)
      from public.orders o
      where o.referrer_id is not null
        and o.status='COMPLETED'
        and lower(coalesce(o.referrer_role,o.source_type,'')) like '%affiliate%'
        and coalesce(o.completed_at,o.created_at)>=p_period_start::timestamptz
        and coalesce(o.completed_at,o.created_at)<p_period_end::timestamptz
    ),
    attributed_orders as (
      select r.user_id,r.order_id,max(r.earning_value) as earning_value,min(r.event_at) as event_at
      from attributed_orders_raw r
      where r.user_id is not null
      group by r.user_id,r.order_id
    ),
    m as (
      select u.id user_id,
             count(a.order_id)::numeric sale_count,
             coalesce(sum(a.earning_value),0)::numeric earning_value,
             max(a.event_at) as achieved_at
      from public.users u
      left join attributed_orders a on a.user_id=u.id
      where coalesce(u.account_status,'ACTIVE')='ACTIVE'
        and coalesce(u.is_admin,false)=false
      group by u.id
    )
    select m.user_id,m.sale_count,m.earning_value,0::numeric,
           jsonb_build_object(
             'affiliate_sales',m.sale_count,
             'affiliate_earnings',m.earning_value,
             'achieved_at',m.achieved_at
           )
    from m;
    return;
  end if;

  if p_challenge_key='starter_affiliate' then
    return query
    with m as (
      select u.id user_id,
             count(sp.id)::numeric sale_count,
             coalesce(sum(sp.affiliate_commission_amount),0)::numeric earning_value,
             max(sp.processed_at) as achieved_at
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
           jsonb_build_object(
             'starter_sales',m.sale_count,
             'affiliate_earnings',m.earning_value,
             'achieved_at',m.achieved_at
           )
    from m;
    return;
  end if;

  raise exception 'Unknown challenge key: %',p_challenge_key;
end;
$function$

revoke all on function public.compute_monthly_growth_leaderboard(text,date,date) from public,anon;
grant execute on function public.compute_monthly_growth_leaderboard(text,date,date) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_get_monthly_growth_simulated_competitors(p_challenge_key text, p_limit integer, p_offset integer, p_search text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'effective_score',coalesce(q.effective_score,0),
    'managed_by_automation',coalesce(q.managed_by_automation,false)
  ) order by q.display_name,q.id),'[]'::jsonb)
  into v_entries
  from (
    select c.id,c.display_name,c.avatar_url,c.active,
           sc.base_score,sc.target_score,sc.increment_amount,sc.increment_interval_seconds,
           sc.enabled score_enabled,sc.managed_by_automation,
           greatest(
             0,
             case
               when sc.competitor_id is null or sc.enabled is not true then 0
               when sc.target_score is null then
                 sc.base_score + floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount
               else least(
                 sc.target_score,
                 sc.base_score + floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount
               )
             end
           )::numeric effective_score
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
$function$

revoke all on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer,text) from public,anon;
grant execute on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer,text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_get_monthly_growth_simulated_competitors(p_challenge_key text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.admin_get_monthly_growth_simulated_competitors(
    p_challenge_key,p_limit,p_offset,null::text
  );
$function$

revoke all on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer) from public,anon;
grant execute on function public.admin_get_monthly_growth_simulated_competitors(text,integer,integer) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_public_monthly_growth_leaderboard(p_challenge_key text, p_period text DEFAULT 'current'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_start date:=date_trunc('month',now() at time zone 'UTC')::date;
  v_start date:=v_current_start;
  v_end date;
  v_total integer:=0;
  v_entries jsonb:='[]'::jsonb;
  v_viewer jsonb:=null;
  v_viewer_offset integer:=0;
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
      e || jsonb_build_object(
        'rank',coalesce((e->>'rank')::integer,ord::integer),
        'is_ranked',true
      )
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
        false as is_synthetic,
        case
          when nullif(c.detail->>'achieved_at','') is null then null
          else (c.detail->>'achieved_at')::timestamptz
        end as achieved_at
      from public.compute_monthly_growth_leaderboard(p_challenge_key,v_start,v_end) c
      join public.users u on u.id=c.user_id
    ),
    simulated_scored as (
      select
        comp.id as entry_id,
        comp.display_name as full_name,
        null::text as username,
        comp.avatar_url,
        sc.base_score,
        sc.target_score,
        sc.increment_amount,
        sc.increment_interval_seconds,
        sc.started_at,
        greatest(
          0,
          case
            when sc.competitor_id is null or sc.enabled is not true then 0
            when sc.target_score is null then
              sc.base_score + floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount
            else least(
              sc.target_score,
              sc.base_score + floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount
            )
          end
        )::numeric as effective_score
      from public.monthly_growth_simulated_competitors comp
      join public.monthly_growth_simulation_settings ss
        on ss.singleton=true and ss.enabled=true
      left join public.monthly_growth_simulated_scores sc
        on sc.competitor_id=comp.id
       and sc.challenge_key=p_challenge_key
       and sc.period_start=v_start
      where comp.active=true
    ),
    simulated_base as (
      select
        s.entry_id,s.full_name,s.username,s.avatar_url,
        s.effective_score as primary_metric,
        0::numeric as secondary_metric,
        0::numeric as tertiary_metric,
        '{}'::jsonb as detail,
        true as is_synthetic,
        case
          when s.effective_score<=0 or s.started_at is null then null
          when coalesce(s.increment_amount,0)<=0 or s.effective_score<=coalesce(s.base_score,0) then s.started_at
          else s.started_at + make_interval(
            secs => (
              ceil((s.effective_score-coalesce(s.base_score,0))/s.increment_amount)
              * s.increment_interval_seconds
            )::integer
          )
        end as achieved_at
      from simulated_scored s
    ),
    combined as (
      select * from real_base
      union all
      select * from simulated_base
    ),
    ranked as (
      select
        row_number() over(
          order by
            primary_metric desc,
            secondary_metric desc,
            tertiary_metric desc,
            achieved_at asc nulls last,
            md5(entry_id::text||':'||v_start::text||':'||p_challenge_key)
        )::integer as rank,
        *
      from combined
    ),
    paged as (
      select *,row_number() over(order by rank)::integer as row_index
      from ranked
    ),
    viewer_row as (
      select *
      from ranked
      where auth.uid() is not null
        and is_synthetic=false
        and entry_id=auth.uid()
      limit 1
    )
    select
      (select count(*)::integer from ranked),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'rank',p.rank,
          'user_id',p.entry_id,
          'full_name',p.full_name,
          'username',p.username,
          'avatar_url',p.avatar_url,
          'primary_metric',p.primary_metric,
          'secondary_metric',p.secondary_metric,
          'tertiary_metric',p.tertiary_metric,
          'detail',p.detail,
          'is_ranked',true
        ) order by p.rank)
        from paged p
        where p.row_index>p_offset and p.row_index<=p_offset+p_limit
      ),'[]'::jsonb),
      (
        select jsonb_build_object(
          'rank',v.rank,
          'user_id',v.entry_id,
          'full_name',v.full_name,
          'username',v.username,
          'avatar_url',v.avatar_url,
          'primary_metric',v.primary_metric,
          'secondary_metric',v.secondary_metric,
          'tertiary_metric',v.tertiary_metric,
          'detail',v.detail,
          'is_ranked',true
        )
        from viewer_row v
      ),
      coalesce((
        select greatest(((v.rank-1)/p_limit)*p_limit,0)::integer
        from viewer_row v
      ),0)
    into v_total,v_entries,v_viewer,v_viewer_offset;
  end if;

  return jsonb_build_object(
    'challenge_key',p_challenge_key,
    'period',p_period,
    'period_start',v_start,
    'total',v_total,
    'offset',p_offset,
    'limit',p_limit,
    'entries',coalesce(v_entries,'[]'::jsonb),
    'viewer',v_viewer,
    'viewer_offset',v_viewer_offset
  );
end;
$function$

revoke all on function public.get_public_monthly_growth_leaderboard(text,text,integer,integer) from public;
grant execute on function public.get_public_monthly_growth_leaderboard(text,text,integer,integer) to anon,authenticated,service_role;

do $$
begin
  if exists(select 1 from cron.job where jobname='dright_monthly_growth_simulation_plan') then
    perform cron.unschedule('dright_monthly_growth_simulation_plan');
  end if;
end $$;

select cron.schedule(
  'dright_monthly_growth_simulation_plan',
  '10 0 1 * *',
  $cron$select public.run_monthly_growth_simulation_automation();$cron$
);
