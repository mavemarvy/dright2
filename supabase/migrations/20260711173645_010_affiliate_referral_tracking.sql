/*
# Affiliate & Referral Tracking System

This migration adds unique referral codes to users, referrer tracking on sales records,
and a role constraint to ensure proper role-based sales analytics.

## 1. User Model Updates (ALTER TABLE users)
- `referral_code` (text, unique) — a short unique code used in affiliate links (?ref=CODE).
  Auto-generated for existing users if null. New users get one via the app layer.
- `role` CHECK constraint updated to include 'customer' alongside existing roles.

## 2. Sales Record Updates (ALTER TABLE sales_records)
- `referrer_id` (uuid, nullable) — the User who referred this sale. FK to users(id) ON DELETE SET NULL.
- `referrer_role` (text, nullable) — the role of the referrer at the time of sale
  ('affiliate', 'marketer', 'advertiser', 'admin'). Used for role-based grouping in analytics.
- `product_id` (uuid, nullable) — FK to products(id) ON DELETE SET NULL, for linking sales to specific products.
- `sale_amount` (numeric 12,2, default 0) — the total sale amount (buyer pays price).

## 3. Indexes
- Index on `sales_records(referrer_id)` for efficient analytics queries.
- Index on `users(referral_code)` for fast lookup during cookie-based referrer resolution.

## 4. Backfill
- Existing users without a referral_code get one generated from their UUID (first 8 chars, uppercased).
  The app layer (AuthContext) will generate codes for new users going forward.

## 5. Security
- No new RLS policies needed — existing users and sales_records policies already cover access.
  The referrer_id is set by the checkout process (edge function or client), not by the referrer themselves.

## 6. Important Notes
1. referral_code is unique — the app must generate collision-free codes.
2. referrer_role is denormalized for query efficiency — it's set at sale time and doesn't change if the user's role changes later.
3. The role CHECK constraint is additive — existing roles ('promoter', 'admin', etc.) remain valid.
4. product_id on sales_records allows joining product name in analytics queries.
*/

-- =========================================================
-- 1. ALTER users: add referral_code
-- =========================================================
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text;
END $$;

-- Add unique index on referral_code (partial — only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique
  ON users(referral_code) WHERE referral_code IS NOT NULL;

-- Backfill: generate referral codes for existing users who don't have one
UPDATE users
SET referral_code = upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- =========================================================
-- 2. ALTER users: update role CHECK constraint to include 'customer'
-- =========================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check_affiliate'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check_affiliate CHECK (
      role IN ('admin', 'affiliate', 'marketer', 'advertiser', 'customer', 'promoter')
    );
  END IF;
END $$;

-- =========================================================
-- 3. ALTER sales_records: add referrer tracking fields
-- =========================================================
DO $$ BEGIN
  ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS referrer_role text;
  ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;
  ALTER TABLE sales_records ADD COLUMN IF NOT EXISTS sale_amount numeric(12,2) NOT NULL DEFAULT 0;
END $$;

-- Add CHECK constraint on referrer_role
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_records_referrer_role_check'
  ) THEN
    ALTER TABLE sales_records ADD CONSTRAINT sales_records_referrer_role_check CHECK (
      referrer_role IS NULL OR referrer_role IN ('affiliate', 'marketer', 'advertiser', 'admin')
    );
  END IF;
END $$;

-- =========================================================
-- 4. Indexes for efficient queries
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_sales_records_referrer_id ON sales_records(referrer_id);
CREATE INDEX IF NOT EXISTS idx_sales_records_referrer_role ON sales_records(referrer_role);

-- =========================================================
-- 5. Update existing sales_records: set referrer_id = promoter_id, referrer_role = 'affiliate'
--    This backfills existing sales as affiliate-referred.
-- =========================================================
UPDATE sales_records
SET referrer_id = promoter_id,
    referrer_role = 'affiliate'
WHERE referrer_id IS NULL AND promoter_id IS NOT NULL;