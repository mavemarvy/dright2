-- ST-8 — production security hardening.
-- Keep intentionally public sponsored/referral delivery RPCs available, while
-- closing direct browser access to trigger-only and legacy financial helpers.

ALTER FUNCTION public.sales_team_contract_interval(text)
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.sales_team_touch_updated_at()
  SET search_path TO public, pg_temp;

REVOKE ALL ON FUNCTION public.audit_admin_permissions_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_cc_wallets_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_escrow_payments_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_payout_records_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_paystack_tx_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_users_admin_fields_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_withdrawal_queue_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_withdrawal_requests_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_team_touch_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.add_affiliate_earnings(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_commission_split(uuid, uuid, text, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_reward_to_wallet(uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_wallet_transaction(uuid, uuid, text, numeric, text, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_invoice_paid(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_escrow_payment(uuid, uuid, uuid, numeric, numeric, numeric, integer) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_financial_reconciliation_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_reconciliation_health() TO service_role;

GRANT EXECUTE ON FUNCTION public.process_wallet_transaction(uuid, uuid, text, numeric, text, text, uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_escrow_payment(uuid, uuid, uuid, numeric, numeric, numeric, integer) TO service_role;

REVOKE ALL ON TABLE public.paystack_transactions FROM anon;
REVOKE ALL ON TABLE public.payment_attempts FROM anon;
REVOKE ALL ON TABLE public.cc_wallets FROM anon;
REVOKE ALL ON TABLE public.ledger_entries FROM anon;
REVOKE ALL ON TABLE public.platform_ledger_entries FROM anon;
REVOKE ALL ON TABLE public.refund_records FROM anon;
REVOKE ALL ON TABLE public.reward_wallets FROM anon;
REVOKE ALL ON TABLE public.wallet_fraud_alerts FROM anon;
REVOKE ALL ON TABLE public.commission_splits FROM anon;
REVOKE ALL ON TABLE public.payout_records FROM anon;
REVOKE ALL ON TABLE public.escrow_payments FROM anon;
REVOKE ALL ON TABLE public.promotion_campaigns FROM anon;
REVOKE ALL ON TABLE public.sales_team_contracts FROM anon;