/*
# Security Hardening Phase 1: Revoke Anonymous Write Access

## Purpose
Remove INSERT, UPDATE, and DELETE privileges from the `anon` role on all sensitive
financial, administrative, RBAC, and marketplace tables. Anonymous (unauthenticated)
users must never be able to modify these records — only authenticated users, and only
through RLS policies that enforce ownership or admin authorization.

## Tables Affected (42 tables)
Financial: withdrawal_requests, withdrawal_queue, payment_attempts, payment_security,
  payment_security_logs, payment_pin_attempts, payment_preferences, payment_providers,
  payment_recovery_codes, payment_recovery_tokens, payment_webhook_logs, payment_invoices,
  payment_analytics, paystack_transactions, escrow_payments, transaction_receipts,
  bank_accounts, payout_methods, withdrawal_methods, cc_transactions, cc_wallets,
  reward_wallets, reward_transactions, referral_withdrawals, wallet_fraud_alerts,
  internal_settlements, user_payment_preferences
Admin/RBAC: roles, permissions, role_permissions, admin_logs, admin_activity_logs,
  admin_agreements, admin_performance, admin_verifications, admin_permissions
Marketplace: products, orders, sales_records, abandoned_payments
Referral: referral_links, referral_rewards

## Security Changes
- REVOKE INSERT, UPDATE, DELETE from anon on all 42 tables
- anon retains SELECT only where RLS policies already scope public reads
- authenticated role privileges are unchanged — RLS policies still govern access

## Important Notes
1. This does NOT change RLS policies — only table-level grants.
2. authenticated users are unaffected; their access is still governed by RLS policies.
3. If any no-auth frontend feature depends on anon writes, it will need an authenticated
   session or a SECURITY DEFINER function with its own authorization logic.
*/

-- Financial tables
REVOKE INSERT, UPDATE, DELETE ON public.withdrawal_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.withdrawal_queue FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_attempts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_security FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_security_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_pin_attempts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_preferences FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_providers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_recovery_codes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_recovery_tokens FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_webhook_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_invoices FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_analytics FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.paystack_transactions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.escrow_payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.transaction_receipts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.bank_accounts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payout_methods FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.withdrawal_methods FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cc_transactions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.cc_wallets FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reward_wallets FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.reward_transactions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.referral_withdrawals FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_fraud_alerts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.internal_settlements FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_payment_preferences FROM anon;

-- Admin / RBAC tables
REVOKE INSERT, UPDATE, DELETE ON public.roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_activity_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_agreements FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_performance FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_verifications FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.admin_permissions FROM anon;

-- Marketplace tables
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.sales_records FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.abandoned_payments FROM anon;

-- Referral tables
REVOKE INSERT, UPDATE, DELETE ON public.referral_links FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.referral_rewards FROM anon;
