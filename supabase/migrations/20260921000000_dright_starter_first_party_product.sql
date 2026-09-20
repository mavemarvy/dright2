begin;

create table if not exists public.dright_official_store_settings (
  singleton boolean primary key default true check (singleton),
  name text not null default 'DRIGHT',
  slug text not null default 'dright',
  tagline text not null default 'Build. Sell. Earn. Grow with DRIGHT.',
  description text not null default 'The official DRIGHT store for platform access, first-party tools, and verified DRIGHT products.',
  public_visible boolean not null default true,
  is_active boolean not null default true,
  logo_url text,
  banner_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.dright_official_store_settings(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.dright_starter_product_settings (
  singleton boolean primary key default true check (singleton),
  title text not null default 'DRIGHT Starter Access',
  subtitle text not null default 'Start your DRIGHT journey and learn how to earn with the platform.',
  description text not null default 'Get official DRIGHT Starter Access as a new user. Complete your purchase, create your DRIGHT account, and receive the included professional-access trial. Affiliates can share this official DRIGHT product and earn commission on verified new-user purchases.',
  category text not null default 'Sign Up',
  price numeric(14,2) not null default 5000 check (price >= 0),
  currency text not null default 'NGN',
  affiliate_commission_percent numeric(5,2) not null default 50 check (affiliate_commission_percent between 0 and 100),
  included_trial_days integer not null default 90 check (included_trial_days between 0 and 730),
  is_enabled boolean not null default true,
  public_visible boolean not null default true,
  guest_only boolean not null default true,
  official_badge_enabled boolean not null default true,
  official_rating_enabled boolean not null default true,
  official_rating numeric(3,2) not null default 5.00 check (official_rating between 0 and 5),
  benefits jsonb not null default '["Official DRIGHT onboarding product","Professional-role platform trial after verified purchase and account claim","Affiliate-shareable with tracked commission","Buyer access remains free after the professional trial"]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.dright_starter_product_settings(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.dright_starter_purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_email text not null,
  buyer_name text not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'NGN',
  affiliate_commission_percent numeric(5,2) not null default 0 check (affiliate_commission_percent between 0 and 100),
  affiliate_commission_amount numeric(14,2) not null default 0 check (affiliate_commission_amount >= 0),
  platform_revenue_amount numeric(14,2) not null default 0 check (platform_revenue_amount >= 0),
  included_trial_days integer not null default 0 check (included_trial_days between 0 and 730),
  referrer_id uuid references public.users(id) on delete set null,
  referral_link_id uuid references public.referral_links(id) on delete set null,
  tracking_code text,
  source_type text,
  source_level text,
  visitor_id text,
  session_id text,
  payment_reference text not null unique,
  payment_status text not null default 'initialized'
    check (payment_status in ('initialized','pending','success','failed','refunded')),
  status text not null default 'pending_payment'
    check (status in ('pending_payment','completed','claimed','payment_failed','refunded')),
  gateway_response text,
  payment_channel text,
  paid_at timestamptz,
  processed_at timestamptz,
  buyer_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  trial_starts_at timestamptz,
  trial_ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dright_starter_success_email_unique
  on public.dright_starter_purchases(lower(buyer_email))
  where payment_status='success';

create index if not exists dright_starter_referrer_idx
  on public.dright_starter_purchases(referrer_id,created_at desc);

create table if not exists public.platform_access_trial_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type,source_id)
);

create index if not exists platform_access_trial_grants_user_idx
  on public.platform_access_trial_grants(user_id,ends_at desc)
  where status='active';

alter table public.sales_records
  add column if not exists starter_purchase_id uuid references public.dright_starter_purchases(id) on delete set null;

create unique index if not exists sales_records_starter_purchase_unique
  on public.sales_records(starter_purchase_id)
  where starter_purchase_id is not null;

alter table public.dright_official_store_settings enable row level security;
alter table public.dright_starter_product_settings enable row level security;
alter table public.dright_starter_purchases enable row level security;
alter table public.platform_access_trial_grants enable row level security;

revoke all on public.dright_official_store_settings from anon,authenticated;
revoke all on public.dright_starter_product_settings from anon,authenticated;
revoke all on public.dright_starter_purchases from anon,authenticated;
revoke all on public.platform_access_trial_grants from anon,authenticated;

create policy platform_access_trial_grants_own_read
on public.platform_access_trial_grants for select
to authenticated
using (user_id=auth.uid());

create or replace function public.get_public_dright_starter_product()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_store public.dright_official_store_settings%rowtype;
  v_product public.dright_starter_product_settings%rowtype;
begin
  select * into v_store from public.dright_official_store_settings where singleton=true;
  select * into v_product from public.dright_starter_product_settings where singleton=true;

  if not coalesce(v_store.is_active,false)
     or not coalesce(v_store.public_visible,false)
     or not coalesce(v_product.is_enabled,false)
     or not coalesce(v_product.public_visible,false) then
    return jsonb_build_object('available',false);
  end if;

  return jsonb_build_object(
    'available',true,
    'store',jsonb_build_object(
      'name',v_store.name,
      'slug',v_store.slug,
      'tagline',v_store.tagline,
      'description',v_store.description,
      'logo_url',v_store.logo_url,
      'banner_url',v_store.banner_url,
      'official',true
    ),
    'product',jsonb_build_object(
      'title',v_product.title,
      'subtitle',v_product.subtitle,
      'description',v_product.description,
      'category',v_product.category,
      'price',v_product.price,
      'currency',v_product.currency,
      'affiliate_commission_percent',v_product.affiliate_commission_percent,
      'included_trial_days',v_product.included_trial_days,
      'guest_only',v_product.guest_only,
      'official_badge_enabled',v_product.official_badge_enabled,
      'official_rating_enabled',v_product.official_rating_enabled,
      'official_rating',v_product.official_rating,
      'benefits',v_product.benefits
    )
  );
end;
$$;

create or replace function public.admin_get_dright_starter_settings()
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

  return jsonb_build_object(
    'store',(select to_jsonb(s) from public.dright_official_store_settings s where singleton=true),
    'product',(select to_jsonb(p) from public.dright_starter_product_settings p where singleton=true)
  );
end;
$$;

create or replace function public.admin_update_dright_starter_settings(
  p_store jsonb default '{}'::jsonb,
  p_product jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_price numeric;
  v_commission numeric;
  v_trial integer;
  v_rating numeric;
  v_currency text;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select price,affiliate_commission_percent,included_trial_days,official_rating,currency
    into v_price,v_commission,v_trial,v_rating,v_currency
  from public.dright_starter_product_settings where singleton=true;

  v_price:=coalesce((p_product->>'price')::numeric,v_price);
  v_commission:=coalesce((p_product->>'affiliate_commission_percent')::numeric,v_commission);
  v_trial:=coalesce((p_product->>'included_trial_days')::integer,v_trial);
  v_rating:=coalesce((p_product->>'official_rating')::numeric,v_rating);
  v_currency:=upper(coalesce(nullif(trim(p_product->>'currency'),''),v_currency));

  if v_price<0 then raise exception 'Starter product price cannot be negative'; end if;
  if v_commission<0 or v_commission>100 then raise exception 'Affiliate commission must be 0 to 100'; end if;
  if v_trial<0 or v_trial>730 then raise exception 'Included trial days must be 0 to 730'; end if;
  if v_rating<0 or v_rating>5 then raise exception 'Official DRIGHT rating must be 0 to 5'; end if;

  update public.dright_official_store_settings
  set name=coalesce(nullif(trim(p_store->>'name'),''),name),
      tagline=coalesce(nullif(trim(p_store->>'tagline'),''),tagline),
      description=coalesce(nullif(trim(p_store->>'description'),''),description),
      public_visible=coalesce((p_store->>'public_visible')::boolean,public_visible),
      is_active=coalesce((p_store->>'is_active')::boolean,is_active),
      logo_url=case when p_store ? 'logo_url' then nullif(trim(p_store->>'logo_url'),'') else logo_url end,
      banner_url=case when p_store ? 'banner_url' then nullif(trim(p_store->>'banner_url'),'') else banner_url end,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  update public.dright_starter_product_settings
  set title=coalesce(nullif(trim(p_product->>'title'),''),title),
      subtitle=coalesce(nullif(trim(p_product->>'subtitle'),''),subtitle),
      description=coalesce(nullif(trim(p_product->>'description'),''),description),
      category=coalesce(nullif(trim(p_product->>'category'),''),category),
      price=v_price,
      currency=v_currency,
      affiliate_commission_percent=v_commission,
      included_trial_days=v_trial,
      is_enabled=coalesce((p_product->>'is_enabled')::boolean,is_enabled),
      public_visible=coalesce((p_product->>'public_visible')::boolean,public_visible),
      guest_only=true,
      official_badge_enabled=coalesce((p_product->>'official_badge_enabled')::boolean,official_badge_enabled),
      official_rating_enabled=coalesce((p_product->>'official_rating_enabled')::boolean,official_rating_enabled),
      official_rating=v_rating,
      benefits=case
        when p_product ? 'benefits' and jsonb_typeof(p_product->'benefits')='array'
          then p_product->'benefits'
        else benefits
      end,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  return public.admin_get_dright_starter_settings();
end;
$$;

create or replace function public.dright_starter_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from auth.users
    where lower(email)=lower(trim(p_email))
  );
$$;

create or replace function public.process_verified_dright_starter_purchase(
  p_reference text,
  p_amount numeric,
  p_currency text,
  p_gateway_response text default null,
  p_paid_at timestamptz default now(),
  p_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_purchase public.dright_starter_purchases%rowtype;
  v_affiliate_ok boolean:=false;
  v_commission numeric:=0;
  v_platform_revenue numeric:=0;
  v_affiliate_wallet uuid;
  v_wallet_result jsonb;
  v_account public.platform_accounts%rowtype;
  v_before numeric;
  v_after numeric;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Starter purchase finalization requires service_role';
  end if;

  select * into v_purchase
  from public.dright_starter_purchases
  where payment_reference=p_reference
  for update;

  if not found then raise exception 'Starter purchase not found'; end if;

  if v_purchase.processed_at is not null and v_purchase.payment_status='success' then
    return jsonb_build_object(
      'success',true,'idempotent',true,
      'purchase_id',v_purchase.id,
      'affiliate_commission',v_purchase.affiliate_commission_amount,
      'platform_revenue',v_purchase.platform_revenue_amount
    );
  end if;

  if upper(coalesce(p_currency,''))<>upper(v_purchase.currency) then
    raise exception 'Starter purchase currency mismatch';
  end if;

  if abs(coalesce(p_amount,0)-coalesce(v_purchase.amount,0))>0.01 then
    raise exception 'Starter purchase amount mismatch';
  end if;

  if v_purchase.referrer_id is not null then
    v_affiliate_ok:=exists(
      select 1 from public.users u
      where u.id=v_purchase.referrer_id
        and upper(coalesce(u.account_status,''))='ACTIVE'
    );

    if v_affiliate_ok and v_purchase.referral_link_id is not null then
      v_affiliate_ok:=exists(
        select 1 from public.referral_links rl
        where rl.id=v_purchase.referral_link_id
          and rl.user_id=v_purchase.referrer_id
          and lower(coalesce(rl.source_type,'affiliate'))='affiliate'
      );
    end if;
  end if;

  v_commission:=case
    when v_affiliate_ok then greatest(0,v_purchase.amount * v_purchase.affiliate_commission_percent / 100)
    else 0
  end;
  v_platform_revenue:=greatest(0,v_purchase.amount-v_commission);

  if v_commission>0 then
    select id into v_affiliate_wallet
    from public.cc_wallets
    where user_id=v_purchase.referrer_id
    for update;

    if v_affiliate_wallet is null then
      insert into public.cc_wallets(user_id)
      values(v_purchase.referrer_id)
      on conflict(user_id) do nothing
      returning id into v_affiliate_wallet;

      if v_affiliate_wallet is null then
        select id into v_affiliate_wallet
        from public.cc_wallets
        where user_id=v_purchase.referrer_id
        for update;
      end if;
    end if;

    select public.process_wallet_transaction(
      v_purchase.referrer_id,
      v_affiliate_wallet,
      'credit',
      v_commission,
      'Affiliate commission from DRIGHT Starter Access',
      'dright_starter_purchase',
      v_purchase.id,
      jsonb_build_object(
        'payment_reference',p_reference,
        'tracking_code',v_purchase.tracking_code,
        'referral_link_id',v_purchase.referral_link_id,
        'first_party_product',true
      ),
      'affiliate_balance'
    ) into v_wallet_result;

    if not coalesce((v_wallet_result->>'success')::boolean,false) then
      raise exception 'Unable to credit Starter affiliate commission';
    end if;

    update public.users
    set balance=coalesce(balance,0)+v_commission,
        available_balance=coalesce(available_balance,0)+v_commission,
        affiliate_earnings=coalesce(affiliate_earnings,0)+v_commission
    where id=v_purchase.referrer_id;

    insert into public.sales_records(
      promoter_id,buyer_name,product_name,commission_amount,status,sale_date,
      referrer_id,referrer_role,product_id,sale_amount,starter_purchase_id
    ) values(
      v_purchase.referrer_id,
      coalesce(nullif(v_purchase.buyer_name,''),'New DRIGHT user'),
      'DRIGHT Starter Access',
      v_commission,
      'paid',
      current_date,
      v_purchase.referrer_id,
      'affiliate',
      null,
      v_purchase.amount,
      v_purchase.id
    )
    on conflict(starter_purchase_id) where starter_purchase_id is not null do nothing;

    if v_purchase.referral_link_id is not null then
      update public.referral_links
      set total_conversions=coalesce(total_conversions,0)+1
      where id=v_purchase.referral_link_id;
    end if;
  end if;

  select * into v_account
  from public.platform_accounts
  where account_type='operating'
  for update;

  if not found then
    raise exception 'DRIGHT operating platform account is not configured';
  end if;

  if upper(v_account.currency)<>upper(v_purchase.currency) then
    raise exception 'DRIGHT operating account currency mismatch';
  end if;

  v_before:=coalesce(v_account.balance,0);
  v_after:=v_before+v_platform_revenue;

  update public.platform_accounts
  set balance=v_after,updated_at=now()
  where id=v_account.id;

  insert into public.platform_ledger_entries(
    entry_id,transaction_id,debit_account,credit_account,amount,currency,exchange_rate,
    debit_balance_before,debit_balance_after,credit_balance_before,credit_balance_after,
    reference_type,reference_id,description,created_by,metadata
  ) values(
    'DRIGHT-STARTER-'||v_purchase.id::text,
    null,
    'paystack_clearing',
    'operating',
    v_platform_revenue,
    v_purchase.currency,
    1,
    null,
    null,
    v_before,
    v_after,
    'dright_starter_purchase',
    v_purchase.id,
    'Net platform revenue from DRIGHT Starter Access',
    null,
    jsonb_build_object(
      'payment_reference',p_reference,
      'gross_amount',v_purchase.amount,
      'affiliate_commission',v_commission,
      'no_marketplace_platform_fee',true
    )
  ) on conflict(entry_id) do nothing;

  update public.dright_starter_purchases
  set payment_status='success',
      status=case when claimed_at is not null then 'claimed' else 'completed' end,
      gateway_response=p_gateway_response,
      payment_channel=p_channel,
      paid_at=coalesce(p_paid_at,now()),
      processed_at=now(),
      affiliate_commission_amount=v_commission,
      platform_revenue_amount=v_platform_revenue,
      updated_at=now()
  where id=v_purchase.id;

  return jsonb_build_object(
    'success',true,
    'idempotent',false,
    'purchase_id',v_purchase.id,
    'affiliate_commission',v_commission,
    'platform_revenue',v_platform_revenue,
    'trial_days',v_purchase.included_trial_days
  );
end;
$$;

create or replace function public.claim_dright_starter_purchase(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text;
  v_purchase public.dright_starter_purchases%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select lower(email) into v_email
  from auth.users where id=v_uid;

  if v_email is null then raise exception 'Account email is unavailable'; end if;

  select * into v_purchase
  from public.dright_starter_purchases
  where payment_reference=p_reference
  for update;

  if not found then raise exception 'Starter purchase not found'; end if;
  if v_purchase.payment_status<>'success' or v_purchase.processed_at is null then
    raise exception 'Starter purchase payment is not verified';
  end if;
  if lower(v_purchase.buyer_email)<>v_email then
    raise exception 'Sign in with the email used for the Starter purchase';
  end if;
  if v_purchase.buyer_user_id is not null and v_purchase.buyer_user_id<>v_uid then
    raise exception 'Starter purchase is already claimed by another account';
  end if;

  if v_purchase.claimed_at is not null and v_purchase.buyer_user_id=v_uid then
    return jsonb_build_object(
      'success',true,'idempotent',true,
      'purchase_id',v_purchase.id,
      'trial_ends_at',v_purchase.trial_ends_at
    );
  end if;

  v_start:=now();
  v_end:=case
    when v_purchase.included_trial_days>0
      then v_start+make_interval(days=>v_purchase.included_trial_days)
    else v_start
  end;

  update public.dright_starter_purchases
  set buyer_user_id=v_uid,
      claimed_at=now(),
      status='claimed',
      trial_starts_at=v_start,
      trial_ends_at=v_end,
      updated_at=now()
  where id=v_purchase.id;

  if v_purchase.included_trial_days>0 then
    insert into public.platform_access_trial_grants(
      user_id,source_type,source_id,starts_at,ends_at,status,metadata
    ) values(
      v_uid,
      'dright_starter_purchase',
      v_purchase.id,
      v_start,
      v_end,
      'active',
      jsonb_build_object(
        'payment_reference',v_purchase.payment_reference,
        'paid_amount',v_purchase.amount,
        'currency',v_purchase.currency
      )
    )
    on conflict(source_type,source_id) do update
      set user_id=excluded.user_id,
          starts_at=excluded.starts_at,
          ends_at=excluded.ends_at,
          status='active',
          metadata=excluded.metadata,
          updated_at=now();
  end if;

  return jsonb_build_object(
    'success',true,'idempotent',false,
    'purchase_id',v_purchase.id,
    'trial_days',v_purchase.included_trial_days,
    'trial_starts_at',v_start,
    'trial_ends_at',v_end
  );
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
  v_uid uuid:=auth.uid();
  v_settings public.platform_access_settings%rowtype;
  v_roles text[];
  v_created timestamptz;
  v_global_trial_end timestamptz;
  v_grant_trial_end timestamptz;
  v_trial_end timestamptz;
  v_trial_active boolean:=false;
  v_subscription_active boolean:=false;
  v_plan_id uuid;
  v_requires_subscription boolean:=false;
  v_admin boolean:=false;
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
    v_global_trial_end:=greatest(coalesce(v_created,now()),coalesce(v_settings.policy_started_at,now()))
      + make_interval(days=>v_settings.trial_days);
  end if;

  select max(g.ends_at) into v_grant_trial_end
  from public.platform_access_trial_grants g
  where g.user_id=v_uid
    and g.status='active'
    and g.starts_at<=now()
    and g.ends_at>now();

  v_trial_end:=case
    when v_global_trial_end is null then v_grant_trial_end
    when v_grant_trial_end is null then v_global_trial_end
    else greatest(v_global_trial_end,v_grant_trial_end)
  end;
  v_trial_active:=v_trial_end is not null and now()<v_trial_end;

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
    'currency',coalesce(v_settings.currency,'NGN'),
    'trial_enabled',coalesce(v_settings.trial_enabled,true),
    'trial_days',coalesce(v_settings.trial_days,90),
    'trial_end',v_trial_end,
    'trial_active',v_trial_active,
    'subscription_active',v_subscription_active,
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

create or replace function public.can_use_platform_feature(p_feature_key text)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_settings public.platform_access_settings%rowtype;
  v_feature public.platform_access_feature_rules%rowtype;
  v_paid_feature boolean:=false;
  v_global_trial_end timestamptz;
  v_grant_trial_end timestamptz;
  v_created timestamptz;
  v_admin boolean:=false;
  v_subscribed boolean:=false;
begin
  if v_uid is null then return false; end if;

  select is_admin,created_at into v_admin,v_created
  from public.users where id=v_uid;

  if coalesce(v_admin,false) then return true; end if;

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
    where rr.requires_subscription=true and rr.locked_free=false
  ) into v_paid_feature;

  if not v_paid_feature then return true; end if;

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
$$;

revoke all on function public.get_public_dright_starter_product() from public;
revoke all on function public.admin_get_dright_starter_settings() from public;
revoke all on function public.admin_update_dright_starter_settings(jsonb,jsonb) from public;
revoke all on function public.dright_starter_email_exists(text) from public;
revoke all on function public.process_verified_dright_starter_purchase(text,numeric,text,text,timestamptz,text) from public;
revoke all on function public.claim_dright_starter_purchase(text) from public;

grant execute on function public.get_public_dright_starter_product() to anon,authenticated;
grant execute on function public.admin_get_dright_starter_settings() to authenticated;
grant execute on function public.admin_update_dright_starter_settings(jsonb,jsonb) to authenticated;
grant execute on function public.claim_dright_starter_purchase(text) to authenticated;
grant execute on function public.dright_starter_email_exists(text) to service_role;
grant execute on function public.process_verified_dright_starter_purchase(text,numeric,text,text,timestamptz,text) to service_role;

commit;