begin;

-- Extend platform-access status with source-aware calendar data for profile/subscription UX.
create or replace function public.get_my_platform_access()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_settings public.platform_access_settings%rowtype;
  v_roles text[];
  v_created timestamptz;
  v_global_trial_start timestamptz;
  v_global_trial_end timestamptz;
  v_grant_start timestamptz;
  v_grant_end timestamptz;
  v_grant_source text;
  v_trial_start timestamptz;
  v_trial_end timestamptz;
  v_trial_source text;
  v_trial_active boolean:=false;
  v_subscription_active boolean:=false;
  v_plan_id uuid;
  v_requires_subscription boolean:=false;
  v_admin boolean:=false;
  v_sub record;
begin
  select * into v_settings from public.platform_access_settings where singleton=true;

  if v_uid is null then
    return jsonb_build_object(
      'authenticated',false,'buyer_free',true,
      'requires_subscription',false,'access_state','buyer_free'
    );
  end if;

  select is_admin,created_at into v_admin,v_created
  from public.users where id=v_uid;

  v_roles:=public.resolve_platform_access_roles(v_uid);

  select exists(
    select 1 from public.platform_access_role_rules r
    where r.requires_subscription=true and r.role_key=any(v_roles)
  ) into v_requires_subscription;

  select id into v_plan_id
  from public.subscription_plans
  where slug='dright_platform_access_monthly'
  limit 1;

  if coalesce(v_settings.trial_enabled,true) and coalesce(v_settings.trial_days,0)>0 then
    v_global_trial_start:=greatest(coalesce(v_created,now()),coalesce(v_settings.policy_started_at,now()));
    v_global_trial_end:=v_global_trial_start + make_interval(days=>v_settings.trial_days);
  end if;

  select g.starts_at,g.ends_at,g.source_type
  into v_grant_start,v_grant_end,v_grant_source
  from public.platform_access_trial_grants g
  where g.user_id=v_uid
    and g.status='active'
    and g.starts_at<=now()
    and g.ends_at>now()
  order by g.ends_at desc
  limit 1;

  if v_grant_end is not null and (v_global_trial_end is null or v_grant_end>=v_global_trial_end) then
    v_trial_start:=v_grant_start;
    v_trial_end:=v_grant_end;
    v_trial_source:=coalesce(v_grant_source,'grant');
  else
    v_trial_start:=v_global_trial_start;
    v_trial_end:=v_global_trial_end;
    v_trial_source:=case when v_global_trial_end is not null then 'standard_platform_trial' else null end;
  end if;

  v_trial_active:=v_trial_end is not null and now()<v_trial_end;

  select
    us.id as subscription_id,
    us.status,
    us.current_period_start,
    us.current_period_end,
    us.grace_period_end,
    us.cancel_at_period_end,
    p.name as plan_name,
    p.interval as plan_interval
  into v_sub
  from public.user_subscriptions us
  join public.subscription_plans p on p.id=us.plan_id
  where us.user_id=v_uid
    and p.plan_type='platform_access'
    and (
      (us.status in ('active','trialing') and us.current_period_end>now())
      or (us.status='past_due' and us.grace_period_end is not null and us.grace_period_end>now())
    )
  order by us.current_period_end desc
  limit 1;

  v_subscription_active:=v_sub.subscription_id is not null;

  return jsonb_build_object(
    'authenticated',true,
    'roles',v_roles,
    'buyer_free',true,
    'policy_enabled',coalesce(v_settings.enabled,false),
    'price',coalesce(v_settings.monthly_price,0),
    'currency',coalesce(v_settings.currency,'NGN'),
    'trial_enabled',coalesce(v_settings.trial_enabled,true),
    'trial_days',coalesce(v_settings.trial_days,90),
    'trial_start',v_trial_start,
    'trial_end',v_trial_end,
    'trial_source',v_trial_source,
    'trial_active',v_trial_active,
    'trial_total_days',case when v_trial_start is not null and v_trial_end is not null then greatest(1,ceil(extract(epoch from (v_trial_end-v_trial_start))/86400.0)::int) else 0 end,
    'trial_days_used',case when v_trial_start is not null and v_trial_end is not null then greatest(0,floor(extract(epoch from (least(now(),v_trial_end)-v_trial_start))/86400.0)::int) else 0 end,
    'trial_days_remaining',case when v_trial_end is not null then greatest(0,ceil(extract(epoch from (v_trial_end-now()))/86400.0)::int) else 0 end,
    'subscription_active',v_subscription_active,
    'subscription_id',v_sub.subscription_id,
    'subscription_status',v_sub.status,
    'subscription_plan_name',v_sub.plan_name,
    'subscription_interval',v_sub.plan_interval,
    'subscription_period_start',v_sub.current_period_start,
    'subscription_period_end',v_sub.current_period_end,
    'subscription_days_used',case when v_sub.current_period_start is not null and v_sub.current_period_end is not null then greatest(0,floor(extract(epoch from (least(now(),v_sub.current_period_end)-v_sub.current_period_start))/86400.0)::int) else 0 end,
    'subscription_days_remaining',case when v_sub.current_period_end is not null then greatest(0,ceil(extract(epoch from (v_sub.current_period_end-now()))/86400.0)::int) else 0 end,
    'grace_period_end',v_sub.grace_period_end,
    'cancel_at_period_end',coalesce(v_sub.cancel_at_period_end,false),
    'requires_subscription',v_requires_subscription,
    'plan_id',v_plan_id,
    'access_state',case
      when coalesce(v_admin,false) then 'admin'
      when not coalesce(v_settings.enabled,false) then 'policy_off'
      when coalesce(v_settings.monthly_price,0)<=0 then 'configuration_pending'
      when not v_requires_subscription then 'buyer_free'
      when v_subscription_active then 'subscribed'
      when v_trial_active then 'trial'
      else 'subscription_required'
    end
  );
end;
$$;

revoke all on function public.get_my_platform_access() from public,anon;
grant execute on function public.get_my_platform_access() to authenticated,service_role;

-- Admin subscription-plan editor. Financial activation still flows through the existing payment engine.
create or replace function public.admin_get_subscription_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_plans jsonb;
  v_platform jsonb;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order,p.name),'[]'::jsonb)
  into v_plans
  from public.subscription_plans p;

  v_platform:=public.admin_get_platform_access_policy();

  return jsonb_build_object('plans',v_plans,'platform_access',v_platform);
end;
$$;

create or replace function public.admin_update_subscription_plan(
  p_plan_id uuid,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_amount numeric;
  v_currency text;
  v_interval text;
  v_trial integer;
  v_grace integer;
  v_features jsonb;
  v_active boolean;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select * into v_plan from public.subscription_plans where id=p_plan_id for update;
  if not found then raise exception 'Subscription plan not found'; end if;

  v_amount:=coalesce((p_patch->>'amount')::numeric,v_plan.amount);
  v_currency:=upper(coalesce(nullif(trim(p_patch->>'currency'),''),v_plan.currency));
  v_interval:=lower(coalesce(nullif(trim(p_patch->>'interval'),''),v_plan.interval));
  v_trial:=coalesce((p_patch->>'trial_days')::integer,v_plan.trial_days);
  v_grace:=coalesce((p_patch->>'grace_period_days')::integer,v_plan.grace_period_days);
  v_features:=coalesce(p_patch->'features',v_plan.features,'[]'::jsonb);
  v_active:=coalesce((p_patch->>'is_active')::boolean,v_plan.is_active);

  if v_amount<0 then raise exception 'Plan amount cannot be negative'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter ISO code'; end if;
  if v_interval not in ('daily','weekly','monthly','yearly') then raise exception 'Invalid plan interval'; end if;
  if v_plan.plan_type='platform_access' then v_interval:='monthly'; end if;
  if v_trial<0 or v_trial>730 then raise exception 'Trial days must be between 0 and 730'; end if;
  if v_grace<0 or v_grace>60 then raise exception 'Grace period must be between 0 and 60 days'; end if;
  if jsonb_typeof(v_features)<>'array' then raise exception 'Features must be a JSON array'; end if;

  update public.subscription_plans
  set name=coalesce(nullif(trim(p_patch->>'name'),''),name),
      description=case when p_patch ? 'description' then nullif(trim(p_patch->>'description'),'') else description end,
      amount=v_amount,
      currency=v_currency,
      interval=v_interval,
      trial_days=v_trial,
      grace_period_days=v_grace,
      features=v_features,
      is_active=v_active
  where id=p_plan_id;

  if v_plan.plan_type='platform_access' then
    update public.platform_access_settings
    set monthly_price=v_amount,
        currency=v_currency,
        grace_period_days=v_grace,
        enabled=v_active,
        updated_at=now(),
        updated_by=auth.uid()
    where singleton=true;
  end if;

  return (
    select to_jsonb(p)
    from public.subscription_plans p
    where p.id=p_plan_id
  );
end;
$$;

revoke all on function public.admin_get_subscription_catalog() from public,anon;
revoke all on function public.admin_update_subscription_plan(uuid,jsonb) from public,anon;
grant execute on function public.admin_get_subscription_catalog() to authenticated,service_role;
grant execute on function public.admin_update_subscription_plan(uuid,jsonb) to authenticated,service_role;

-- Live, calendar-based Sales Team progress for the current Monday-Sunday UTC week.
create or replace function public.get_my_sales_progression_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_user record;
  v_stage_key text;
  v_rule public.sales_progression_rules%rowtype;
  v_week_start timestamptz;
  v_week_end timestamptz;
  v_sales integer:=0;
begin
  if v_uid is null then return jsonb_build_object('authenticated',false); end if;

  select marketer_status,advertiser_status,marketer_level,advertiser_grade
  into v_user
  from public.users
  where id=v_uid;

  if coalesce(v_user.advertiser_status,'')='approved' and v_user.advertiser_grade is not null then
    v_stage_key:=case lower(v_user.advertiser_grade)
      when 'a' then 'advertiser_a'
      when 'b' then 'advertiser_b'
      when 'c' then 'advertiser_c'
      when 'pro' then 'advertiser_pro'
      when 'super' then 'advertiser_super'
      when 'partnership' then 'partnership'
      else 'marketer_'||greatest(0,least(5,coalesce(v_user.marketer_level,0)))::text
    end;
  else
    v_stage_key:='marketer_'||greatest(0,least(5,coalesce(v_user.marketer_level,0)))::text;
  end if;

  select * into v_rule from public.sales_progression_rules
  where stage_key=v_stage_key and active=true;

  v_week_start:=(date_trunc('week',now() at time zone 'UTC') at time zone 'UTC');
  v_week_end:=v_week_start+interval '7 days';

  select count(*)::integer into v_sales
  from public.sales_records sr
  where sr.promoter_id=v_uid
    and sr.status='paid'
    and sr.created_at>=v_week_start
    and sr.created_at<v_week_end;

  return jsonb_build_object(
    'authenticated',true,
    'eligible',coalesce(v_user.marketer_status,'')='approved' or coalesce(v_user.advertiser_status,'')='approved',
    'stage_key',v_stage_key,
    'stage_label',coalesce(v_rule.stage_label,v_stage_key),
    'weekly_target',coalesce(v_rule.weekly_target,0),
    'weekly_sales',v_sales,
    'remaining_sales',greatest(coalesce(v_rule.weekly_target,0)-v_sales,0),
    'target_met',v_sales>=coalesce(v_rule.weekly_target,0),
    'period_start',v_week_start,
    'period_end',v_week_end,
    'seconds_remaining',greatest(0,floor(extract(epoch from (v_week_end-now())))::bigint),
    'next_stage_key',v_rule.next_stage_key,
    'downgrade_stage_key',v_rule.downgrade_stage_key
  );
end;
$$;

revoke all on function public.get_my_sales_progression_status() from public,anon;
grant execute on function public.get_my_sales_progression_status() to authenticated,service_role;

-- Evaluate the previous completed calendar week from authoritative paid sales records.
create or replace function public.run_weekly_sales_progression()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_now timestamptz:=now();
  v_current_week_start timestamptz:=(date_trunc('week',now() at time zone 'UTC') at time zone 'UTC');
  v_period_start date:=((date_trunc('week',now() at time zone 'UTC')::date)-7);
  v_period_end date:=((date_trunc('week',now() at time zone 'UTC')::date)-1);
  v_period_start_ts timestamptz;
  v_period_end_ts timestamptz;
  v_processed integer:=0;
  v_upgrades integer:=0;
  v_downgrades integer:=0;
  v_stage_key text;
  v_stage_after_key text;
  v_action text;
  v_sales integer;
  v_streak_before integer;
  v_streak_after integer;
  v_fail_before integer;
  v_fail_after integer;
  v_target_met boolean;
  v_total integer;
  v_rule public.sales_progression_rules%rowtype;
  v_next_rule public.sales_progression_rules%rowtype;
  u record;
begin
  v_period_start_ts:=(v_period_start::timestamp at time zone 'UTC');
  v_period_end_ts:=((v_period_end+1)::timestamp at time zone 'UTC');

  for u in
    select id,marketer_status,advertiser_status,marketer_level,advertiser_grade,
           consecutive_weeks_streak,consecutive_week_failures,total_sales_count
    from public.users
    where marketer_status='approved' or advertiser_status='approved'
    for update
  loop
    if exists(select 1 from public.sales_progression_weekly w where w.user_id=u.id and w.period_start=v_period_start) then
      continue;
    end if;

    if coalesce(u.advertiser_status,'')='approved' and u.advertiser_grade is not null then
      v_stage_key:=case lower(u.advertiser_grade)
        when 'a' then 'advertiser_a'
        when 'b' then 'advertiser_b'
        when 'c' then 'advertiser_c'
        when 'pro' then 'advertiser_pro'
        when 'super' then 'advertiser_super'
        when 'partnership' then 'partnership'
        else 'marketer_'||greatest(0,least(5,coalesce(u.marketer_level,0)))::text
      end;
    else
      v_stage_key:='marketer_'||greatest(0,least(5,coalesce(u.marketer_level,0)))::text;
    end if;

    select * into v_rule from public.sales_progression_rules
    where stage_key=v_stage_key and active=true;
    if not found then continue; end if;

    select count(*)::integer into v_sales
    from public.sales_records sr
    where sr.promoter_id=u.id
      and sr.status='paid'
      and sr.created_at>=v_period_start_ts
      and sr.created_at<v_period_end_ts;

    v_total:=coalesce(u.total_sales_count,0);
    v_streak_before:=coalesce(u.consecutive_weeks_streak,0);
    v_fail_before:=coalesce(u.consecutive_week_failures,0);
    v_streak_after:=v_streak_before;
    v_fail_after:=v_fail_before;
    v_stage_after_key:=v_stage_key;
    v_action:='maintain';
    v_target_met:=v_sales>=v_rule.weekly_target;

    if v_target_met then
      v_streak_after:=v_streak_before+1;
      v_fail_after:=0;
      if v_rule.next_stage_key is not null
         and v_streak_after>=v_rule.required_success_streak
         and (v_rule.required_total_sales is null or v_total>=v_rule.required_total_sales)
      then
        v_stage_after_key:=v_rule.next_stage_key;
        v_action:='upgrade';
        v_streak_after:=0;
        v_upgrades:=v_upgrades+1;
      end if;
    else
      v_streak_after:=0;
      v_fail_after:=v_fail_before+1;
      if v_rule.downgrade_stage_key is not null and v_fail_after>=v_rule.downgrade_after_failures then
        v_stage_after_key:=v_rule.downgrade_stage_key;
        v_action:='downgrade';
        v_fail_after:=0;
        v_downgrades:=v_downgrades+1;
      end if;
    end if;

    select * into v_next_rule from public.sales_progression_rules where stage_key=v_stage_after_key;

    insert into public.sales_progression_weekly(
      user_id,period_start,period_end,stage_before,stage_after,
      marketer_level_before,marketer_level_after,advertiser_grade_before,advertiser_grade_after,
      weekly_sales,weekly_target,target_met,streak_before,streak_after,
      failure_streak_before,failure_streak_after,action,evaluated_at,metadata
    ) values(
      u.id,v_period_start,v_period_end,v_rule.stage_label,coalesce(v_next_rule.stage_label,v_stage_after_key),
      coalesce(u.marketer_level,0),
      case when v_stage_after_key like 'marketer_%' then substring(v_stage_after_key from 'marketer_([0-9]+)')::integer else coalesce(u.marketer_level,5) end,
      u.advertiser_grade,
      case
        when v_stage_after_key='advertiser_a' then 'A'
        when v_stage_after_key='advertiser_b' then 'B'
        when v_stage_after_key='advertiser_c' then 'C'
        when v_stage_after_key='advertiser_pro' then 'Pro'
        when v_stage_after_key='advertiser_super' then 'Super'
        when v_stage_after_key='partnership' then 'Partnership'
        else null
      end,
      v_sales,v_rule.weekly_target,v_target_met,v_streak_before,v_streak_after,
      v_fail_before,v_fail_after,v_action,v_now,
      jsonb_build_object('source','paid_sales_records','calendar','UTC Monday-Sunday','total_sales_count',v_total)
    );

    update public.users
    set marketer_status='approved',
        marketer_level=case when v_stage_after_key like 'marketer_%' then substring(v_stage_after_key from 'marketer_([0-9]+)')::integer else greatest(5,coalesce(marketer_level,5)) end,
        advertiser_status=case when v_stage_after_key like 'advertiser_%' or v_stage_after_key='partnership' then 'approved' else 'none' end,
        advertiser_grade=case
          when v_stage_after_key='advertiser_a' then 'A'
          when v_stage_after_key='advertiser_b' then 'B'
          when v_stage_after_key='advertiser_c' then 'C'
          when v_stage_after_key='advertiser_pro' then 'Pro'
          when v_stage_after_key='advertiser_super' then 'Super'
          when v_stage_after_key='partnership' then 'Partnership'
          else null
        end,
        consecutive_weeks_streak=v_streak_after,
        consecutive_week_failures=v_fail_after,
        weekly_sales_count=0,
        last_weekly_reset_at=v_current_week_start,
        downgraded_at=case when v_action='downgrade' then v_now else downgraded_at end
    where id=u.id;

    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'success',true,'processed',v_processed,'upgrades',v_upgrades,'downgrades',v_downgrades,
    'period_start',v_period_start,'period_end',v_period_end,'evaluated_at',v_now
  );
end;
$$;

revoke all on function public.run_weekly_sales_progression() from public,anon,authenticated;
grant execute on function public.run_weekly_sales_progression() to service_role;

-- Generic clock maintenance: no financial balances are changed here.
create or replace function public.run_time_based_lifecycle_maintenance()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_grants integer:=0;
  v_promotions integer:=0;
  v_campaigns integer:=0;
  v_featured integer:=0;
begin
  update public.platform_access_trial_grants
  set status='expired',updated_at=now()
  where status='active' and ends_at<=now();
  get diagnostics v_grants=row_count;

  update public.cc_promotions
  set status='completed'
  where status='active' and ends_at<=now();
  get diagnostics v_promotions=row_count;

  update public.promotion_campaigns
  set status='completed',updated_at=now()
  where status in ('active','approved') and end_date is not null and end_date<=now();
  get diagnostics v_campaigns=row_count;

  update public.featured_products
  set is_active=false
  where is_active=true and end_date<=now();
  get diagnostics v_featured=row_count;

  return jsonb_build_object(
    'success',true,
    'expired_trial_grants',v_grants,
    'completed_cc_promotions',v_promotions,
    'completed_promotion_campaigns',v_campaigns,
    'expired_featured_products',v_featured,
    'ran_at',now()
  );
end;
$$;

revoke all on function public.run_time_based_lifecycle_maintenance() from public,anon,authenticated;
grant execute on function public.run_time_based_lifecycle_maintenance() to service_role;

create extension if not exists pg_cron;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='dright2-weekly-sales-progression' loop
    perform cron.unschedule(j.jobid);
  end loop;
  for j in select jobid from cron.job where jobname='dright2-time-lifecycle-maintenance' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'dright2-weekly-sales-progression',
  '5 0 * * 1',
  'select public.run_weekly_sales_progression();'
);

select cron.schedule(
  'dright2-time-lifecycle-maintenance',
  '*/5 * * * *',
  'select public.run_time_based_lifecycle_maintenance();'
);

commit;