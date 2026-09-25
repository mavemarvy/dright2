begin;

-- Support channel visibility: keep a department available while hiding an inactive email address.
alter table public.support_departments
  add column if not exists email_visible boolean not null default true;

create or replace function public.admin_set_support_department_email_visibility(
  p_department_id uuid,
  p_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_row public.support_departments%rowtype;
begin
  if auth.uid() is null or not public.has_dright_permission('site_settings','manage') then
    raise exception 'Site settings management permission required';
  end if;

  update public.support_departments
  set email_visible=coalesce(p_visible,false),
      updated_at=now(),
      updated_by=auth.uid()
  where id=p_department_id
    and coalesce(is_deleted,false)=false
  returning * into v_row;

  if not found then raise exception 'Support department not found'; end if;

  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values(
    auth.uid(),
    'support_email_visibility_update',
    p_department_id,
    'support_department',
    jsonb_build_object('visible',v_row.email_visible,'name',v_row.name,'email',v_row.email)
  );

  return jsonb_build_object(
    'id',v_row.id,
    'name',v_row.name,
    'email',v_row.email,
    'email_visible',v_row.email_visible
  );
end;
$function$;

revoke all on function public.admin_set_support_department_email_visibility(uuid,boolean) from public;
grant execute on function public.admin_set_support_department_email_visibility(uuid,boolean) to authenticated;

-- Marketplace flyer strip behavior. The global user/admin visibility remains in
-- user_navigation_visibility; this table controls looping behavior and timing.
create table if not exists public.marketplace_flyer_settings(
  singleton boolean primary key default true check(singleton),
  loop_enabled boolean not null default true,
  interval_seconds integer not null default 5 check(interval_seconds between 3 and 30),
  max_official_items integer not null default 8 check(max_official_items between 1 and 25),
  max_sponsored_items integer not null default 4 check(max_sponsored_items between 0 and 10),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

insert into public.marketplace_flyer_settings(singleton)
values(true)
on conflict(singleton) do nothing;

alter table public.marketplace_flyer_settings enable row level security;

drop policy if exists marketplace_flyer_settings_read on public.marketplace_flyer_settings;
create policy marketplace_flyer_settings_read
on public.marketplace_flyer_settings
for select
to anon,authenticated
using(true);

grant select on public.marketplace_flyer_settings to anon,authenticated;

create or replace function public.admin_update_marketplace_flyer_settings(
  p_loop_enabled boolean,
  p_interval_seconds integer default 5,
  p_max_official_items integer default 8,
  p_max_sponsored_items integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_row public.marketplace_flyer_settings%rowtype;
begin
  if auth.uid() is null or not public.has_dright_permission('site_settings','manage') then
    raise exception 'Site settings management permission required';
  end if;

  insert into public.marketplace_flyer_settings(
    singleton,loop_enabled,interval_seconds,max_official_items,max_sponsored_items,updated_at,updated_by
  )
  values(
    true,
    coalesce(p_loop_enabled,true),
    least(greatest(coalesce(p_interval_seconds,5),3),30),
    least(greatest(coalesce(p_max_official_items,8),1),25),
    least(greatest(coalesce(p_max_sponsored_items,4),0),10),
    now(),auth.uid()
  )
  on conflict(singleton) do update
  set loop_enabled=excluded.loop_enabled,
      interval_seconds=excluded.interval_seconds,
      max_official_items=excluded.max_official_items,
      max_sponsored_items=excluded.max_sponsored_items,
      updated_at=now(),
      updated_by=auth.uid()
  returning * into v_row;

  insert into public.admin_logs(admin_id,action_type,target_type,details)
  values(
    auth.uid(),
    'marketplace_flyer_settings_update',
    'marketplace_flyer_settings',
    jsonb_build_object(
      'loop_enabled',v_row.loop_enabled,
      'interval_seconds',v_row.interval_seconds,
      'max_official_items',v_row.max_official_items,
      'max_sponsored_items',v_row.max_sponsored_items
    )
  );

  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.admin_update_marketplace_flyer_settings(boolean,integer,integer,integer) from public;
grant execute on function public.admin_update_marketplace_flyer_settings(boolean,integer,integer,integer) to authenticated;

-- User-side component visibility controls.
insert into public.user_navigation_visibility(
  feature_key,label,route,nav_group,visible,visible_to_admins,feature_scope,sort_order
)
values
  ('promo_flyer_strip','Marketplace Promo Flyers','/market','Interface & Marketing',true,true,'component',901),
  ('cookie_consent_banner','Cookie Consent Banner','/legal/cookie-policy','Privacy & Consent',true,true,'component',902)
on conflict(feature_key) do update
set label=excluded.label,
    route=excluded.route,
    nav_group=excluded.nav_group,
    feature_scope=excluded.feature_scope,
    sort_order=excluded.sort_order;

-- Consent storage. Essential/security cookies are not disabled by choosing
-- "Necessary only"; the preference only limits optional analytics/marketing.
create table if not exists public.cookie_consents(
  user_id uuid primary key references auth.users(id) on delete cascade,
  consent_version text not null default '2026-09',
  preference text not null default 'necessary' check(preference in ('necessary','all')),
  analytics_allowed boolean not null default false,
  marketing_allowed boolean not null default false,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cookie_consents enable row level security;

drop policy if exists cookie_consents_own_select on public.cookie_consents;
create policy cookie_consents_own_select
on public.cookie_consents for select to authenticated
using(auth.uid()=user_id);

drop policy if exists cookie_consents_own_insert on public.cookie_consents;
create policy cookie_consents_own_insert
on public.cookie_consents for insert to authenticated
with check(auth.uid()=user_id);

drop policy if exists cookie_consents_own_update on public.cookie_consents;
create policy cookie_consents_own_update
on public.cookie_consents for update to authenticated
using(auth.uid()=user_id)
with check(auth.uid()=user_id);

grant select,insert,update on public.cookie_consents to authenticated;

-- Network risk policy and server-side observations. These are security signals,
-- not definitive proof of VPN usage. Automatic suspension is intentionally off;
-- confirmed/repeated signals are reviewed before punitive action.
create table if not exists public.network_fraud_policy(
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  vpn_prohibited boolean not null default true,
  proxy_prohibited boolean not null default true,
  tor_prohibited boolean not null default true,
  datacenter_flag_enabled boolean not null default true,
  auto_flag boolean not null default true,
  auto_suspend boolean not null default false,
  recheck_hours integer not null default 12 check(recheck_hours between 1 and 168),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);

insert into public.network_fraud_policy(singleton)
values(true)
on conflict(singleton) do nothing;

create table if not exists public.user_network_risk_signals(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_address inet not null,
  country_code text null,
  country text null,
  region text null,
  city text null,
  device_type text null,
  is_vpn boolean null,
  is_proxy boolean null,
  is_tor boolean null,
  is_datacenter boolean null,
  is_abuser boolean null,
  risk_detected boolean not null default false,
  risk_reasons text[] not null default '{}'::text[],
  provider text not null default 'ipapi.is',
  provider_status text not null default 'unknown',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_response jsonb null,
  unique(user_id,ip_address)
);

create index if not exists idx_user_network_risk_signals_user_last_seen
  on public.user_network_risk_signals(user_id,last_seen_at desc);
create index if not exists idx_user_network_risk_signals_risk
  on public.user_network_risk_signals(risk_detected,last_seen_at desc);

alter table public.network_fraud_policy enable row level security;
alter table public.user_network_risk_signals enable row level security;

drop policy if exists network_fraud_policy_read_authenticated on public.network_fraud_policy;
create policy network_fraud_policy_read_authenticated
on public.network_fraud_policy for select to authenticated
using(true);

drop policy if exists network_risk_admin_read on public.user_network_risk_signals;
create policy network_risk_admin_read
on public.user_network_risk_signals for select to authenticated
using(public.has_dright_permission('users','view_sensitive'));

grant select on public.network_fraud_policy to authenticated;
grant select on public.user_network_risk_signals to authenticated;

create or replace function public.get_my_network_fraud_policy()
returns jsonb
language sql
stable
security definer
set search_path=public
as $function$
  select jsonb_build_object(
    'enabled',enabled,
    'vpn_prohibited',vpn_prohibited,
    'proxy_prohibited',proxy_prohibited,
    'tor_prohibited',tor_prohibited,
    'datacenter_flag_enabled',datacenter_flag_enabled,
    'auto_flag',auto_flag,
    'auto_suspend',auto_suspend,
    'recheck_hours',recheck_hours
  )
  from public.network_fraud_policy
  where singleton=true;
$function$;

revoke all on function public.get_my_network_fraud_policy() from public;
grant execute on function public.get_my_network_fraud_policy() to authenticated;

-- Include the latest network-risk signal in Admin > Users.
create or replace function public.get_admin_users_page(
  p_search text default null,
  p_role_filter text default 'all',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_rows jsonb;
  v_total bigint;
  v_admins bigint;
  v_members bigint;
  v_balance numeric;
  v_page integer:=greatest(coalesce(p_page,1),1);
  v_size integer:=least(greatest(coalesce(p_page_size,25),1),100);
  v_q text:=lower(trim(coalesce(p_search,'')));
begin
  if not public.has_dright_permission('users','view') then
    raise exception 'permission denied';
  end if;

  select count(*),
         count(*) filter(where u.is_admin=true and u.admin_status='active'),
         count(*) filter(where coalesce(u.is_admin,false)=false),
         coalesce(sum(u.balance),0)
  into v_total,v_admins,v_members,v_balance
  from public.users u
  where (
    v_q='' or
    lower(coalesce(u.email,'')) like '%'||v_q||'%' or
    lower(coalesce(u.username,'')) like '%'||v_q||'%' or
    lower(coalesce(u.full_name,'')) like '%'||v_q||'%' or
    lower(coalesce(u.phone,'')) like '%'||v_q||'%'
  )
  and (
    p_role_filter='all' or
    (p_role_filter='admins' and u.is_admin=true) or
    (p_role_filter='promoters' and coalesce(u.is_admin,false)=false)
  );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select
      u.id,u.email,u.username,u.full_name,u.phone,u.is_admin,u.admin_status,u.account_status,u.balance,u.created_at,
      (select kp.status from public.kyc_profiles kp where kp.user_id=u.id and kp.is_deleted=false order by kp.updated_at desc limit 1) as kyc_status,
      (select qs.status from public.questionnaire_submissions qs where qs.user_id=u.id order by qs.created_at desc limit 1) as questionnaire_status,
      (select ue.status from public.user_eligibility ue where ue.user_id=u.id order by ue.calculated_at desc limit 1) as eligibility_status,
      (select count(*) from public.badge_assignments ba where ba.user_id=u.id and ba.is_active=true and ba.is_deleted=false and (ba.expires_at is null or ba.expires_at>now())) as active_badges,
      (select gs.score from public.user_growth_scores gs where gs.user_id=u.id) as growth_score,
      (select gs.growth_level from public.user_growth_scores gs where gs.user_id=u.id) as growth_level,
      coalesce((select nr.risk_detected from public.user_network_risk_signals nr where nr.user_id=u.id order by nr.last_seen_at desc limit 1),false) as network_risk_detected,
      (select nr.risk_reasons from public.user_network_risk_signals nr where nr.user_id=u.id order by nr.last_seen_at desc limit 1) as network_risk_reasons,
      (select nr.provider_status from public.user_network_risk_signals nr where nr.user_id=u.id order by nr.last_seen_at desc limit 1) as network_provider_status,
      (select nr.last_seen_at from public.user_network_risk_signals nr where nr.user_id=u.id order by nr.last_seen_at desc limit 1) as network_last_checked_at
    from public.users u
    where (
      v_q='' or
      lower(coalesce(u.email,'')) like '%'||v_q||'%' or
      lower(coalesce(u.username,'')) like '%'||v_q||'%' or
      lower(coalesce(u.full_name,'')) like '%'||v_q||'%' or
      lower(coalesce(u.phone,'')) like '%'||v_q||'%'
    )
    and (
      p_role_filter='all' or
      (p_role_filter='admins' and u.is_admin=true) or
      (p_role_filter='promoters' and coalesce(u.is_admin,false)=false)
    )
    order by u.created_at desc
    limit v_size offset((v_page-1)*v_size)
  ) x;

  return jsonb_build_object(
    'rows',v_rows,
    'page',v_page,
    'page_size',v_size,
    'total',v_total,
    'summary',jsonb_build_object('admins',v_admins,'members',v_members,'total_balance',v_balance)
  );
end;
$function$;

-- Cookie is a first-class legal page type.
alter table public.legal_pages drop constraint if exists legal_pages_page_type_check;
alter table public.legal_pages
  add constraint legal_pages_page_type_check
  check(page_type=any(array[
    'terms','privacy','refund','vendor_agreement','affiliate_agreement',
    'buyer_rules','seller_rules','community_guidelines','kyc_policy',
    'advertising_policy','cookie'
  ]::text[]));

commit;
