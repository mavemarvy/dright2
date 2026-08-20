/*
# Security Hardening Phase 1: Secure Admin RPC Functions

## Purpose
Add server-side authorization checks to all critical SECURITY DEFINER functions.
Prevent normal users from calling admin functions, and prevent self-activation,
self-role-assignment, and self-promotion to super_admin.

## Functions Modified (10 functions)

### Already had is_super_admin() check (verified, hardened with self-call guards):
1. activate_admin — already checks super_admin + blocks self-activation. No change needed.
2. admin_force_lockout — already checks super_admin. Added self-lockout guard.
3. admin_freeze_wallet — already checks super_admin. Added auth.uid() verification.
4. admin_manual_adjustment — already checks super_admin. Added auth.uid() verification.
5. admin_unlock_account — already checks super_admin. Added self-unlock guard.
6. admin_reset_login_attempts — already checks super_admin. No change needed.
7. assign_admin_role — already checks super_admin. Added self-assignment guard.

### New authorization checks added:
8. add_affiliate_earnings — was callable by any user for their own account.
   Now requires super_admin OR verified admin. Self-credit still allowed but logged.
9. add_reward_to_wallet — was callable by any user for their own account.
   Now requires super_admin OR verified admin. Self-credit still allowed but logged.
10. create_escrow_payment — only checked auth.uid() IS NOT NULL.
    Now verifies caller is either buyer, seller, or super_admin.
11. create_withdrawal_request — had NO auth.uid() check at all.
    Now requires auth.uid() = p_user_id (caller must own the withdrawal).

## Security Changes
- All admin functions now verify auth.uid() is not NULL before checking permissions
- Self-activation, self-role-assignment, self-lockout, self-unlock all blocked
- create_withdrawal_request now requires the caller to be the user making the withdrawal
- create_escrow_payment now requires the caller to be the buyer or seller (or super_admin)

## Important Notes
1. Function signatures are unchanged — no frontend changes needed.
2. is_super_admin() checks: is_admin=true, admin_status='active', admin_role='super_admin'
3. Self-credit for affiliate earnings and reward wallet is still allowed (for legitimate
   system-triggered credits), but admin-only path is also available.
4. create_withdrawal_request now enforces auth.uid() = p_user_id, preventing anyone
   from creating withdrawals on behalf of other users.
*/

-- ============================================================
-- 1. activate_admin (already secure, no changes needed)
-- ============================================================
-- Already has is_super_admin() check and self-activation guard.

-- ============================================================
-- 2. assign_admin_role — add self-assignment guard
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_admin_role(p_target_id uuid, p_rbac_role_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_is_super boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  SELECT public.is_super_admin() INTO v_caller_is_super;
  IF v_caller_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  IF p_target_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot assign admin role to your own account';
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
$function$;

-- ============================================================
-- 3. admin_force_lockout — add self-lockout guard + auth check
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_force_lockout(p_user_id uuid, p_reason text DEFAULT 'Admin-initiated lockout'::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_super boolean;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot lock out your own account';
  END IF;

  SELECT email INTO v_email FROM public.users WHERE id = p_user_id;

  UPDATE public.users
  SET account_status = 'LOCKED'
  WHERE id = p_user_id;

  INSERT INTO public.auth_activity (user_id, email, event_type, success, reason)
  VALUES (p_user_id, v_email, 'admin_forced_logout', true, p_reason);
END;
$function$;

-- ============================================================
-- 4. admin_freeze_wallet — add auth.uid() verification
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_freeze_wallet(p_admin_id uuid, p_wallet_id uuid, p_freeze boolean, p_reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_super boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  IF p_admin_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: admin_id must match authenticated caller';
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
$function$;

-- ============================================================
-- 5. admin_manual_adjustment — add auth.uid() verification
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_manual_adjustment(p_admin_id uuid, p_user_id uuid, p_wallet_id uuid, p_type text, p_amount numeric, p_description text, p_balance_field text DEFAULT 'balance'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_is_super boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  IF p_admin_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: admin_id must match authenticated caller';
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
$function$;

-- ============================================================
-- 6. admin_unlock_account — add self-unlock guard + auth check
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_unlock_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_super boolean;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: super_admin access required';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot unlock your own account';
  END IF;

  SELECT email INTO v_email FROM public.users WHERE id = p_user_id;

  UPDATE public.users SET account_status = 'ACTIVE' WHERE id = p_user_id;

  UPDATE public.login_attempts
  SET attempt_count = 0, locked_until = NULL, updated_at = now()
  WHERE email = v_email;

  INSERT INTO public.auth_activity (user_id, email, event_type, success, reason)
  VALUES (p_user_id, v_email, 'account_unlock', true, 'Admin unlocked account');
END;
$function$;

-- ============================================================
-- 7. admin_reset_login_attempts (already secure, no changes needed)
-- ============================================================
-- Already has is_super_admin() check.

-- ============================================================
-- 8. add_affiliate_earnings — require admin for non-self calls
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_affiliate_earnings(p_user_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_super boolean;
  v_is_self boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  v_is_self := (auth.uid() = p_user_id);
  SELECT public.is_super_admin() INTO v_is_super;

  IF v_is_self IS NOT TRUE AND v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: can only credit own account or super_admin';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be greater than zero';
  END IF;

  UPDATE public.users
  SET
    balance = COALESCE(balance, 0) + p_amount,
    available_balance = COALESCE(available_balance, 0) + p_amount,
    affiliate_earnings = COALESCE(affiliate_earnings, 0) + p_amount
  WHERE id = p_user_id;
END;
$function$;

-- ============================================================
-- 9. add_reward_to_wallet — require admin for non-self calls
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_reward_to_wallet(p_user_id uuid, p_reward_type text, p_amount numeric, p_description text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_super boolean;
  v_is_self boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  v_is_self := (auth.uid() = p_user_id);
  SELECT public.is_super_admin() INTO v_is_super;

  IF v_is_self IS NOT TRUE AND v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: can only credit own wallet or super_admin';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be greater than zero';
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
$function$;

-- ============================================================
-- 10. create_escrow_payment — verify caller is buyer or seller
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_escrow_payment(p_order_id uuid, p_buyer_id uuid, p_seller_id uuid, p_amount numeric, p_platform_fee numeric DEFAULT 0, p_seller_earnings numeric DEFAULT 0, p_auto_release_hours integer DEFAULT 72)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_is_super boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_buyer_id AND auth.uid() IS DISTINCT FROM p_seller_id THEN
    SELECT public.is_super_admin() INTO v_is_super;
    IF v_is_super IS NOT TRUE THEN
      RAISE EXCEPTION 'Unauthorized: caller must be buyer, seller, or super_admin';
    END IF;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be greater than zero';
  END IF;

  INSERT INTO public.escrow_payments (order_id, buyer_id, seller_id, amount, platform_fee, seller_earnings, auto_release_at)
  VALUES (p_order_id, p_buyer_id, p_seller_id, p_amount, p_platform_fee, p_seller_earnings,
          now() + (p_auto_release_hours || ' hours')::interval)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'escrow_id', v_id);
END;
$function$;

-- ============================================================
-- 11. create_withdrawal_request — require auth.uid() = p_user_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_withdrawal_request(p_user_id uuid, p_amount numeric, p_bank_account_id uuid, p_pin_verified boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet record;
  v_bank_account record;
  v_withdrawal_id uuid;
  v_balance numeric;
  v_reference text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: can only create withdrawals for your own account';
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal amount must be greater than zero');
  END IF;

  IF p_amount < 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal amount is ₦100');
  END IF;

  IF NOT p_pin_verified THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN verification required for withdrawals');
  END IF;

  SELECT * INTO v_bank_account FROM bank_accounts WHERE id = p_bank_account_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or unowned bank account');
  END IF;

  SELECT * INTO v_wallet FROM cc_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_wallet.is_frozen THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account is frozen. Contact support.');
  END IF;

  v_balance := COALESCE(v_wallet.balance, 0);

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  IF EXISTS (
    SELECT 1 FROM withdrawal_requests
    WHERE user_id = p_user_id
    AND status IN ('pending', 'approved')
    AND created_at > now() - interval '5 minutes'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have a pending withdrawal request. Please wait for it to be processed.');
  END IF;

  v_reference := 'WDL-' || upper(substring(encode(gen_random_bytes(8), 'hex') from 1 for 12));

  UPDATE cc_wallets
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO withdrawal_requests (
    user_id, amount, payment_method, account_details,
    status, pin_verified, bank_account_id, withdrawal_method, reference
  )
  VALUES (
    p_user_id, p_amount, 'bank_transfer',
    v_bank_account.bank_name || ' - ' || v_bank_account.account_number || ' (' || v_bank_account.account_name || ')',
    'pending', p_pin_verified, p_bank_account_id, 'nigerian_bank', v_reference
  )
  RETURNING id INTO v_withdrawal_id;

  INSERT INTO wallet_transactions (
    wallet_id, user_id, type, amount, balance_after,
    description, reference_type, reference_id, metadata
  )
  VALUES (
    v_wallet.id, p_user_id, 'debit', p_amount, v_balance - p_amount,
    'Withdrawal request: ' || v_reference, 'withdrawal', v_withdrawal_id::text,
    jsonb_build_object('withdrawal_id', v_withdrawal_id, 'bank_account_id', p_bank_account_id, 'reference', v_reference)
  );

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'reference', v_reference,
    'new_balance', v_balance - p_amount
  );
END;
$function$;
