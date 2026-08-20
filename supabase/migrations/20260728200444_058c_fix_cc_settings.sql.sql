/*
# Creator Campaigns — Fix cc_settings id type
The cc_settings table uses uuid PK but had integer default 1.
Fix: use a real uuid and insert with gen_random_uuid().
*/

-- Drop the broken table if it was partially created
DROP TABLE IF EXISTS cc_settings;

CREATE TABLE IF NOT EXISTS cc_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_fee_percent numeric NOT NULL DEFAULT 10,
  launch_fee numeric NOT NULL DEFAULT 0,
  premium_creator_fee_percent numeric NOT NULL DEFAULT 5,
  min_reward numeric NOT NULL DEFAULT 0.25,
  max_reward numeric NOT NULL DEFAULT 1000,
  min_withdrawal numeric NOT NULL DEFAULT 5,
  ai_verification_premium_price numeric NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cc_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_cc_settings" ON cc_settings;
CREATE POLICY "select_cc_settings" ON cc_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_cc_settings" ON cc_settings;
CREATE POLICY "admin_manage_cc_settings" ON cc_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

INSERT INTO cc_settings DEFAULT VALUES;
