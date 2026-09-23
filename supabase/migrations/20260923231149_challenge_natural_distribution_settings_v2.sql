-- DRIGHT monthly challenge natural-distribution and transparent benchmark controls.
alter table public.monthly_growth_simulation_automation_settings
  add column if not exists top_first_target integer not null default 500,
  add column if not exists top_second_target integer not null default 200,
  add column if not exists top_third_target integer not null default 100,
  add column if not exists distribution_curve numeric not null default 3.5;

alter table public.monthly_growth_simulation_automation_settings
  drop constraint if exists monthly_growth_simulation_top_targets_valid,
  add constraint monthly_growth_simulation_top_targets_valid check (
    top_first_target >= 0 and top_second_target >= 0 and top_third_target >= 0
    and top_first_target >= top_second_target
    and top_second_target >= top_third_target
    and distribution_curve between 1 and 8
  );

create table if not exists public.monthly_growth_simulated_showcase (
  period_start date not null,
  challenge_key text not null references public.monthly_growth_challenge_settings(challenge_key) on delete cascade,
  rank integer not null check (rank between 1 and 3),
  competitor_id uuid not null references public.monthly_growth_simulated_competitors(id) on delete cascade,
  primary_metric numeric not null default 0 check (primary_metric >= 0),
  public_visible boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key(period_start,challenge_key,rank),
  unique(period_start,challenge_key,competitor_id)
);

alter table public.monthly_growth_simulated_showcase enable row level security;
revoke all on table public.monthly_growth_simulated_showcase from public,anon,authenticated;
grant select,insert,update,delete on table public.monthly_growth_simulated_showcase to service_role;

CREATE OR REPLACE FUNCTION public.monthly_growth_random_progress_plan(p_target integer, p_period_start date, p_period_end date, p_top_rank integer DEFAULT 0)
 RETURNS TABLE(base_score numeric, increment_amount numeric, increment_interval_seconds integer, started_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz:=now();
  v_target integer:=greatest(coalesce(p_target,0),0);
  v_total numeric;
  v_elapsed numeric;
  v_progress numeric:=0;
  v_factor numeric;
  v_current integer:=0;
  v_remaining integer;
  v_increment integer;
  v_steps integer;
  v_remaining_seconds numeric;
  v_interval integer;
begin
  if v_target<=0 then
    return query select 0::numeric,0::numeric,3600,v_now;
    return;
  end if;

  v_total:=greatest(extract(epoch from (p_period_end::timestamptz-p_period_start::timestamptz)),1);
  v_elapsed:=least(greatest(extract(epoch from (v_now-p_period_start::timestamptz)),0),v_total);
  v_progress:=least(greatest(v_elapsed/v_total,0),1);

  if v_now>=p_period_end::timestamptz then
    v_current:=v_target;
  elsif v_now<=p_period_start::timestamptz then
    v_current:=0;
  elsif p_top_rank=1 then
    v_factor:=0.82+random()*0.13;
    v_current:=floor(v_target*least(0.97,v_progress*v_factor))::integer;
  elsif p_top_rank=2 then
    v_factor:=0.72+random()*0.14;
    v_current:=floor(v_target*least(0.95,v_progress*v_factor))::integer;
  elsif p_top_rank=3 then
    v_factor:=0.65+random()*0.16;
    v_current:=floor(v_target*least(0.93,v_progress*v_factor))::integer;
  else
    v_factor:=0.05+random()*1.35;
    v_current:=floor(
      v_target*least(0.95,greatest(0,v_progress*v_factor-random()*0.18))
    )::integer;
    v_current:=greatest(
      0,
      least(
        greatest(v_target-1,0),
        v_current+floor((random()-0.5)*greatest(v_target,1)*0.10)::integer
      )
    );
  end if;

  v_current:=least(greatest(v_current,0),v_target);
  v_remaining:=greatest(v_target-v_current,0);

  if v_remaining=0 then
    return query select v_current::numeric,0::numeric,3600,v_now;
    return;
  end if;

  v_increment:=greatest(
    1,
    least(v_remaining,1+floor(random()*greatest(1,ceil(v_remaining/140.0)))::integer)
  );
  v_steps:=greatest(1,ceil(v_remaining::numeric/v_increment)::integer);
  v_remaining_seconds:=greatest(extract(epoch from (p_period_end::timestamptz-v_now)),3600);
  v_interval:=greatest(
    60,
    least(2592000,floor((v_remaining_seconds*(0.62+random()*0.36))/v_steps)::integer)
  );

  return query select
    v_current::numeric,
    v_increment::numeric,
    v_interval,
    v_now-make_interval(secs=>floor(random()*v_interval)::integer);
end;
$function$

revoke all on function public.monthly_growth_random_progress_plan(integer,date,date,integer) from public,anon,authenticated;
grant execute on function public.monthly_growth_random_progress_plan(integer,date,date,integer) to service_role;

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
    'top_first_target',v_row.top_first_target,
    'top_second_target',v_row.top_second_target,
    'top_third_target',v_row.top_third_target,
    'distribution_curve',v_row.distribution_curve,
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

CREATE OR REPLACE FUNCTION public.admin_update_monthly_growth_simulation_automation_v2(p_challenge_key text, p_enabled boolean, p_active_competitor_count integer, p_min_target integer, p_max_target integer, p_top_target_count integer, p_top_first_target integer, p_top_second_target integer, p_top_third_target integer, p_distribution_curve numeric, p_allow_repeat_winners boolean, p_total_target_records bigint, p_exact_distribution jsonb)
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
  if p_top_first_target<0 or p_top_second_target<0 or p_top_third_target<0
     or p_top_first_target<p_top_second_target or p_top_second_target<p_top_third_target then
    raise exception 'Top targets must be descending: first >= second >= third';
  end if;
  if coalesce(p_distribution_curve,0)<1 or p_distribution_curve>8 then
    raise exception 'Distribution curve must be between 1 and 8';
  end if;
  if jsonb_typeof(v_distribution)<>'object' then
    raise exception 'Exact distribution must be a JSON object';
  end if;

  if p_top_target_count>=1 then v_top_sum:=v_top_sum+p_top_first_target; end if;
  if p_top_target_count>=2 then v_top_sum:=v_top_sum+p_top_second_target; end if;
  if p_top_target_count>=3 then v_top_sum:=v_top_sum+p_top_third_target; end if;
  if p_top_target_count>3 then
    select v_top_sum+coalesce(sum(greatest(p_top_third_target-(g-3),0)),0)
    into v_top_sum from generate_series(4,p_top_target_count) g;
  end if;

  v_non_top_max:=case
    when p_top_target_count>=3 then least(p_max_target,greatest(floor(p_top_third_target*0.75)::integer,p_min_target))
    when p_top_target_count=2 then least(p_max_target,greatest(floor(p_top_second_target*0.75)::integer,p_min_target))
    when p_top_target_count=1 then least(p_max_target,greatest(floor(p_top_first_target*0.75)::integer,p_min_target))
    else p_max_target
  end;

  for v_score,v_count in
    select key::integer,value::text::integer from jsonb_each(v_distribution)
  loop
    if v_score<0 or v_count<0 then raise exception 'Distribution scores and counts cannot be negative'; end if;
    if v_score<p_min_target or v_score>v_non_top_max then
      raise exception 'Distribution score % must be between % and %',v_score,p_min_target,v_non_top_max;
    end if;
    v_dist_count:=v_dist_count+v_count;
  end loop;

  if v_dist_count+p_top_target_count>p_active_competitor_count then
    raise exception 'Distribution counts plus top positions exceed the active automated profile count';
  end if;

  if p_total_target_records is not null and v_distribution='{}'::jsonb then
    if p_total_target_records<0 then raise exception 'Total target records cannot be negative'; end if;
    v_min_total:=v_top_sum+(p_active_competitor_count-p_top_target_count)::bigint*p_min_target;
    v_max_total:=v_top_sum+(p_active_competitor_count-p_top_target_count)::bigint*v_non_top_max;
    if p_total_target_records<v_min_total or p_total_target_records>v_max_total then
      raise exception 'Total target records must be between % and % for these settings',v_min_total,v_max_total;
    end if;
  end if;

  insert into public.monthly_growth_simulation_automation_settings(
    challenge_key,enabled,active_competitor_count,min_target,max_target,top_target_count,
    top_first_target,top_second_target,top_third_target,distribution_curve,
    allow_repeat_winners,total_target_records,exact_distribution,updated_at,updated_by
  )
  values(
    p_challenge_key,coalesce(p_enabled,false),p_active_competitor_count,p_min_target,p_max_target,p_top_target_count,
    p_top_first_target,p_top_second_target,p_top_third_target,p_distribution_curve,
    coalesce(p_allow_repeat_winners,false),p_total_target_records,v_distribution,now(),v_admin
  )
  on conflict(challenge_key) do update
  set enabled=excluded.enabled,
      active_competitor_count=excluded.active_competitor_count,
      min_target=excluded.min_target,
      max_target=excluded.max_target,
      top_target_count=excluded.top_target_count,
      top_first_target=excluded.top_first_target,
      top_second_target=excluded.top_second_target,
      top_third_target=excluded.top_third_target,
      distribution_curve=excluded.distribution_curve,
      allow_repeat_winners=excluded.allow_repeat_winners,
      total_target_records=excluded.total_target_records,
      exact_distribution=excluded.exact_distribution,
      updated_at=now(),
      updated_by=v_admin;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(v_admin,'competition_simulation_automation_settings_update','monthly_growth_competition',
    jsonb_build_object(
      'challenge_key',p_challenge_key,'enabled',coalesce(p_enabled,false),
      'active_competitor_count',p_active_competitor_count,'min_target',p_min_target,'max_target',p_max_target,
      'top_target_count',p_top_target_count,'top_first_target',p_top_first_target,
      'top_second_target',p_top_second_target,'top_third_target',p_top_third_target,
      'distribution_curve',p_distribution_curve,'allow_repeat_winners',coalesce(p_allow_repeat_winners,false),
      'total_target_records',p_total_target_records,'exact_distribution',v_distribution
    )
  );

  return public.admin_get_monthly_growth_simulation_automation(p_challenge_key);
end;
$function$

revoke all on function public.admin_update_monthly_growth_simulation_automation_v2(text,boolean,integer,integer,integer,integer,integer,integer,integer,numeric,boolean,bigint,jsonb) from public,anon;
grant execute on function public.admin_update_monthly_growth_simulation_automation_v2(text,boolean,integer,integer,integer,integer,integer,integer,integer,numeric,boolean,bigint,jsonb) to authenticated,service_role;

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
  v_base numeric;
  v_increment numeric;
  v_interval integer;
  v_started_at timestamptz;
  v_distribution jsonb;
  v_assigned integer:=0;
  v_budget bigint:=0;
  v_slots integer:=0;
  v_low bigint;
  v_high bigint;
  v_top_sum bigint:=0;
  v_prev_top_base numeric:=null;
  v_curve numeric;
begin
  select * into v_setting
  from public.monthly_growth_simulation_automation_settings
  where challenge_key=p_challenge_key;

  if not found or v_setting.enabled is not true then
    return jsonb_build_object('challenge_key',p_challenge_key,'period_start',v_start,'generated',0,'enabled',false);
  end if;

  v_end:=(v_start+interval '1 month')::date;
  v_distribution:=coalesce(v_setting.exact_distribution,'{}'::jsonb);
  v_curve:=least(greatest(coalesce(v_setting.distribution_curve,3.5),1),8);

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
  where active=true and not(id=any(v_manual_ids));

  v_active:=least(v_setting.active_competitor_count,cardinality(v_candidates));
  v_top:=least(v_setting.top_target_count,v_active);

  v_non_top_max:=case
    when v_top>=3 then least(v_setting.max_target,greatest(floor(v_setting.top_third_target*0.75)::integer,v_setting.min_target))
    when v_top=2 then least(v_setting.max_target,greatest(floor(v_setting.top_second_target*0.75)::integer,v_setting.min_target))
    when v_top=1 then least(v_setting.max_target,greatest(floor(v_setting.top_first_target*0.75)::integer,v_setting.min_target))
    else v_setting.max_target
  end;

  if v_active<=0 then
    return jsonb_build_object('challenge_key',p_challenge_key,'period_start',v_start,'generated',0,'enabled',true);
  end if;

  select coalesce(array_agg(id order by random()),array[]::uuid[])
  into v_top_pool
  from public.monthly_growth_simulated_competitors
  where active=true
    and not(id=any(v_manual_ids))
    and (v_setting.allow_repeat_winners or not(id=any(v_prev_winners)));

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

      v_target:=case
        when v_i=1 then v_setting.top_first_target
        when v_i=2 then v_setting.top_second_target
        when v_i=3 then v_setting.top_third_target
        else greatest(v_setting.top_third_target-(v_i-3),0)
      end;
      v_top_sum:=v_top_sum+v_target;

      select p.base_score,p.increment_amount,p.increment_interval_seconds,p.started_at
      into v_base,v_increment,v_interval,v_started_at
      from public.monthly_growth_random_progress_plan(v_target,v_start,v_end,least(v_i,3)) p;

      if v_i<=3 then
        v_base:=greatest(v_base,least(v_target,v_non_top_max+(4-v_i)));
      end if;
      if v_prev_top_base is not null and v_base>=v_prev_top_base then
        v_base:=greatest(v_prev_top_base-1,0);
      end if;
      v_prev_top_base:=v_base;

      insert into public.monthly_growth_simulated_scores(
        competitor_id,challenge_key,period_start,base_score,target_score,increment_amount,
        increment_interval_seconds,started_at,enabled,updated_at,updated_by,
        managed_by_automation,automation_generated_at
      )
      values(v_candidate,p_challenge_key,v_start,v_base,v_target,v_increment,v_interval,v_started_at,true,now(),null,true,now())
      on conflict(competitor_id,challenge_key,period_start) do update
      set base_score=excluded.base_score,target_score=excluded.target_score,increment_amount=excluded.increment_amount,
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
      select key::integer,value::text::integer from jsonb_each(v_distribution) order by key::integer
    loop
      if v_count>0 then
        for v_j in 1..v_count loop
          exit when v_assigned>=v_active or v_idx>cardinality(v_candidates);
          v_candidate:=v_candidates[v_idx]; v_idx:=v_idx+1; v_target:=v_score;

          select p.base_score,p.increment_amount,p.increment_interval_seconds,p.started_at
          into v_base,v_increment,v_interval,v_started_at
          from public.monthly_growth_random_progress_plan(v_target,v_start,v_end,0) p;

          insert into public.monthly_growth_simulated_scores(
            competitor_id,challenge_key,period_start,base_score,target_score,increment_amount,
            increment_interval_seconds,started_at,enabled,updated_at,updated_by,
            managed_by_automation,automation_generated_at
          )
          values(v_candidate,p_challenge_key,v_start,v_base,v_target,v_increment,v_interval,v_started_at,true,now(),null,true,now())
          on conflict(competitor_id,challenge_key,period_start) do update
          set base_score=excluded.base_score,target_score=excluded.target_score,increment_amount=excluded.increment_amount,
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
      v_candidate:=v_candidates[v_idx]; v_idx:=v_idx+1;
      if v_slots<=1 then
        v_target:=v_budget::integer;
      else
        v_low:=greatest(v_setting.min_target::bigint,v_budget-v_non_top_max::bigint*(v_slots-1));
        v_high:=least(v_non_top_max::bigint,v_budget-v_setting.min_target::bigint*(v_slots-1));
        if v_high<v_low then v_target:=v_low::integer;
        else v_target:=(v_low+floor(random()*(v_high-v_low+1)))::integer;
        end if;
      end if;
      v_budget:=v_budget-v_target;
      v_slots:=v_slots-1;

      select p.base_score,p.increment_amount,p.increment_interval_seconds,p.started_at
      into v_base,v_increment,v_interval,v_started_at
      from public.monthly_growth_random_progress_plan(v_target,v_start,v_end,0) p;

      insert into public.monthly_growth_simulated_scores(
        competitor_id,challenge_key,period_start,base_score,target_score,increment_amount,
        increment_interval_seconds,started_at,enabled,updated_at,updated_by,
        managed_by_automation,automation_generated_at
      )
      values(v_candidate,p_challenge_key,v_start,v_base,v_target,v_increment,v_interval,v_started_at,true,now(),null,true,now())
      on conflict(competitor_id,challenge_key,period_start) do update
      set base_score=excluded.base_score,target_score=excluded.target_score,increment_amount=excluded.increment_amount,
          increment_interval_seconds=excluded.increment_interval_seconds,started_at=excluded.started_at,
          enabled=true,updated_at=now(),updated_by=null,managed_by_automation=true,automation_generated_at=now();

      v_assigned:=v_assigned+1;
    end loop;
  else
    while v_assigned<v_active and v_idx<=cardinality(v_candidates) loop
      v_candidate:=v_candidates[v_idx]; v_idx:=v_idx+1;

      if v_non_top_max<=v_setting.min_target then
        v_target:=v_setting.min_target;
      else
        loop
          v_target:=v_setting.min_target+
            floor(power(random(),v_curve)*(v_non_top_max-v_setting.min_target+1))::integer;
          v_target:=least(v_target,v_non_top_max);
          exit when v_distribution='{}'::jsonb or not(v_distribution ? v_target::text);
        end loop;
      end if;

      select p.base_score,p.increment_amount,p.increment_interval_seconds,p.started_at
      into v_base,v_increment,v_interval,v_started_at
      from public.monthly_growth_random_progress_plan(v_target,v_start,v_end,0) p;

      insert into public.monthly_growth_simulated_scores(
        competitor_id,challenge_key,period_start,base_score,target_score,increment_amount,
        increment_interval_seconds,started_at,enabled,updated_at,updated_by,
        managed_by_automation,automation_generated_at
      )
      values(v_candidate,p_challenge_key,v_start,v_base,v_target,v_increment,v_interval,v_started_at,true,now(),null,true,now())
      on conflict(competitor_id,challenge_key,period_start) do update
      set base_score=excluded.base_score,target_score=excluded.target_score,increment_amount=excluded.increment_amount,
          increment_interval_seconds=excluded.increment_interval_seconds,started_at=excluded.started_at,
          enabled=true,updated_at=now(),updated_by=null,managed_by_automation=true,automation_generated_at=now();

      v_assigned:=v_assigned+1;
    end loop;
  end if;

  update public.monthly_growth_realtime_signal
  set version=version+1,pulse_at=now(),source_table='monthly_growth_simulated_scores'
  where singleton=true;

  return jsonb_build_object(
    'challenge_key',p_challenge_key,'period_start',v_start,'generated',v_assigned,
    'top_target_count',v_top,'top_first_target',v_setting.top_first_target,
    'top_second_target',v_setting.top_second_target,'top_third_target',v_setting.top_third_target,
    'highest_target',v_setting.top_first_target,'distribution_curve',v_curve,
    'total_target_records',v_setting.total_target_records,'repeat_winners',v_setting.allow_repeat_winners
  );
end;
$function$

revoke all on function public.generate_monthly_growth_simulation_plan_internal(text,date) from public,anon,authenticated;
grant execute on function public.generate_monthly_growth_simulation_plan_internal(text,date) to service_role;

CREATE OR REPLACE FUNCTION public.admin_get_monthly_growth_simulated_showcase(p_period_start date, p_challenge_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entries jsonb;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',s.rank,
    'competitor_id',s.competitor_id,
    'full_name',c.display_name,
    'avatar_url',c.avatar_url,
    'primary_metric',s.primary_metric,
    'public_visible',s.public_visible
  ) order by s.rank),'[]'::jsonb)
  into v_entries
  from public.monthly_growth_simulated_showcase s
  join public.monthly_growth_simulated_competitors c on c.id=s.competitor_id
  where s.period_start=p_period_start and s.challenge_key=p_challenge_key;

  return jsonb_build_object(
    'period_start',p_period_start,'challenge_key',p_challenge_key,'entries',v_entries
  );
end;
$function$

revoke all on function public.admin_get_monthly_growth_simulated_showcase(date,text) from public,anon;
grant execute on function public.admin_get_monthly_growth_simulated_showcase(date,text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_set_monthly_growth_simulated_showcase(p_period_start date, p_challenge_key text, p_first_name text, p_first_score numeric, p_second_name text, p_second_score numeric, p_third_name text, p_third_score numeric, p_public_visible boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin uuid:=auth.uid();
  v_names text[]:=array[p_first_name,p_second_name,p_third_name];
  v_scores numeric[]:=array[p_first_score,p_second_score,p_third_score];
  v_id uuid;
  v_i integer;
begin
  if public.monthly_growth_competition_admin_allowed() is not true then
    raise exception 'Competition management permission required';
  end if;
  if p_period_start<>date_trunc('month',p_period_start)::date
     or p_period_start>=date_trunc('month',now() at time zone 'UTC')::date then
    raise exception 'Showcase month must be a completed calendar month';
  end if;
  if not exists(select 1 from public.monthly_growth_challenge_settings where challenge_key=p_challenge_key) then
    raise exception 'Unknown challenge key';
  end if;
  if coalesce(p_first_score,0)<coalesce(p_second_score,0)
     or coalesce(p_second_score,0)<coalesce(p_third_score,0)
     or coalesce(p_third_score,0)<0 then
    raise exception 'Showcase scores must be descending and non-negative';
  end if;

  delete from public.monthly_growth_simulated_showcase
  where period_start=p_period_start and challenge_key=p_challenge_key;

  for v_i in 1..3 loop
    if nullif(trim(coalesce(v_names[v_i],'')),'') is not null then
      select id into v_id
      from public.monthly_growth_simulated_competitors
      where active=true and lower(trim(display_name))=lower(trim(v_names[v_i]))
      limit 1;
      if v_id is null then
        raise exception 'Managed competitor not found: %',v_names[v_i];
      end if;

      insert into public.monthly_growth_simulated_showcase(
        period_start,challenge_key,rank,competitor_id,primary_metric,public_visible,updated_at,updated_by
      ) values(
        p_period_start,p_challenge_key,v_i,v_id,coalesce(v_scores[v_i],0),coalesce(p_public_visible,false),now(),v_admin
      );
    end if;
  end loop;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(v_admin,'competition_simulated_showcase_update','monthly_growth_competition',
    jsonb_build_object(
      'period_start',p_period_start,'challenge_key',p_challenge_key,
      'public_visible',coalesce(p_public_visible,false)
    )
  );

  return public.admin_get_monthly_growth_simulated_showcase(p_period_start,p_challenge_key);
end;
$function$

revoke all on function public.admin_set_monthly_growth_simulated_showcase(date,text,text,numeric,text,numeric,text,numeric,boolean) from public,anon;
grant execute on function public.admin_set_monthly_growth_simulated_showcase(date,text,text,numeric,text,numeric,text,numeric,boolean) to authenticated,service_role;

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
  v_history_source text:='verified';
begin
  p_limit:=least(greatest(coalesce(p_limit,25),3),200);
  p_offset:=greatest(coalesce(p_offset,0),0);

  if not exists(select 1 from public.monthly_growth_challenge_settings where challenge_key=p_challenge_key and enabled=true) then
    raise exception 'Challenge is unavailable';
  end if;

  select visible_months into v_visible
  from public.monthly_growth_public_history_settings where singleton=true;
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

    if jsonb_array_length(coalesce(v_snapshot,'[]'::jsonb))=0 and exists(
      select 1 from public.monthly_growth_simulated_showcase
      where period_start=v_start and challenge_key=p_challenge_key and public_visible=true
    ) then
      v_history_source:='simulated_benchmark';
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank',s.rank,
        'user_id',s.competitor_id,
        'full_name',c.display_name,
        'username',null,
        'avatar_url',c.avatar_url,
        'primary_metric',s.primary_metric,
        'secondary_metric',0,
        'tertiary_metric',0,
        'detail','{}'::jsonb,
        'is_ranked',true
      ) order by s.rank),'[]'::jsonb)
      into v_snapshot
      from public.monthly_growth_simulated_showcase s
      join public.monthly_growth_simulated_competitors c on c.id=s.competitor_id
      where s.period_start=v_start and s.challenge_key=p_challenge_key and s.public_visible=true;
    end if;

    v_total:=jsonb_array_length(coalesce(v_snapshot,'[]'::jsonb));
    select coalesce(jsonb_agg(
      e || jsonb_build_object('rank',coalesce((e->>'rank')::integer,ord::integer),'is_ranked',true)
      order by ord
    ),'[]'::jsonb)
    into v_entries
    from jsonb_array_elements(coalesce(v_snapshot,'[]'::jsonb)) with ordinality x(e,ord)
    where ord>p_offset and ord<=p_offset+p_limit;
  else
    v_end:=(v_start+interval '1 month')::date;

    with real_base as (
      select c.user_id as entry_id,
        case when coalesce(u.show_full_name,true)=true and coalesce(u.privacy_full_name,'public')='public' then u.full_name else null end as full_name,
        u.username,
        case when coalesce(u.privacy_profile,'public')='public' then u.avatar_url else null end as avatar_url,
        c.primary_metric,c.secondary_metric,c.tertiary_metric,c.detail,false as is_synthetic,
        case when nullif(c.detail->>'achieved_at','') is null then null else (c.detail->>'achieved_at')::timestamptz end as achieved_at
      from public.compute_monthly_growth_leaderboard(p_challenge_key,v_start,v_end) c
      join public.users u on u.id=c.user_id
    ),
    simulated_scored as (
      select comp.id as entry_id,comp.display_name as full_name,null::text as username,comp.avatar_url,
        sc.base_score,sc.target_score,sc.increment_amount,sc.increment_interval_seconds,sc.started_at,
        greatest(0,case
          when sc.competitor_id is null or sc.enabled is not true then 0
          when sc.target_score is null then sc.base_score+floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount
          else least(sc.target_score,sc.base_score+floor(greatest(extract(epoch from (now()-sc.started_at)),0)/sc.increment_interval_seconds)*sc.increment_amount)
        end)::numeric as effective_score
      from public.monthly_growth_simulated_competitors comp
      join public.monthly_growth_simulation_settings ss on ss.singleton=true and ss.enabled=true
      left join public.monthly_growth_simulated_scores sc
        on sc.competitor_id=comp.id and sc.challenge_key=p_challenge_key and sc.period_start=v_start
      where comp.active=true
    ),
    simulated_base as (
      select s.entry_id,s.full_name,s.username,s.avatar_url,s.effective_score as primary_metric,
        0::numeric as secondary_metric,0::numeric as tertiary_metric,'{}'::jsonb as detail,true as is_synthetic,
        case
          when s.effective_score<=0 or s.started_at is null then null
          when coalesce(s.increment_amount,0)<=0 or s.effective_score<=coalesce(s.base_score,0) then s.started_at
          else s.started_at+make_interval(secs=>(ceil((s.effective_score-coalesce(s.base_score,0))/s.increment_amount)*s.increment_interval_seconds)::integer)
        end as achieved_at
      from simulated_scored s
    ),
    combined as (
      select * from real_base
      union all
      select * from simulated_base
    ),
    ranked as (
      select row_number() over(
        order by primary_metric desc,secondary_metric desc,tertiary_metric desc,achieved_at asc nulls last,
        md5(entry_id::text||':'||v_start::text||':'||p_challenge_key)
      )::integer as rank,* from combined
    ),
    paged as (
      select *,row_number() over(order by rank)::integer as row_index from ranked
    ),
    viewer_row as (
      select * from ranked where auth.uid() is not null and is_synthetic=false and entry_id=auth.uid() limit 1
    )
    select
      (select count(*)::integer from ranked),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'rank',p.rank,'user_id',p.entry_id,'full_name',p.full_name,'username',p.username,'avatar_url',p.avatar_url,
          'primary_metric',p.primary_metric,'secondary_metric',p.secondary_metric,'tertiary_metric',p.tertiary_metric,
          'detail',p.detail,'is_ranked',true
        ) order by p.rank)
        from paged p where p.row_index>p_offset and p.row_index<=p_offset+p_limit
      ),'[]'::jsonb),
      (
        select jsonb_build_object(
          'rank',v.rank,'user_id',v.entry_id,'full_name',v.full_name,'username',v.username,'avatar_url',v.avatar_url,
          'primary_metric',v.primary_metric,'secondary_metric',v.secondary_metric,'tertiary_metric',v.tertiary_metric,
          'detail',v.detail,'is_ranked',true
        ) from viewer_row v
      ),
      coalesce((select greatest(((v.rank-1)/p_limit)*p_limit,0)::integer from viewer_row v),0)
    into v_total,v_entries,v_viewer,v_viewer_offset;
  end if;

  return jsonb_build_object(
    'challenge_key',p_challenge_key,'period',p_period,'period_start',v_start,'total',v_total,
    'offset',p_offset,'limit',p_limit,'entries',coalesce(v_entries,'[]'::jsonb),
    'viewer',v_viewer,'viewer_offset',v_viewer_offset,'history_source',v_history_source
  );
end;
$function$

revoke all on function public.get_public_monthly_growth_leaderboard(text,text,integer,integer) from public;
grant execute on function public.get_public_monthly_growth_leaderboard(text,text,integer,integer) to anon,authenticated,service_role;

-- Natural defaults for each enabled leaderboard. Admins can change each challenge independently afterward.
update public.monthly_growth_simulation_automation_settings
set enabled=true,
    active_competitor_count=10000,
    min_target=0,
    max_target=500,
    top_target_count=3,
    top_first_target=500,
    top_second_target=200,
    top_third_target=100,
    distribution_curve=3.5,
    total_target_records=null,
    exact_distribution='{}'::jsonb,
    updated_at=now()
where challenge_key in (
  select challenge_key from public.monthly_growth_challenge_settings where enabled=true
);
