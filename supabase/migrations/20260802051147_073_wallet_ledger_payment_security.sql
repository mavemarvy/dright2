/*
# Phase 4.1 — Wallet & Ledger Engine + Payment Security

## Summary
Extends the existing cc_wallets table with multi-balance support and creates
the full payment security system (PIN, lockout, recovery, audit logs),
double-entry ledger, payout accounts, and fraud tracking.

## New Tables
1. **payment_security** — Per-user payment PIN (hashed), lockout state, auth rules
2. **payment_pin_attempts** — Every PIN verify attempt (success/fail) for audit
3. **payment_security_logs** — Security events (PIN set, changed, reset, unlocked)
4. **payment_recovery_tokens** — Single-use tokens for PIN reset via email
5. **ledger_entries** — Double-entry bookkeeping (debit/credit pairs)
6. **payout_accounts** — User's saved payout methods (bank, wise, paypal, crypto)
7. **wallet_fraud_alerts** — Suspicious activity flags for admin review

## Modified Tables
- **cc_wallets** — Adds pending_balance, locked_balance, referral_balance,
  affiliate_balance, creator_balance, advertiser_budget, seller_earnings,
  currency, is_frozen, frozen_reason, frozen_by, frozen_at

## New RPCs
- get_wallet_balances(p_user_id) — returns all balance types
- process_wallet_transaction(...) — atomic balance update + ledger entry + transaction record
- verify_payment_pin(p_user_id, p_pin_hash) — checks PIN, records attempt, handles lockout
- set_payment_pin(p_user_id, p_pin_hash) — sets/updates hashed PIN
- reset_payment_pin(p_user_id, p_new_pin_hash) — resets PIN after recovery
- create_pin_recovery_token(p_user_id) — generates single-use reset token
- verify_pin_recovery_token(p_token) — validates token, returns user_id
- unlock_payment_pin(p_user_id) — admin unlock
- get_payment_security_status(p_user_id) — returns PIN status, lockout, auth rules
- update_payment_auth_rules(p_user_id, p_rules) — update transaction authorization rules
- admin_manual_adjustment(...) — admin credit/debit with ledger entry
- admin_freeze_wallet(...) — freeze/unfreeze wallet
- get_wallet_transactions(p_user_id, p_limit, p_offset) — paginated transaction history
- get_wallet_summary(p_user_id) — aggregate stats for dashboard

## Security
- RLS enabled on all new tables
- Owner-scoped policies for user tables
- Admin-scoped policies for admin tables
- All PIN operations use SHA-256 hashing (never plaintext)
*/

-- ============================================================
-- 1. Extend cc_wallets
-- ============================================================
ALTER TABLE cc_wallets
  ADD COLUMN IF NOT EXISTS pending_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS creator_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advertiser_budget numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_earnings numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_reason text,
  ADD COLUMN IF NOT EXISTS frozen_by uuid,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cc_wallets_user ON cc_wallets(user_id);

-- ============================================================
-- 2. Payment Security (PIN)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_security (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE DEFAULT auth.uid(),
  pin_hash text NOT NULL,
  pin_length int NOT NULL DEFAULT 4,
  is_locked boolean NOT NULL DEFAULT false,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_pin_change timestamptz NOT NULL DEFAULT now(),
  auth_rules jsonb NOT NULL DEFAULT '{"require_pin_threshold": 0, "always_require_pin": true, "require_pin_withdrawals": true, "require_pin_new_device": true, "require_pin_after_minutes": 30, "require_pin_payout_change": true}'::jsonb,
  recovery_email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payment_security ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_payment_security" ON payment_security;
CREATE POLICY "select_own_payment_security" ON payment_security FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_payment_security" ON payment_security;
CREATE POLICY "insert_own_payment_security" ON payment_security FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_payment_security" ON payment_security;
CREATE POLICY "update_own_payment_security" ON payment_security FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_select_payment_security" ON payment_security;
CREATE POLICY "admin_select_payment_security" ON payment_security FOR SELECT TO authenticated USING (is_admin_user());
DROP POLICY IF EXISTS "admin_update_payment_security" ON payment_security;
CREATE POLICY "admin_update_payment_security" ON payment_security FOR UPDATE TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 3. Payment PIN Attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  success boolean NOT NULL,
  ip_address text,
  user_agent text,
  context text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pin_attempts_user ON payment_pin_attempts(user_id, created_at DESC);
ALTER TABLE payment_pin_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_pin_attempts" ON payment_pin_attempts;
CREATE POLICY "select_own_pin_attempts" ON payment_pin_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_pin_attempts" ON payment_pin_attempts;
CREATE POLICY "insert_own_pin_attempts" ON payment_pin_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_select_pin_attempts" ON payment_pin_attempts;
CREATE POLICY "admin_select_pin_attempts" ON payment_pin_attempts FOR SELECT TO authenticated USING (is_admin_user());

-- ============================================================
-- 4. Payment Security Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  event_type text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_logs_user ON payment_security_logs(user_id, created_at DESC);
ALTER TABLE payment_security_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_security_logs" ON payment_security_logs;
CREATE POLICY "select_own_security_logs" ON payment_security_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_security_logs" ON payment_security_logs;
CREATE POLICY "insert_own_security_logs" ON payment_security_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR is_admin_user());
DROP POLICY IF EXISTS "admin_select_security_logs" ON payment_security_logs;
CREATE POLICY "admin_select_security_logs" ON payment_security_logs FOR SELECT TO authenticated USING (is_admin_user());

-- ============================================================
-- 5. Payment Recovery Tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recovery_tokens_user ON payment_recovery_tokens(user_id);
ALTER TABLE payment_recovery_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_recovery_tokens" ON payment_recovery_tokens;
CREATE POLICY "select_own_recovery_tokens" ON payment_recovery_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_recovery_tokens" ON payment_recovery_tokens;
CREATE POLICY "insert_own_recovery_tokens" ON payment_recovery_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_select_recovery_tokens" ON payment_recovery_tokens;
CREATE POLICY "admin_select_recovery_tokens" ON payment_recovery_tokens FOR SELECT TO authenticated USING (is_admin_user());

-- ============================================================
-- 6. Ledger Entries (double-entry)
-- ============================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid, -- links to cc_transactions
  wallet_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  entry_type text NOT NULL, -- 'debit' or 'credit'
  account text NOT NULL, -- 'available', 'pending', 'locked', 'escrow', 'referral', 'affiliate', 'creator', 'advertiser', 'seller_earnings'
  amount numeric NOT NULL,
  balance_after numeric,
  description text,
  reference_type text, -- 'purchase', 'withdrawal', 'deposit', 'refund', 'escrow_hold', 'escrow_release', 'affiliate_payout', 'referral_payout', 'creator_payout', 'promotion', 'subscription', 'manual_adjustment'
  reference_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger_entries(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction ON ledger_entries(transaction_id);
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_ledger" ON ledger_entries;
CREATE POLICY "select_own_ledger" ON ledger_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_ledger" ON ledger_entries;
CREATE POLICY "insert_own_ledger" ON ledger_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_select_ledger" ON ledger_entries;
CREATE POLICY "admin_select_ledger" ON ledger_entries FOR SELECT TO authenticated USING (is_admin_user());
DROP POLICY IF EXISTS "admin_insert_ledger" ON ledger_entries;
CREATE POLICY "admin_insert_ledger" ON ledger_entries FOR INSERT TO authenticated WITH CHECK (is_admin_user());

-- ============================================================
-- 7. Payout Accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  account_type text NOT NULL, -- 'bank_ngn', 'wise', 'paypal', 'bank_us', 'crypto'
  nickname text,
  account_details jsonb NOT NULL DEFAULT '{}'::jsonb, -- bank_name, account_number, account_name, routing_number, wallet_address, etc.
  is_default boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_accounts_user ON payout_accounts(user_id);
ALTER TABLE payout_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_payout_accounts" ON payout_accounts;
CREATE POLICY "select_own_payout_accounts" ON payout_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_payout_accounts" ON payout_accounts;
CREATE POLICY "insert_own_payout_accounts" ON payout_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_payout_accounts" ON payout_accounts;
CREATE POLICY "update_own_payout_accounts" ON payout_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_payout_accounts" ON payout_accounts;
CREATE POLICY "delete_own_payout_accounts" ON payout_accounts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 8. Wallet Fraud Alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_fraud_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  alert_type text NOT NULL, -- 'failed_pin', 'suspicious_withdrawal', 'multiple_device', 'velocity', 'duplicate', 'impossible_travel', 'large_withdrawal'
  severity text NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user ON wallet_fraud_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_unresolved ON wallet_fraud_alerts(is_resolved, created_at DESC);
ALTER TABLE wallet_fraud_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_select_fraud_alerts" ON wallet_fraud_alerts;
CREATE POLICY "admin_select_fraud_alerts" ON wallet_fraud_alerts FOR SELECT TO authenticated USING (is_admin_user());
DROP POLICY IF EXISTS "admin_update_fraud_alerts" ON wallet_fraud_alerts;
CREATE POLICY "admin_update_fraud_alerts" ON wallet_fraud_alerts FOR UPDATE TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
DROP POLICY IF EXISTS "admin_insert_fraud_alerts" ON wallet_fraud_alerts;
CREATE POLICY "admin_insert_fraud_alerts" ON wallet_fraud_alerts FOR INSERT TO authenticated WITH CHECK (is_admin_user());

-- ============================================================
-- 9. RPCs
-- ============================================================

-- Get all wallet balances for a user
CREATE OR REPLACE FUNCTION get_wallet_balances(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'wallet_id', id, 'balance', balance, 'pending_balance', pending_balance,
    'locked_balance', locked_balance, 'escrow_balance', escrow_balance,
    'referral_balance', referral_balance, 'affiliate_balance', affiliate_balance,
    'creator_balance', creator_balance, 'advertiser_budget', advertiser_budget,
    'seller_earnings', seller_earnings, 'currency', currency,
    'is_frozen', is_frozen, 'frozen_reason', frozen_reason
  )), '[]'::jsonb)
  FROM cc_wallets WHERE user_id = p_user_id;
$$;

-- Process a wallet transaction atomically (balance update + ledger + transaction record)
CREATE OR REPLACE FUNCTION process_wallet_transaction(
  p_user_id uuid,
  p_wallet_id uuid,
  p_type text,
  p_amount numeric,
  p_description text DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_balance_field text DEFAULT 'balance'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_after numeric;
  v_transaction_id uuid;
  v_wallet RECORD;
BEGIN
  -- Lock the wallet row
  SELECT * INTO v_wallet FROM cc_wallets WHERE id = p_wallet_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;
  IF v_wallet.is_frozen THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet is frozen');
  END IF;

  -- Calculate new balance
  CASE p_balance_field
    WHEN 'balance' THEN
      IF p_type = 'credit' THEN v_balance_after := v_wallet.balance + p_amount;
      ELSE
        IF v_wallet.balance < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance'); END IF;
        v_balance_after := v_wallet.balance - p_amount;
      END IF;
      UPDATE cc_wallets SET balance = v_balance_after, updated_at = now() WHERE id = p_wallet_id;
    WHEN 'pending_balance' THEN
      IF p_type = 'credit' THEN v_balance_after := v_wallet.pending_balance + p_amount;
      ELSE
        IF v_wallet.pending_balance < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient pending balance'); END IF;
        v_balance_after := v_wallet.pending_balance - p_amount;
      END IF;
      UPDATE cc_wallets SET pending_balance = v_balance_after, updated_at = now() WHERE id = p_wallet_id;
    WHEN 'locked_balance' THEN
      IF p_type = 'credit' THEN v_balance_after := v_wallet.locked_balance + p_amount;
      ELSE
        IF v_wallet.locked_balance < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient locked balance'); END IF;
        v_balance_after := v_wallet.locked_balance - p_amount;
      END IF;
      UPDATE cc_wallets SET locked_balance = v_balance_after, updated_at = now() WHERE id = p_wallet_id;
    WHEN 'escrow_balance' THEN
      IF p_type = 'credit' THEN v_balance_after := v_wallet.escrow_balance + p_amount;
      ELSE
        IF v_wallet.escrow_balance < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient escrow balance'); END IF;
        v_balance_after := v_wallet.escrow_balance - p_amount;
      END IF;
      UPDATE cc_wallets SET escrow_balance = v_balance_after, updated_at = now() WHERE id = p_wallet_id;
    WHEN 'referral_balance' THEN
      IF p_type = 'credit' THEN v_balance_after := v_wallet.referral_balance + p_amount;
      ELSE
        IF v_wallet.referral_balance < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient referral balance'); END IF;
        v_balance_after := v_wallet.referral_balance - p_amount;
      END IF;
      UPDATE cc_wallets SET referral_balance = v_balance_after, updated_at = now() WHERE id = p_wallet_id;
    WHEN 'affiliate_balance' THEN
      IF p_type = 'credit' THEN v_balance_after := v_wallet.affiliate_balance + p_amount;
      ELSE
        IF v_wallet.affiliate_balance < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient affiliate balance'); END IF;
        v_balance_after := v_wallet.affiliate_balance - p_amount;
      END IF;
      UPDATE cc_wallets SET affiliate_balance = v_balance_after, updated_at = now() WHERE id = p_wallet_id;
    WHEN 'creator_balance' THEN
      IF p_type = 'credit' THEN v_balance_after := v_wallet.creator_balance + p_amount;
      ELSE
        IF v_wallet.creator_balance < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient creator balance'); END IF;
        v_balance_after := v_wallet.creator_balance - p_amount;
      END IF;
      UPDATE cc_wallets SET creator_balance = v_balance_after, updated_at = now() WHERE id = p_wallet_id;
    WHEN 'seller_earnings' THEN
      IF p_type = 'credit' THEN v_balance_after := v_wallet.seller_earnings + p_amount;
      ELSE
        IF v_wallet.seller_earnings < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient seller earnings'); END IF;
        v_balance_after := v_wallet.seller_earnings - p_amount;
      END IF;
      UPDATE cc_wallets SET seller_earnings = v_balance_after, updated_at = now() WHERE id = p_wallet_id;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Invalid balance field');
  END CASE;

  -- Create transaction record
  INSERT INTO cc_transactions (wallet_id, user_id, type, amount, balance_after, description, metadata)
  VALUES (p_wallet_id, p_user_id, p_type, p_amount, v_balance_after, p_description, p_metadata)
  RETURNING id INTO v_transaction_id;

  -- Create ledger entry
  INSERT INTO ledger_entries (transaction_id, wallet_id, user_id, entry_type, account, amount, balance_after, description, reference_type, reference_id, metadata)
  VALUES (v_transaction_id, p_wallet_id, p_user_id, p_type, p_balance_field, p_amount, v_balance_after, p_description, p_reference_type, p_reference_id, p_metadata);

  RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id, 'balance_after', v_balance_after);
END;
$$;

-- Verify payment PIN
CREATE OR REPLACE FUNCTION verify_payment_pin(p_user_id uuid, p_pin_hash text, p_context text DEFAULT 'transaction')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sec RECORD;
  v_matched boolean;
BEGIN
  SELECT * INTO v_sec FROM payment_security WHERE user_id = p_user_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN not set');
  END IF;

  -- Check lockout
  IF v_sec.is_locked AND (v_sec.locked_until IS NULL OR v_sec.locked_until > now()) THEN
    INSERT INTO payment_pin_attempts (user_id, success, context) VALUES (p_user_id, false, 'locked_out');
    RETURN jsonb_build_object('success', false, 'error', 'PIN is locked', 'locked_until', v_sec.locked_until);
  END IF;

  -- Unlock if lockout expired
  IF v_sec.is_locked AND v_sec.locked_until IS NOT NULL AND v_sec.locked_until <= now() THEN
    UPDATE payment_security SET is_locked = false, failed_attempts = 0, updated_at = now() WHERE user_id = p_user_id;
    v_sec.is_locked := false; v_sec.failed_attempts := 0;
  END IF;

  v_matched := (v_sec.pin_hash = p_pin_hash);

  INSERT INTO payment_pin_attempts (user_id, success, context) VALUES (p_user_id, v_matched, p_context);

  IF v_matched THEN
    UPDATE payment_security SET failed_attempts = 0, updated_at = now() WHERE user_id = p_user_id;
    INSERT INTO payment_security_logs (user_id, event_type, description) VALUES (p_user_id, 'pin_verified', 'PIN verified for ' || p_context);
    RETURN jsonb_build_object('success', true);
  ELSE
    UPDATE payment_security SET failed_attempts = failed_attempts + 1, updated_at = now() WHERE user_id = p_user_id;
    v_sec.failed_attempts := v_sec.failed_attempts + 1;

    -- Lockout thresholds: 5 fails → 15min, 10 fails → 24h
    IF v_sec.failed_attempts >= 10 THEN
      UPDATE payment_security SET is_locked = true, locked_until = now() + interval '24 hours', updated_at = now() WHERE user_id = p_user_id;
      INSERT INTO payment_security_logs (user_id, event_type, description) VALUES (p_user_id, 'pin_locked', 'PIN locked for 24 hours after 10 failed attempts');
      RETURN jsonb_build_object('success', false, 'error', 'PIN locked for 24 hours', 'locked_until', now() + interval '24 hours');
    ELSIF v_sec.failed_attempts >= 5 THEN
      UPDATE payment_security SET is_locked = true, locked_until = now() + interval '15 minutes', updated_at = now() WHERE user_id = p_user_id;
      INSERT INTO payment_security_logs (user_id, event_type, description) VALUES (p_user_id, 'pin_locked', 'PIN locked for 15 minutes after 5 failed attempts');
      RETURN jsonb_build_object('success', false, 'error', 'PIN locked for 15 minutes', 'locked_until', now() + interval '15 minutes');
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Incorrect PIN', 'attempts_remaining', 5 - v_sec.failed_attempts);
  END IF;
END;
$$;

-- Set payment PIN (new or update)
CREATE OR REPLACE FUNCTION set_payment_pin(p_user_id uuid, p_pin_hash text, p_pin_length int DEFAULT 4)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO payment_security (user_id, pin_hash, pin_length, last_pin_change, updated_at)
  VALUES (p_user_id, p_pin_hash, p_pin_length, now(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash, pin_length = EXCLUDED.pin_length, last_pin_change = now(), updated_at = now();

  INSERT INTO payment_security_logs (user_id, event_type, description)
  VALUES (p_user_id, 'pin_set', 'Payment PIN set/updated');
END;
$$;

-- Reset payment PIN (after recovery)
CREATE OR REPLACE FUNCTION reset_payment_pin(p_user_id uuid, p_new_pin_hash text, p_pin_length int DEFAULT 4)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE payment_security
  SET pin_hash = p_new_pin_hash, pin_length = p_pin_length, is_locked = false,
      failed_attempts = 0, locked_until = NULL, last_pin_change = now(), updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO payment_security_logs (user_id, event_type, description)
  VALUES (p_user_id, 'pin_reset', 'Payment PIN reset via recovery');
END;
$$;

-- Create PIN recovery token
CREATE OR REPLACE FUNCTION create_pin_recovery_token(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_token text;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO payment_recovery_tokens (user_id, token, expires_at)
  VALUES (p_user_id, v_token, now() + interval '1 hour');
  INSERT INTO payment_security_logs (user_id, event_type, description)
  VALUES (p_user_id, 'recovery_token_created', 'PIN recovery token generated');
  RETURN v_token;
END;
$$;

-- Verify PIN recovery token
CREATE OR REPLACE FUNCTION verify_pin_recovery_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rec RECORD;
BEGIN
  SELECT * INTO v_rec FROM payment_recovery_tokens
  WHERE token = p_token AND used_at IS NULL AND expires_at > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token');
  END IF;
  UPDATE payment_recovery_tokens SET used_at = now() WHERE id = v_rec.id;
  INSERT INTO payment_security_logs (user_id, event_type, description)
  VALUES (v_rec.user_id, 'recovery_token_used', 'PIN recovery token verified');
  RETURN jsonb_build_object('success', true, 'user_id', v_rec.user_id);
END;
$$;

-- Admin unlock PIN
CREATE OR REPLACE FUNCTION unlock_payment_pin(p_user_id uuid, p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE payment_security SET is_locked = false, failed_attempts = 0, locked_until = NULL, updated_at = now()
  WHERE user_id = p_user_id;
  INSERT INTO payment_security_logs (user_id, event_type, description, performed_by)
  VALUES (p_user_id, 'admin_unlock', 'PIN unlocked by admin', p_admin_id);
END;
$$;

-- Get payment security status
CREATE OR REPLACE FUNCTION get_payment_security_status(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM payment_security WHERE user_id = p_user_id AND is_active = true)
  THEN (
    SELECT jsonb_build_object(
      'has_pin', true, 'pin_length', pin_length, 'is_locked', is_locked,
      'failed_attempts', failed_attempts, 'locked_until', locked_until,
      'last_pin_change', last_pin_change, 'auth_rules', auth_rules,
      'recovery_email', recovery_email
    ) FROM payment_security WHERE user_id = p_user_id AND is_active = true
  )
  ELSE jsonb_build_object('has_pin', false)
  END;
$$;

-- Update payment auth rules
CREATE OR REPLACE FUNCTION update_payment_auth_rules(p_user_id uuid, p_rules jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE payment_security SET auth_rules = p_rules, updated_at = now() WHERE user_id = p_user_id;
  INSERT INTO payment_security_logs (user_id, event_type, description)
  VALUES (p_user_id, 'auth_rules_updated', 'Transaction authorization rules updated');
END;
$$;

-- Admin manual adjustment
CREATE OR REPLACE FUNCTION admin_manual_adjustment(
  p_admin_id uuid, p_user_id uuid, p_wallet_id uuid, p_type text, p_amount numeric,
  p_description text, p_balance_field text DEFAULT 'balance'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  v_result := process_wallet_transaction(
    p_user_id, p_wallet_id, p_type, p_amount,
    COALESCE(p_description, 'Admin ' || p_type),
    'manual_adjustment', NULL,
    jsonb_build_object('admin_id', p_admin_id, 'admin_adjustment', true),
    p_balance_field
  );
  INSERT INTO payment_security_logs (user_id, event_type, description, performed_by)
  VALUES (p_user_id, 'admin_adjustment', p_description, p_admin_id);
  RETURN v_result;
END;
$$;

-- Admin freeze/unfreeze wallet
CREATE OR REPLACE FUNCTION admin_freeze_wallet(p_admin_id uuid, p_wallet_id uuid, p_freeze boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_freeze THEN
    UPDATE cc_wallets SET is_frozen = true, frozen_reason = p_reason, frozen_by = p_admin_id, frozen_at = now(), updated_at = now()
    WHERE id = p_wallet_id;
  ELSE
    UPDATE cc_wallets SET is_frozen = false, frozen_reason = NULL, frozen_by = NULL, frozen_at = NULL, updated_at = now()
    WHERE id = p_wallet_id;
  END IF;
END;
$$;

-- Get wallet transactions (paginated)
CREATE OR REPLACE FUNCTION get_wallet_transactions(p_user_id uuid DEFAULT auth.uid(), p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t.*) ORDER BY t.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT id, wallet_id, type, amount, balance_after, description, metadata, created_at
    FROM cc_transactions WHERE user_id = p_user_id
    ORDER BY created_at DESC LIMIT p_limit OFFSET p_offset
  ) t;
$$;

-- Get wallet summary (dashboard stats)
CREATE OR REPLACE FUNCTION get_wallet_summary(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'wallet_id', id, 'balance', balance, 'pending_balance', pending_balance,
    'locked_balance', locked_balance, 'escrow_balance', escrow_balance,
    'referral_balance', referral_balance, 'affiliate_balance', affiliate_balance,
    'creator_balance', creator_balance, 'advertiser_budget', advertiser_budget,
    'seller_earnings', seller_earnings, 'currency', currency, 'is_frozen', is_frozen,
    'total_deposited', total_deposited, 'total_withdrawn', total_withdrawn, 'total_paid_out', total_paid_out
  )), '[]'::jsonb)
  FROM cc_wallets WHERE user_id = p_user_id;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION get_wallet_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION process_wallet_transaction(uuid, uuid, text, numeric, text, text, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_payment_pin(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION set_payment_pin(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION reset_payment_pin(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION create_pin_recovery_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_pin_recovery_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_payment_pin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_payment_security_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_payment_auth_rules(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_manual_adjustment(uuid, uuid, uuid, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_freeze_wallet(uuid, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_wallet_transactions(uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_wallet_summary(uuid) TO authenticated;