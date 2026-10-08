
-- Consolidate SELECT policies so authenticated reads do not evaluate duplicate permissive policies.
-- Cycle/tier snapshots remain server-managed; clients only read them.

-- sales_challenges
drop policy if exists "sales_challenges_public_read" on public.sales_challenges;
drop policy if exists "sales_challenges_admin_all" on public.sales_challenges;
drop policy if exists "sales_challenges_anon_read" on public.sales_challenges;
drop policy if exists "sales_challenges_auth_read" on public.sales_challenges;
drop policy if exists "sales_challenges_admin_insert" on public.sales_challenges;
drop policy if exists "sales_challenges_admin_update" on public.sales_challenges;
drop policy if exists "sales_challenges_admin_delete" on public.sales_challenges;

create policy "sales_challenges_anon_read" on public.sales_challenges
for select to anon
using (status in ('SCHEDULED','ACTIVE','ENDED'));

create policy "sales_challenges_auth_read" on public.sales_challenges
for select to authenticated
using (status in ('SCHEDULED','ACTIVE','ENDED') or (select private.sales_challenge_admin_allowed()));

create policy "sales_challenges_admin_insert" on public.sales_challenges
for insert to authenticated
with check ((select private.sales_challenge_admin_allowed()));

create policy "sales_challenges_admin_update" on public.sales_challenges
for update to authenticated
using ((select private.sales_challenge_admin_allowed()))
with check ((select private.sales_challenge_admin_allowed()));

create policy "sales_challenges_admin_delete" on public.sales_challenges
for delete to authenticated
using ((select private.sales_challenge_admin_allowed()));

-- reusable tiers: read client-side, mutate only through secure admin RPC.
drop policy if exists "sales_challenge_tiers_public_read" on public.sales_challenge_tiers;
drop policy if exists "sales_challenge_tiers_admin_all" on public.sales_challenge_tiers;
drop policy if exists "sales_challenge_tiers_anon_read" on public.sales_challenge_tiers;
drop policy if exists "sales_challenge_tiers_auth_read" on public.sales_challenge_tiers;

create policy "sales_challenge_tiers_anon_read" on public.sales_challenge_tiers
for select to anon
using (exists(
  select 1 from public.sales_challenges c
  where c.id=sales_challenge_tiers.challenge_id and c.status in ('SCHEDULED','ACTIVE','ENDED')
));

create policy "sales_challenge_tiers_auth_read" on public.sales_challenge_tiers
for select to authenticated
using (
  exists(
    select 1 from public.sales_challenges c
    where c.id=sales_challenge_tiers.challenge_id and c.status in ('SCHEDULED','ACTIVE','ENDED')
  )
  or (select private.sales_challenge_admin_allowed())
);

revoke insert,update,delete on table public.sales_challenge_tiers from authenticated;

-- cycles
drop policy if exists "sales_challenge_cycles_public_read" on public.sales_challenge_cycles;
drop policy if exists "sales_challenge_cycles_admin_all" on public.sales_challenge_cycles;
drop policy if exists "sales_challenge_cycles_anon_read" on public.sales_challenge_cycles;
drop policy if exists "sales_challenge_cycles_auth_read" on public.sales_challenge_cycles;

create policy "sales_challenge_cycles_anon_read" on public.sales_challenge_cycles
for select to anon
using (status in ('SCHEDULED','ACTIVE','ENDED'));

create policy "sales_challenge_cycles_auth_read" on public.sales_challenge_cycles
for select to authenticated
using (status in ('SCHEDULED','ACTIVE','ENDED') or (select private.sales_challenge_admin_allowed()));

revoke insert,update,delete on table public.sales_challenge_cycles from authenticated;

-- cycle tier snapshots
drop policy if exists "sales_challenge_cycle_tiers_public_read" on public.sales_challenge_cycle_tiers;
drop policy if exists "sales_challenge_cycle_tiers_admin_all" on public.sales_challenge_cycle_tiers;
drop policy if exists "sales_challenge_cycle_tiers_anon_read" on public.sales_challenge_cycle_tiers;
drop policy if exists "sales_challenge_cycle_tiers_auth_read" on public.sales_challenge_cycle_tiers;

create policy "sales_challenge_cycle_tiers_anon_read" on public.sales_challenge_cycle_tiers
for select to anon
using (exists(
  select 1 from public.sales_challenge_cycles c
  where c.id=sales_challenge_cycle_tiers.challenge_cycle_id and c.status in ('SCHEDULED','ACTIVE','ENDED')
));

create policy "sales_challenge_cycle_tiers_auth_read" on public.sales_challenge_cycle_tiers
for select to authenticated
using (
  exists(
    select 1 from public.sales_challenge_cycles c
    where c.id=sales_challenge_cycle_tiers.challenge_cycle_id and c.status in ('SCHEDULED','ACTIVE','ENDED')
  )
  or (select private.sales_challenge_admin_allowed())
);

revoke insert,update,delete on table public.sales_challenge_cycle_tiers from authenticated;

-- cycle product snapshots
drop policy if exists "sales_challenge_cycle_products_public_read" on public.sales_challenge_cycle_products;
drop policy if exists "sales_challenge_cycle_products_admin_all" on public.sales_challenge_cycle_products;
drop policy if exists "sales_challenge_cycle_products_anon_read" on public.sales_challenge_cycle_products;
drop policy if exists "sales_challenge_cycle_products_auth_read" on public.sales_challenge_cycle_products;

create policy "sales_challenge_cycle_products_anon_read" on public.sales_challenge_cycle_products
for select to anon
using (exists(
  select 1 from public.sales_challenge_cycles c
  where c.id=sales_challenge_cycle_products.challenge_cycle_id and c.status in ('SCHEDULED','ACTIVE','ENDED')
));

create policy "sales_challenge_cycle_products_auth_read" on public.sales_challenge_cycle_products
for select to authenticated
using (
  exists(
    select 1 from public.sales_challenge_cycles c
    where c.id=sales_challenge_cycle_products.challenge_cycle_id and c.status in ('SCHEDULED','ACTIVE','ENDED')
  )
  or (select private.sales_challenge_admin_allowed())
);

revoke insert,update,delete on table public.sales_challenge_cycle_products from authenticated;

-- leaderboard
drop policy if exists "sales_challenge_leaderboard_public_read" on public.sales_challenge_leaderboard_rows;
drop policy if exists "sales_challenge_leaderboard_admin_read" on public.sales_challenge_leaderboard_rows;
drop policy if exists "sales_challenge_leaderboard_anon_read" on public.sales_challenge_leaderboard_rows;
drop policy if exists "sales_challenge_leaderboard_auth_read" on public.sales_challenge_leaderboard_rows;

create policy "sales_challenge_leaderboard_anon_read" on public.sales_challenge_leaderboard_rows
for select to anon
using (exists(
  select 1
  from public.sales_challenge_cycles cyc
  join public.sales_challenges ch on ch.id=cyc.challenge_id
  where cyc.id=sales_challenge_leaderboard_rows.challenge_cycle_id
    and cyc.status in ('SCHEDULED','ACTIVE','ENDED')
    and ch.leaderboard_enabled=true
));

create policy "sales_challenge_leaderboard_auth_read" on public.sales_challenge_leaderboard_rows
for select to authenticated
using (
  exists(
    select 1
    from public.sales_challenge_cycles cyc
    join public.sales_challenges ch on ch.id=cyc.challenge_id
    where cyc.id=sales_challenge_leaderboard_rows.challenge_cycle_id
      and cyc.status in ('SCHEDULED','ACTIVE','ENDED')
      and ch.leaderboard_enabled=true
  )
  or (select private.sales_challenge_admin_allowed())
);
