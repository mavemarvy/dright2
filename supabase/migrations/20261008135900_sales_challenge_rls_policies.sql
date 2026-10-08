
grant select on table public.sales_challenge_participants to authenticated;
grant select on table public.sales_challenge_sales_ledger to authenticated;
grant select on table public.sales_challenge_claims to authenticated;
grant select on table public.sales_challenge_leaderboard_rows to anon, authenticated;
grant select on table public.sales_challenge_leaderboard_view to anon, authenticated;

-- Admin-managed configuration writes.
grant insert,update,delete on table public.sales_challenges to authenticated;
grant insert,update,delete on table public.sales_challenge_tiers to authenticated;
grant select,insert,update,delete on table public.sales_challenge_products to authenticated;
grant insert,update,delete on table public.sales_challenge_cycles to authenticated;
grant select,insert,update,delete on table public.sales_challenge_cycle_tiers to authenticated;
grant select,insert,update,delete on table public.sales_challenge_cycle_products to authenticated;
grant select on table public.sales_challenge_audit_logs to authenticated;

-- Challenges: public active/scheduled/ended; admins see/manage all.
drop policy if exists "sales_challenges_public_read" on public.sales_challenges;
create policy "sales_challenges_public_read"
on public.sales_challenges for select
to anon,authenticated
using (status in ('SCHEDULED','ACTIVE','ENDED'));

drop policy if exists "sales_challenges_admin_all" on public.sales_challenges;
create policy "sales_challenges_admin_all"
on public.sales_challenges for all
to authenticated
using ((select private.sales_challenge_admin_allowed()))
with check ((select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_tiers_public_read" on public.sales_challenge_tiers;
create policy "sales_challenge_tiers_public_read"
on public.sales_challenge_tiers for select
to anon,authenticated
using (exists(
  select 1 from public.sales_challenges c
  where c.id=sales_challenge_tiers.challenge_id and c.status in ('SCHEDULED','ACTIVE','ENDED')
));

drop policy if exists "sales_challenge_tiers_admin_all" on public.sales_challenge_tiers;
create policy "sales_challenge_tiers_admin_all"
on public.sales_challenge_tiers for all
to authenticated
using ((select private.sales_challenge_admin_allowed()))
with check ((select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_products_admin_all" on public.sales_challenge_products;
create policy "sales_challenge_products_admin_all"
on public.sales_challenge_products for all
to authenticated
using ((select private.sales_challenge_admin_allowed()))
with check ((select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_cycles_public_read" on public.sales_challenge_cycles;
create policy "sales_challenge_cycles_public_read"
on public.sales_challenge_cycles for select
to anon,authenticated
using (status in ('SCHEDULED','ACTIVE','ENDED'));

drop policy if exists "sales_challenge_cycles_admin_all" on public.sales_challenge_cycles;
create policy "sales_challenge_cycles_admin_all"
on public.sales_challenge_cycles for all
to authenticated
using ((select private.sales_challenge_admin_allowed()))
with check ((select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_cycle_tiers_public_read" on public.sales_challenge_cycle_tiers;
create policy "sales_challenge_cycle_tiers_public_read"
on public.sales_challenge_cycle_tiers for select
to anon,authenticated
using (exists(
  select 1 from public.sales_challenge_cycles c
  where c.id=sales_challenge_cycle_tiers.challenge_cycle_id and c.status in ('SCHEDULED','ACTIVE','ENDED')
));

drop policy if exists "sales_challenge_cycle_tiers_admin_all" on public.sales_challenge_cycle_tiers;
create policy "sales_challenge_cycle_tiers_admin_all"
on public.sales_challenge_cycle_tiers for all
to authenticated
using ((select private.sales_challenge_admin_allowed()))
with check ((select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_cycle_products_public_read" on public.sales_challenge_cycle_products;
create policy "sales_challenge_cycle_products_public_read"
on public.sales_challenge_cycle_products for select
to anon,authenticated
using (exists(
  select 1 from public.sales_challenge_cycles c
  where c.id=sales_challenge_cycle_products.challenge_cycle_id and c.status in ('SCHEDULED','ACTIVE','ENDED')
));

drop policy if exists "sales_challenge_cycle_products_admin_all" on public.sales_challenge_cycle_products;
create policy "sales_challenge_cycle_products_admin_all"
on public.sales_challenge_cycle_products for all
to authenticated
using ((select private.sales_challenge_admin_allowed()))
with check ((select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_participants_own_read" on public.sales_challenge_participants;
create policy "sales_challenge_participants_own_read"
on public.sales_challenge_participants for select
to authenticated
using ((select auth.uid())=user_id or (select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_ledger_own_read" on public.sales_challenge_sales_ledger;
create policy "sales_challenge_ledger_own_read"
on public.sales_challenge_sales_ledger for select
to authenticated
using ((select auth.uid())=user_id or (select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_claims_own_read" on public.sales_challenge_claims;
create policy "sales_challenge_claims_own_read"
on public.sales_challenge_claims for select
to authenticated
using ((select auth.uid())=user_id or (select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_audit_admin_read" on public.sales_challenge_audit_logs;
create policy "sales_challenge_audit_admin_read"
on public.sales_challenge_audit_logs for select
to authenticated
using ((select private.sales_challenge_admin_allowed()));

drop policy if exists "sales_challenge_leaderboard_public_read" on public.sales_challenge_leaderboard_rows;
create policy "sales_challenge_leaderboard_public_read"
on public.sales_challenge_leaderboard_rows for select
to anon,authenticated
using (exists(
  select 1
  from public.sales_challenge_cycles cyc
  join public.sales_challenges ch on ch.id=cyc.challenge_id
  where cyc.id=sales_challenge_leaderboard_rows.challenge_cycle_id
    and cyc.status in ('SCHEDULED','ACTIVE','ENDED')
    and ch.leaderboard_enabled=true
));
