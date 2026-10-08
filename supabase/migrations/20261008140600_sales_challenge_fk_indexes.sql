
-- Cover challenge-engine foreign keys used by history, review, cleanup and admin queries.
create index if not exists idx_sales_challenges_created_by
  on public.sales_challenges(created_by);

create index if not exists idx_sales_challenge_products_product
  on public.sales_challenge_products(product_id);
create index if not exists idx_sales_challenge_products_added_by
  on public.sales_challenge_products(added_by);

create index if not exists idx_sales_challenge_cycles_started_by
  on public.sales_challenge_cycles(started_by);

create index if not exists idx_sales_challenge_cycle_tiers_source_tier
  on public.sales_challenge_cycle_tiers(source_tier_id);

create index if not exists idx_sales_challenge_cycle_products_product
  on public.sales_challenge_cycle_products(product_id);

create index if not exists idx_sales_challenge_participants_user
  on public.sales_challenge_participants(user_id);
create index if not exists idx_sales_challenge_participants_current_tier
  on public.sales_challenge_participants(current_cycle_tier_id);

create index if not exists idx_sales_challenge_ledger_affiliate
  on public.sales_challenge_sales_ledger(affiliate_id);
create index if not exists idx_sales_challenge_ledger_product
  on public.sales_challenge_sales_ledger(product_id);
create index if not exists idx_sales_challenge_ledger_applied_tier
  on public.sales_challenge_sales_ledger(applied_cycle_tier_id);
create index if not exists idx_sales_challenge_ledger_refund
  on public.sales_challenge_sales_ledger(refund_id);

create index if not exists idx_sales_challenge_claims_cycle_tier
  on public.sales_challenge_claims(cycle_tier_id);
create index if not exists idx_sales_challenge_claims_source_tier
  on public.sales_challenge_claims(source_tier_id);
create index if not exists idx_sales_challenge_claims_reviewed_by
  on public.sales_challenge_claims(reviewed_by);

create index if not exists idx_sales_challenge_audit_cycle
  on public.sales_challenge_audit_logs(challenge_cycle_id);
create index if not exists idx_sales_challenge_audit_actor
  on public.sales_challenge_audit_logs(actor_id);

create index if not exists idx_sales_challenge_leaderboard_user
  on public.sales_challenge_leaderboard_rows(user_id);
