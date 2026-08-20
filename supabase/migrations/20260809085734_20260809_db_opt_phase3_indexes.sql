/*
# Database Optimization Phase 3: Indexing

## Purpose
Create missing indexes on foreign key columns and high-traffic query patterns.
No business logic changes — only performance indexes.

## Indexes Added (28 total)

### High-traffic table indexes
1. orders.created_at — date-range queries for dashboard/sales reports
2. orders.composite(buyer_id, created_at DESC) — buyer order history
3. orders.composite(seller_id, created_at DESC) — seller sales history
4. reviews.composite(target_type, target_id, created_at DESC) — product review feed
5. reviews.composite(reviewer_id, target_type, target_id) — prevent duplicate review check
6. escrow_payments.composite(status, auto_release_at) — auto-release scheduler
7. disputes.composite(status, created_at) — admin dispute queue
8. disputes.composite(buyer_id, created_at DESC) — buyer dispute history
9. disputes.composite(seller_id, created_at DESC) — seller dispute history
10. ledger_entries.composite(wallet_id, created_at DESC) — wallet transaction history
11. ledger_entries.composite(user_id, created_at DESC) — user ledger history
12. cc_transactions.composite(user_id, created_at DESC) — user transaction history
13. cc_wallets.composite(user_id, updated_at) — wallet freshness check
14. campaign_events.composite(campaign_id, created_at DESC) — event timeline
15. campaign_statistics.composite(campaign_id, stat_date DESC) — stats by date
16. marketing_campaigns.composite(owner_id, status) — owner campaign list
17. promotion_campaigns.composite(status, end_date) — active promotions scan
18. paystack_transactions.composite(user_id, created_at DESC) — user payment history
19. payment_attempts.composite(user_id, attempt_time DESC) — user payment attempts
20. payment_invoices.composite(user_id, created_at DESC) — user invoice history
21. withdrawal_requests.composite(status, created_at) — admin withdrawal queue
22. payout_records.composite(user_id, created_at DESC) — user payout history
23. user_subscriptions.composite(user_id, status) — active subscription lookup
24. notifications.composite(user_id, is_read, created_at DESC) — unread notification feed
25. transaction_receipts.composite(transaction_id) — receipt lookup by transaction
26. reward_transactions.composite(user_id, created_at DESC) — reward history
27. wallet_fraud_alerts.composite(user_id, resolved_at) — unresolved alerts per user
28. financial_audit_logs.composite(entity_type, entity_id, created_at DESC) — audit trail lookup
*/

-- ============================================================
-- 1. ORDERS — date-range and per-user history indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created ON public.orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller_created ON public.orders(seller_id, created_at DESC);

-- ============================================================
-- 2. REVIEWS — target-based composite indexes (reviews use target_type/target_id)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reviews_target_created ON public.reviews(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_target ON public.reviews(reviewer_id, target_type, target_id);

-- ============================================================
-- 3. ESCROW — auto-release scheduler index
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_escrow_status_auto_release ON public.escrow_payments(status, auto_release_at) WHERE auto_release_at IS NOT NULL;

-- ============================================================
-- 4. DISPUTES — admin queue and per-user history
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_disputes_status_created ON public.disputes(status, created_at);
CREATE INDEX IF NOT EXISTS idx_disputes_buyer_created ON public.disputes(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_seller_created ON public.disputes(seller_id, created_at DESC);

-- ============================================================
-- 5. LEDGER ENTRIES — wallet and user history
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created ON public.ledger_entries(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON public.ledger_entries(user_id, created_at DESC);

-- ============================================================
-- 6. CC TRANSACTIONS — user transaction history
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cc_tx_user_created ON public.cc_transactions(user_id, created_at DESC);

-- ============================================================
-- 7. CC WALLETS — freshness check
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cc_wallets_user_updated ON public.cc_wallets(user_id, updated_at);

-- ============================================================
-- 8. CAMPAIGN EVENTS — event timeline
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign_created ON public.campaign_events(campaign_id, created_at DESC);

-- ============================================================
-- 9. CAMPAIGN STATISTICS — stats by date
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_campaign_stats_campaign_date ON public.campaign_statistics(campaign_id, stat_date DESC);

-- ============================================================
-- 10. MARKETING CAMPAIGNS — owner campaign list
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_owner_status ON public.marketing_campaigns(owner_id, status);

-- ============================================================
-- 11. PROMOTION CAMPAIGNS — active promotions scan
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_promotion_campaigns_status_end ON public.promotion_campaigns(status, end_date) WHERE status = 'active';

-- ============================================================
-- 12. PAYSTACK TRANSACTIONS — user payment history
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_paystack_tx_user_created ON public.paystack_transactions(user_id, created_at DESC);

-- ============================================================
-- 13. PAYMENT ATTEMPTS — user payment attempt history
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_payment_attempts_user_attempt ON public.payment_attempts(user_id, attempt_time DESC);

-- ============================================================
-- 14. PAYMENT INVOICES — user invoice history
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invoices_user_created ON public.payment_invoices(user_id, created_at DESC);

-- ============================================================
-- 15. WITHDRAWAL REQUESTS — admin queue
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status_created ON public.withdrawal_requests(status, created_at);

-- ============================================================
-- 16. PAYOUT RECORDS — user payout history
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_payout_records_user_created ON public.payout_records(user_id, created_at DESC);

-- ============================================================
-- 17. USER SUBSCRIPTIONS — active subscription lookup
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_subs_user_status ON public.user_subscriptions(user_id, status);

-- ============================================================
-- 18. NOTIFICATIONS — unread notification feed
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created ON public.notifications(user_id, is_read, created_at DESC) WHERE is_read = false;

-- ============================================================
-- 19. TRANSACTION RECEIPTS — receipt lookup by transaction
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transaction_receipts_tx ON public.transaction_receipts(transaction_id);

-- ============================================================
-- 20. REWARD TRANSACTIONS — reward history
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reward_tx_user_created ON public.reward_transactions(user_id, created_at DESC);

-- ============================================================
-- 21. WALLET FRAUD ALERTS — unresolved alerts per user
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user_unresolved ON public.wallet_fraud_alerts(user_id, resolved_at) WHERE resolved_at IS NULL;

-- ============================================================
-- 22. FINANCIAL AUDIT LOGS — entity lookup
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_entity ON public.financial_audit_logs(entity_type, entity_id, created_at DESC);

-- ============================================================
-- 23. ADMIN ACTIVITY LOGS — admin action lookup
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_created ON public.admin_activity_logs(admin_id, created_at DESC);
