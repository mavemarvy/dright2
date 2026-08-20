/*
# Referral System — Multi-Level Rewards & Analytics

This migration adds the new DRIGHT referral system with 3-level commission tracking,
qualification windows (buyer 14 days, vendor 30 days), auto-expiration, anti-fraud logging,
and per-user stats aggregation. It is an incremental addition — existing referral_links,
referrals, sales_records, and users tables are NOT modified.

## 1. New Tables

### referral_relationships
Stores the multi-level chain: who referred whom, at which level (1-3).
- `id` (uuid PK)
- `referrer_id` (uuid, FK auth.users) — the earning user
- `referred_id` (uuid, FK auth.users) — the user who was referred
- `level` (int 1-3) — 1 = direct, 2 = referral of referral, 3 = third level
- `created_at` (timestamptz default now())

### referral_rewards
One-time rewards generated from platform fees. Each reward is tied to a qualifying
action (first_purchase or first_sale) of a referred user.
- `id` (uuid PK)
- `referrer_id` (uuid, FK auth.users) — who earns the reward
- `referred_user_id` (uuid, FK auth.users) — whose action triggered it
- `level` (int 1-3)
- `transaction_id` (uuid, nullable) — linked sales_records row
- `reward_amount` (numeric 12,2) — calculated from DRIGHT platform fee
- `reward_type` (text: 'first_purchase' | 'first_sale')
- `status` (text: 'pending' | 'confirmed' | 'expired' | 'paid', default 'pending')
- `expires_at` (timestamptz) — buyer: reg+14d, vendor: reg+30d
- `created_at` (timestamptz default now())
- `paid_at` (timestamptz, nullable)

### referral_stats
Cached per-user referral analytics (single row per user).
- `user_id` (uuid PK, FK auth.users)
- `total_referrals` (int default 0)
- `active_referrals` (int default 0)
- `total_earned` (numeric 12,2 default 0)
- `pending_earnings` (numeric 12,2 default 0)
- `withdrawable_earnings` (numeric 12,2 default 0)

### referral_fraud_logs
Admin-visible log of blocked referral reward attempts.
- `id` (uuid PK)
- `referrer_id` (uuid, nullable, FK auth.users)
- `referred_user_id` (uuid, nullable, FK auth.users)
- `reason` (text) — 'self_referral' | 'same_device' | 'same_payment' | 'refunded' | 'chargeback' | 'banned_account'
- `details` (jsonb, nullable)
- `created_at` (timestamptz default now())

## 2. Indexes
- referral_relationships: referrer_id, referred_id, created_at
- referral_rewards: referrer_id, status, created_at
- referral_stats: (PK covers user_id)
- referral_fraud_logs: referrer_id, created_at

## 3. Security (RLS)
All tables ENABLE RLS.
- referral_relationships: referrer reads own (as referrer or referred); insert by authenticated.
- referral_rewards: user reads own rewards; insert by authenticated.
- referral_stats: user reads own stats; insert/update by authenticated (upsert).
- referral_fraud_logs: SELECT restricted to admins (is_admin = true); insert by authenticated.

## 4. RPCs
- `expire_referral_rewards()` — marks pending rewards past expires_at as 'expired'.
  Safe to run periodically or on read.
- `refresh_referral_stats(p_user_id uuid)` — recomputes a user's referral_stats row
  from referral_relationships + referral_rewards and upserts it.

## 5. Important Notes
1. Commission is calculated from the DRIGHT platform fee, NOT the full product price.
   Level 1 = 10% of fee, Level 2 = 5%, Level 3 = 1%. No rewards beyond Level 3.
2. Rewards are one-time only: a referred user triggers at most one first_purchase
   and one first_sale reward across the chain.
3. Qualification windows: buyers 14 days, vendors 30 days from registration.
   If the action doesn't happen in the window, the reward expires permanently.
4. Existing referral_links / referrals tables are untouched — this is additive.
*/

-- =========================================================
-- 1. referral_relationships
-- =========================================================
CREATE TABLE IF NOT EXISTS referral_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level int NOT NULL CHECK (level BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_relationships ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_refrel_referrer ON referral_relationships(referrer_id);
CREATE INDEX IF NOT EXISTS idx_refrel_referred ON referral_relationships(referred_id);
CREATE INDEX IF NOT EXISTS idx_refrel_created ON referral_relationships(created_at);

DROP POLICY IF EXISTS "refrel_select_own" ON referral_relationships;
CREATE POLICY "refrel_select_own" ON referral_relationships FOR SELECT
  TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

DROP POLICY IF EXISTS "refrel_insert_own" ON referral_relationships;
CREATE POLICY "refrel_insert_own" ON referral_relationships FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- =========================================================
-- 2. referral_rewards
-- =========================================================
CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level int NOT NULL CHECK (level BETWEEN 1 AND 3),
  transaction_id uuid,
  reward_amount numeric(12,2) NOT NULL DEFAULT 0,
  reward_type text NOT NULL CHECK (reward_type IN ('first_purchase','first_sale')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','expired','paid')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_refrew_referrer ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_refrew_status ON referral_rewards(status);
CREATE INDEX IF NOT EXISTS idx_refrew_created ON referral_rewards(created_at);

DROP POLICY IF EXISTS "refrew_select_own" ON referral_rewards;
CREATE POLICY "refrew_select_own" ON referral_rewards FOR SELECT
  TO authenticated USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "refrew_insert_own" ON referral_rewards;
CREATE POLICY "refrew_insert_own" ON referral_rewards FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "refrew_update_own" ON referral_rewards;
CREATE POLICY "refrew_update_own" ON referral_rewards FOR UPDATE
  TO authenticated USING (auth.uid() = referrer_id) WITH CHECK (auth.uid() = referrer_id);

-- =========================================================
-- 3. referral_stats
-- =========================================================
CREATE TABLE IF NOT EXISTS referral_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_referrals int NOT NULL DEFAULT 0,
  active_referrals int NOT NULL DEFAULT 0,
  total_earned numeric(12,2) NOT NULL DEFAULT 0,
  pending_earnings numeric(12,2) NOT NULL DEFAULT 0,
  withdrawable_earnings numeric(12,2) NOT NULL DEFAULT 0
);

ALTER TABLE referral_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refstats_select_own" ON referral_stats;
CREATE POLICY "refstats_select_own" ON referral_stats FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "refstats_upsert_own" ON referral_stats;
CREATE POLICY "refstats_upsert_own" ON referral_stats FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "refstats_update_own" ON referral_stats;
CREATE POLICY "refstats_update_own" ON referral_stats FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- 4. referral_fraud_logs
-- =========================================================
CREATE TABLE IF NOT EXISTS referral_fraud_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_fraud_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reffraud_referrer ON referral_fraud_logs(referrer_id);
CREATE INDEX IF NOT EXISTS idx_reffraud_created ON referral_fraud_logs(created_at);

-- Admins can read fraud logs
DROP POLICY IF EXISTS "reffraud_select_admin" ON referral_fraud_logs;
CREATE POLICY "reffraud_select_admin" ON referral_fraud_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- Authenticated users can insert fraud log entries (e.g. checkout edge function)
DROP POLICY IF EXISTS "reffraud_insert_auth" ON referral_fraud_logs;
CREATE POLICY "reffraud_insert_auth" ON referral_fraud_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- =========================================================
-- 5. RPC: expire_referral_rewards()
--    Marks pending rewards past their expires_at as 'expired'.
-- =========================================================
CREATE OR REPLACE FUNCTION expire_referral_rewards()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE referral_rewards
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;

-- =========================================================
-- 6. RPC: refresh_referral_stats(p_user_id uuid)
--    Recomputes and upserts a user's referral_stats row.
-- =========================================================
CREATE OR REPLACE FUNCTION refresh_referral_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total int;
  v_active int;
  v_total_earned numeric(12,2);
  v_pending numeric(12,2);
  v_withdrawable numeric(12,2);
BEGIN
  -- Total direct (level 1) referrals
  SELECT count(*) INTO v_total
  FROM referral_relationships
  WHERE referrer_id = p_user_id AND level = 1;

  -- Active = level-1 referrals whose latest reward is not expired
  SELECT count(DISTINCT r.referred_id) INTO v_active
  FROM referral_relationships r
  WHERE r.referrer_id = p_user_id AND r.level = 1
    AND EXISTS (
      SELECT 1 FROM referral_rewards rw
      WHERE rw.referrer_id = p_user_id AND rw.referred_user_id = r.referred_id
        AND rw.status IN ('pending','confirmed','paid')
    );

  -- Earnings aggregation
  SELECT
    COALESCE(sum(reward_amount), 0),
    COALESCE(sum(reward_amount) FILTER (WHERE status = 'pending'), 0),
    COALESCE(sum(reward_amount) FILTER (WHERE status IN ('confirmed','paid')), 0)
  INTO v_total_earned, v_pending, v_withdrawable
  FROM referral_rewards
  WHERE referrer_id = p_user_id;

  INSERT INTO referral_stats (user_id, total_referrals, active_referrals, total_earned, pending_earnings, withdrawable_earnings)
  VALUES (p_user_id, v_total, v_active, v_total_earned, v_pending, v_withdrawable)
  ON CONFLICT (user_id) DO UPDATE SET
    total_referrals = EXCLUDED.total_referrals,
    active_referrals = EXCLUDED.active_referrals,
    total_earned = EXCLUDED.total_earned,
    pending_earnings = EXCLUDED.pending_earnings,
    withdrawable_earnings = EXCLUDED.withdrawable_earnings;
END;
$$;
