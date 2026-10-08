
create table if not exists public.sales_challenge_sales_ledger (
  id uuid primary key default gen_random_uuid(),
  challenge_cycle_id uuid not null references public.sales_challenge_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  affiliate_id uuid references auth.users(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  guest_order_id uuid references public.guest_orders(id) on delete set null,
  source_kind text not null check (source_kind in ('ORDER','GUEST_ORDER')),
  source_reference text not null,
  product_id uuid not null references public.products(id) on delete restrict,
  qualifying_amount numeric(18,2) not null default 0 check (qualifying_amount >= 0),
  affiliate_commission_amount numeric(18,2) not null default 0 check (affiliate_commission_amount >= 0),
  counted_at timestamptz not null,
  applied_cycle_tier_id uuid references public.sales_challenge_cycle_tiers(id) on delete set null,
  applied_to_mission boolean not null default false,
  qualification_status text not null default 'COUNTED'
    check (qualification_status in ('COUNTED','REVERSED','REVERSED_AFTER_CLAIM','FLAGGED')),
  reversed_at timestamptz,
  refund_id uuid references public.refund_records(id) on delete set null,
  reversal_reason text,
  reversal_metadata jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(challenge_cycle_id, source_kind, source_reference),
  check (
    (source_kind='ORDER' and order_id is not null and guest_order_id is null)
    or
    (source_kind='GUEST_ORDER' and guest_order_id is not null and order_id is null)
  )
);

create index if not exists idx_sales_challenge_ledger_user_cycle
  on public.sales_challenge_sales_ledger(user_id, challenge_cycle_id, counted_at desc);
create index if not exists idx_sales_challenge_ledger_order
  on public.sales_challenge_sales_ledger(order_id) where order_id is not null;
create index if not exists idx_sales_challenge_ledger_guest
  on public.sales_challenge_sales_ledger(guest_order_id) where guest_order_id is not null;

create table if not exists public.sales_challenge_claims (
  id uuid primary key default gen_random_uuid(),
  challenge_cycle_id uuid not null references public.sales_challenge_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  cycle_tier_id uuid not null references public.sales_challenge_cycle_tiers(id) on delete restrict,
  source_tier_id uuid references public.sales_challenge_tiers(id) on delete set null,
  sales_target_snapshot integer not null check (sales_target_snapshot > 0),
  reward_type_snapshot text not null check (reward_type_snapshot in ('CASH','PRIZE','CASH_OR_PRIZE')),
  reward_choice text not null check (reward_choice in ('CASH','PRIZE')),
  cash_amount_snapshot numeric(18,2) not null default 0 check (cash_amount_snapshot >= 0),
  prize_name_snapshot text,
  prize_description_snapshot text,
  prize_estimated_cost_snapshot numeric(18,2) not null default 0 check (prize_estimated_cost_snapshot >= 0),
  status text not null default 'APPROVED' check (status in ('APPROVED','PAID','FULFILLED','REJECTED')),
  payout_status text not null default 'PENDING' check (payout_status in ('PENDING','PAID','FULFILLED','REJECTED','NOT_APPLICABLE')),
  claimed_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  payment_reference text,
  needs_review boolean not null default false,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, challenge_cycle_id, cycle_tier_id)
);

create index if not exists idx_sales_challenge_claims_cycle_status
  on public.sales_challenge_claims(challenge_cycle_id, status, claimed_at desc);

create table if not exists public.sales_challenge_audit_logs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references public.sales_challenges(id) on delete set null,
  challenge_cycle_id uuid references public.sales_challenge_cycles(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_challenge_audit_lookup
  on public.sales_challenge_audit_logs(challenge_id, challenge_cycle_id, created_at desc);

create table if not exists public.sales_challenge_leaderboard_rows (
  challenge_cycle_id uuid not null references public.sales_challenge_cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  lifetime_qualified_sales integer not null default 0 check (lifetime_qualified_sales >= 0),
  joined_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(challenge_cycle_id, user_id)
);

create index if not exists idx_sales_challenge_leaderboard_rank
  on public.sales_challenge_leaderboard_rows(challenge_cycle_id, lifetime_qualified_sales desc, joined_at asc, user_id);

create or replace view public.sales_challenge_leaderboard_view
with (security_invoker = true)
as
select
  r.challenge_cycle_id,
  r.user_id,
  coalesce(nullif(r.display_name,''), 'DRIGHT Affiliate') as display_name,
  r.avatar_url,
  r.lifetime_qualified_sales,
  r.joined_at,
  rank() over (
    partition by r.challenge_cycle_id
    order by r.lifetime_qualified_sales desc, r.joined_at asc, r.user_id asc
  )::integer as rank
from public.sales_challenge_leaderboard_rows r;

create or replace function private.sales_challenge_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sales_challenges_updated_at on public.sales_challenges;
create trigger trg_sales_challenges_updated_at
before update on public.sales_challenges
for each row execute function private.sales_challenge_set_updated_at();

drop trigger if exists trg_sales_challenge_tiers_updated_at on public.sales_challenge_tiers;
create trigger trg_sales_challenge_tiers_updated_at
before update on public.sales_challenge_tiers
for each row execute function private.sales_challenge_set_updated_at();

drop trigger if exists trg_sales_challenge_participants_updated_at on public.sales_challenge_participants;
create trigger trg_sales_challenge_participants_updated_at
before update on public.sales_challenge_participants
for each row execute function private.sales_challenge_set_updated_at();

drop trigger if exists trg_sales_challenge_claims_updated_at on public.sales_challenge_claims;
create trigger trg_sales_challenge_claims_updated_at
before update on public.sales_challenge_claims
for each row execute function private.sales_challenge_set_updated_at();
