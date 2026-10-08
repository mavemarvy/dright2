
-- DRIGHT Sales Challenge Engine
-- Additive production-safe schema. Does not change existing products, prices, courses,
-- affiliate percentages, orders, wallets, or the existing generic challenge tables.

create schema if not exists private;

create table if not exists public.sales_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tagline text,
  short_description text,
  long_description text,
  cta_label text not null default 'Start Selling',
  completed_tier_message text not null default 'Mission complete. Claim your reward to unlock the next sales mission.',
  expired_message text not null default 'This challenge has ended. Your unfinished progress has expired. Rewards successfully claimed during the challenge remain recorded in your account.',
  status text not null default 'DRAFT' check (status in ('DRAFT','SCHEDULED','ACTIVE','ENDED','ARCHIVED')),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  minimum_product_price numeric(18,2) not null default 20000 check (minimum_product_price >= 0),
  minimum_retained_margin_pct numeric(7,4) not null default 15 check (minimum_retained_margin_pct between 0 and 100),
  estimated_payment_cost_pct numeric(7,4) not null default 0 check (estimated_payment_cost_pct between 0 and 100),
  estimated_payment_cost_fixed numeric(18,2) not null default 0 check (estimated_payment_cost_fixed >= 0),
  leaderboard_enabled boolean not null default true,
  claims_enabled boolean not null default true,
  is_template boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_challenge_tiers (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.sales_challenges(id) on delete cascade,
  sort_order integer not null check (sort_order > 0),
  sales_required integer not null check (sales_required > 0),
  reward_type text not null default 'CASH' check (reward_type in ('CASH','PRIZE','CASH_OR_PRIZE')),
  cash_reward numeric(18,2) not null default 0 check (cash_reward >= 0),
  prize_name text,
  prize_description text,
  prize_estimated_cost numeric(18,2) not null default 0 check (prize_estimated_cost >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(challenge_id, sort_order)
);

create table if not exists public.sales_challenge_products (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.sales_challenges(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  active boolean not null default true,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  unique(challenge_id, product_id)
);

create table if not exists public.sales_challenge_cycles (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.sales_challenges(id) on delete cascade,
  cycle_number integer not null check (cycle_number > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'SCHEDULED' check (status in ('DRAFT','SCHEDULED','ACTIVE','ENDED','ARCHIVED')),
  started_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  reset_reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique(challenge_id, cycle_number)
);

create unique index if not exists ux_sales_challenge_one_active_cycle
  on public.sales_challenge_cycles(challenge_id)
  where status = 'ACTIVE';

create index if not exists idx_sales_challenge_cycles_window
  on public.sales_challenge_cycles(status, starts_at, ends_at);

create table if not exists public.sales_challenge_cycle_tiers (
  id uuid primary key default gen_random_uuid(),
  challenge_cycle_id uuid not null references public.sales_challenge_cycles(id) on delete cascade,
  source_tier_id uuid references public.sales_challenge_tiers(id) on delete set null,
  sort_order integer not null check (sort_order > 0),
  sales_required integer not null check (sales_required > 0),
  reward_type text not null check (reward_type in ('CASH','PRIZE','CASH_OR_PRIZE')),
  cash_reward numeric(18,2) not null default 0 check (cash_reward >= 0),
  prize_name text,
  prize_description text,
  prize_estimated_cost numeric(18,2) not null default 0 check (prize_estimated_cost >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(challenge_cycle_id, sort_order)
);

create index if not exists idx_sales_challenge_cycle_tiers_lookup
  on public.sales_challenge_cycle_tiers(challenge_cycle_id, enabled, sort_order);

create table if not exists public.sales_challenge_cycle_products (
  id uuid primary key default gen_random_uuid(),
  challenge_cycle_id uuid not null references public.sales_challenge_cycles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name_snapshot text not null,
  price_snapshot numeric(18,2) not null check (price_snapshot >= 0),
  affiliate_pct_snapshot numeric(7,4) not null default 0 check (affiliate_pct_snapshot between 0 and 100),
  meets_minimum_product_price boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(challenge_cycle_id, product_id)
);

create index if not exists idx_sales_challenge_cycle_products_lookup
  on public.sales_challenge_cycle_products(challenge_cycle_id, product_id)
  where active = true;

create table if not exists public.sales_challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_cycle_id uuid not null references public.sales_challenge_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_cycle_tier_id uuid references public.sales_challenge_cycle_tiers(id) on delete set null,
  current_tier_sales integer not null default 0 check (current_tier_sales >= 0),
  lifetime_qualified_sales integer not null default 0 check (lifetime_qualified_sales >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED','EXPIRED')),
  mission_completed_at timestamptz,
  completed_at timestamptz,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(challenge_cycle_id, user_id)
);

create index if not exists idx_sales_challenge_participants_cycle_sales
  on public.sales_challenge_participants(challenge_cycle_id, lifetime_qualified_sales desc, joined_at asc);
