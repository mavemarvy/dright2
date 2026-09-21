begin;

-- Separate standard signup access from the paid Starter-product access.
update public.platform_access_settings
set trial_days = 30,
    updated_at = now()
where singleton = true;

-- Starter product becomes USD-first for global presentation.
update public.dright_starter_product_settings
set price = 3.76,
    currency = 'USD',
    description = 'Purchase official DRIGHT Starter Access and receive {{trial_days}} days of professional platform access after your payment is verified and your account is claimed. During that access period, eligible professional tools that Admin has enabled for the platform subscription can be used without the monthly platform-access payment. Affiliates can share this official product and earn the configured commission on verified new-user purchases. Buyer marketplace access remains free.',
    benefits = jsonb_build_array(
      '{{trial_days}} days of professional-role platform access after verified purchase and account claim',
      'Access to eligible affiliate, freelancer, employer, task-creator and task-completer tools during the Starter access period',
      'Official affiliate test product with tracked commission and sales progress',
      'Subscription-gated professional features stay available during the active Starter access period where Admin has enabled them',
      'Buyer marketplace access remains free after the professional access period'
    ),
    updated_at = now()
where singleton = true;

update public.dright_starter_purchases
set currency = upper(currency)
where currency is not null;

alter table public.dright_starter_purchases
  alter column currency set default 'USD';

-- Keep the first-party marketplace representation aligned with Starter settings.
update public.products p
set price = 3.76,
    affiliate_commission_percent = 50,
    specifications = coalesce(p.specifications,'{}'::jsonb)
      || jsonb_build_object(
        'system_product_kind','dright_starter_access',
        'first_party',true,
        'official_store',true,
        'guest_only',true,
        'special_route','/dright/starter',
        'included_trial_days',90,
        'platform_fee_percent',0,
        'price_currency','USD',
        'official_badge_enabled',true,
        'official_rating_enabled',true,
        'official_rating',5
      )
where p.id = (
  select marketplace_product_id
  from public.dright_starter_product_settings
  where singleton=true
);

create table if not exists public.dright_starter_affiliate_challenge_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  target_sales integer not null default 20 check (target_sales between 1 and 100000),
  unlock_label text not null default 'Level 1 Pro Affiliate',
  description_template text not null default 'Complete {{target_sales}} verified DRIGHT Starter Access sales to unlock more affiliate products.',
  restrict_marketplace_until_complete boolean not null default true,
  allow_own_listings_while_restricted boolean not null default true,
  seller_profile_exempt boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.dright_starter_affiliate_challenge_settings(singleton)
values(true)
on conflict(singleton) do nothing;

alter table public.dright_starter_affiliate_challenge_settings enable row level security;
revoke all on public.dright_starter_affiliate_challenge_settings from anon,authenticated;

create or replace function public.get_public_dright_starter_affiliate_challenge()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'enabled',s.enabled,
    'target_sales',s.target_sales,
    'unlock_label',s.unlock_label,
    'description_template',s.description_template,
    'restrict_marketplace_until_complete',s.restrict_marketplace_until_complete,
    'allow_own_listings_while_restricted',s.allow_own_listings_while_restricted,
    'seller_profile_exempt',s.seller_profile_exempt
  )
  from public.dright_starter_affiliate_challenge_settings s
  where s.singleton=true;
$$;

revoke all on function public.get_public_dright_starter_affiliate_challenge() from public;
grant execute on function public.get_public_dright_starter_affiliate_challenge() to anon,authenticated,service_role;

create or replace function public.get_my_dright_starter_affiliate_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.dright_starter_affiliate_challenge_settings%rowtype;
  v_profiles text[] := '{}'::text[];
  v_has_affiliate boolean := false;
  v_has_seller boolean := false;
  v_sales integer := 0;
  v_applies boolean := false;
  v_completed boolean := false;
begin
  select * into v_settings
  from public.dright_starter_affiliate_challenge_settings
  where singleton=true;

  if v_uid is null then
    return jsonb_build_object(
      'authenticated',false,
      'enabled',coalesce(v_settings.enabled,false),
      'applies',false,
      'sales',0,
      'target_sales',coalesce(v_settings.target_sales,20),
      'completed',false,
      'marketplace_limited',false
    );
  end if;

  select coalesce(intended_profiles,'{}'::text[])
  into v_profiles
  from public.user_private_profiles
  where user_id=v_uid;

  select exists (
    select 1
    from unnest(coalesce(v_profiles,'{}'::text[])) p
    where regexp_replace(lower(trim(p)),'[^a-z0-9]+','_','g')
      in ('affiliate','affiliate_marketer','affiliate_marketing','marketer')
  ) into v_has_affiliate;

  select exists (
    select 1
    from unnest(coalesce(v_profiles,'{}'::text[])) p
    where regexp_replace(lower(trim(p)),'[^a-z0-9]+','_','g')
      in ('seller','vendor','product_seller','digital_seller')
  ) into v_has_seller;

  select count(*)::integer
  into v_sales
  from public.dright_starter_purchases p
  where p.referrer_id=v_uid
    and p.payment_status='success'
    and p.processed_at is not null;

  v_applies := coalesce(v_settings.enabled,false)
    and v_has_affiliate
    and not (coalesce(v_settings.seller_profile_exempt,true) and v_has_seller);

  v_completed := v_sales >= coalesce(v_settings.target_sales,20);

  return jsonb_build_object(
    'authenticated',true,
    'enabled',coalesce(v_settings.enabled,false),
    'applies',v_applies,
    'sales',v_sales,
    'target_sales',coalesce(v_settings.target_sales,20),
    'remaining_sales',greatest(coalesce(v_settings.target_sales,20)-v_sales,0),
    'completed',v_completed,
    'unlock_label',v_settings.unlock_label,
    'description_template',v_settings.description_template,
    'restrict_marketplace_until_complete',coalesce(v_settings.restrict_marketplace_until_complete,false),
    'allow_own_listings_while_restricted',coalesce(v_settings.allow_own_listings_while_restricted,true),
    'marketplace_limited',v_applies
      and coalesce(v_settings.restrict_marketplace_until_complete,false)
      and not v_completed,
    'selected_profiles',coalesce(v_profiles,'{}'::text[]),
    'seller_exempt',v_has_seller and coalesce(v_settings.seller_profile_exempt,true)
  );
end;
$$;

revoke all on function public.get_my_dright_starter_affiliate_progress() from public,anon;
grant execute on function public.get_my_dright_starter_affiliate_progress() to authenticated,service_role;

create or replace function public.admin_get_dright_starter_affiliate_challenge()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;
  return (
    select to_jsonb(s)
    from public.dright_starter_affiliate_challenge_settings s
    where singleton=true
  );
end;
$$;

revoke all on function public.admin_get_dright_starter_affiliate_challenge() from public,anon;
grant execute on function public.admin_get_dright_starter_affiliate_challenge() to authenticated,service_role;

create or replace function public.admin_update_dright_starter_affiliate_challenge(
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_target integer;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select target_sales into v_target
  from public.dright_starter_affiliate_challenge_settings
  where singleton=true;

  v_target := coalesce((p_settings->>'target_sales')::integer,v_target);
  if v_target < 1 or v_target > 100000 then
    raise exception 'Starter affiliate target sales must be between 1 and 100000';
  end if;

  update public.dright_starter_affiliate_challenge_settings
  set enabled=coalesce((p_settings->>'enabled')::boolean,enabled),
      target_sales=v_target,
      unlock_label=coalesce(nullif(trim(p_settings->>'unlock_label'),''),unlock_label),
      description_template=coalesce(nullif(trim(p_settings->>'description_template'),''),description_template),
      restrict_marketplace_until_complete=coalesce((p_settings->>'restrict_marketplace_until_complete')::boolean,restrict_marketplace_until_complete),
      allow_own_listings_while_restricted=coalesce((p_settings->>'allow_own_listings_while_restricted')::boolean,allow_own_listings_while_restricted),
      seller_profile_exempt=coalesce((p_settings->>'seller_profile_exempt')::boolean,seller_profile_exempt),
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  return public.admin_get_dright_starter_affiliate_challenge();
end;
$$;

revoke all on function public.admin_update_dright_starter_affiliate_challenge(jsonb) from public,anon;
grant execute on function public.admin_update_dright_starter_affiliate_challenge(jsonb) to authenticated,service_role;

commit;