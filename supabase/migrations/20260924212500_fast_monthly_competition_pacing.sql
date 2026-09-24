begin;

-- Replace the row-by-row competition planner with a set-based planner.
-- This keeps the same public/admin RPC contract, but can rebuild thousands of
-- AI challenger score plans quickly enough for an admin save to take effect immediately.
create or replace function public.generate_monthly_growth_simulation_plan_internal(
  p_challenge_key text,
  p_period_start date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_setting public.monthly_growth_simulation_automation_settings%rowtype;
  v_start date:=coalesce(p_period_start,date_trunc('month',now() at time zone 'UTC')::date);
  v_end date;
  v_active integer:=0;
  v_available integer:=0;
  v_top integer:=0;
  v_rest integer:=0;
  v_non_top_max integer:=0;
  v_range_count integer:=0;
  v_distribution jsonb;
  v_exact_count integer:=0;
  v_allowed_scores integer[];
  v_top_sum bigint:=0;
  v_budget bigint:=0;
  v_capacity integer:=0;
  v_extra bigint:=0;
  v_q integer:=0;
  v_r integer:=0;
  v_elapsed_ratio numeric:=0;
  v_remaining_seconds numeric:=3600;
  v_generated integer:=0;
  v_target_sum numeric:=0;
begin
  select * into v_setting
  from public.monthly_growth_simulation_automation_settings
  where challenge_key=p_challenge_key;

  if not found or v_setting.enabled is not true then
    return jsonb_build_object(
      'challenge_key',p_challenge_key,
      'period_start',v_start,
      'generated',0,
      'enabled',false
    );
  end if;

  v_end:=(v_start+interval '1 month')::date;
  v_distribution:=coalesce(v_setting.exact_distribution,'{}'::jsonb);
  v_remaining_seconds:=greatest(extract(epoch from (v_end::timestamptz-now())),60);
  v_elapsed_ratio:=least(
    greatest(
      extract(epoch from (now()-v_start::timestamptz))
      / greatest(extract(epoch from (v_end::timestamptz-v_start::timestamptz)),1),
      0
    ),
    1
  );

  select count(*)::integer into v_available
  from public.monthly_growth_simulated_competitors c
  where c.active=true
    and not exists(
      select 1
      from public.monthly_growth_simulated_scores m
      where m.competitor_id=c.id
        and m.challenge_key=p_challenge_key
        and m.period_start=v_start
        and m.managed_by_automation=false
    );

  v_active:=least(greatest(v_setting.active_competitor_count,0),v_available);
  v_top:=least(greatest(v_setting.top_target_count,0),v_active);
  v_rest:=greatest(v_active-v_top,0);

  v_non_top_max:=case
    when v_top>=3 then least(v_setting.max_target,greatest(floor(v_setting.top_third_target*0.75)::integer,v_setting.min_target))
    when v_top=2 then least(v_setting.max_target,greatest(floor(v_setting.top_second_target*0.75)::integer,v_setting.min_target))
    when v_top=1 then least(v_setting.max_target,greatest(floor(v_setting.top_first_target*0.75)::integer,v_setting.min_target))
    else v_setting.max_target
  end;
  v_non_top_max:=greatest(v_non_top_max,v_setting.min_target);
  v_range_count:=greatest(v_non_top_max-v_setting.min_target+1,1);

  if v_top>=1 then v_top_sum:=v_top_sum+v_setting.top_first_target; end if;
  if v_top>=2 then v_top_sum:=v_top_sum+v_setting.top_second_target; end if;
  if v_top>=3 then v_top_sum:=v_top_sum+v_setting.top_third_target; end if;
  if v_top>3 then
    select v_top_sum+coalesce(sum(greatest(v_setting.top_third_target-(g-3),0)),0)
    into v_top_sum
    from generate_series(4,v_top) g;
  end if;

  if v_distribution<>'{}'::jsonb then
    select coalesce(sum(value::text::integer),0)::integer
    into v_exact_count
    from jsonb_each(v_distribution);

    if v_exact_count>v_rest then
      raise exception 'Exact distribution requires % non-top profiles but only % are available',v_exact_count,v_rest;
    end if;

    select coalesce(array_agg(g order by g),array[]::integer[])
    into v_allowed_scores
    from generate_series(v_setting.min_target,v_non_top_max) g
    where not (v_distribution ? g::text);
  end if;

  if v_setting.total_target_records is not null and v_distribution='{}'::jsonb then
    v_budget:=v_setting.total_target_records-v_top_sum;
    if v_rest=0 then
      if v_budget<>0 then
        raise exception 'Total target records do not match the reserved top targets';
      end if;
    else
      if v_budget < v_rest::bigint*v_setting.min_target
         or v_budget > v_rest::bigint*v_non_top_max then
        raise exception 'Total target records cannot be distributed across the current non-top range';
      end if;
      v_capacity:=greatest(v_non_top_max-v_setting.min_target,0);
      v_extra:=v_budget-v_rest::bigint*v_setting.min_target;
      v_q:=case when v_rest>0 then floor(v_extra::numeric/v_rest)::integer else 0 end;
      v_r:=case when v_rest>0 then mod(v_extra,v_rest)::integer else 0 end;
    end if;
  end if;

  delete from public.monthly_growth_simulated_scores
  where challenge_key=p_challenge_key
    and period_start=v_start
    and managed_by_automation=true;

  if v_active<=0 then
    update public.monthly_growth_realtime_signal
    set version=version+1,pulse_at=now(),source_table='monthly_growth_simulated_scores'
    where singleton=true;

    return jsonb_build_object(
      'challenge_key',p_challenge_key,
      'period_start',v_start,
      'period_end',v_end,
      'generated',0,
      'enabled',true,
      'available_profiles',v_available,
      'seconds_remaining',v_remaining_seconds
    );
  end if;

  with
  previous_winners as (
    select competitor_id
    from public.monthly_growth_simulated_scores
    where challenge_key=p_challenge_key
      and period_start=(v_start-interval '1 month')::date
      and enabled=true
    order by coalesce(target_score,base_score) desc,competitor_id
    limit greatest(v_setting.top_target_count,1)
  ),
  top_ranked as (
    select c.id,
      row_number() over(
        order by
          case
            when v_setting.allow_repeat_winners then 0
            when exists(select 1 from previous_winners p where p.competitor_id=c.id) then 1
            else 0
          end,
          random()
      )::integer as rn
    from public.monthly_growth_simulated_competitors c
    where c.active=true
      and not exists(
        select 1
        from public.monthly_growth_simulated_scores m
        where m.competitor_id=c.id
          and m.challenge_key=p_challenge_key
          and m.period_start=v_start
          and m.managed_by_automation=false
      )
  ),
  chosen_top as (
    select id,rn
    from top_ranked
    where rn<=v_top
  ),
  rest_ranked as (
    select c.id,row_number() over(order by random())::integer as rn
    from public.monthly_growth_simulated_competitors c
    where c.active=true
      and not exists(select 1 from chosen_top t where t.id=c.id)
      and not exists(
        select 1
        from public.monthly_growth_simulated_scores m
        where m.competitor_id=c.id
          and m.challenge_key=p_challenge_key
          and m.period_start=v_start
          and m.managed_by_automation=false
      )
  ),
  chosen_rest as (
    select id,rn
    from rest_ranked
    where rn<=v_rest
  ),
  top_assignments as (
    select
      t.id,
      t.rn as top_rank,
      case
        when t.rn=1 then v_setting.top_first_target
        when t.rn=2 then v_setting.top_second_target
        when t.rn=3 then v_setting.top_third_target
        else greatest(v_setting.top_third_target-(t.rn-3),0)
      end::integer as target_score
    from chosen_top t
  ),
  exact_rows as (
    select score,
      row_number() over(order by random())::integer as rn
    from (
      select e.key::integer as score,generate_series(1,e.value::text::integer) as copy_no
      from jsonb_each(v_distribution) e
      where e.value::text::integer>0
    ) x
  ),
  rest_seed as (
    select
      r.id,
      r.rn,
      case
        when v_setting.total_target_records is not null and v_distribution='{}'::jsonb then
          v_q + case when r.rn<=v_r then 1 else 0 end
        else null
      end::integer as base_extra
    from chosen_rest r
  ),
  rest_pairs as (
    select
      s.*,
      ((s.rn-1)/2)::integer as pair_id,
      row_number() over(partition by ((s.rn-1)/2)::integer order by s.rn)::integer as pair_pos,
      count(*) over(partition by ((s.rn-1)/2)::integer)::integer as pair_count,
      sum(coalesce(s.base_extra,0)) over(partition by ((s.rn-1)/2)::integer)::integer as pair_total
    from rest_seed s
  ),
  pair_choices as (
    select distinct pair_id,pair_count,pair_total,
      case
        when pair_count=1 then pair_total
        else (
          greatest(0,pair_total-v_capacity)
          + floor(
              random()
              * (
                  least(v_capacity,pair_total)
                  - greatest(0,pair_total-v_capacity)
                  + 1
                )
            )::integer
        )
      end as first_extra
    from rest_pairs
  ),
  rest_targets as (
    select
      r.id,
      0::integer as top_rank,
      case
        when v_distribution<>'{}'::jsonb and r.rn<=v_exact_count then
          (select e.score from exact_rows e where e.rn=r.rn)
        when v_distribution<>'{}'::jsonb then
          case
            when cardinality(v_allowed_scores)>0 then
              v_allowed_scores[
                1+floor(random()*cardinality(v_allowed_scores))::integer
              ]
            else v_setting.min_target
          end
        when v_setting.total_target_records is not null then
          v_setting.min_target
          + case
              when p.pair_count=1 then p.pair_total
              when r.pair_pos=1 then p.first_extra
              else p.pair_total-p.first_extra
            end
        when r.rn<=v_range_count then
          v_setting.min_target+(r.rn-1)
        else
          least(
            v_non_top_max,
            v_setting.min_target
            + floor(
                power(random(),least(greatest(coalesce(v_setting.distribution_curve,3.5),1),8))
                * v_range_count
              )::integer
          )
      end::integer as target_score
    from rest_pairs r
    left join pair_choices p on p.pair_id=r.pair_id
  ),
  assignments as (
    select id,top_rank,target_score from top_assignments
    union all
    select id,top_rank,target_score from rest_targets
  ),
  randoms as (
    select a.*,
      random() as r1,random() as r2,random() as r3,random() as r4,random() as r5,random() as r6
    from assignments a
  ),
  base_calc as (
    select r.*,
      case
        when r.target_score<=0 then 0
        when v_start>=v_end then r.target_score
        when r.top_rank=1 then floor(r.target_score*least(0.97,v_elapsed_ratio*(0.82+r.r1*0.13)))::integer
        when r.top_rank=2 then floor(r.target_score*least(0.95,v_elapsed_ratio*(0.72+r.r1*0.14)))::integer
        when r.top_rank>=3 then floor(r.target_score*least(0.93,v_elapsed_ratio*(0.65+r.r1*0.16)))::integer
        else greatest(
          0,
          least(
            greatest(r.target_score-1,0),
            floor(
              r.target_score
              * least(0.95,greatest(0,v_elapsed_ratio*(0.05+r.r1*1.35)-r.r2*0.18))
            )::integer
            + floor((r.r3-0.5)*greatest(r.target_score,1)*0.10)::integer
          )
        )
      end::integer as raw_base
    from randoms r
  ),
  progress as (
    select b.*,
      least(greatest(
        case
          when b.top_rank between 1 and 3 then
            greatest(
              b.raw_base,
              least(
                b.target_score,
                v_non_top_max+greatest(4-b.top_rank,1)
              )
            )
          else b.raw_base
        end,
        0
      ),b.target_score)::integer as base_score
    from base_calc b
  ),
  increments as (
    select p.*,
      greatest(p.target_score-p.base_score,0)::integer as remaining_score
    from progress p
  ),
  paced as (
    select i.*,
      case
        when i.remaining_score<=0 then 0
        else greatest(
          1,
          least(
            i.remaining_score,
            1+floor(
              i.r4*greatest(1,ceil(i.remaining_score/140.0))
            )::integer
          )
        )
      end::integer as increment_amount
    from increments i
  ),
  timed as (
    select p.*,
      case
        when p.remaining_score<=0 or p.increment_amount<=0 then 3600
        else greatest(
          60,
          least(
            2592000,
            floor(
              (v_remaining_seconds*(0.62+p.r5*0.36))
              / greatest(1,ceil(p.remaining_score::numeric/p.increment_amount))
            )::integer
          )
        )
      end::integer as interval_seconds
    from paced p
  )
  insert into public.monthly_growth_simulated_scores(
    competitor_id,challenge_key,period_start,base_score,target_score,
    increment_amount,increment_interval_seconds,started_at,enabled,
    updated_at,updated_by,managed_by_automation,automation_generated_at
  )
  select
    t.id,p_challenge_key,v_start,t.base_score,t.target_score,
    t.increment_amount,t.interval_seconds,
    now()-make_interval(secs=>floor(t.r6*t.interval_seconds)::integer),
    true,now(),null,true,now()
  from timed t;

  get diagnostics v_generated=row_count;

  select coalesce(sum(target_score),0)
  into v_target_sum
  from public.monthly_growth_simulated_scores
  where challenge_key=p_challenge_key
    and period_start=v_start
    and managed_by_automation=true
    and enabled=true;

  update public.monthly_growth_realtime_signal
  set version=version+1,pulse_at=now(),source_table='monthly_growth_simulated_scores'
  where singleton=true;

  return jsonb_build_object(
    'challenge_key',p_challenge_key,
    'period_start',v_start,
    'period_end',v_end,
    'generated',v_generated,
    'requested_profiles',v_setting.active_competitor_count,
    'available_profiles',v_available,
    'top_target_count',v_top,
    'top_first_target',v_setting.top_first_target,
    'top_second_target',v_setting.top_second_target,
    'top_third_target',v_setting.top_third_target,
    'highest_target',v_setting.top_first_target,
    'distribution_curve',v_setting.distribution_curve,
    'total_target_records',v_setting.total_target_records,
    'generated_target_sum',v_target_sum,
    'seconds_remaining',v_remaining_seconds,
    'random_pacing',true,
    'repeat_winners',v_setting.allow_repeat_winners
  );
end;
$function$;

comment on function public.generate_monthly_growth_simulation_plan_internal(text,date) is
  'Set-based monthly AI challenger plan generator. Randomizes profile targets and pacing, guarantees low-score coverage in unconstrained mode, and recalculates increments against the remaining time before month end.';

commit;
