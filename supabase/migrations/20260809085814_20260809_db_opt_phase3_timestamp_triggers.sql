/*
# Database Optimization Phase 3: Timestamp Management

## Purpose
Add updated_at triggers for important tables that have an updated_at column
but no trigger to automatically update it. Uses a single shared function.

## Triggers Added (20 tables)
1. users
2. products
3. disputes
4. escrow_payments
5. payment_invoices
6. paystack_transactions
7. user_subscriptions
8. cc_wallets
9. cc_campaigns
10. bank_accounts
11. marketing_campaigns
12. promotion_campaigns
13. chat_conversations
14. product_drafts
15. product_edits
16. notification_preferences
17. payment_preferences
18. withdrawal_methods
19. withdrawal_queue
20. verification_requests
*/

-- ============================================================
-- Create a shared updated_at trigger function (if not exists)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ============================================================
-- Add triggers to priority tables
-- ============================================================

-- 1. users
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. products
DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. disputes
DROP TRIGGER IF EXISTS trg_disputes_updated_at ON public.disputes;
CREATE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. escrow_payments
DROP TRIGGER IF EXISTS trg_escrow_payments_updated_at ON public.escrow_payments;
CREATE TRIGGER trg_escrow_payments_updated_at
  BEFORE UPDATE ON public.escrow_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. payment_invoices
DROP TRIGGER IF EXISTS trg_payment_invoices_updated_at ON public.payment_invoices;
CREATE TRIGGER trg_payment_invoices_updated_at
  BEFORE UPDATE ON public.payment_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. paystack_transactions
DROP TRIGGER IF EXISTS trg_paystack_transactions_updated_at ON public.paystack_transactions;
CREATE TRIGGER trg_paystack_transactions_updated_at
  BEFORE UPDATE ON public.paystack_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. user_subscriptions
DROP TRIGGER IF EXISTS trg_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. cc_wallets
DROP TRIGGER IF EXISTS trg_cc_wallets_updated_at ON public.cc_wallets;
CREATE TRIGGER trg_cc_wallets_updated_at
  BEFORE UPDATE ON public.cc_wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. cc_campaigns
DROP TRIGGER IF EXISTS trg_cc_campaigns_updated_at ON public.cc_campaigns;
CREATE TRIGGER trg_cc_campaigns_updated_at
  BEFORE UPDATE ON public.cc_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. bank_accounts
DROP TRIGGER IF EXISTS trg_bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 11. marketing_campaigns
DROP TRIGGER IF EXISTS trg_marketing_campaigns_updated_at ON public.marketing_campaigns;
CREATE TRIGGER trg_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 12. promotion_campaigns
DROP TRIGGER IF EXISTS trg_promotion_campaigns_updated_at ON public.promotion_campaigns;
CREATE TRIGGER trg_promotion_campaigns_updated_at
  BEFORE UPDATE ON public.promotion_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 13. chat_conversations
DROP TRIGGER IF EXISTS trg_chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER trg_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 14. product_drafts
DROP TRIGGER IF EXISTS trg_product_drafts_updated_at ON public.product_drafts;
CREATE TRIGGER trg_product_drafts_updated_at
  BEFORE UPDATE ON public.product_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 15. product_edits
DROP TRIGGER IF EXISTS trg_product_edits_updated_at ON public.product_edits;
CREATE TRIGGER trg_product_edits_updated_at
  BEFORE UPDATE ON public.product_edits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 16. notification_preferences
DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 17. payment_preferences
DROP TRIGGER IF EXISTS trg_payment_preferences_updated_at ON public.payment_preferences;
CREATE TRIGGER trg_payment_preferences_updated_at
  BEFORE UPDATE ON public.payment_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 18. withdrawal_methods
DROP TRIGGER IF EXISTS trg_withdrawal_methods_updated_at ON public.withdrawal_methods;
CREATE TRIGGER trg_withdrawal_methods_updated_at
  BEFORE UPDATE ON public.withdrawal_methods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 19. withdrawal_queue
DROP TRIGGER IF EXISTS trg_withdrawal_queue_updated_at ON public.withdrawal_queue;
CREATE TRIGGER trg_withdrawal_queue_updated_at
  BEFORE UPDATE ON public.withdrawal_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 20. verification_requests
DROP TRIGGER IF EXISTS trg_verification_requests_updated_at ON public.verification_requests;
CREATE TRIGGER trg_verification_requests_updated_at
  BEFORE UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
