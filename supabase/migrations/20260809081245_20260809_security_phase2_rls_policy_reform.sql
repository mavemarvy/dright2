/*
# Security Hardening Phase 2: RBAC Permission Helper + Replace FOR ALL Policies

## Purpose
1. Create `has_rbac_permission(module, action)` helper that checks the RBAC system
   (roles → role_permissions → permissions) instead of a simple `is_admin = true` boolean.
2. Replace all 11 FOR ALL policies on priority tables with separate CRUD policies
   that use `is_super_admin()` for full admin access or `has_rbac_permission()` for
   granular admin access, plus existing ownership policies for regular users.

## New Functions
- `has_rbac_permission(p_module text, p_action text)` — checks if the authenticated
  user has a specific permission through their RBAC role. Returns true for super_admin.

## Tables Modified (11 tables, FOR ALL → CRUD split)
1. withdrawal_queue — admin_all_wq → select/insert/update/delete
2. withdrawal_requests — "Admins can manage all withdrawals" → select/insert/update/delete
3. payout_records — "Admins can manage all payouts" → select/insert/update/delete
4. escrow_payments — admin_all_escrow → select/insert/update/delete
5. payment_invoices — admin_all_invoices → select/insert/update/delete
6. paystack_transactions — admin_all_paystack_tx → select/insert/update/delete
7. user_subscriptions — admin_all_subscriptions → select/insert/update/delete
8. disputes — admin_all_disputes → select/insert/update/delete
9. verification_documents — admin_all_verif_docs → select/insert/update/delete
10. verification_requests — admin_all_verif_req → select/insert/update/delete
11. reviews — admin_all_reviews → select/insert/update/delete

## Security Changes
- Super admin retains full access to all tables via `is_super_admin()`
- Other admins get access only through RBAC permission checks
- Regular users keep their existing ownership-based policies
- No FOR ALL policies remain on these tables
*/

-- ============================================================
-- 1. Create has_rbac_permission helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_rbac_permission(p_module text, p_action text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM public.users u
  JOIN public.role_permissions rp ON rp.role_id = u.rbac_role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE u.id = auth.uid()
    AND u.is_admin = true
    AND u.admin_status = 'active'
    AND p.module = p_module
    AND p.action = p_action
    AND p.is_active = true
    AND p.is_deleted = false
)
OR EXISTS (
  SELECT 1
  FROM public.users u
  WHERE u.id = auth.uid()
    AND u.is_admin = true
    AND u.admin_status = 'active'
    AND u.admin_role = 'super_admin'
);
$function$;

-- ============================================================
-- 2. withdrawal_queue: Replace admin_all_wq (FOR ALL) with CRUD
-- ============================================================
DROP POLICY IF EXISTS "admin_all_wq" ON public.withdrawal_queue;

DROP POLICY IF EXISTS "admin_select_wq" ON public.withdrawal_queue;
CREATE POLICY "admin_select_wq" ON public.withdrawal_queue
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('withdrawals', 'read'));

DROP POLICY IF EXISTS "admin_update_wq" ON public.withdrawal_queue;
CREATE POLICY "admin_update_wq" ON public.withdrawal_queue
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('withdrawals', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('withdrawals', 'manage'));

DROP POLICY IF EXISTS "admin_insert_wq" ON public.withdrawal_queue;
CREATE POLICY "admin_insert_wq" ON public.withdrawal_queue
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('withdrawals', 'manage'));

DROP POLICY IF EXISTS "admin_delete_wq" ON public.withdrawal_queue;
CREATE POLICY "admin_delete_wq" ON public.withdrawal_queue
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('withdrawals', 'manage'));

-- ============================================================
-- 3. withdrawal_requests: Replace "Admins can manage all withdrawals" (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "Admins can manage all withdrawals" ON public.withdrawal_requests;

DROP POLICY IF EXISTS "admin_select_withdrawals" ON public.withdrawal_requests;
CREATE POLICY "admin_select_withdrawals" ON public.withdrawal_requests
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('withdrawals', 'read'));

DROP POLICY IF EXISTS "admin_update_withdrawals" ON public.withdrawal_requests;
CREATE POLICY "admin_update_withdrawals" ON public.withdrawal_requests
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('withdrawals', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('withdrawals', 'manage'));

DROP POLICY IF EXISTS "admin_delete_withdrawals" ON public.withdrawal_requests;
CREATE POLICY "admin_delete_withdrawals" ON public.withdrawal_requests
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('withdrawals', 'manage'));

-- ============================================================
-- 4. payout_records: Replace "Admins can manage all payouts" (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "Admins can manage all payouts" ON public.payout_records;

DROP POLICY IF EXISTS "admin_select_payouts" ON public.payout_records;
CREATE POLICY "admin_select_payouts" ON public.payout_records
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payouts', 'read'));

DROP POLICY IF EXISTS "admin_update_payouts" ON public.payout_records;
CREATE POLICY "admin_update_payouts" ON public.payout_records
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payouts', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('payouts', 'manage'));

DROP POLICY IF EXISTS "admin_insert_payouts" ON public.payout_records;
CREATE POLICY "admin_insert_payouts" ON public.payout_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('payouts', 'manage'));

DROP POLICY IF EXISTS "admin_delete_payouts" ON public.payout_records;
CREATE POLICY "admin_delete_payouts" ON public.payout_records
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payouts', 'manage'));

-- ============================================================
-- 5. escrow_payments: Replace admin_all_escrow (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "admin_all_escrow" ON public.escrow_payments;

DROP POLICY IF EXISTS "admin_select_escrow" ON public.escrow_payments;
CREATE POLICY "admin_select_escrow" ON public.escrow_payments
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payments', 'read'));

DROP POLICY IF EXISTS "admin_update_escrow" ON public.escrow_payments;
CREATE POLICY "admin_update_escrow" ON public.escrow_payments
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payments', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('payments', 'manage'));

DROP POLICY IF EXISTS "admin_delete_escrow" ON public.escrow_payments;
CREATE POLICY "admin_delete_escrow" ON public.escrow_payments
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payments', 'manage'));

-- ============================================================
-- 6. payment_invoices: Replace admin_all_invoices (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "admin_all_invoices" ON public.payment_invoices;

DROP POLICY IF EXISTS "admin_select_invoices" ON public.payment_invoices;
CREATE POLICY "admin_select_invoices" ON public.payment_invoices
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payments', 'read'));

DROP POLICY IF EXISTS "admin_update_invoices" ON public.payment_invoices;
CREATE POLICY "admin_update_invoices" ON public.payment_invoices
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payments', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('payments', 'manage'));

DROP POLICY IF EXISTS "admin_delete_invoices" ON public.payment_invoices;
CREATE POLICY "admin_delete_invoices" ON public.payment_invoices
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payments', 'manage'));

-- ============================================================
-- 7. paystack_transactions: Replace admin_all_paystack_tx (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "admin_all_paystack_tx" ON public.paystack_transactions;

DROP POLICY IF EXISTS "admin_select_paystack_tx" ON public.paystack_transactions;
CREATE POLICY "admin_select_paystack_tx" ON public.paystack_transactions
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payments', 'read'));

DROP POLICY IF EXISTS "admin_update_paystack_tx" ON public.paystack_transactions;
CREATE POLICY "admin_update_paystack_tx" ON public.paystack_transactions
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payments', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('payments', 'manage'));

DROP POLICY IF EXISTS "admin_delete_paystack_tx" ON public.paystack_transactions;
CREATE POLICY "admin_delete_paystack_tx" ON public.paystack_transactions
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('payments', 'manage'));

-- ============================================================
-- 8. user_subscriptions: Replace admin_all_subscriptions (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "admin_all_subscriptions" ON public.user_subscriptions;

DROP POLICY IF EXISTS "admin_select_subscriptions" ON public.user_subscriptions;
CREATE POLICY "admin_select_subscriptions" ON public.user_subscriptions
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('subscriptions', 'read'));

DROP POLICY IF EXISTS "admin_update_subscriptions" ON public.user_subscriptions;
CREATE POLICY "admin_update_subscriptions" ON public.user_subscriptions
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('subscriptions', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('subscriptions', 'manage'));

DROP POLICY IF EXISTS "admin_delete_subscriptions" ON public.user_subscriptions;
CREATE POLICY "admin_delete_subscriptions" ON public.user_subscriptions
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('subscriptions', 'manage'));

-- ============================================================
-- 9. disputes: Replace admin_all_disputes (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "admin_all_disputes" ON public.disputes;

DROP POLICY IF EXISTS "admin_select_disputes" ON public.disputes;
CREATE POLICY "admin_select_disputes" ON public.disputes
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('disputes', 'read'));

DROP POLICY IF EXISTS "admin_update_disputes" ON public.disputes;
CREATE POLICY "admin_update_disputes" ON public.disputes
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('disputes', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('disputes', 'manage'));

DROP POLICY IF EXISTS "admin_delete_disputes" ON public.disputes;
CREATE POLICY "admin_delete_disputes" ON public.disputes
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('disputes', 'manage'));

-- ============================================================
-- 10. verification_documents: Replace admin_all_verif_docs (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "admin_all_verif_docs" ON public.verification_documents;

DROP POLICY IF EXISTS "admin_select_verif_docs" ON public.verification_documents;
CREATE POLICY "admin_select_verif_docs" ON public.verification_documents
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('verification', 'read'));

DROP POLICY IF EXISTS "admin_update_verif_docs" ON public.verification_documents;
CREATE POLICY "admin_update_verif_docs" ON public.verification_documents
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('verification', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('verification', 'manage'));

DROP POLICY IF EXISTS "admin_delete_verif_docs" ON public.verification_documents;
CREATE POLICY "admin_delete_verif_docs" ON public.verification_documents
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('verification', 'manage'));

-- ============================================================
-- 11. verification_requests: Replace admin_all_verif_req (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "admin_all_verif_req" ON public.verification_requests;

DROP POLICY IF EXISTS "admin_select_verif_req" ON public.verification_requests;
CREATE POLICY "admin_select_verif_req" ON public.verification_requests
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('verification', 'read'));

DROP POLICY IF EXISTS "admin_update_verif_req" ON public.verification_requests;
CREATE POLICY "admin_update_verif_req" ON public.verification_requests
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('verification', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('verification', 'manage'));

DROP POLICY IF EXISTS "admin_delete_verif_req" ON public.verification_requests;
CREATE POLICY "admin_delete_verif_req" ON public.verification_requests
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('verification', 'manage'));

-- ============================================================
-- 12. reviews: Replace admin_all_reviews (FOR ALL)
-- ============================================================
DROP POLICY IF EXISTS "admin_all_reviews" ON public.reviews;

DROP POLICY IF EXISTS "admin_select_reviews" ON public.reviews;
CREATE POLICY "admin_select_reviews" ON public.reviews
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('reviews', 'read'));

DROP POLICY IF EXISTS "admin_update_reviews" ON public.reviews;
CREATE POLICY "admin_update_reviews" ON public.reviews
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('reviews', 'manage'))
  WITH CHECK (public.is_super_admin() OR public.has_rbac_permission('reviews', 'manage'));

DROP POLICY IF EXISTS "admin_delete_reviews" ON public.reviews;
CREATE POLICY "admin_delete_reviews" ON public.reviews
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR public.has_rbac_permission('reviews', 'manage'));
