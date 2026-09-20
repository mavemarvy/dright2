begin;

-- Allow the existing subscription engine to represent the DRIGHT platform-access plan.
alter table public.subscription_plans
  drop constraint if exists subscription_plans_plan_type_check;

alter table public.subscription_plans
  add constraint subscription_plans_plan_type_check
  check (plan_type = any (array[
    'affiliate'::text,
    'vendor'::text,
    'premium'::text,
    'ai'::text,
    'advertising'::text,
    'platform_access'::text
  ]));

create table if not exists public.platform_access_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  monthly_price numeric(14,2) not null default 0 check (monthly_price >= 0),
  currency text not null default 'USD',
  trial_enabled boolean not null default true,
  trial_days integer not null default 90 check (trial_days between 0 and 730),
  grace_period_days integer not null default 3 check (grace_period_days between 0 and 60),
  buyer_free boolean not null default true,
  policy_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.platform_access_settings(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.platform_access_role_rules (
  role_key text primary key,
  label text not null,
  description text,
  requires_subscription boolean not null default false,
  locked_free boolean not null default false,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

insert into public.platform_access_role_rules(role_key,label,description,requires_subscription,locked_free,sort_order)
values
  ('buyer','Buyer','Browse, purchase, manage orders, and use buyer features.',false,true,10),
  ('freelancer','Freelancer / Service Provider','Offer and manage freelance or service work.',true,false,20),
  ('affiliate_marketer','Affiliate Marketer','Use affiliate-marketing earning tools.',true,false,30),
  ('employer','Employer','Post and manage jobs.',true,false,40),
  ('task_creator','Task Creator','Create paid task/campaign opportunities.',true,false,50),
  ('task_completer','Task Completer','Accept and complete earning tasks.',true,false,60)
on conflict (role_key) do update
set label=excluded.label,
    description=excluded.description,
    locked_free=excluded.locked_free,
    sort_order=excluded.sort_order;

create table if not exists public.platform_access_feature_rules (
  feature_key text primary key,
  label text not null,
  description text,
  role_keys text[] not null default '{}'::text[],
  requires_subscription boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

insert into public.platform_access_feature_rules(
  feature_key,label,description,role_keys,requires_subscription,is_active,sort_order
)
values
  ('freelancer_services','Freelancer / Service Selling','Create and publish service/freelancer listings.',array['freelancer'],true,true,10),
  ('affiliate_marketing','Affiliate Marketing','Create/use affiliate marketing links and affiliate earning tools.',array['affiliate_marketer'],true,true,20),
  ('employer_job_posting','Employer Job Posting','Create new job listings as an employer.',array['employer'],true,true,30),
  ('task_creation','Task Creation','Create creator campaigns and paid tasks.',array['task_creator'],true,true,40),
  ('task_completion','Task Completion','Claim/submit work for earning tasks.',array['task_completer'],true,true,50)
on conflict (feature_key) do update
set label=excluded.label,
    description=excluded.description,
    role_keys=excluded.role_keys,
    sort_order=excluded.sort_order;

create table if not exists public.platform_access_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references public.platform_access_role_rules(role_key) on delete cascade,
  source text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,role_key)
);

alter table public.platform_access_settings enable row level security;
alter table public.platform_access_role_rules enable row level security;
alter table public.platform_access_feature_rules enable row level security;
alter table public.platform_access_user_roles enable row level security;

drop policy if exists platform_access_settings_read on public.platform_access_settings;
create policy platform_access_settings_read
on public.platform_access_settings for select
to authenticated
using (true);

drop policy if exists platform_access_role_rules_read on public.platform_access_role_rules;
create policy platform_access_role_rules_read
on public.platform_access_role_rules for select
to authenticated
using (true);

drop policy if exists platform_access_feature_rules_read on public.platform_access_feature_rules;
create policy platform_access_feature_rules_read
on public.platform_access_feature_rules for select
to authenticated
using (true);

drop policy if exists platform_access_user_roles_own_read on public.platform_access_user_roles;
create policy platform_access_user_roles_own_read
on public.platform_access_user_roles for select
to authenticated
using (user_id=auth.uid());

revoke insert,update,delete on public.platform_access_settings from anon,authenticated;
revoke insert,update,delete on public.platform_access_role_rules from anon,authenticated;
revoke insert,update,delete on public.platform_access_feature_rules from anon,authenticated;
revoke insert,update,delete on public.platform_access_user_roles from anon,authenticated;

insert into public.subscription_plans(
  slug,name,description,plan_type,amount,currency,interval,trial_days,
  grace_period_days,features,is_active,sort_order
)
values(
  'dright_platform_access_monthly',
  'DRIGHT Platform Access',
  'Monthly access for selected professional and earning roles. Buyer access remains free.',
  'platform_access',
  0,
  'USD',
  'monthly',
  0,
  3,
  '["Professional role access","Admin-configurable feature access","Buyer access remains free"]'::jsonb,
  false,
  5
)
on conflict(slug) do update
set name=excluded.name,
    description=excluded.description,
    plan_type='platform_access',
    interval='monthly',
    trial_days=0;

create or replace function public.resolve_platform_access_roles(p_user_id uuid default auth.uid())
returns text[]
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_roles text[] := array['buyer']::text[];
  v_profiles text[] := '{}'::text[];
  v_role text;
begin
  if p_user_id is null then
    return array['buyer']::text[];
  end if;

  select coalesce(intended_profiles,'{}'::text[])
  into v_profiles
  from public.user_private_profiles
  where user_id=p_user_id;

  if exists (
    select 1 from unnest(coalesce(v_profiles,'{}'::text[])) p
    where regexp_replace(lower(trim(p)),'[^a-z0-9]+','_','g')
      in ('freelancer','service_provider','service_seller','professional_service_provider')
  ) or exists (
    select 1 from public.products
    where uploaded_by=p_user_id and upper(coalesce(product_type,''))='SERVICE'
  ) then
    v_roles := array_append(v_roles,'freelancer');
  end if;

  select lower(coalesce(role,'')) into v_role
  from public.users where id=p_user_id;

  if v_role='affiliate'
     or exists (
       select 1 from unnest(coalesce(v_profiles,'{}'::text[])) p
       where regexp_replace(lower(trim(p)),'[^a-z0-9]+','_','g')
         in ('affiliate','affiliate_marketer','affiliate_marketing','marketer')
     )
  then
    v_roles := array_append(v_roles,'affiliate_marketer');
  end if;

  if exists(select 1 from public.jobs where employer_id=p_user_id)
     or exists (
       select 1 from unnest(coalesce(v_profiles,'{}'::text[])) p
       where regexp_replace(lower(trim(p)),'[^a-z0-9]+','_','g')
         in ('employer','job_creator','job_poster')
     )
  then
    v_roles := array_append(v_roles,'employer');
  end if;

  if exists(select 1 from public.cc_creator_profiles where user_id=p_user_id)
     or exists(select 1 from public.cc_campaigns where creator_id=p_user_id)
     or exists (
       select 1 from unnest(coalesce(v_profiles,'{}'::text[])) p
       where regexp_replace(lower(trim(p)),'[^a-z0-9]+','_','g')
         in ('task_creator','campaign_creator','creator')
     )
  then
    v_roles := array_append(v_roles,'task_creator');
  end if;

  if exists(select 1 from public.cc_worker_profiles where user_id=p_user_id)
     or exists(select 1 from public.cc_submissions where worker_id=p_user_id)
     or exists (
       select 1 from unnest(coalesce(v_profiles,'{}'::text[])) p
       where regexp_replace(lower(trim(p)),'[^a-z0-9]+','_','g')
         in ('task_completer','task_worker','worker')
     )
  then
    v_roles := array_append(v_roles,'task_completer');
  end if;

  select array_agg(distinct role_key order by role_key)
  into v_profiles
  from public.platform_access_user_roles
  where user_id=p_user_id and is_active=true;

  v_roles := coalesce(v_roles,'{}'::text[]) || coalesce(v_profiles,'{}'::text[]);

  select array_agg(distinct r order by r)
  into v_roles
  from unnest(v_roles) r;

  return coalesce(v_roles,array['buyer']::text[]);
end;
$$;

create or replace function public.get_my_platform_access()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.platform_access_settings%rowtype;
  v_roles text[];
  v_created timestamptz;
  v_anchor timestamptz;
  v_trial_end timestamptz;
  v_trial_active boolean := false;
  v_subscription_active boolean := false;
  v_plan_id uuid;
  v_requires_subscription boolean := false;
  v_admin boolean := false;
begin
  select * into v_settings
  from public.platform_access_settings
  where singleton=true;

  select is_admin,created_at into v_admin,v_created
  from public.users where id=v_uid;

  if v_uid is null then
    return jsonb_build_object(
      'authenticated',false,
      'buyer_free',true,
      'requires_subscription',false,
      'access_state','buyer_free'
    );
  end if;

  v_roles := public.resolve_platform_access_roles(v_uid);

  select exists(
    select 1
    from public.platform_access_role_rules r
    where r.requires_subscription=true
      and r.role_key=any(v_roles)
  ) into v_requires_subscription;

  select p.id into v_plan_id
  from public.subscription_plans p
  where p.slug='dright_platform_access_monthly'
  limit 1;

  if coalesce(v_settings.trial_enabled,true) and coalesce(v_settings.trial_days,0)>0 then
    v_anchor := greatest(coalesce(v_created,now()),coalesce(v_settings.policy_started_at,now()));
    v_trial_end := v_anchor + make_interval(days=>v_settings.trial_days);
    v_trial_active := now() < v_trial_end;
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
  ) into v_subscription_active;

  return jsonb_build_object(
    'authenticated',true,
    'roles',v_roles,
    'buyer_free',true,
    'policy_enabled',coalesce(v_settings.enabled,false),
    'price',coalesce(v_settings.monthly_price,0),
    'currency',coalesce(v_settings.currency,'USD'),
    'trial_enabled',coalesce(v_settings.trial_enabled,true),
    'trial_days',coalesce(v_settings.trial_days,90),
    'trial_end',v_trial_end,
    'trial_active',v_trial_active,
    'subscription_active',v_subscription_active,
    'requires_subscription',v_requires_subscription,
    'plan_id',v_plan_id,
    'access_state',
      case
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
  v_roles text[];
  v_relevant boolean := false;
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

  v_roles := public.resolve_platform_access_roles(v_uid);

  select exists(
    select 1
    from unnest(coalesce(v_feature.role_keys,'{}'::text[])) r
    join public.platform_access_role_rules rr on rr.role_key=r
    where r=any(v_roles)
      and rr.requires_subscription=true
  ) into v_relevant;

  if not v_relevant then
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

create or replace function public.admin_get_platform_access_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_settings jsonb;
  v_roles jsonb;
  v_features jsonb;
  v_plan jsonb;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select to_jsonb(s) into v_settings
  from public.platform_access_settings s where singleton=true;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order),'[]'::jsonb)
  into v_roles
  from public.platform_access_role_rules r;

  select coalesce(jsonb_agg(to_jsonb(f) order by f.sort_order),'[]'::jsonb)
  into v_features
  from public.platform_access_feature_rules f;

  select to_jsonb(p) into v_plan
  from public.subscription_plans p
  where p.slug='dright_platform_access_monthly';

  return jsonb_build_object(
    'settings',v_settings,
    'roles',v_roles,
    'features',v_features,
    'plan',v_plan
  );
end;
$$;

create or replace function public.admin_update_platform_access_policy(
  p_settings jsonb,
  p_roles jsonb default '[]'::jsonb,
  p_features jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_price numeric;
  v_currency text;
  v_enabled boolean;
  v_trial_enabled boolean;
  v_trial_days integer;
  v_grace integer;
  r jsonb;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select monthly_price,currency,enabled,trial_enabled,trial_days,grace_period_days
  into v_price,v_currency,v_enabled,v_trial_enabled,v_trial_days,v_grace
  from public.platform_access_settings where singleton=true;

  v_price := coalesce((p_settings->>'monthly_price')::numeric,v_price);
  v_currency := upper(coalesce(nullif(trim(p_settings->>'currency'),''),v_currency));
  v_enabled := coalesce((p_settings->>'enabled')::boolean,v_enabled);
  v_trial_enabled := coalesce((p_settings->>'trial_enabled')::boolean,v_trial_enabled);
  v_trial_days := coalesce((p_settings->>'trial_days')::integer,v_trial_days);
  v_grace := coalesce((p_settings->>'grace_period_days')::integer,v_grace);

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
$$;

revoke all on function public.resolve_platform_access_roles(uuid) from public;
revoke all on function public.get_my_platform_access() from public;
revoke all on function public.can_use_platform_feature(text) from public;
revoke all on function public.admin_get_platform_access_policy() from public;
revoke all on function public.admin_update_platform_access_policy(jsonb,jsonb,jsonb) from public;

grant execute on function public.get_my_platform_access() to authenticated;
grant execute on function public.can_use_platform_feature(text) to authenticated;
grant execute on function public.admin_get_platform_access_policy() to authenticated;
grant execute on function public.admin_update_platform_access_policy(jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.resolve_platform_access_roles(uuid) to service_role;

-- Database enforcement for the obvious role-specific creation/earning surfaces.
create or replace function public.enforce_platform_access_write()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_feature text;
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
    else
      return new;
    end if;
  elsif tg_table_name='jobs' then
    if new.employer_id=v_uid then v_feature:='employer_job_posting'; else return new; end if;
  elsif tg_table_name='cc_campaigns' then
    if new.creator_id=v_uid then v_feature:='task_creation'; else return new; end if;
  elsif tg_table_name='cc_submissions' then
    if new.worker_id=v_uid then v_feature:='task_completion'; else return new; end if;
  elsif tg_table_name='referral_links' then
    if new.user_id=v_uid then v_feature:='affiliate_marketing'; else return new; end if;
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

drop trigger if exists trg_platform_access_service_listing on public.products;
create trigger trg_platform_access_service_listing
before insert on public.products
for each row execute function public.enforce_platform_access_write();

drop trigger if exists trg_platform_access_job_posting on public.jobs;
create trigger trg_platform_access_job_posting
before insert on public.jobs
for each row execute function public.enforce_platform_access_write();

drop trigger if exists trg_platform_access_task_creation on public.cc_campaigns;
create trigger trg_platform_access_task_creation
before insert on public.cc_campaigns
for each row execute function public.enforce_platform_access_write();

drop trigger if exists trg_platform_access_task_completion on public.cc_submissions;
create trigger trg_platform_access_task_completion
before insert on public.cc_submissions
for each row execute function public.enforce_platform_access_write();

drop trigger if exists trg_platform_access_affiliate_marketing on public.referral_links;
create trigger trg_platform_access_affiliate_marketing
before insert on public.referral_links
for each row execute function public.enforce_platform_access_write();

commit;