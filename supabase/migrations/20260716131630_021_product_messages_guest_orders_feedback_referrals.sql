/*
# Product Messages, Guest Orders, Feedback, Referral Tracking

## Overview
This migration adds four new tables to support the marketplace's enhanced features:
1. `product_messages` — Direct messaging between buyers and sellers about specific products
2. `guest_orders` — Guest checkout orders without account creation
3. `feedback` — General platform feedback from users
4. `referrals` — Explicit referral tracking with tiered reward status

## New Tables

### product_messages
- `id` (uuid PK)
- `sender_id` (uuid, references auth.users) — the buyer sending the message
- `receiver_id` (uuid, references auth.users) — the seller receiving the message
- `product_id` (uuid, references products) — the product being discussed
- `message` (text) — message content
- `created_at` (timestamptz)
- RLS: sender and receiver can read; sender can insert

### guest_orders
- `id` (uuid PK)
- `product_id` (uuid, references products)
- `buyer_email` (text)
- `buyer_name` (text)
- `shipping_address` (text)
- `quantity` (integer, default 1)
- `total_amount` (numeric)
- `status` (text, default 'completed')
- `user_id` (uuid, nullable, references auth.users) — populated if guest later signs up
- `created_at` (timestamptz)
- RLS: anyone can insert (guest checkout); user can read their own orders

### feedback
- `id` (uuid PK)
- `user_id` (uuid, references auth.users)
- `category` (text)
- `message` (text)
- `created_at` (timestamptz)
- RLS: authenticated users can insert; read own only

### referrals
- `id` (uuid PK)
- `referrer_id` (uuid, references auth.users)
- `referred_user_id` (uuid, references auth.users)
- `referral_code` (text)
- `is_successful` (boolean, default true)
- `created_at` (timestamptz)
- RLS: referrer can read; insert by authenticated

## Security
- All tables have RLS enabled with appropriate policies
- product_messages: sender and receiver can read; only sender can insert
- guest_orders: anon can insert (guest checkout); users can read by user_id or buyer_email
- feedback: authenticated insert; read own only
- referrals: referrer can read; insert by authenticated

## Notes
- The `users` table already has `referral_code` and `referred_by` columns
- The `referral_links` table already tracks clicks and conversions
- The `reviews` table already exists for product reviews
- The `fraud_reports` table already exists for product reports
- The `notifications` table already exists with INSERT policies
*/

-- Product Messages table
CREATE TABLE IF NOT EXISTS product_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_sender_receiver_read" ON product_messages;
CREATE POLICY "pm_sender_receiver_read" ON product_messages FOR SELECT
  TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "pm_sender_insert" ON product_messages;
CREATE POLICY "pm_sender_insert" ON product_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = sender_id);

-- Guest Orders table
CREATE TABLE IF NOT EXISTS guest_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_email text NOT NULL,
  buyer_name text NOT NULL,
  shipping_address text,
  quantity integer NOT NULL DEFAULT 1,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE guest_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "go_anon_insert" ON guest_orders;
CREATE POLICY "go_anon_insert" ON guest_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "go_user_read_own" ON guest_orders;
CREATE POLICY "go_user_read_own" ON guest_orders FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR buyer_email = (SELECT email FROM users WHERE id = auth.uid()));

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fb_insert_own" ON feedback;
CREATE POLICY "fb_insert_own" ON feedback FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fb_read_own" ON feedback;
CREATE POLICY "fb_read_own" ON feedback FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Referrals table (explicit tracking beyond referral_links)
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  is_successful boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(referred_user_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_referrer_read" ON referrals;
CREATE POLICY "ref_referrer_read" ON referrals FOR SELECT
  TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

DROP POLICY IF EXISTS "ref_insert_authenticated" ON referrals;
CREATE POLICY "ref_insert_authenticated" ON referrals FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_messages_product ON product_messages(product_id);
CREATE INDEX IF NOT EXISTS idx_product_messages_sender ON product_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_product_messages_receiver ON product_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_guest_orders_email ON guest_orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
