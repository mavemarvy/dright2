/*
# Fix Referral System: Click/Conversion Tracking + Referred-By + Affiliate Earnings

## 1. Add `referred_by` to `users` — permanently track who referred each user at signup
## 2. Add `affiliate_earnings` to `users` — accumulated affiliate commission
## 3. Create `affiliate_clicks` table — log every affiliate link click
## 4. Add RPC to increment referral_links.total_clicks
## 5. Add RPC to increment referral_links.total_conversions
## 6. Sync referral_links.unique_code = users.referral_code for existing rows
*/

-- 1. Add referred_by and affiliate_earnings to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS affiliate_earnings numeric DEFAULT 0;

-- Add FK for referred_by (self-referential, nullable)
DO $$
BEGIN
  BEGIN
    ALTER TABLE users ADD CONSTRAINT users_referred_by_fkey
      FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 2. Create affiliate_clicks table
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  clicker_ip text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_clicks" ON affiliate_clicks;
CREATE POLICY "insert_clicks" ON affiliate_clicks FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "select_own_clicks" ON affiliate_clicks;
CREATE POLICY "select_own_clicks" ON affiliate_clicks FOR SELECT
  TO authenticated USING (referrer_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_referrer ON affiliate_clicks(referrer_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_product ON affiliate_clicks(product_id);

-- 3. RPC: increment_referral_clicks
CREATE OR REPLACE FUNCTION increment_referral_clicks(p_referrer_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE referral_links
  SET total_clicks = COALESCE(total_clicks, 0) + 1
  WHERE user_id = p_referrer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: increment_referral_conversions
CREATE OR REPLACE FUNCTION increment_referral_conversions(p_referrer_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE referral_links
  SET total_conversions = COALESCE(total_conversions, 0) + 1
  WHERE user_id = p_referrer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: add_affiliate_earnings — add commission to referrer's balance and affiliate_earnings
CREATE OR REPLACE FUNCTION add_affiliate_earnings(p_user_id uuid, p_amount numeric)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET
    balance = COALESCE(balance, 0) + p_amount,
    available_balance = COALESCE(available_balance, 0) + p_amount,
    affiliate_earnings = COALESCE(affiliate_earnings, 0) + p_amount
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Sync existing referral_links.unique_code with users.referral_code
UPDATE referral_links rl
SET unique_code = u.referral_code
FROM users u
WHERE rl.user_id = u.id
  AND u.referral_code IS NOT NULL
  AND rl.unique_code <> u.referral_code;
