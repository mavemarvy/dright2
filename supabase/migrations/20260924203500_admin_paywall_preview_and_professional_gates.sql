begin;

alter table public.platform_access_settings
  add column if not exists admin_paywall_preview boolean not null default false;

comment on column public.platform_access_settings.admin_paywall_preview is
  'Admin-only QA switch. When enabled, admin accounts using the user interface are evaluated as if their professional-access trial/subscription were expired. It does not modify any user trial, Starter grant, or subscription record.';

insert into public.platform_access_feature_rules(
  feature_key,
  label,
  description,
  role_keys,
  requires_subscription,
  is_active,
  sort_order
)
values
  (
    'seller_product_listing',
    'Seller Product & Service Tools',
    'Create and manage product/service selling tools after the introductory professional-access period.',
    array['freelancer']::text[],
    true,
    true,
    15
  ),
  (
    'referral_program',
    'Referral Program',
    'Use DRIGHT referral-link and referral-growth tools after the introductory professional-access period.',
    array['affiliate_marketer']::text[],
    true,
    true,
    18
  )
on conflict (feature_key) do update
set label = excluded.label,
    description = excluded.description,
    role_keys = excluded.role_keys,
    requires_subscription = excluded.requires_subscription,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    updated_at = now();

create or replace function public.get_my_platform_access()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $function$
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
  v_preview boolean:=false;
  v_sub record;
begin
  select * into v_settings from public.platform_access_settings where singleton=true;

  if v_uid is null then
    return jsonb_build_object(
      'authenticated',false,'buyer_free',true,
      'requires_subscription',false,'access_state','buyer_free',
      'admin_paywall_preview',false
    );
  end if;

  select is_admin,created_at into v_admin,v_created
  from public.users where id=v_uid;

  v_preview := coalesce(v_admin,false)
    and coalesce(v_settings.admin_paywall_preview,false);

  v_roles:=public.resolve_platform_access_roles(v_uid);

  select exists(
    select 1 from public.platform_access_role_rules r
    where r.requires_subscription=true and r.role_key=any(v_roles)
  ) into v_requires_subscription;

  if v_preview then
    v_requires_subscription := true;
  end if;

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
    'trial_days',coalesce(v_settings.trial_days,30),
    'trial_start',v_trial_start,
    'trial_end',v_trial_end,
    'trial_source',v_trial_source,
    'trial_active',case when v_preview then false else v_trial_active end,
    'trial_total_days',case when v_trial_start is not null and v_trial_end is not null then greatest(1,ceil(extract(epoch from (v_trial_end-v_trial_start))/86400.0)::int) else 0 end,
    'trial_days_used',case when v_trial_start is not null and v_trial_end is not null then greatest(0,floor(extract(epoch from (least(now(),v_trial_end)-v_trial_start))/86400.0)::int) else 0 end,
    'trial_days_remaining',case when v_preview then 0 when v_trial_end is not null then greatest(0,ceil(extract(epoch from (v_trial_end-now()))/86400.0)::int) else 0 end,
    'subscription_active',case when v_preview then false else v_subscription_active end,
    'subscription_id',v_sub.subscription_id,
    'subscription_status',v_sub.status,
    'subscription_plan_name',v_sub.plan_name,
    'subscription_interval',v_sub.plan_interval,
    'subscription_period_start',v_sub.current_period_start,
    'subscription_period_end',v_sub.current_period_end,
    'subscription_days_used',case when v_sub.current_period_start is not null and v_sub.current_period_end is not null then greatest(0,floor(extract(epoch from (least(now(),v_sub.current_period_end)-v_sub.current_period_start))/86400.0)::int) else 0 end,
    'subscription_days_remaining',case when v_preview then 0 when v_sub.current_period_end is not null then greatest(0,ceil(extract(epoch from (v_sub.current_period_end-now()))/86400.0)::int) else 0 end,
    'grace_period_end',v_sub.grace_period_end,
    'cancel_at_period_end',coalesce(v_sub.cancel_at_period_end,false),
    'requires_subscription',v_requires_subscription,
    'plan_id',v_plan_id,
    'admin_paywall_preview',v_preview,
    'access_state',case
      when v_preview and coalesce(v_settings.enabled,false) and coalesce(v_settings.monthly_price,0)>0 then 'subscription_required'
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
$function$;

create or replace function public.can_use_platform_feature(p_feature_key text)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $function$
declare
  v_uid uuid:=auth.uid();
  v_settings public.platform_access_settings%rowtype;
  v_feature public.platform_access_feature_rules%rowtype;
  v_paid_feature boolean:=false;
  v_global_trial_end timestamptz;
  v_grant_trial_end timestamptz;
  v_created timestamptz;
  v_admin boolean:=false;
  v_preview boolean:=false;
  v_subscribed boolean:=false;
begin
  if v_uid is null then return false; end if;

  select is_admin,created_at into v_admin,v_created
  from public.users where id=v_uid;

  select * into v_settings
  from public.platform_access_settings where singleton=true;

  v_preview := coalesce(v_admin,false)
    and coalesce(v_settings.admin_paywall_preview,false);

  if coalesce(v_admin,false) and not v_preview then
    return true;
  end if;

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
    where rr.requires_subscription=true and rr.locked_free=false
  ) into v_paid_feature;

  if not v_paid_feature then return true; end if;

  if v_preview then
    return false;
  end if;

  if coalesce(v_settings.trial_enabled,true) and coalesce(v_settings.trial_days,0)>0 then
    v_global_trial_end:=greatest(coalesce(v_created,now()),coalesce(v_settings.policy_started_at,now()))
      + make_interval(days=>v_settings.trial_days);
    if now()<v_global_trial_end then return true; end if;
  end if;

  select max(g.ends_at) into v_grant_trial_end
  from public.platform_access_trial_grants g
  where g.user_id=v_uid
    and g.status='active'
    and g.starts_at<=now()
    and g.ends_at>now();

  if v_grant_trial_end is not null and now()<v_grant_trial_end then
    return true;
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
$function$;

create or replace function public.admin_update_platform_access_policy(
  p_settings jsonb,
  p_roles jsonb default '[]'::jsonb,
  p_features jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_price numeric;
  v_currency text;
  v_enabled boolean;
  v_trial_enabled boolean;
  v_trial_days integer;
  v_grace integer;
  v_admin_preview boolean;
  r jsonb;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select monthly_price,currency,enabled,trial_enabled,trial_days,grace_period_days,admin_paywall_preview
  into v_price,v_currency,v_enabled,v_trial_enabled,v_trial_days,v_grace,v_admin_preview
  from public.platform_access_settings where singleton=true;

  v_price := coalesce((p_settings->>'monthly_price')::numeric,v_price);
  v_currency := upper(coalesce(nullif(trim(p_settings->>'currency'),''),v_currency));
  v_enabled := coalesce((p_settings->>'enabled')::boolean,v_enabled);
  v_trial_enabled := coalesce((p_settings->>'trial_enabled')::boolean,v_trial_enabled);
  v_trial_days := coalesce((p_settings->>'trial_days')::integer,v_trial_days);
  v_grace := coalesce((p_settings->>'grace_period_days')::integer,v_grace);
  v_admin_preview := coalesce((p_settings->>'admin_paywall_preview')::boolean,v_admin_preview);

  if v_price<0 then raise exception 'Monthly price cannot be negative'; end if;
  if v_trial_days<0 or v_trial_days>730 then raise exception 'Invalid trial days'; end if;
  if v_grace<0 or v_grace>60 then raise exception 'Invalid grace period'; end if;

  update public.platform_access_settings
  set enabled=v_enabled,
      monthly_price=v_price,
      currency=v_currency,
      trial_enabled=v_trial_enabled,
      trial_days=v_trial_days,
      grace_period_days=v_grace,
      admin_paywall_preview=v_admin_preview,
      policy_started_at=case
        when enabled=false and v_enabled=true then now()
        else policy_started_at
      end,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  for r in select value from jsonb_array_elements(coalesce(p_roles,'[]'::jsonb))
  loop
    update public.platform_access_role_rules
    set requires_subscription=case
          when locked_free then false
          else coalesce((r->>'requires_subscription')::boolean,requires_subscription)
        end,
        updated_at=now()
    where role_key=r->>'role_key';
  end loop;

  for r in select value from jsonb_array_elements(coalesce(p_features,'[]'::jsonb))
  loop
    update public.platform_access_feature_rules
    set requires_subscription=coalesce((r->>'requires_subscription')::boolean,requires_subscription),
        is_active=coalesce((r->>'is_active')::boolean,is_active),
        updated_at=now()
    where feature_key=r->>'feature_key';
  end loop;

  update public.subscription_plans
  set amount=v_price,
      currency=v_currency,
      interval='monthly',
      trial_days=0,
      grace_period_days=v_grace,
      is_active=(v_enabled and v_price>0)
  where slug='dright_platform_access_monthly';

  return public.admin_get_platform_access_policy();
end;
$function$;

create or replace function public.enforce_platform_access_write()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_uid uuid := auth.uid();
  v_feature text;
begin
  if v_uid is null then
    return new;
  end if;

  if exists(
    select 1
    from public.users
    where id=v_uid
      and coalesce(is_admin,false)=true
      and not coalesce(
        (select admin_paywall_preview from public.platform_access_settings where singleton=true),
        false
      )
  ) then
    return new;
  end if;

  if tg_table_name='products' then
    if new.uploaded_by=v_uid then
      v_feature:='seller_product_listing';
    else
      return new;
    end if;
  elsif tg_table_name='jobs' then
    if new.employer_id=v_uid then
      v_feature:='employer_job_posting';
    else
      return new;
    end if;
  elsif tg_table_name='cc_campaigns' then
    if new.creator_id=v_uid then
      v_feature:='task_creation';
    else
      return new;
    end if;
  elsif tg_table_name='cc_submissions' then
    if new.worker_id=v_uid then
      v_feature:='task_completion';
    else
      return new;
    end if;
  elsif tg_table_name='referral_links' then
    if new.user_id=v_uid then
      v_feature:='referral_program';
    else
      return new;
    end if;
  else
    return new;
  end if;

  if not public.can_use_platform_feature(v_feature) then
    raise exception 'DRIGHT platform subscription required for feature: %',v_feature
      using errcode='P0001';
  end if;

  return new;
end;
$function$;

comment on function public.can_use_platform_feature(text) is
  'Authoritative professional-feature access check. Admin paywall preview can intentionally make admin user-side requests fail for QA without changing normal user access records.';

commit;
