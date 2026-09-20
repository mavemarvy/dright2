begin;

create or replace function public.can_use_platform_feature(p_feature_key text)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.platform_access_settings%rowtype;
  v_feature public.platform_access_feature_rules%rowtype;
  v_paid_feature boolean := false;
  v_trial_end timestamptz;
  v_created timestamptz;
  v_admin boolean := false;
  v_subscribed boolean := false;
begin
  if v_uid is null then
    return false;
  end if;

  select is_admin,created_at into v_admin,v_created
  from public.users where id=v_uid;

  if coalesce(v_admin,false) then
    return true;
  end if;

  select * into v_settings
  from public.platform_access_settings where singleton=true;

  if not coalesce(v_settings.enabled,false)
     or coalesce(v_settings.monthly_price,0)<=0 then
    return true;
  end if;

  select * into v_feature
  from public.platform_access_feature_rules
  where feature_key=p_feature_key and is_active=true;

  if not found or not coalesce(v_feature.requires_subscription,false) then
    return true;
  end if;

  select exists(
    select 1
    from unnest(coalesce(v_feature.role_keys,'{}'::text[])) r
    join public.platform_access_role_rules rr on rr.role_key=r
    where rr.requires_subscription=true
      and rr.locked_free=false
  ) into v_paid_feature;

  if not v_paid_feature then
    return true;
  end if;

  if coalesce(v_settings.trial_enabled,true) and coalesce(v_settings.trial_days,0)>0 then
    v_trial_end := greatest(coalesce(v_created,now()),coalesce(v_settings.policy_started_at,now()))
      + make_interval(days=>v_settings.trial_days);
    if now()<v_trial_end then
      return true;
    end if;
  end if;

  select exists(
    select 1
    from public.user_subscriptions us
    join public.subscription_plans p on p.id=us.plan_id
    where us.user_id=v_uid
      and p.plan_type='platform_access'
      and (
        (us.status in ('active','trialing') and us.current_period_end>now())
        or (us.status='past_due' and us.grace_period_end is not null and us.grace_period_end>now())
      )
  ) into v_subscribed;

  return v_subscribed;
end;
$$;

create or replace function public.enforce_platform_access_write()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_feature text;
  v_role text;
  v_roles text[];
begin
  if v_uid is null then
    return new;
  end if;

  if exists(select 1 from public.users where id=v_uid and coalesce(is_admin,false)=true) then
    return new;
  end if;

  if tg_table_name='products' then
    if upper(coalesce(new.product_type,''))='SERVICE' and new.uploaded_by=v_uid then
      v_feature:='freelancer_services';
      v_role:='freelancer';
    else
      return new;
    end if;
  elsif tg_table_name='jobs' then
    if new.employer_id=v_uid then
      v_feature:='employer_job_posting';
      v_role:='employer';
    else
      return new;
    end if;
  elsif tg_table_name='cc_campaigns' then
    if new.creator_id=v_uid then
      v_feature:='task_creation';
      v_role:='task_creator';
    else
      return new;
    end if;
  elsif tg_table_name='cc_submissions' then
    if new.worker_id=v_uid then
      v_feature:='task_completion';
      v_role:='task_completer';
    else
      return new;
    end if;
  elsif tg_table_name='referral_links' then
    if new.user_id<>v_uid then
      return new;
    end if;
    v_roles := public.resolve_platform_access_roles(v_uid);
    if not ('affiliate_marketer'=any(coalesce(v_roles,'{}'::text[]))) then
      return new;
    end if;
    v_feature:='affiliate_marketing';
    v_role:='affiliate_marketer';
  else
    return new;
  end if;

  if not public.can_use_platform_feature(v_feature) then
    raise exception 'DRIGHT platform subscription required for feature: %',v_feature
      using errcode='P0001';
  end if;

  return new;
end;
$$;

commit;