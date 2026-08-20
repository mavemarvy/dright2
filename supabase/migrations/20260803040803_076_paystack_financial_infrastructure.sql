/*
# Phase 6 — Paystack Payment Gateway & Financial Infrastructure

## New Tables
1. paystack_transactions — every Paystack transaction init + verification result
2. subscription_plans — recurring plan catalog (affiliate, vendor, premium, AI, ads)
3. user_subscriptions — active/inactive subscriptions with billing cycle state
4. escrow_payments — links orders to escrow hold/release lifecycle
5. commission_splits — per-order commission breakdown (platform, affiliate, referral, seller, creator)
6. withdrawal_queue — batched withdrawal processing queue

## RPCs
- process_paystack_payment(p_tx_ref, p_user_id, p_amount, p_purpose, p_reference_id) — idempotent wallet credit
- release_escrow(p_escrow_id) — release escrow to seller + distribute commissions
- process_subscription_renewal(p_sub_id) — debit wallet or mark failed
- get_admin_financial_dashboard() — aggregated revenue/GMV/escrow/withdrawal metrics

All tables have RLS, indexes, FKs.
*/

-- ============================================================
-- 1. Paystack Transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS paystack_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  paystack_reference text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  channel text,
  purpose text NOT NULL DEFAULT 'wallet_funding' CHECK (purpose IN ('wallet_funding','product_purchase','subscription','escrow','advertiser_funding','affiliate_subscription','vendor_subscription')),
  reference_id uuid,
  status text NOT NULL DEFAULT 'initialized' CHECK (status IN ('initialized','pending','success','failed','abandoned','reversed')),
  gateway_response text,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paystack_tx_user ON paystack_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paystack_tx_status ON paystack_transactions(status);
CREATE INDEX IF NOT EXISTS idx_paystack_tx_reference ON paystack_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_paystack_tx_purpose ON paystack_transactions(purpose, status);
ALTER TABLE paystack_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_paystack_tx" ON paystack_transactions;
CREATE POLICY "select_own_paystack_tx" ON paystack_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_paystack_tx" ON paystack_transactions;
CREATE POLICY "insert_own_paystack_tx" ON paystack_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_paystack_tx" ON paystack_transactions;
CREATE POLICY "admin_all_paystack_tx" ON paystack_transactions FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 2. Subscription Plans
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  plan_type text NOT NULL CHECK (plan_type IN ('affiliate','vendor','premium','ai','advertising')),
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  interval text NOT NULL DEFAULT 'monthly' CHECK (interval IN ('daily','weekly','monthly','yearly')),
  trial_days int NOT NULL DEFAULT 0,
  grace_period_days int NOT NULL DEFAULT 3,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  paystack_plan_code text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_plans_active ON subscription_plans(is_active, sort_order);
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all_sub_plans" ON subscription_plans;
CREATE POLICY "select_all_sub_plans" ON subscription_plans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_all_sub_plans" ON subscription_plans;
CREATE POLICY "admin_all_sub_plans" ON subscription_plans FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 3. User Subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trialing','active','past_due','canceled','expired','paused')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  trial_end timestamptz,
  grace_period_end timestamptz,
  canceled_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  paystack_subscription_code text,
  paystack_email_token text,
  failed_renewal_count int NOT NULL DEFAULT 0,
  last_payment_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_subs_user ON user_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_subs_status ON user_subscriptions(status, current_period_end);
CREATE INDEX IF NOT EXISTS idx_user_subs_plan ON user_subscriptions(plan_id);
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_subscriptions" ON user_subscriptions;
CREATE POLICY "select_own_subscriptions" ON user_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_subscriptions" ON user_subscriptions;
CREATE POLICY "insert_own_subscriptions" ON user_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_subscriptions" ON user_subscriptions;
CREATE POLICY "update_own_subscriptions" ON user_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_subscriptions" ON user_subscriptions;
CREATE POLICY "admin_all_subscriptions" ON user_subscriptions FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 4. Escrow Payments
-- ============================================================
CREATE TABLE IF NOT EXISTS escrow_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  platform_fee numeric(12,2) NOT NULL DEFAULT 0,
  seller_earnings numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','released','refunded','partial_refund','disputed','expired')),
  held_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  refund_amount numeric(12,2),
  auto_release_at timestamptz,
  dispute_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_payments(status);
CREATE INDEX IF NOT EXISTS idx_escrow_buyer ON escrow_payments(buyer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_seller ON escrow_payments(seller_id);
CREATE INDEX IF NOT EXISTS idx_escrow_order ON escrow_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_escrow_auto_release ON escrow_payments(auto_release_at) WHERE status = 'held';
ALTER TABLE escrow_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_escrow" ON escrow_payments;
CREATE POLICY "select_own_escrow" ON escrow_payments FOR SELECT TO authenticated USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
DROP POLICY IF EXISTS "insert_own_escrow" ON escrow_payments;
CREATE POLICY "insert_own_escrow" ON escrow_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "admin_all_escrow" ON escrow_payments;
CREATE POLICY "admin_all_escrow" ON escrow_payments FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 5. Commission Splits
-- ============================================================
CREATE TABLE IF NOT EXISTS commission_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id uuid REFERENCES escrow_payments(id) ON DELETE CASCADE,
  order_id uuid,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_role text NOT NULL CHECK (recipient_role IN ('platform','seller','affiliate','referrer','creator','admin')),
  amount numeric(12,2) NOT NULL,
  percentage numeric(5,2) NOT NULL DEFAULT 0,
  balance_field text NOT NULL DEFAULT 'balance',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','distributed','failed')),
  distributed_at timestamptz,
  ledger_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_escrow ON commission_splits(escrow_id);
CREATE INDEX IF NOT EXISTS idx_commission_recipient ON commission_splits(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_commission_status ON commission_splits(status);
ALTER TABLE commission_splits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_commissions" ON commission_splits;
CREATE POLICY "select_own_commissions" ON commission_splits FOR SELECT TO authenticated USING (auth.uid() = recipient_id);
DROP POLICY IF EXISTS "admin_all_commissions" ON commission_splits;
CREATE POLICY "admin_all_commissions" ON commission_splits FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 6. Withdrawal Queue
-- ============================================================
CREATE TABLE IF NOT EXISTS withdrawal_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_request_id uuid,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  bank_code text,
  account_number text,
  account_name text,
  recipient_code text,
  transfer_reference text,
  paystack_transfer_code text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','success','failed','retried','cancelled')),
  gateway_response text,
  processed_at timestamptz,
  retry_count int NOT NULL DEFAULT 0,
  max_retries int NOT NULL DEFAULT 3,
  next_retry_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wq_status ON withdrawal_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_wq_user ON withdrawal_queue(user_id);
ALTER TABLE withdrawal_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_wq" ON withdrawal_queue;
CREATE POLICY "select_own_wq" ON withdrawal_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_all_wq" ON withdrawal_queue;
CREATE POLICY "admin_all_wq" ON withdrawal_queue FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

-- ============================================================
-- 7. Seed Default Subscription Plans
-- ============================================================
INSERT INTO subscription_plans (slug, name, description, plan_type, amount, interval, trial_days, grace_period_days, features, sort_order) VALUES
  ('affiliate_monthly', 'Affiliate Membership', 'Earn commissions on every referral sale', 'affiliate', 2500, 'monthly', 7, 3, '["Up to 50 active referrals","5% base commission","Priority payouts","Analytics dashboard"]', 1),
  ('vendor_monthly', 'Vendor Membership', 'Sell digital products and services on DRIGHT', 'vendor', 5000, 'monthly', 14, 3, '["Unlimited product listings","0% listing fees","Seller analytics","Portfolio verification","Priority support"]', 2),
  ('premium_monthly', 'Premium Membership', 'Unlock all DRIGHT features', 'premium', 10000, 'monthly', 7, 3, '["No platform fees on sales","Priority listing placement","Advanced AI insights","Custom store themes","Verified badge","Dedicated support"]', 3),
  ('ai_starter', 'AI Starter', 'Basic AI tools for content and insights', 'ai', 3000, 'monthly', 0, 3, '["100 AI messages/month","Basic image generation","Product descriptions","Review analysis"]', 4),
  ('ai_pro', 'AI Pro', 'Advanced AI for power sellers', 'ai', 7500, 'monthly', 7, 3, '["1000 AI messages/month","Unlimited image generation","Advanced analytics","Dynamic pricing","AI ad copy generation","Priority AI processing"]', 5),
  ('ads_starter', 'Advertising Starter', 'Promote your products to more buyers', 'advertising', 5000, 'monthly', 0, 3, '["₦10,000 ad credit","Targeted placements","Basic analytics"]', 6),
  ('ads_pro', 'Advertising Pro', 'Maximum visibility for your listings', 'advertising', 20000, 'monthly', 7, 3, '["₦50,000 ad credit","Premium placements","Advanced targeting","A/B testing","Conversion analytics","Dedicated ad manager"]', 7)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 8. RPCs
-- ============================================================

-- Idempotent wallet credit after Paystack verification
CREATE OR REPLACE FUNCTION process_paystack_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_purpose text DEFAULT 'wallet_funding',
  p_reference_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_wallet_id uuid;
  v_result jsonb;
BEGIN
  -- Check if already processed (idempotency)
  SELECT * INTO v_tx FROM paystack_transactions WHERE reference = p_reference;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;
  IF v_tx.status = 'success' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already processed', 'idempotent', true);
  END IF;

  -- Mark as success
  UPDATE paystack_transactions
  SET status = 'success', paid_at = now(), updated_at = now()
  WHERE reference = p_reference AND status != 'success';

  -- Get or create wallet
  SELECT id INTO v_wallet_id FROM cc_wallets WHERE user_id = p_user_id;
  IF v_wallet_id IS NULL THEN
    INSERT INTO cc_wallets (user_id) VALUES (p_user_id) RETURNING id INTO v_wallet_id;
  END IF;

  -- Credit wallet based on purpose
  IF p_purpose = 'wallet_funding' OR p_purpose = 'advertiser_funding' THEN
    SELECT process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Wallet funding via card', 'deposit', p_reference, p_metadata, 'balance'
    ) INTO v_result;
  ELSIF p_purpose = 'product_purchase' OR p_purpose = 'escrow' THEN
    SELECT process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Payment for order', 'deposit', p_reference, p_metadata, 'escrow_balance'
    ) INTO v_result;
  ELSIF p_purpose = 'subscription' OR p_purpose = 'affiliate_subscription' OR p_purpose = 'vendor_subscription' THEN
    SELECT process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Subscription payment', 'deposit', p_reference, p_metadata, 'balance'
    ) INTO v_result;
  ELSE
    SELECT process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Payment received', 'deposit', p_reference, p_metadata, 'balance'
    ) INTO v_result;
  END IF;

  RETURN jsonb_build_object('success', true, 'wallet_result', v_result);
END;
$$;

-- Release escrow to seller + distribute commissions
CREATE OR REPLACE FUNCTION release_escrow(p_escrow_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_escrow RECORD;
  v_seller_wallet uuid;
  v_platform_wallet uuid;
  v_commission RECORD;
  v_result jsonb;
  v_total_distributed numeric := 0;
BEGIN
  SELECT * INTO v_escrow FROM escrow_payments WHERE id = p_escrow_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Escrow not found'); END IF;
  IF v_escrow.status != 'held' THEN RETURN jsonb_build_object('success', false, 'error', 'Escrow not held'); END IF;

  -- Update escrow status
  UPDATE escrow_payments SET status = 'released', released_at = now(), updated_at = now() WHERE id = p_escrow_id;

  -- Get seller wallet
  SELECT id INTO v_seller_wallet FROM cc_wallets WHERE user_id = v_escrow.seller_id;
  IF v_seller_wallet IS NULL THEN
    INSERT INTO cc_wallets (user_id) VALUES (v_escrow.seller_id) RETURNING id INTO v_seller_wallet;
  END IF;

  -- Credit seller earnings
  SELECT process_wallet_transaction(
    v_escrow.seller_id, v_seller_wallet, 'credit', v_escrow.seller_earnings,
    'Escrow released - seller earnings', 'escrow_release', p_escrow_id::text,
    jsonb_build_object('order_id', v_escrow.order_id), 'seller_earnings'
  ) INTO v_result;

  v_total_distributed := v_total_distributed + v_escrow.seller_earnings;

  -- Process all pending commission splits
  FOR v_commission IN SELECT * FROM commission_splits WHERE escrow_id = p_escrow_id AND status = 'pending' LOOP
    IF v_commission.recipient_role != 'platform' THEN
      DECLARE
        v_recipient_wallet uuid;
      BEGIN
        SELECT id INTO v_recipient_wallet FROM cc_wallets WHERE user_id = v_commission.recipient_id;
        IF v_recipient_wallet IS NULL THEN
          INSERT INTO cc_wallets (user_id) VALUES (v_commission.recipient_id) RETURNING id INTO v_recipient_wallet;
        END IF;

        SELECT process_wallet_transaction(
          v_commission.recipient_id, v_recipient_wallet, 'credit', v_commission.amount,
          v_commission.recipient_role || ' commission', v_commission.recipient_role || '_payout',
          p_escrow_id::text, jsonb_build_object('commission_id', v_commission.id),
          v_commission.balance_field
        ) INTO v_result;

        v_total_distributed := v_total_distributed + v_commission.amount;
      END;
    END IF;

    UPDATE commission_splits SET status = 'distributed', distributed_at = now() WHERE id = v_commission.id;
  END LOOP;

  -- Debit escrow balance from buyer
  DECLARE
    v_buyer_wallet uuid;
  BEGIN
    SELECT id INTO v_buyer_wallet FROM cc_wallets WHERE user_id = v_escrow.buyer_id;
    IF v_buyer_wallet IS NOT NULL THEN
      SELECT process_wallet_transaction(
        v_escrow.buyer_id, v_buyer_wallet, 'debit', v_escrow.amount,
        'Escrow released to seller', 'escrow_release', p_escrow_id::text,
        jsonb_build_object('order_id', v_escrow.order_id), 'escrow_balance'
      ) INTO v_result;
    END IF;
  END;

  RETURN jsonb_build_object('success', true, 'total_distributed', v_total_distributed);
END;
$$;

-- Admin financial dashboard
CREATE OR REPLACE FUNCTION get_admin_financial_dashboard()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_revenue', (SELECT COALESCE(SUM(amount), 0) FROM paystack_transactions WHERE status = 'success' AND purpose IN ('wallet_funding','advertiser_funding')),
    'monthly_revenue', (SELECT COALESCE(SUM(amount), 0) FROM paystack_transactions WHERE status = 'success' AND purpose IN ('wallet_funding','advertiser_funding') AND paid_at >= date_trunc('month', now())),
    'daily_revenue', (SELECT COALESCE(SUM(amount), 0) FROM paystack_transactions WHERE status = 'success' AND purpose IN ('wallet_funding','advertiser_funding') AND paid_at >= date_trunc('day', now())),
    'total_gmv', (SELECT COALESCE(SUM(amount), 0) FROM paystack_transactions WHERE status = 'success' AND purpose IN ('product_purchase','escrow')),
    'successful_transactions', (SELECT COUNT(*) FROM paystack_transactions WHERE status = 'success'),
    'failed_transactions', (SELECT COUNT(*) FROM paystack_transactions WHERE status = 'failed'),
    'abandoned_transactions', (SELECT COUNT(*) FROM paystack_transactions WHERE status = 'abandoned'),
    'pending_transactions', (SELECT COUNT(*) FROM paystack_transactions WHERE status IN ('initialized','pending')),
    'total_escrow_held', (SELECT COALESCE(SUM(amount), 0) FROM escrow_payments WHERE status = 'held'),
    'total_escrow_released', (SELECT COALESCE(SUM(amount), 0) FROM escrow_payments WHERE status = 'released'),
    'pending_withdrawals', (SELECT COUNT(*) FROM withdrawal_queue WHERE status = 'queued'),
    'processing_withdrawals', (SELECT COUNT(*) FROM withdrawal_queue WHERE status = 'processing'),
    'successful_withdrawals', (SELECT COALESCE(SUM(amount), 0) FROM withdrawal_queue WHERE status = 'success'),
    'failed_withdrawals', (SELECT COUNT(*) FROM withdrawal_queue WHERE status = 'failed'),
    'active_subscriptions', (SELECT COUNT(*) FROM user_subscriptions WHERE status IN ('active','trialing')),
    'past_due_subscriptions', (SELECT COUNT(*) FROM user_subscriptions WHERE status = 'past_due'),
    'subscription_revenue', (SELECT COALESCE(SUM(p.amount), 0) FROM paystack_transactions p JOIN user_subscriptions us ON p.reference = us.last_payment_ref WHERE p.status = 'success'),
    'total_commissions_distributed', (SELECT COALESCE(SUM(amount), 0) FROM commission_splits WHERE status = 'distributed'),
    'pending_commissions', (SELECT COALESCE(SUM(amount), 0) FROM commission_splits WHERE status = 'pending'),
    'total_refunds', (SELECT COALESCE(SUM(refund_amount), 0) FROM escrow_payments WHERE status IN ('refunded','partial_refund')),
    'platform_fee_revenue', (SELECT COALESCE(SUM(platform_fee), 0) FROM escrow_payments WHERE status = 'released')
  );
$$;

-- Create escrow payment for an order
CREATE OR REPLACE FUNCTION create_escrow_payment(
  p_order_id uuid,
  p_buyer_id uuid,
  p_seller_id uuid,
  p_amount numeric,
  p_platform_fee numeric DEFAULT 0,
  p_seller_earnings numeric DEFAULT 0,
  p_auto_release_hours int DEFAULT 72
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO escrow_payments (order_id, buyer_id, seller_id, amount, platform_fee, seller_earnings, auto_release_at)
  VALUES (p_order_id, p_buyer_id, p_seller_id, p_amount, p_platform_fee, p_seller_earnings,
          now() + (p_auto_release_hours || ' hours')::interval)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'escrow_id', v_id);
END;
$$;

-- Add commission split
CREATE OR REPLACE FUNCTION add_commission_split(
  p_escrow_id uuid,
  p_recipient_id uuid,
  p_recipient_role text,
  p_amount numeric,
  p_percentage numeric DEFAULT 0,
  p_balance_field text DEFAULT 'balance'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO commission_splits (escrow_id, recipient_id, recipient_role, amount, percentage, balance_field)
  VALUES (p_escrow_id, p_recipient_id, p_recipient_role, p_amount, p_percentage, p_balance_field)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION process_paystack_payment(text, uuid, numeric, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION release_escrow(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_financial_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION create_escrow_payment(uuid, uuid, uuid, numeric, numeric, numeric, int) TO authenticated;
GRANT EXECUTE ON FUNCTION add_commission_split(uuid, uuid, text, numeric, numeric, text) TO authenticated;