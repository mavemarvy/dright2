/*
# Extend Digital/Service/Course Product Support

## Overview
Adds COURSE as a product type, extends digital_product_details with course-specific fields,
adds fields to service_product_details and service_tiers per the full spec, and adds
customization option types. Also adds messages and reviews tables for order communication.

## 1. Changes to `products` table
- Update product_type CHECK to include 'COURSE'

## 2. Changes to `digital_product_details`
- `access_link` (text, nullable) — for courses/memberships access URL
- `file_format` (text, nullable) — PDF/ZIP/VIDEO/NOTION_TEMPLATE etc.
- `file_size` (bigint, nullable) — file size in bytes
- `includes_bonus_materials` (boolean, default false)

## 3. Changes to `service_product_details`
- `is_customizable` (boolean, default true)
- `revision_count` (integer, default 1)

## 4. Changes to `service_tiers`
- `tier_number` (integer, 1-3)
- `title` (text, nullable)
- `description` (text, nullable)
- `word_count` (integer, nullable) — for writing services
- `revision_count` (integer, default 1)
- `sort_order` (integer, default 0)

## 5. Changes to `customization_options`
- `option_type` (text, nullable) — EXTRA_FAST_DELIVERY/ADDITIONAL_REVISIONS/EXTRA_WORDS/VIDEO_CALL etc.
- `description` (text, nullable)
- `is_required` (boolean, default false)

## 6. New Table: `order_messages`
Per-order messaging between buyer and seller.
- `id` (uuid PK)
- `order_id` (uuid FK → orders, ON DELETE CASCADE)
- `sender_id` (uuid FK → users)
- `receiver_id` (uuid FK → users)
- `content` (text, not null)
- `attachments` (jsonb, default '[]') — array of file URLs
- `is_read` (boolean, default false)
- `read_at` (timestamptz, nullable)
- `created_at` (timestamptz, default now())

## 7. New Table: `order_reviews`
Reviews tied to completed orders.
- `id` (uuid PK)
- `order_id` (uuid FK → orders, ON DELETE CASCADE, unique)
- `product_id` (uuid FK → products, ON DELETE CASCADE)
- `buyer_id` (uuid FK → users)
- `seller_id` (uuid FK → users)
- `rating` (integer, 1-5, not null)
- `title` (text, nullable)
- `comment` (text, nullable)
- `seller_response` (text, nullable)
- `created_at` (timestamptz, default now())

## 8. Security
- RLS on order_messages: sender or receiver can see; sender can insert
- RLS on order_reviews: buyer or seller can see; buyer can insert (own order); seller can update (response only)
*/

-- 1. Update product_type constraint to include COURSE
DO $$
BEGIN
  BEGIN
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
  CHECK (product_type = ANY (ARRAY['PHYSICAL', 'DIGITAL', 'SERVICE', 'COURSE']));

-- 2. Extend digital_product_details
ALTER TABLE digital_product_details
  ADD COLUMN IF NOT EXISTS access_link text,
  ADD COLUMN IF NOT EXISTS file_format text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS includes_bonus_materials boolean DEFAULT false;

-- Update delivery_type to include EMAIL_DELIVERY
DO $$
BEGIN
  BEGIN
    ALTER TABLE digital_product_details DROP CONSTRAINT IF EXISTS digital_product_details_delivery_type_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
ALTER TABLE digital_product_details ADD CONSTRAINT digital_product_details_delivery_type_check
  CHECK (delivery_type = ANY (ARRAY['INSTANT_DOWNLOAD', 'LINK_ACCESS', 'EMAIL_DELIVERY']));

-- 3. Extend service_product_details
ALTER TABLE service_product_details
  ADD COLUMN IF NOT EXISTS is_customizable boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS revision_count integer DEFAULT 1;

-- 4. Extend service_tiers
ALTER TABLE service_tiers
  ADD COLUMN IF NOT EXISTS tier_number integer DEFAULT 1 CHECK (tier_number >= 1 AND tier_number <= 3),
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS word_count integer,
  ADD COLUMN IF NOT EXISTS revision_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- 5. Extend customization_options
ALTER TABLE customization_options
  ADD COLUMN IF NOT EXISTS option_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_required boolean DEFAULT false;

-- 6. order_messages
CREATE TABLE IF NOT EXISTS order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON order_messages;
CREATE POLICY "select_own_messages" ON order_messages FOR SELECT
  TO authenticated USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_messages" ON order_messages;
CREATE POLICY "insert_own_messages" ON order_messages FOR INSERT
  TO authenticated WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "update_own_messages" ON order_messages;
CREATE POLICY "update_own_messages" ON order_messages FOR UPDATE
  TO authenticated USING (receiver_id = auth.uid()) WITH CHECK (receiver_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_order_messages_order_id ON order_messages(order_id);

-- 7. order_reviews
CREATE TABLE IF NOT EXISTS order_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  comment text,
  seller_response text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_reviews" ON order_reviews;
CREATE POLICY "select_reviews" ON order_reviews FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_review" ON order_reviews;
CREATE POLICY "insert_own_review" ON order_reviews FOR INSERT
  TO authenticated WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "update_seller_response" ON order_reviews;
CREATE POLICY "update_seller_response" ON order_reviews FOR UPDATE
  TO authenticated USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_order_reviews_product_id ON order_reviews(product_id);
