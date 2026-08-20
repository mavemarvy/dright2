/*
# Marketer & Advertiser Sales Team System

This migration adds the full "Marketers and Advertisers" Sales Team system
with tiered progression, complex pricing tasks, and subscription mechanics.

## 1. User Model Updates (ALTER TABLE users)
New columns added to the existing `users` table:
- `marketer_level` (int, default 0, range 0-5) — current Marketer level based on weekly sales.
- `advertiser_grade` (text, nullable) — one of: 'A', 'B', 'C', 'Pro', 'Super', 'Partnership', or null.
- `weekly_sales_count` (int, default 0) — sales count for the current week, resets weekly.
- `total_sales_count` (int, default 0) — cumulative sales count across all time.
- `consecutive_weeks_streak` (int, default 0) — consecutive weeks meeting the level's weekly target.
- `social_media_links` (jsonb, nullable) — array of social media URLs submitted during Marketer registration.
- `marketer_status` (text, default 'none') — one of: 'none', 'pending', 'approved', 'rejected'. Tracks Marketer application state.
- `advertiser_status` (text, default 'none') — one of: 'none', 'pending', 'approved', 'rejected'. Tracks Advertiser application state.
- `locked_balance` (numeric, default 0) — funds locked in active subscription contracts, released on expiry.
- `available_balance` (numeric, default 0) — funds available for withdrawal (replaces ad-hoc use of `balance` for sales team earnings).
- `downgraded_at` (timestamptz, nullable) — when the user was last downgraded, used to enforce the 2-week re-upgrade cooldown.
- `last_weekly_reset_at` (timestamptz, nullable) — timestamp of the last weekly reset, used by the cron.

## 2. Product Model Updates (ALTER TABLE products)
New columns added to the existing `products` table:
- `admin_task_percent` (numeric(5,2), default 15.00) — the Admin Task percentage added to the product price for the buyer.
- `sales_team_task_percent` (numeric(5,2), default 0.00) — the Sales Team Task percentage, determined by the assigned team's level/grade.
- `affiliate_commission_percent` (numeric(5,2), default 0.00) — the affiliate commission percentage the seller sets, calculated on the BASE price.
- `sales_team_tier` (text, nullable) — the tier label of the assigned sales team, e.g. 'Mkt L3', 'Adv A', 'Partner'.

## 3. New Table: sales_team_contracts
Tracks subscription contracts between a seller and a sales team (marketer/advertiser).
- `id` (uuid, PK)
- `seller_id` (uuid, FK to users.id) — the seller who hired the sales team.
- `sales_team_id` (uuid, FK to users.id) — the marketer/advertiser who is hired.
- `product_id` (uuid, FK to products.id, nullable) — the product this contract is associated with.
- `duration` (text) — one of: '1_week', '2_weeks', '1_month'.
- `total_amount` (numeric(12,2)) — the total subscription price paid by the seller.
- `status` (text, default 'active') — one of: 'active', 'expired', 'cancelled'.
- `admin_cut_applied` (boolean, default false) — whether the 5% admin cut has been deducted on expiry.
- `starts_at` (timestamptz, default now())
- `expires_at` (timestamptz) — calculated from duration.
- `created_at` (timestamptz, default now())

## 4. New Table: system_config
Stores editable Admin Task percentages and Subscription base prices per level.
Single-row design (enforced by a unique constraint on a sentinel column).
- `id` (uuid, PK)
- `singleton` (boolean, default true, unique) — ensures only one config row exists.
- `admin_task_percent` (numeric(5,2), default 15.00) — global default Admin Task %.
- `marketer_task_pcts` (jsonb) — map of marketer level -> task %, e.g. {"3": 14, "4": 13, "5": 12}.
- `advertiser_task_pcts` (jsonb) — map of advertiser grade -> task %, e.g. {"A": 12, "B": 11, ...}.
- `marketer_sub_prices` (jsonb) — map of marketer level -> weekly base price, e.g. {"3": 4, "4": 6, "5": 10}.
- `advertiser_sub_prices` (jsonb) — map of advertiser grade -> weekly base price, e.g. {"A": 15, "B": 22, ...}.
- `admin_cut_percent` (numeric(5,2), default 5.00) — admin cut on contract expiry.
- `updated_at` (timestamptz, default now())
- `updated_by` (uuid, FK to users.id, nullable)

## 5. Security
- RLS enabled on `sales_team_contracts` and `system_config`.
- `sales_team_contracts`: sellers and sales team members can read their own contracts; sellers can insert; both can update their own.
- `system_config`: any authenticated user can read (needed for pricing calculations); only admins can update.

## 6. Important Notes
1. The existing `balance` column on `users` is preserved and continues to represent the promoter/affiliate balance. The new `available_balance` is specifically for sales team subscription earnings.
2. The `system_config` table is seeded with default values matching the specification.
3. All new columns have safe defaults so existing rows and code paths continue to work.
4. The weekly reset and progression logic is implemented as an edge function that reads/writes these columns.
*/

-- =========================================================
-- 1. ALTER users table: add marketer/advertiser fields
-- =========================================================
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS marketer_level int NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS advertiser_grade text;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_sales_count int NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS total_sales_count int NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS consecutive_weeks_streak int NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS social_media_links jsonb;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS marketer_status text NOT NULL DEFAULT 'none';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS advertiser_status text NOT NULL DEFAULT 'none';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_balance numeric(12,2) NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS available_balance numeric(12,2) NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS downgraded_at timestamptz;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_weekly_reset_at timestamptz;
END $$;

-- Add CHECK constraint for marketer_level range
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_marketer_level_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_marketer_level_check CHECK (marketer_level >= 0 AND marketer_level <= 5);
  END IF;
END $$;

-- Add CHECK constraint for advertiser_grade values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_advertiser_grade_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_advertiser_grade_check CHECK (
      advertiser_grade IS NULL OR advertiser_grade IN ('A', 'B', 'C', 'Pro', 'Super', 'Partnership')
    );
  END IF;
END $$;

-- =========================================================
-- 2. ALTER products table: add pricing task fields
-- =========================================================
DO $$ BEGIN
  ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_task_percent numeric(5,2) NOT NULL DEFAULT 15.00;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_team_task_percent numeric(5,2) NOT NULL DEFAULT 0.00;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS affiliate_commission_percent numeric(5,2) NOT NULL DEFAULT 0.00;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_team_tier text;
END $$;

-- =========================================================
-- 3. CREATE sales_team_contracts table
-- =========================================================
CREATE TABLE IF NOT EXISTS sales_team_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sales_team_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  duration text NOT NULL DEFAULT '1_week' CHECK (duration IN ('1_week', '2_weeks', '1_month')),
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  admin_cut_applied boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_team_contracts_seller ON sales_team_contracts(seller_id);
CREATE INDEX IF NOT EXISTS idx_sales_team_contracts_sales_team ON sales_team_contracts(sales_team_id);
CREATE INDEX IF NOT EXISTS idx_sales_team_contracts_status ON sales_team_contracts(status);

ALTER TABLE sales_team_contracts ENABLE ROW LEVEL SECURITY;

-- Policies: seller can read/insert/update their own contracts
DROP POLICY IF EXISTS "select_own_contracts_seller" ON sales_team_contracts;
CREATE POLICY "select_own_contracts_seller" ON sales_team_contracts FOR SELECT
  TO authenticated USING (auth.uid() = seller_id OR auth.uid() = sales_team_id);

DROP POLICY IF EXISTS "insert_own_contracts_seller" ON sales_team_contracts;
CREATE POLICY "insert_own_contracts_seller" ON sales_team_contracts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "update_own_contracts_seller" ON sales_team_contracts;
CREATE POLICY "update_own_contracts_seller" ON sales_team_contracts FOR UPDATE
  TO authenticated USING (auth.uid() = seller_id OR auth.uid() = sales_team_id)
  WITH CHECK (auth.uid() = seller_id OR auth.uid() = sales_team_id);

-- Admin access via the is_admin function
DROP POLICY IF EXISTS "admin_all_access_contracts" ON sales_team_contracts;
CREATE POLICY "admin_all_access_contracts" ON sales_team_contracts FOR ALL
  TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- =========================================================
-- 4. CREATE system_config table
-- =========================================================
CREATE TABLE IF NOT EXISTS system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  admin_task_percent numeric(5,2) NOT NULL DEFAULT 15.00,
  marketer_task_pcts jsonb NOT NULL DEFAULT '{"3": 14, "4": 13, "5": 12}'::jsonb,
  advertiser_task_pcts jsonb NOT NULL DEFAULT '{"A": 12, "B": 11, "C": 10, "Pro": 9, "Super": 8, "Partnership": 7}'::jsonb,
  marketer_sub_prices jsonb NOT NULL DEFAULT '{"3": 4, "4": 6, "5": 10}'::jsonb,
  advertiser_sub_prices jsonb NOT NULL DEFAULT '{"A": 15, "B": 22, "C": 30, "Pro": 50, "Super": 100, "Partnership": 350}'::jsonb,
  admin_cut_percent numeric(5,2) NOT NULL DEFAULT 5.00,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read system config (needed for pricing)
DROP POLICY IF EXISTS "read_system_config" ON system_config;
CREATE POLICY "read_system_config" ON system_config FOR SELECT
  TO authenticated USING (true);

-- Only admins can update/insert system config
DROP POLICY IF EXISTS "admin_write_system_config" ON system_config;
CREATE POLICY "admin_write_system_config" ON system_config FOR ALL
  TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Seed the singleton row
INSERT INTO system_config (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;