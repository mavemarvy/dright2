begin;

-- ---------------------------------------------------------------------------
-- 1) Clean up legacy subscription catalog claims.
-- Platform-access trial is authoritative in platform_access_settings.
-- Individual plans do not get extra introductory trials.
-- ---------------------------------------------------------------------------
update public.subscription_plans
set trial_days = 0;

update public.subscription_plans
set
  is_active = false,
  description = 'Legacy plan retained for Admin configuration. It is not offered publicly by default.',
  features = '[]'::jsonb
where slug in (
  'affiliate_monthly',
  'vendor_monthly',
  'premium_monthly',
  'ads_starter',
  'ads_pro'
);

update public.subscription_plans
set features = (
  select coalesce(jsonb_agg(
    case
      when value = 'Unlimited image generation' then 'Expanded image generation allowance'
      else value
    end
  ), '[]'::jsonb)
  from jsonb_array_elements_text(coalesce(features,'[]'::jsonb))
)
where plan_type = 'ai';

-- ---------------------------------------------------------------------------
-- 2) Listing capacity / monthly allowance engine.
-- Free listing allowance, extra paid capacity, and promotions are separate.
-- ---------------------------------------------------------------------------
create table if not exists public.listing_allowance_settings (
  singleton boolean primary key default true check (singleton = true),
  enabled boolean not null default true,
  default_free_allowance integer not null default 5 check (default_free_allowance >= 0),
  period_kind text not null default 'calendar_month' check (period_kind in ('calendar_month')),
  warning_thresholds integer[] not null default array[80,90,100]::integer[],
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.listing_allowance_settings(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.listing_allowance_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope_type text not null check (scope_type in ('global','listing_type','category','role','user')),
  listing_type_code text references public.marketplace_listing_types(code) on delete cascade,
  category_id uuid references public.marketplace_taxonomy_categories(id) on delete cascade,
  role_key text,
  user_id uuid references public.users(id) on delete cascade,
  free_allowance integer not null check (free_allowance >= 0),
  priority integer not null default 100,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  check (
    (scope_type='global' and listing_type_code is null and category_id is null and role_key is null and user_id is null)
    or (scope_type='listing_type' and listing_type_code is not null and category_id is null and role_key is null and user_id is null)
    or (scope_type='category' and category_id is not null and role_key is null and user_id is null)
    or (scope_type='role' and role_key is not null and category_id is null and user_id is null)
    or (scope_type='user' and user_id is not null and category_id is null and role_key is null)
  )
);

create index if not exists listing_allowance_rules_resolution_idx
on public.listing_allowance_rules(is_active, scope_type, listing_type_code, category_id, role_key, user_id, priority desc);

create table if not exists public.listing_capacity_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  listing_count integer not null check (listing_count > 0),
  amount numeric(18,2) not null check (amount >= 0),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  validity_days integer not null default 30 check (validity_days between 1 and 366),
  listing_type_code text references public.marketplace_listing_types(code) on delete set null,
  category_id uuid references public.marketplace_taxonomy_categories(id) on delete set null,
  is_active boolean not null default false,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create table if not exists public.listing_capacity_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pack_id uuid references public.listing_capacity_packs(id) on delete set null,
  listing_type_code text references public.marketplace_listing_types(code) on delete set null,
  category_id uuid references public.marketplace_taxonomy_categories(id) on delete set null,
  quantity_total integer not null check (quantity_total > 0),
  quantity_used integer not null default 0 check (quantity_used >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','exhausted','expired','revoked','reversed')),
  payment_reference text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_used <= quantity_total),
  check (ends_at > starts_at)
);

create index if not exists listing_capacity_grants_user_active_idx
on public.listing_capacity_grants(user_id, status, ends_at);

create table if not exists public.listing_quota_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  listing_type_code text not null,
  category_id uuid references public.marketplace_taxonomy_categories(id) on delete set null,
  source text not null check (source in ('free_allowance','capacity_pack','admin_grant')),
  rule_id uuid references public.listing_allowance_rules(id) on delete set null,
  grant_id uuid references public.listing_capacity_grants(id) on delete set null,
  bucket_key text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, entity_type, entity_id)
);

create index if not exists listing_quota_events_usage_idx
on public.listing_quota_events(user_id, bucket_key, period_start, period_end);

alter table public.listing_allowance_settings enable row level security;
alter table public.listing_allowance_rules enable row level security;
alter table public.listing_capacity_packs enable row level security;
alter table public.listing_capacity_grants enable row level security;
alter table public.listing_quota_events enable row level security;

drop policy if exists listing_capacity_packs_public_read on public.listing_capacity_packs;
create policy listing_capacity_packs_public_read
on public.listing_capacity_packs
for select
to authenticated
using (is_active = true);

drop policy if exists listing_capacity_grants_owner_read on public.listing_capacity_grants;
create policy listing_capacity_grants_owner_read
on public.listing_capacity_grants
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists listing_quota_events_owner_read on public.listing_quota_events;
create policy listing_quota_events_owner_read
on public.listing_quota_events
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.listing_allowance_settings from anon,authenticated;
revoke all on public.listing_allowance_rules from anon,authenticated;
revoke insert,update,delete on public.listing_capacity_packs from anon,authenticated;
revoke insert,update,delete on public.listing_capacity_grants from anon,authenticated;
revoke insert,update,delete on public.listing_quota_events from anon,authenticated;
grant select on public.listing_capacity_packs,public.listing_capacity_grants,public.listing_quota_events to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_listing_allowance_rule(
  p_user_id uuid,
  p_listing_type_code text default null,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_role text;
  v_rule public.listing_allowance_rules%rowtype;
  v_default integer;
  v_ancestor_ids uuid[] := '{}'::uuid[];
begin
  select role into v_role from public.users where id=p_user_id;
  select default_free_allowance into v_default
  from public.listing_allowance_settings where singleton=true;

  if p_category_id is not null then
    with recursive a as (
      select id,parent_id from public.marketplace_taxonomy_categories where id=p_category_id
      union all
      select p.id,p.parent_id
      from public.marketplace_taxonomy_categories p
      join a child on child.parent_id=p.id
    )
    select coalesce(array_agg(id),'{}'::uuid[]) into v_ancestor_ids from a;
  end if;

  select r.* into v_rule
  from public.listing_allowance_rules r
  where r.is_active=true
    and (
      (r.scope_type='user'
        and r.user_id=p_user_id
        and (r.listing_type_code is null or r.listing_type_code=upper(coalesce(p_listing_type_code,''))))
      or
      (r.scope_type='category'
        and p_category_id is not null
        and r.category_id=any(v_ancestor_ids)
        and (r.listing_type_code is null or r.listing_type_code=upper(coalesce(p_listing_type_code,''))))
      or
      (r.scope_type='role'
        and lower(r.role_key)=lower(coalesce(v_role,'user'))
        and (r.listing_type_code is null or r.listing_type_code=upper(coalesce(p_listing_type_code,''))))
      or
      (r.scope_type='listing_type'
        and r.listing_type_code=upper(coalesce(p_listing_type_code,'')))
      or
      (r.scope_type='global')
    )
  order by
    case r.scope_type
      when 'user' then 500
      when 'category' then 400
      when 'role' then 300
      when 'listing_type' then 200
      else 100
    end desc,
    r.priority desc,
    r.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'rule_id',v_rule.id,
      'rule_name',v_rule.name,
      'scope_type',v_rule.scope_type,
      'free_allowance',v_rule.free_allowance,
      'bucket_key','rule:'||v_rule.id::text
    );
  end if;

  return jsonb_build_object(
    'rule_id',null,
    'rule_name','Default monthly allowance',
    'scope_type','default',
    'free_allowance',coalesce(v_default,5),
    'bucket_key','default'
  );
end;
$$;

revoke all on function public.resolve_listing_allowance_rule(uuid,text,uuid) from public,anon;
grant execute on function public.resolve_listing_allowance_rule(uuid,text,uuid) to authenticated,service_role;

create or replace function public.get_my_listing_capacity(
  p_listing_type_code text default null,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_settings public.listing_allowance_settings%rowtype;
  v_policy jsonb;
  v_bucket text;
  v_free integer;
  v_used integer:=0;
  v_extra_total integer:=0;
  v_extra_used integer:=0;
  v_start timestamptz;
  v_end timestamptz;
  v_packs jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('authenticated',false);
  end if;

  select * into v_settings from public.listing_allowance_settings where singleton=true;
  v_start := date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  v_end := v_start + interval '1 month';

  v_policy := public.resolve_listing_allowance_rule(v_uid,p_listing_type_code,p_category_id);
  v_bucket := v_policy->>'bucket_key';
  v_free := coalesce((v_policy->>'free_allowance')::integer,0);

  select count(*)::integer into v_used
  from public.listing_quota_events e
  where e.user_id=v_uid
    and e.bucket_key=v_bucket
    and e.source='free_allowance'
    and e.period_start=v_start;

  select
    coalesce(sum(g.quantity_total),0)::integer,
    coalesce(sum(g.quantity_used),0)::integer
  into v_extra_total,v_extra_used
  from public.listing_capacity_grants g
  where g.user_id=v_uid
    and g.status in ('active','exhausted')
    and g.starts_at<=now()
    and g.ends_at>now()
    and (g.listing_type_code is null or g.listing_type_code=upper(coalesce(p_listing_type_code,g.listing_type_code)))
    and (g.category_id is null or p_category_id is null or g.category_id=p_category_id);

  select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order,p.amount,p.name),'[]'::jsonb)
  into v_packs
  from public.listing_capacity_packs p
  where p.is_active=true
    and (p.listing_type_code is null or p.listing_type_code=upper(coalesce(p_listing_type_code,p.listing_type_code)))
    and (p.category_id is null or p_category_id is null or p.category_id=p_category_id);

  return jsonb_build_object(
    'authenticated',true,
    'enabled',coalesce(v_settings.enabled,true),
    'period_start',v_start,
    'period_end',v_end,
    'policy',v_policy,
    'free_allowance',v_free,
    'free_used',v_used,
    'free_remaining',greatest(v_free-v_used,0),
    'extra_allowance',v_extra_total,
    'extra_used',v_extra_used,
    'extra_remaining',greatest(v_extra_total-v_extra_used,0),
    'total_remaining',greatest(v_free-v_used,0)+greatest(v_extra_total-v_extra_used,0),
    'packs',v_packs
  );
end;
$$;

revoke all on function public.get_my_listing_capacity(text,uuid) from public,anon;
grant execute on function public.get_my_listing_capacity(text,uuid) to authenticated,service_role;

create or replace function public.can_create_listing(
  p_listing_type_code text default null,
  p_category_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_status jsonb;
begin
  if auth.uid() is null then return false; end if;
  if exists(select 1 from public.users where id=auth.uid() and is_admin=true) then return true; end if;
  select public.get_my_listing_capacity(p_listing_type_code,p_category_id) into v_status;
  if coalesce((v_status->>'enabled')::boolean,true)=false then return true; end if;
  return coalesce((v_status->>'total_remaining')::integer,0)>0;
end;
$$;

revoke all on function public.can_create_listing(text,uuid) from public,anon;
grant execute on function public.can_create_listing(text,uuid) to authenticated,service_role;

create or replace function public.consume_listing_capacity(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_listing_type_code text,
  p_category_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_settings public.listing_allowance_settings%rowtype;
  v_policy jsonb;
  v_rule_id uuid;
  v_bucket text;
  v_free integer;
  v_used integer;
  v_start timestamptz;
  v_end timestamptz;
  v_grant public.listing_capacity_grants%rowtype;
  v_event_id uuid;
begin
  if p_user_id is null or p_entity_id is null then
    raise exception 'Listing capacity requires a user and entity id';
  end if;

  if exists(
    select 1 from public.listing_quota_events
    where user_id=p_user_id and entity_type=p_entity_type and entity_id=p_entity_id
  ) then
    return jsonb_build_object('success',true,'idempotent',true);
  end if;

  if exists(select 1 from public.users where id=p_user_id and is_admin=true) then
    return jsonb_build_object('success',true,'admin_exempt',true);
  end if;

  select * into v_settings from public.listing_allowance_settings where singleton=true;
  if coalesce(v_settings.enabled,true)=false then
    return jsonb_build_object('success',true,'policy_disabled',true);
  end if;

  v_start := date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  v_end := v_start + interval '1 month';
  v_policy := public.resolve_listing_allowance_rule(p_user_id,p_listing_type_code,p_category_id);
  v_bucket := v_policy->>'bucket_key';
  v_free := coalesce((v_policy->>'free_allowance')::integer,0);
  v_rule_id := nullif(v_policy->>'rule_id','')::uuid;

  select count(*)::integer into v_used
  from public.listing_quota_events
  where user_id=p_user_id
    and bucket_key=v_bucket
    and source='free_allowance'
    and period_start=v_start;

  if v_used < v_free then
    insert into public.listing_quota_events(
      user_id,entity_type,entity_id,listing_type_code,category_id,
      source,rule_id,bucket_key,period_start,period_end
    )
    values(
      p_user_id,p_entity_type,p_entity_id,upper(p_listing_type_code),p_category_id,
      'free_allowance',v_rule_id,v_bucket,v_start,v_end
    )
    returning id into v_event_id;

    return jsonb_build_object(
      'success',true,
      'source','free_allowance',
      'event_id',v_event_id,
      'free_remaining',greatest(v_free-v_used-1,0)
    );
  end if;

  select g.* into v_grant
  from public.listing_capacity_grants g
  where g.user_id=p_user_id
    and g.status='active'
    and g.starts_at<=now()
    and g.ends_at>now()
    and g.quantity_used<g.quantity_total
    and (g.listing_type_code is null or g.listing_type_code=upper(p_listing_type_code))
    and (g.category_id is null or p_category_id is null or g.category_id=p_category_id)
  order by g.ends_at asc,g.created_at asc
  for update skip locked
  limit 1;

  if found then
    update public.listing_capacity_grants
    set quantity_used=quantity_used+1,
        status=case when quantity_used+1>=quantity_total then 'exhausted' else 'active' end,
        updated_at=now()
    where id=v_grant.id;

    insert into public.listing_quota_events(
      user_id,entity_type,entity_id,listing_type_code,category_id,
      source,grant_id,bucket_key,period_start,period_end,
      metadata
    )
    values(
      p_user_id,p_entity_type,p_entity_id,upper(p_listing_type_code),p_category_id,
      'capacity_pack',v_grant.id,'grant:'||v_grant.id::text,v_start,v_end,
      jsonb_build_object('grant_ends_at',v_grant.ends_at)
    )
    returning id into v_event_id;

    return jsonb_build_object(
      'success',true,
      'source','capacity_pack',
      'event_id',v_event_id,
      'grant_id',v_grant.id,
      'grant_remaining',greatest(v_grant.quantity_total-v_grant.quantity_used-1,0)
    );
  end if;

  raise exception using
    errcode='P0001',
    message='LISTING_CAPACITY_EXHAUSTED',
    detail='Your free listing allowance is exhausted. Purchase additional listing capacity or wait for the next monthly reset.';
end;
$$;

revoke all on function public.consume_listing_capacity(uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.consume_listing_capacity(uuid,text,uuid,text,uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Server-side enforcement for Products (physical/digital/service/course/etc.)
-- and Jobs. Service-role/system records and admins are exempt.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_product_listing_capacity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_category_id uuid;
begin
  if coalesce(auth.role(),'')='service_role' or v_uid is null then return new; end if;
  if new.uploaded_by is distinct from v_uid then return new; end if;
  if exists(select 1 from public.users where id=v_uid and is_admin=true) then return new; end if;

  select c.id into v_category_id
  from public.marketplace_taxonomy_categories c
  where c.listing_type_code=upper(coalesce(new.product_type,'PHYSICAL'))
    and c.parent_id is null
    and lower(c.name)=lower(coalesce(new.category,''))
  order by c.created_at
  limit 1;

  perform public.consume_listing_capacity(
    v_uid,'product',new.id,upper(coalesce(new.product_type,'PHYSICAL')),v_category_id
  );
  return new;
end;
$$;

drop trigger if exists trg_enforce_product_listing_capacity on public.products;
create trigger trg_enforce_product_listing_capacity
before insert on public.products
for each row execute function public.enforce_product_listing_capacity();

create or replace function public.enforce_job_listing_capacity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_category_id uuid;
begin
  if coalesce(auth.role(),'')='service_role' or v_uid is null then return new; end if;
  if new.employer_id is distinct from v_uid then return new; end if;
  if exists(select 1 from public.users where id=v_uid and is_admin=true) then return new; end if;

  select c.id into v_category_id
  from public.marketplace_taxonomy_categories c
  where c.listing_type_code='JOB'
    and c.parent_id is null
    and lower(c.name)=lower(coalesce(new.category,''))
  order by c.created_at
  limit 1;

  perform public.consume_listing_capacity(v_uid,'job',new.id,'JOB',v_category_id);
  return new;
end;
$$;

drop trigger if exists trg_enforce_job_listing_capacity on public.jobs;
create trigger trg_enforce_job_listing_capacity
before insert on public.jobs
for each row execute function public.enforce_job_listing_capacity();

-- ---------------------------------------------------------------------------
-- 3) Verified paid capacity packs.
-- ---------------------------------------------------------------------------
alter table public.paystack_transactions
drop constraint if exists paystack_transactions_purpose_check;

alter table public.paystack_transactions
add constraint paystack_transactions_purpose_check
check (purpose = any(array[
  'wallet_funding'::text,'product_purchase'::text,'subscription'::text,'escrow'::text,
  'advertiser_funding'::text,'affiliate_subscription'::text,'vendor_subscription'::text,
  'promotion_campaign'::text,'sales_team_contract'::text,'listing_capacity'::text
]));

create or replace function public.process_verified_listing_capacity_payment(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tx public.paystack_transactions%rowtype;
  v_pack public.listing_capacity_packs%rowtype;
  v_existing public.listing_capacity_grants%rowtype;
  v_grant_id uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Listing capacity payment processing requires service_role';
  end if;

  select * into v_tx
  from public.paystack_transactions
  where reference=p_reference
  for update;

  if not found then raise exception 'Canonical Paystack transaction not found'; end if;
  if v_tx.purpose<>'listing_capacity' then raise exception 'Invalid payment purpose'; end if;
  if v_tx.status<>'success' then raise exception 'Listing capacity payment is not verified'; end if;
  if v_tx.reference_id is null then raise exception 'Listing capacity pack reference is missing'; end if;

  select * into v_existing
  from public.listing_capacity_grants
  where payment_reference=p_reference
  limit 1;

  if found then
    return jsonb_build_object('success',true,'idempotent',true,'grant_id',v_existing.id);
  end if;

  select * into v_pack
  from public.listing_capacity_packs
  where id=v_tx.reference_id and is_active=true
  for share;

  if not found then raise exception 'Listing capacity pack is unavailable'; end if;
  if abs(v_pack.amount-v_tx.amount)>0.01 then raise exception 'Listing capacity payment amount mismatch'; end if;
  if upper(v_pack.currency)<>upper(v_tx.currency) then raise exception 'Listing capacity payment currency mismatch'; end if;

  insert into public.listing_capacity_grants(
    user_id,pack_id,listing_type_code,category_id,
    quantity_total,quantity_used,starts_at,ends_at,status,payment_reference,
    metadata
  )
  values(
    v_tx.user_id,v_pack.id,v_pack.listing_type_code,v_pack.category_id,
    v_pack.listing_count,0,now(),now()+make_interval(days=>v_pack.validity_days),
    'active',p_reference,
    jsonb_build_object('pack_name',v_pack.name,'amount',v_pack.amount,'currency',v_pack.currency)
  )
  returning id into v_grant_id;

  update public.paystack_transactions
  set processed_at=coalesce(processed_at,now()),updated_at=now()
  where reference=p_reference;

  insert into public.analytics_events(
    event_type,entity_type,entity_id,seller_id,viewer_id,metadata
  )
  values(
    'listing_capacity_purchased','listing_capacity_grant',v_grant_id,
    v_tx.user_id,v_tx.user_id,
    jsonb_build_object('payment_reference',p_reference,'pack_id',v_pack.id,'listing_count',v_pack.listing_count)
  );

  return jsonb_build_object(
    'success',true,'grant_id',v_grant_id,'listing_count',v_pack.listing_count,
    'ends_at',now()+make_interval(days=>v_pack.validity_days)
  );
end;
$$;

revoke all on function public.process_verified_listing_capacity_payment(text) from public,anon,authenticated;
grant execute on function public.process_verified_listing_capacity_payment(text) to service_role;

-- Extend authoritative payment dispatcher without changing existing product,
-- subscription, Sales Team, promotion, wallet, or affiliate branches.
create or replace function public.process_paystack_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_purpose text,
  p_reference_id uuid,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tx public.paystack_transactions%rowtype;
  v_currency text;
  v_result jsonb;
  v_subscription jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Payment processing requires service_role';
  end if;

  select * into v_tx
  from public.paystack_transactions
  where reference=p_reference
  for update;

  if not found then raise exception 'Canonical Paystack transaction not found'; end if;
  if v_tx.user_id is distinct from p_user_id then raise exception 'Payment user mismatch'; end if;
  if v_tx.purpose is distinct from p_purpose then raise exception 'Payment purpose mismatch'; end if;
  if v_tx.reference_id is distinct from p_reference_id then raise exception 'Payment reference target mismatch'; end if;
  if abs(coalesce(v_tx.amount,0)-coalesce(p_amount,0))>0.01 then raise exception 'Payment amount mismatch'; end if;
  if v_tx.status<>'success' then raise exception 'Paystack transaction is not verified successful'; end if;

  v_currency := upper(v_tx.currency);

  if p_purpose='listing_capacity' then
    return public.process_verified_listing_capacity_payment(p_reference);
  end if;

  if p_purpose='promotion_campaign' then
    return public.process_verified_promotion_payment(
      p_reference,p_user_id,v_tx.amount,v_currency,'paystack'
    );
  end if;

  if p_purpose='sales_team_contract' then
    return public.process_verified_sales_team_contract_payment(
      p_reference,p_user_id,v_tx.amount,v_currency,'paystack'
    );
  end if;

  v_result := public.process_paystack_payment_core_st6(
    p_reference,
    p_user_id,
    v_tx.amount,
    v_tx.purpose,
    v_tx.reference_id,
    coalesce(v_tx.metadata,'{}'::jsonb)
  );

  if p_purpose in ('subscription','affiliate_subscription','vendor_subscription') then
    v_subscription := public.activate_verified_subscription_payment(p_reference);
    v_result := coalesce(v_result,'{}'::jsonb)
      || jsonb_build_object('subscription_activation',v_subscription);
  end if;

  return v_result;
end;
$$;

revoke all on function public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 4) Admin controls.
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_listing_capacity_config()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_settings jsonb;
  v_rules jsonb;
  v_packs jsonb;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select to_jsonb(s) into v_settings
  from public.listing_allowance_settings s
  where singleton=true;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.priority desc,r.created_at),'[]'::jsonb)
  into v_rules
  from public.listing_allowance_rules r;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order,p.amount,p.name),'[]'::jsonb)
  into v_packs
  from public.listing_capacity_packs p;

  return jsonb_build_object('settings',v_settings,'rules',v_rules,'packs',v_packs);
end;
$$;

create or replace function public.admin_update_listing_allowance_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_enabled boolean;
  v_allowance integer;
  v_thresholds integer[];
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select
    coalesce((p_patch->>'enabled')::boolean,enabled),
    coalesce((p_patch->>'default_free_allowance')::integer,default_free_allowance),
    case
      when p_patch ? 'warning_thresholds' then
        array(select value::integer from jsonb_array_elements_text(p_patch->'warning_thresholds'))
      else warning_thresholds
    end
  into v_enabled,v_allowance,v_thresholds
  from public.listing_allowance_settings where singleton=true;

  if v_allowance<0 or v_allowance>1000000 then raise exception 'Invalid free listing allowance'; end if;

  update public.listing_allowance_settings
  set enabled=v_enabled,
      default_free_allowance=v_allowance,
      warning_thresholds=v_thresholds,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  return (select to_jsonb(s) from public.listing_allowance_settings s where singleton=true);
end;
$$;

create or replace function public.admin_upsert_listing_capacity_pack(p_pack jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid:=nullif(p_pack->>'id','')::uuid;
  v_row public.listing_capacity_packs%rowtype;
  v_currency text:=upper(coalesce(nullif(trim(p_pack->>'currency'),''),'NGN'));
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  if coalesce(trim(p_pack->>'name'),'')='' then raise exception 'Pack name is required'; end if;
  if coalesce((p_pack->>'listing_count')::integer,0)<=0 then raise exception 'Listing count must be greater than zero'; end if;
  if coalesce((p_pack->>'amount')::numeric,-1)<0 then raise exception 'Price cannot be negative'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter ISO code'; end if;
  if coalesce((p_pack->>'validity_days')::integer,0) not between 1 and 366 then raise exception 'Validity must be 1 to 366 days'; end if;

  if v_id is null then
    insert into public.listing_capacity_packs(
      name,description,listing_count,amount,currency,validity_days,
      listing_type_code,category_id,is_active,sort_order,created_by,updated_by
    )
    values(
      trim(p_pack->>'name'),nullif(trim(p_pack->>'description'),''),
      (p_pack->>'listing_count')::integer,(p_pack->>'amount')::numeric,v_currency,
      (p_pack->>'validity_days')::integer,
      nullif(upper(trim(p_pack->>'listing_type_code')),''),
      nullif(p_pack->>'category_id','')::uuid,
      coalesce((p_pack->>'is_active')::boolean,false),
      coalesce((p_pack->>'sort_order')::integer,100),
      auth.uid(),auth.uid()
    )
    returning * into v_row;
  else
    update public.listing_capacity_packs
    set name=trim(p_pack->>'name'),
        description=nullif(trim(p_pack->>'description'),''),
        listing_count=(p_pack->>'listing_count')::integer,
        amount=(p_pack->>'amount')::numeric,
        currency=v_currency,
        validity_days=(p_pack->>'validity_days')::integer,
        listing_type_code=nullif(upper(trim(p_pack->>'listing_type_code')),''),
        category_id=nullif(p_pack->>'category_id','')::uuid,
        is_active=coalesce((p_pack->>'is_active')::boolean,is_active),
        sort_order=coalesce((p_pack->>'sort_order')::integer,sort_order),
        updated_at=now(),
        updated_by=auth.uid()
    where id=v_id
    returning * into v_row;
    if not found then raise exception 'Listing capacity pack not found'; end if;
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_upsert_listing_allowance_rule(p_rule jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid:=nullif(p_rule->>'id','')::uuid;
  v_scope text:=lower(coalesce(p_rule->>'scope_type','global'));
  v_row public.listing_allowance_rules%rowtype;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;
  if v_scope not in ('global','listing_type','category','role','user') then raise exception 'Invalid rule scope'; end if;
  if coalesce((p_rule->>'free_allowance')::integer,-1)<0 then raise exception 'Allowance cannot be negative'; end if;

  if v_id is null then
    insert into public.listing_allowance_rules(
      name,scope_type,listing_type_code,category_id,role_key,user_id,
      free_allowance,priority,is_active,created_by,updated_by
    )
    values(
      coalesce(nullif(trim(p_rule->>'name'),''),'Listing allowance rule'),
      v_scope,
      nullif(upper(trim(p_rule->>'listing_type_code')),''),
      nullif(p_rule->>'category_id','')::uuid,
      nullif(lower(trim(p_rule->>'role_key')),''),
      nullif(p_rule->>'user_id','')::uuid,
      (p_rule->>'free_allowance')::integer,
      coalesce((p_rule->>'priority')::integer,100),
      coalesce((p_rule->>'is_active')::boolean,true),
      auth.uid(),auth.uid()
    )
    returning * into v_row;
  else
    update public.listing_allowance_rules
    set name=coalesce(nullif(trim(p_rule->>'name'),''),name),
        scope_type=v_scope,
        listing_type_code=nullif(upper(trim(p_rule->>'listing_type_code')),''),
        category_id=nullif(p_rule->>'category_id','')::uuid,
        role_key=nullif(lower(trim(p_rule->>'role_key')),''),
        user_id=nullif(p_rule->>'user_id','')::uuid,
        free_allowance=(p_rule->>'free_allowance')::integer,
        priority=coalesce((p_rule->>'priority')::integer,priority),
        is_active=coalesce((p_rule->>'is_active')::boolean,is_active),
        updated_at=now(),updated_by=auth.uid()
    where id=v_id
    returning * into v_row;
    if not found then raise exception 'Listing allowance rule not found'; end if;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_get_listing_capacity_config() from public,anon;
revoke all on function public.admin_update_listing_allowance_settings(jsonb) from public,anon;
revoke all on function public.admin_upsert_listing_capacity_pack(jsonb) from public,anon;
revoke all on function public.admin_upsert_listing_allowance_rule(jsonb) from public,anon;
grant execute on function public.admin_get_listing_capacity_config() to authenticated,service_role;
grant execute on function public.admin_update_listing_allowance_settings(jsonb) to authenticated,service_role;
grant execute on function public.admin_upsert_listing_capacity_pack(jsonb) to authenticated,service_role;
grant execute on function public.admin_upsert_listing_allowance_rule(jsonb) to authenticated,service_role;

commit;