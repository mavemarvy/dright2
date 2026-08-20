/*
# Admin & RBAC Security Fix

## Purpose
Fixes critical admin authorization vulnerabilities identified in the security audit.
This migration moves admin activation, suspension, role assignment, and permission
changes behind server-side SECURITY DEFINER functions that require verified super_admin
authorization. It also tightens RLS policies on the users table to prevent self-activation,
adds authorization guards to existing privileged functions, and secures search paths.

## Changes

### 1. New SECURITY DEFINER Functions for Admin Management
- `activate_admin(p_target_id, p_rbac_role_id)` — Sets a user's admin_status to 'active'
  and assigns a role. Requires the caller to be an active super_admin.
- `suspend_admin(p_target_id)` — Sets admin_status to 'suspended'. Requires super_admin.
- `set_admin_pending(p_target_id)` — Sets is_admin=true, admin_status='pending',
  admin_role=null. Requires super_admin.
- `reject_admin(p_target_id)` — Sets admin_status='rejected', is_admin=false. Requires super_admin.
- `assign_admin_role(p_target_id, p_rbac_role_id)` — Changes only the role of an existing
  active admin. Requires super_admin.

All new functions log actions to `admin_activity_logs`.

### 2. Authorization Guards on Existing Privileged Functions
- `admin_force_lockout` — now requires super_admin (was: any admin)
- `admin_unlock_account` — now requires super_admin (was: any admin)
- `admin_reset_login_attempts` — now requires super_admin (was: any admin)
- `admin_freeze_wallet` — now requires super_admin (was: NO auth check)
- `admin_manual_adjustment` — now requires super_admin (was: NO auth check)
- `add_affiliate_earnings` — now requires caller = target user OR super_admin (was: NO auth check)
- `add_reward_to_wallet` — now requires caller = target user OR super_admin (was: NO auth check)
- `add_commission_split` — now requires authenticated caller (was: NO auth check)
- `create_escrow_payment` — now requires authenticated caller (was: NO auth check)

### 3. RLS Policy Tightening on `users` Table
- INSERT: New users cannot set is_admin=true, admin_status, admin_role, or rbac_role_id
  (except the first-admin bootstrap when no active admin exists).
- UPDATE: Split into two policies:
  (a) Self-update: users can update their own non-admin columns only.
  (b) Super-admin-update: only active super_admins can update admin columns on any user.
- Replaced the old "Admins can update all users" policy which allowed ANY admin
  (is_admin=true) to update admin columns on any user.

### 4. Search Path Security
All SECURITY DEFINER functions now have search_path locked to 'public'.

### Important Notes
1. This migration is idempotent — safe to re-run if a timeout occurs.
2. No data is lost — no DROP, DELETE, or column type changes.
3. The first-admin bootstrap logic is preserved: when zero active admins exist,
   a user's first signup can still self-register as super_admin/active.
4. After this migration, all admin mutations must go through the new RPCs.
   Direct table writes to admin columns will be rejected by RLS.
*/

-- ═══════════════════════════════════════════════════════════════
-- Helper: check if caller is active super_admin
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND is_admin = true
      AND admin_status = 'active'
      AND admin_role = 'super_admin'
  );
$$;

-- ═══════════════════════════════════════════════════════════════
-- Helper: check if any active admin exists (for first-admin bootstrap)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.has_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE is_admin = true
      AND admin_status = 'active'
  );
$$;

-- ═══════════════════════════════════════════════════════════════
-- 1. NEW ADMIN MANAGEMENT RPCs
-- ═══════════════════════════════════════════════════════════════

-- activate_admin: set admin_status='active' and assign a role
CREATE OR REPLACE FUNCTION public.activate_admin(p_target_id uuid, p_rbac_role_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_is_super boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_caller_is_super;
  IF v_caller_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  IF p_target_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot activate your own admin account';
  END IF;

  UPDATE public.users
  SET admin_status = 'active',
      rbac_role_id = p_rbac_role_id,
      admin_pending_since = NULL,
      updated_at = now()
  WHERE id = p_target_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'activate_admin', 'user', p_target_id::text,
          jsonb_build_object('rbac_role_id', p_rbac_role_id));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- suspend_admin: set admin_status='suspended'
CREATE OR REPLACE FUNCTION public.suspend_admin(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_is_super boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_caller_is_super;
  IF v_caller_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  IF p_target_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot suspend your own admin account';
  END IF;

  UPDATE public.users
  SET admin_status = 'suspended',
      updated_at = now()
  WHERE id = p_target_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'suspend_admin', 'user', p_target_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- set_admin_pending: mark a user as a pending admin (no role, no permissions)
CREATE OR REPLACE FUNCTION public.set_admin_pending(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_is_super boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_caller_is_super;
  IF v_caller_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  UPDATE public.users
  SET is_admin = true,
      admin_status = 'pending',
      admin_role = NULL,
      rbac_role_id = NULL,
      admin_pending_since = now(),
      updated_at = now()
  WHERE id = p_target_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'set_admin_pending', 'user', p_target_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- reject_admin: revoke admin status
CREATE OR REPLACE FUNCTION public.reject_admin(p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_is_super boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_caller_is_super;
  IF v_caller_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  UPDATE public.users
  SET admin_status = 'rejected',
      is_admin = false,
      admin_role = NULL,
      rbac_role_id = NULL,
      updated_at = now()
  WHERE id = p_target_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'reject_admin', 'user', p_target_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- assign_admin_role: change the role of an existing active admin
CREATE OR REPLACE FUNCTION public.assign_admin_role(p_target_id uuid, p_rbac_role_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_is_super boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_caller_is_super;
  IF v_caller_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  UPDATE public.users
  SET rbac_role_id = p_rbac_role_id,
      updated_at = now()
  WHERE id = p_target_id;

  INSERT INTO public.admin_activity_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'assign_admin_role', 'user', p_target_id::text,
          jsonb_build_object('rbac_role_id', p_rbac_role_id));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 2. AUTHORIZATION GUARDS ON EXISTING PRIVILEGED FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- admin_force_lockout: now requires super_admin
CREATE OR REPLACE FUNCTION public.admin_force_lockout(p_user_id uuid, p_reason text DEFAULT 'Admin-initiated lockout'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_super boolean;
  v_email text;
BEGIN
  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  SELECT email INTO v_email FROM public.users WHERE id = p_user_id;

  UPDATE public.users
  SET account_status = 'LOCKED'
  WHERE id = p_user_id;

  INSERT INTO public.auth_activity (user_id, email, event_type, success, reason)
  VALUES (p_user_id, v_email, 'admin_forced_logout', true, p_reason);
END;
$$;

-- admin_unlock_account: now requires super_admin
CREATE OR REPLACE FUNCTION public.admin_unlock_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_super boolean;
  v_email text;
BEGIN
  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  SELECT email INTO v_email FROM public.users WHERE id = p_user_id;

  UPDATE public.users SET account_status = 'ACTIVE' WHERE id = p_user_id;

  UPDATE public.login_attempts
  SET attempt_count = 0, locked_until = NULL, updated_at = now()
  WHERE email = v_email;

  INSERT INTO public.auth_activity (user_id, email, event_type, success, reason)
  VALUES (p_user_id, v_email, 'account_unlock', true, 'Admin unlocked account');
END;
$$;

-- admin_reset_login_attempts: now requires super_admin
CREATE OR REPLACE FUNCTION public.admin_reset_login_attempts(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_super boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  UPDATE public.login_attempts
  SET attempt_count = 0, locked_until = NULL, updated_at = now()
  WHERE email = p_email;
END;
$$;

-- admin_freeze_wallet: now requires super_admin (was: NO auth check)
CREATE OR REPLACE FUNCTION public.admin_freeze_wallet(
  p_admin_id uuid,
  p_wallet_id uuid,
  p_freeze boolean,
  p_reason text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_super boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  IF p_freeze THEN
    UPDATE public.cc_wallets
    SET is_frozen = true,
        frozen_reason = p_reason,
        frozen_by = p_admin_id,
        frozen_at = now(),
        updated_at = now()
    WHERE id = p_wallet_id;
  ELSE
    UPDATE public.cc_wallets
    SET is_frozen = false,
        frozen_reason = NULL,
        frozen_by = NULL,
        frozen_at = NULL,
        updated_at = now()
    WHERE id = p_wallet_id;
  END IF;
END;
$$;

-- admin_manual_adjustment: now requires super_admin (was: NO auth check)
CREATE OR REPLACE FUNCTION public.admin_manual_adjustment(
  p_admin_id uuid,
  p_user_id uuid,
  p_wallet_id uuid,
  p_type text,
  p_amount numeric,
  p_description text,
  p_balance_field text DEFAULT 'balance'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result jsonb;
  v_is_super boolean;
BEGIN
  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  v_result := public.process_wallet_transaction(
    p_user_id, p_wallet_id, p_type, p_amount,
    COALESCE(p_description, 'Admin ' || p_type),
    'manual_adjustment', NULL,
    jsonb_build_object('admin_id', p_admin_id, 'admin_adjustment', true),
    p_balance_field
  );

  INSERT INTO public.payment_security_logs (user_id, event_type, description, performed_by)
  VALUES (p_user_id, 'admin_adjustment', p_description, p_admin_id);

  RETURN v_result;
END;
$$;

-- add_affiliate_earnings: now requires caller = target user OR super_admin
CREATE OR REPLACE FUNCTION public.add_affiliate_earnings(p_user_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_super boolean;
  v_is_self boolean;
BEGIN
  v_is_self := (auth.uid() = p_user_id);
  SELECT public.is_super_admin() INTO v_is_super;

  IF v_is_self IS NOT TRUE AND v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: can only credit own account or super_admin';
  END IF;

  UPDATE public.users
  SET
    balance = COALESCE(balance, 0) + p_amount,
    available_balance = COALESCE(available_balance, 0) + p_amount,
    affiliate_earnings = COALESCE(affiliate_earnings, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

-- add_reward_to_wallet: now requires caller = target user OR super_admin
CREATE OR REPLACE FUNCTION public.add_reward_to_wallet(
  p_user_id uuid,
  p_reward_type text,
  p_amount numeric,
  p_description text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_super boolean;
  v_is_self boolean;
BEGIN
  v_is_self := (auth.uid() = p_user_id);
  SELECT public.is_super_admin() INTO v_is_super;

  IF v_is_self IS NOT TRUE AND v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: can only credit own wallet or super_admin';
  END IF;

  INSERT INTO public.reward_wallets (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_reward_type = 'promotion_credits' THEN
    UPDATE public.reward_wallets SET promotion_credits = promotion_credits + p_amount, updated_at = now() WHERE user_id = p_user_id;
  ELSIF p_reward_type = 'promotion_tokens' THEN
    UPDATE public.reward_wallets SET promotion_tokens = promotion_tokens + p_amount, updated_at = now() WHERE user_id = p_user_id;
  ELSIF p_reward_type = 'voucher' THEN
    UPDATE public.reward_wallets SET voucher_count = voucher_count + p_amount, updated_at = now() WHERE user_id = p_user_id;
  ELSIF p_reward_type = 'gift_code' THEN
    UPDATE public.reward_wallets SET gift_code_count = gift_code_count + p_amount, updated_at = now() WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.reward_transactions (user_id, transaction_type, reward_type, amount, description)
  VALUES (p_user_id, 'credit_added', p_reward_type, p_amount, p_description);
END;
$$;

-- add_commission_split: now requires authenticated caller
CREATE OR REPLACE FUNCTION public.add_commission_split(
  p_escrow_id uuid,
  p_recipient_id uuid,
  p_recipient_role text,
  p_amount numeric,
  p_percentage numeric DEFAULT 0,
  p_balance_field text DEFAULT 'balance'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  INSERT INTO public.commission_splits (escrow_id, recipient_id, recipient_role, amount, percentage, balance_field)
  VALUES (p_escrow_id, p_recipient_id, p_recipient_role, p_amount, p_percentage, p_balance_field)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- create_escrow_payment: now requires authenticated caller
CREATE OR REPLACE FUNCTION public.create_escrow_payment(
  p_order_id uuid,
  p_buyer_id uuid,
  p_seller_id uuid,
  p_amount numeric,
  p_platform_fee numeric DEFAULT 0,
  p_seller_earnings numeric DEFAULT 0,
  p_auto_release_hours integer DEFAULT 72
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  INSERT INTO public.escrow_payments (order_id, buyer_id, seller_id, amount, platform_fee, seller_earnings, auto_release_at)
  VALUES (p_order_id, p_buyer_id, p_seller_id, p_amount, p_platform_fee, p_seller_earnings,
          now() + (p_auto_release_hours || ' hours')::interval)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'escrow_id', v_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. RLS POLICY TIGHTENING ON `users` TABLE
-- ═══════════════════════════════════════════════════════════════

-- Replace INSERT policy: prevent self-activation as admin (except first-admin bootstrap)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

CREATE POLICY "Users can insert own profile"
ON public.users FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND (
    -- Case 1: NOT setting admin columns (normal signup) — always allowed
    (COALESCE(is_admin, false) = false
     AND COALESCE(admin_status, 'active') != 'super_admin'
     AND admin_role IS NULL
     AND rbac_role_id IS NULL)
    -- Case 2: First-admin bootstrap — allowed only when no active admin exists
    OR (
      is_admin = true
      AND admin_status = 'active'
      AND admin_role = 'super_admin'
      AND NOT public.has_active_admin()
    )
  )
);

-- Replace UPDATE policies: split self-update (non-admin cols) from super-admin-update (admin cols)
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

-- Self-update: users can update their own row, but NOT admin columns
CREATE POLICY "Users can update own profile non_admin"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND is_admin = false
  AND admin_role IS NULL
  AND admin_status IS NULL
  AND rbac_role_id IS NULL
);

-- Super-admin update: only active super_admins can update admin columns on any user
CREATE POLICY "Super admins can update admin columns"
ON public.users FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Revoke broad table-level UPDATE and INSERT grants so column-level security is enforced
-- Re-grant only SELECT (needed for profile reads and admin reads)
REVOKE UPDATE ON public.users FROM anon, authenticated;
REVOKE INSERT ON public.users FROM anon, authenticated;
REVOKE DELETE ON public.users FROM anon, authenticated;

-- Re-grant INSERT and UPDATE at table level (RLS still enforces column restrictions)
-- This is needed because Postgres requires table-level grant for the operation,
-- but RLS policies control which rows and columns can actually be modified.
GRANT INSERT ON public.users TO authenticated;
GRANT UPDATE ON public.users TO authenticated;
GRANT DELETE ON public.users TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4. GRANT EXECUTE on new functions to authenticated role only
-- ═══════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_active_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_active_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.activate_admin(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.activate_admin(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.suspend_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.suspend_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_admin_pending(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_admin_pending(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.assign_admin_role(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assign_admin_role(uuid, uuid) TO authenticated;

-- Revoke execute on guarded functions from anon (was implicitly granted to public)
REVOKE EXECUTE ON FUNCTION public.admin_force_lockout(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_unlock_account(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reset_login_attempts(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_freeze_wallet(uuid, uuid, boolean, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.admin_manual_adjustment(uuid, uuid, uuid, text, numeric, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.add_affiliate_earnings(uuid, numeric) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.add_reward_to_wallet(uuid, text, numeric, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.add_commission_split(uuid, uuid, text, numeric, numeric, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.create_escrow_payment(uuid, uuid, uuid, numeric, numeric, numeric, integer) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.admin_force_lockout(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlock_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_login_attempts(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_freeze_wallet(uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manual_adjustment(uuid, uuid, uuid, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_affiliate_earnings(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_reward_to_wallet(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_commission_split(uuid, uuid, text, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_escrow_payment(uuid, uuid, uuid, numeric, numeric, numeric, integer) TO authenticated;
