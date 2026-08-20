/*
# DRIGHT Phase 4 — Coupons, Tokens, Vouchers & Reward Campaign System

## New Tables
1. coupons — Discount coupons, promotion credits, tokens, vouchers, gift codes
2. coupon_redemptions — Redemption records with validation
3. reward_wallets — Per-user wallet (credits, tokens, vouchers)
4. reward_transactions — Wallet transaction history
5. giveaway_campaigns — Giveaway campaign manager
6. giveaway_entries — User entries into giveaways
7. featured_listing_rewards — Featured placement rewards

## Security
- RLS on ALL tables.
- coupons: SELECT for authenticated (only active+published); CRUD for admins.
- coupon_redemptions: INSERT for authenticated (own); SELECT for own+admin.
- reward_wallets: SELECT for own; UPDATE via RPC only.
- reward_transactions: SELECT for own; INSERT via RPC.
- giveaway_campaigns: SELECT for authenticated; CRUD for admins.
- giveaway_entries: INSERT for authenticated (own); SELECT for own+admin.
- featured_listing_rewards: SELECT for authenticated; CRUD for admins.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. COUPONS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  reward_type text NOT NULL DEFAULT 'percentage_discount',
  -- percentage_discount | fixed_amount | promotion_credits | promotion_token | voucher | gift_code
  value numeric NOT NULL DEFAULT 0,
  -- For percentage: 1-100 (percent). For fixed: monetary amount. For credits: credit count.
  currency text NOT NULL DEFAULT 'USD',
  -- Rules
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  max_uses integer, -- NULL = unlimited
  uses_per_user integer NOT NULL DEFAULT 1,
  min_purchase_amount numeric NOT NULL DEFAULT 0,
  max_discount_amount numeric, -- cap for percentage discounts
  applicable_categories text[] DEFAULT '{}',
  applicable_sellers text[] DEFAULT '{}',
  applicable_listing_types text[] DEFAULT '{}',
  excluded_listings text[] DEFAULT '{}',
  excluded_categories text[] DEFAULT '{}',
  excluded_sellers text[] DEFAULT '{}',
  -- Promotion-specific
  promotion_restrictions jsonb,
  -- State
  is_active boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  current_uses integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_published_coupons" ON coupons;
CREATE POLICY "select_published_coupons"
  ON coupons FOR SELECT TO authenticated
  USING (is_published AND is_active AND NOT is_archived OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_coupons" ON coupons;
CREATE POLICY "admin_insert_coupons"
  ON coupons FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_update_coupons" ON coupons;
CREATE POLICY "admin_update_coupons"
  ON coupons FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_delete_coupons" ON coupons;
CREATE POLICY "admin_delete_coupons"
  ON coupons FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, is_published, is_archived);
CREATE INDEX IF NOT EXISTS idx_coupons_dates ON coupons(start_date, end_date);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. COUPON REDEMPTIONS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid,
  order_id uuid,
  original_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  final_amount numeric NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_own_redemptions" ON coupon_redemptions;
CREATE POLICY "insert_own_redemptions"
  ON coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_redemptions" ON coupon_redemptions;
CREATE POLICY "select_own_redemptions"
  ON coupon_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_redemptions_coupon ON coupon_redemptions(coupon_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON coupon_redemptions(user_id, redeemed_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. REWARD WALLETS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reward_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  promotion_credits numeric NOT NULL DEFAULT 0,
  promotion_tokens integer NOT NULL DEFAULT 0,
  voucher_count integer NOT NULL DEFAULT 0,
  gift_code_count integer NOT NULL DEFAULT 0,
  total_saved numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reward_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wallet" ON reward_wallets;
CREATE POLICY "select_own_wallet"
  ON reward_wallets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_update_wallets" ON reward_wallets;
CREATE POLICY "admin_update_wallets"
  ON reward_wallets FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_user ON reward_wallets(user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4. REWARD TRANSACTIONS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reward_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  -- credit_added | credit_spent | token_added | token_spent | voucher_received | voucher_used | gift_received | gift_used | coupon_redeemed | reward_expired
  reward_type text,
  amount numeric NOT NULL DEFAULT 0,
  coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
  description text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reward_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transactions" ON reward_transactions;
CREATE POLICY "select_own_transactions"
  ON reward_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "insert_own_transactions" ON reward_transactions;
CREATE POLICY "insert_own_transactions"
  ON reward_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_reward_tx_user ON reward_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_tx_type ON reward_transactions(transaction_type);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. GIVEAWAY CAMPAIGNS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS giveaway_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  giveaway_type text NOT NULL DEFAULT 'random_winners',
  -- holiday | referral | seller_challenge | affiliate_competition | first_n_users | random_winners
  reward_type text NOT NULL,
  reward_value numeric NOT NULL DEFAULT 0,
  reward_coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL,
  max_winners integer NOT NULL DEFAULT 1,
  max_entries integer,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  -- active | paused | completed | cancelled
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE giveaway_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_giveaways" ON giveaway_campaigns;
CREATE POLICY "select_giveaways"
  ON giveaway_campaigns FOR SELECT TO authenticated
  USING (status = 'active' OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_insert_giveaways" ON giveaway_campaigns;
CREATE POLICY "admin_insert_giveaways"
  ON giveaway_campaigns FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_update_giveaways" ON giveaway_campaigns;
CREATE POLICY "admin_update_giveaways"
  ON giveaway_campaigns FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_delete_giveaways" ON giveaway_campaigns;
CREATE POLICY "admin_delete_giveaways"
  ON giveaway_campaigns FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_giveaways_status ON giveaway_campaigns(status, start_date, end_date);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. GIVEAWAY ENTRIES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES giveaway_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_winner boolean NOT NULL DEFAULT false,
  entry_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(giveaway_id, user_id)
);

ALTER TABLE giveaway_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_own_entries" ON giveaway_entries;
CREATE POLICY "insert_own_entries"
  ON giveaway_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_entries" ON giveaway_entries;
CREATE POLICY "select_own_entries"
  ON giveaway_entries FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_update_entries" ON giveaway_entries;
CREATE POLICY "admin_update_entries"
  ON giveaway_entries FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_entries_giveaway ON giveaway_entries(giveaway_id, created_at);
CREATE INDEX IF NOT EXISTS idx_entries_winners ON giveaway_entries(giveaway_id) WHERE is_winner = true;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. FEATURED LISTING REWARDS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS featured_listing_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL,
  listing_type text NOT NULL DEFAULT 'product',
  reward_type text NOT NULL DEFAULT 'homepage_feature',
  -- featured_placement | homepage_feature | category_spotlight | trending_highlight | recommendation_boost
  duration_days integer NOT NULL DEFAULT 7,
  start_date timestamptz NOT NULL DEFAULT now(),
  end_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  -- active | expired | revoked
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE featured_listing_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_featured_rewards" ON featured_listing_rewards;
CREATE POLICY "select_featured_rewards"
  ON featured_listing_rewards FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_insert_featured_rewards" ON featured_listing_rewards;
CREATE POLICY "admin_insert_featured_rewards"
  ON featured_listing_rewards FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_update_featured_rewards" ON featured_listing_rewards;
CREATE POLICY "admin_update_featured_rewards"
  ON featured_listing_rewards FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

DROP POLICY IF EXISTS "admin_delete_featured_rewards" ON featured_listing_rewards;
CREATE POLICY "admin_delete_featured_rewards"
  ON featured_listing_rewards FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

CREATE INDEX IF NOT EXISTS idx_featured_active ON featured_listing_rewards(listing_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_featured_end ON featured_listing_rewards(end_date) WHERE status = 'active';

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Validate and redeem coupon
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION validate_coupon(p_code text, p_user_id uuid, p_amount numeric, p_listing_id uuid DEFAULT NULL)
RETURNS TABLE(valid boolean, discount_amount numeric, message text, coupon_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  user_uses integer;
BEGIN
  SELECT * INTO c FROM coupons WHERE code = UPPER(p_code) AND is_active = true AND is_published = true AND is_archived = false;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::numeric, 'Coupon not found or inactive', NULL::uuid;
    RETURN;
  END IF;

  IF c.start_date > now() THEN
    RETURN QUERY SELECT false, 0::numeric, 'Coupon not yet active', NULL::uuid;
    RETURN;
  END IF;

  IF c.end_date IS NOT NULL AND c.end_date < now() THEN
    RETURN QUERY SELECT false, 0::numeric, 'Coupon has expired', NULL::uuid;
    RETURN;
  END IF;

  IF c.max_uses IS NOT NULL AND c.current_uses >= c.max_uses THEN
    RETURN QUERY SELECT false, 0::numeric, 'Coupon usage limit reached', NULL::uuid;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO user_uses FROM coupon_redemptions WHERE coupon_id = c.id AND user_id = p_user_id;
  IF user_uses >= c.uses_per_user THEN
    RETURN QUERY SELECT false, 0::numeric, 'You have already used this coupon', NULL::uuid;
    RETURN;
  END IF;

  IF p_amount < c.min_purchase_amount THEN
    RETURN QUERY SELECT false, 0::numeric, 'Minimum purchase amount not met', NULL::uuid;
    RETURN;
  END IF;

  DECLARE
    calc_discount numeric;
  BEGIN
    IF c.reward_type = 'percentage_discount' THEN
      calc_discount := (p_amount * c.value / 100);
      IF c.max_discount_amount IS NOT NULL AND calc_discount > c.max_discount_amount THEN
        calc_discount := c.max_discount_amount;
      END IF;
    ELSIF c.reward_type = 'fixed_amount' THEN
      calc_discount := LEAST(c.value, p_amount);
    ELSE
      calc_discount := 0;
    END IF;

    RETURN QUERY SELECT true, calc_discount, 'Coupon applied successfully', c.id;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_coupon(text, uuid, numeric, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: Redeem coupon (atomic: validate + insert + increment)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION redeem_coupon(p_code text, p_user_id uuid, p_amount numeric, p_listing_id uuid DEFAULT NULL)
RETURNS TABLE(success boolean, discount_amount numeric, final_amount numeric, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM validate_coupon(p_code, p_user_id, p_amount, p_listing_id);

  IF NOT v_result.valid THEN
    RETURN QUERY SELECT false, 0::numeric, p_amount, v_result.message;
    RETURN;
  END IF;

  INSERT INTO coupon_redemptions (coupon_id, user_id, listing_id, original_amount, discount_amount, final_amount)
  VALUES (v_result.coupon_id, p_user_id, p_listing_id, p_amount, v_result.discount_amount, p_amount - v_result.discount_amount);

  UPDATE coupons SET current_uses = current_uses + 1, updated_at = now() WHERE id = v_result.coupon_id;

  INSERT INTO reward_transactions (user_id, transaction_type, reward_type, amount, coupon_id, description)
  VALUES (p_user_id, 'coupon_redeemed', 'coupon', v_result.discount_amount, v_result.coupon_id, 'Coupon redeemed: ' || p_code);

  RETURN QUERY SELECT true, v_result.discount_amount, p_amount - v_result.discount_amount, 'Coupon redeemed successfully';
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_coupon(text, uuid, numeric, uuid) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: Add reward to wallet
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION add_reward_to_wallet(p_user_id uuid, p_reward_type text, p_amount numeric, p_description text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO reward_wallets (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_reward_type = 'promotion_credits' THEN
    UPDATE reward_wallets SET promotion_credits = promotion_credits + p_amount, updated_at = now() WHERE user_id = p_user_id;
  ELSIF p_reward_type = 'promotion_tokens' THEN
    UPDATE reward_wallets SET promotion_tokens = promotion_tokens + p_amount, updated_at = now() WHERE user_id = p_user_id;
  ELSIF p_reward_type = 'voucher' THEN
    UPDATE reward_wallets SET voucher_count = voucher_count + p_amount, updated_at = now() WHERE user_id = p_user_id;
  ELSIF p_reward_type = 'gift_code' THEN
    UPDATE reward_wallets SET gift_code_count = gift_code_count + p_amount, updated_at = now() WHERE user_id = p_user_id;
  END IF;

  INSERT INTO reward_transactions (user_id, transaction_type, reward_type, amount, description)
  VALUES (p_user_id, 'credit_added', p_reward_type, p_amount, p_description);
END;
$$;

GRANT EXECUTE ON FUNCTION add_reward_to_wallet(uuid, text, numeric, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: Generate unique coupon code
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION generate_coupon_code(p_prefix text DEFAULT '', p_length integer DEFAULT 8)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
  attempts integer := 0;
BEGIN
  LOOP
    result := '';
    IF p_prefix IS NOT NULL AND p_prefix != '' THEN
      result := UPPER(p_prefix);
    END IF;
    FOR i IN 1..p_length LOOP
      result := result || substr(chars, floor(random() * length(chars))::integer + 1, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM coupons WHERE code = result);
    attempts := attempts + 1;
    IF attempts > 100 THEN
      RAISE EXCEPTION 'Unable to generate unique code after 100 attempts';
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_coupon_code(text, integer) TO authenticated;
