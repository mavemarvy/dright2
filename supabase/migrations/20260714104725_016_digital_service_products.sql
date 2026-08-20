/*
# Digital & Service Product Support — Schema Upgrade

## Overview
Extends the existing marketplace to support three product types: PHYSICAL (existing default), DIGITAL, and SERVICE.
Adds tables for digital delivery details, service tiered pricing, customization options, and a full order lifecycle.
Preserves all existing affiliate, marketer/advertiser, admin RBAC, and free product systems.

## 1. Changes to `products` table
- `product_type` (text, default 'PHYSICAL') — enum: 'PHYSICAL', 'DIGITAL', 'SERVICE'
- `demo_video_url` (text, nullable) — URL for embedded product demo video (Mux/Cloudflare Stream)

## 2. New Table: `digital_product_details`
Stores digital-specific delivery configuration for DIGITAL products.
- `id` (uuid PK)
- `product_id` (uuid FK → products, ON DELETE CASCADE, unique)
- `delivery_type` (text: 'INSTANT_DOWNLOAD' or 'LINK_ACCESS')
- `download_file_url` (text, nullable) — encrypted S3 key / storage path
- `download_limit` (integer, nullable) — max downloads per buyer; null = unlimited
- `expiry_days` (integer, default 30) — how long the download link stays valid

## 3. New Table: `service_product_details`
Stores service-specific configuration for SERVICE products.
- `id` (uuid PK)
- `product_id` (uuid FK → products, ON DELETE CASCADE, unique)
- `service_category` (text, nullable) — e.g. 'Design', 'Consulting', 'Development'
- `delivery_time_days` (integer, default 7) — default delivery turnaround
- `requires_consultation` (boolean, default false) — whether buyer must book a call

## 4. New Table: `service_tiers`
Tiered pricing for SERVICE products (Basic/Standard/Premium).
- `id` (uuid PK)
- `product_id` (uuid FK → products, ON DELETE CASCADE)
- `tier_name` (text: 'BASIC', 'STANDARD', 'PREMIUM')
- `price` (numeric, not null)
- `delivery_days` (integer, default 7)
- `features` (jsonb, default '[]') — array of feature strings
- `is_most_popular` (boolean, default false)

## 5. New Table: `customization_options`
Optional add-ons for SERVICE products.
- `id` (uuid PK)
- `product_id` (uuid FK → products, ON DELETE CASCADE)
- `option_name` (text, not null)
- `additional_price` (numeric, default 0)
- `additional_days` (integer, default 0)

## 6. New Table: `orders`
Full order lifecycle for both digital and service products.
- `id` (uuid PK)
- `buyer_id` (uuid FK → users, ON DELETE CASCADE)
- `product_id` (uuid FK → products, ON DELETE CASCADE)
- `seller_id` (uuid FK → users) — denormalized for fast seller queries
- `order_type` (text: 'PHYSICAL', 'DIGITAL', 'SERVICE')
- `status` (text: 'PENDING', 'COMPLETED', 'IN_PROGRESS', 'DELIVERED', 'REVISION_REQUESTED', 'CANCELLED')
- `base_price` (numeric, not null)
- `tier_price` (numeric, default 0) — selected service tier price
- `customization_price` (numeric, default 0) — sum of selected customization option prices
- `admin_task_amount` (numeric, default 0)
- `sales_team_task_amount` (numeric, default 0)
- `affiliate_commission_amount` (numeric, default 0)
- `final_price` (numeric, not null) — total buyer pays
- `selected_tier_id` (uuid FK → service_tiers, nullable)
- `customization_options` (jsonb, nullable) — array of selected option IDs + names + prices
- `buyer_requirements` (text, nullable) — mandatory for service orders
- `delivery_url` (text, nullable) — seller-uploaded deliverable or signed S3 URL
- `download_token` (text, nullable) — secure token for digital download access
- `referrer_id` (uuid, nullable) — affiliate who referred the buyer
- `referrer_role` (text, nullable) — role of the referrer
- `is_free_order` (boolean, default false) — true when final_price = 0
- `created_at` (timestamptz, default now())
- `completed_at` (timestamptz, nullable)

## 7. Security (RLS)
All new tables have RLS enabled with owner-scoped policies:
- `digital_product_details`, `service_product_details`, `service_tiers`, `customization_options`:
  - SELECT: authenticated users (marketplace is browsable when signed in)
  - INSERT/UPDATE/DELETE: only the product owner (uploaded_by = auth.uid())
- `orders`:
  - SELECT: buyer or seller can see their orders
  - INSERT: buyer creates orders (buyer_id = auth.uid())
  - UPDATE: seller updates order status (seller_id = auth.uid()); buyer can request revision/cancel
  - DELETE: not allowed (orders are permanent records)

## 8. Important Notes
1. `product_type` defaults to 'PHYSICAL' so all existing products remain valid.
2. `orders` table integrates with existing affiliate tracking via `referrer_id` and `referrer_role`.
3. Free orders ($0) bypass payment and auto-complete, still incrementing `weekly_sales_count`.
4. Service tiers and customization options are only used when `product_type = 'SERVICE'`.
5. Digital delivery details are only used when `product_type = 'DIGITAL'`.
*/

-- ============================================================
-- 1. Add product_type and demo_video_url to products
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'PHYSICAL' NOT NULL,
  ADD COLUMN IF NOT EXISTS demo_video_url text;

-- ============================================================
-- 2. digital_product_details
-- ============================================================
CREATE TABLE IF NOT EXISTS digital_product_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  delivery_type text NOT NULL DEFAULT 'INSTANT_DOWNLOAD' CHECK (delivery_type = ANY (ARRAY['INSTANT_DOWNLOAD', 'LINK_ACCESS'])),
  download_file_url text,
  download_limit integer,
  expiry_days integer NOT NULL DEFAULT 30,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE digital_product_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_digital_details" ON digital_product_details;
CREATE POLICY "select_digital_details" ON digital_product_details FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_digital_details" ON digital_product_details;
CREATE POLICY "insert_digital_details" ON digital_product_details FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = digital_product_details.product_id AND products.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "update_digital_details" ON digital_product_details;
CREATE POLICY "update_digital_details" ON digital_product_details FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = digital_product_details.product_id AND products.uploaded_by = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = digital_product_details.product_id AND products.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "delete_digital_details" ON digital_product_details;
CREATE POLICY "delete_digital_details" ON digital_product_details FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = digital_product_details.product_id AND products.uploaded_by = auth.uid())
  );

-- ============================================================
-- 3. service_product_details
-- ============================================================
CREATE TABLE IF NOT EXISTS service_product_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  service_category text,
  delivery_time_days integer NOT NULL DEFAULT 7,
  requires_consultation boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_product_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_service_details" ON service_product_details;
CREATE POLICY "select_service_details" ON service_product_details FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_service_details" ON service_product_details;
CREATE POLICY "insert_service_details" ON service_product_details FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = service_product_details.product_id AND products.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "update_service_details" ON service_product_details;
CREATE POLICY "update_service_details" ON service_product_details FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = service_product_details.product_id AND products.uploaded_by = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = service_product_details.product_id AND products.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "delete_service_details" ON service_product_details;
CREATE POLICY "delete_service_details" ON service_product_details FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = service_product_details.product_id AND products.uploaded_by = auth.uid())
  );

-- ============================================================
-- 4. service_tiers
-- ============================================================
CREATE TABLE IF NOT EXISTS service_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tier_name text NOT NULL CHECK (tier_name = ANY (ARRAY['BASIC', 'STANDARD', 'PREMIUM'])),
  price numeric NOT NULL DEFAULT 0,
  delivery_days integer NOT NULL DEFAULT 7,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_most_popular boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_service_tiers" ON service_tiers;
CREATE POLICY "select_service_tiers" ON service_tiers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_service_tiers" ON service_tiers;
CREATE POLICY "insert_service_tiers" ON service_tiers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = service_tiers.product_id AND products.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "update_service_tiers" ON service_tiers;
CREATE POLICY "update_service_tiers" ON service_tiers FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = service_tiers.product_id AND products.uploaded_by = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = service_tiers.product_id AND products.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "delete_service_tiers" ON service_tiers;
CREATE POLICY "delete_service_tiers" ON service_tiers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = service_tiers.product_id AND products.uploaded_by = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_service_tiers_product_id ON service_tiers(product_id);

-- ============================================================
-- 5. customization_options
-- ============================================================
CREATE TABLE IF NOT EXISTS customization_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_name text NOT NULL,
  additional_price numeric NOT NULL DEFAULT 0,
  additional_days integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customization_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_customization_options" ON customization_options;
CREATE POLICY "select_customization_options" ON customization_options FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_customization_options" ON customization_options;
CREATE POLICY "insert_customization_options" ON customization_options FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = customization_options.product_id AND products.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "update_customization_options" ON customization_options;
CREATE POLICY "update_customization_options" ON customization_options FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = customization_options.product_id AND products.uploaded_by = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM products WHERE products.id = customization_options.product_id AND products.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "delete_customization_options" ON customization_options;
CREATE POLICY "delete_customization_options" ON customization_options FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM products WHERE products.id = customization_options.product_id AND products.uploaded_by = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_customization_options_product_id ON customization_options(product_id);

-- ============================================================
-- 6. orders
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES users(id),
  order_type text NOT NULL CHECK (order_type = ANY (ARRAY['PHYSICAL', 'DIGITAL', 'SERVICE'])),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status = ANY (ARRAY['PENDING', 'COMPLETED', 'IN_PROGRESS', 'DELIVERED', 'REVISION_REQUESTED', 'CANCELLED'])),
  base_price numeric NOT NULL,
  tier_price numeric NOT NULL DEFAULT 0,
  customization_price numeric NOT NULL DEFAULT 0,
  admin_task_amount numeric NOT NULL DEFAULT 0,
  sales_team_task_amount numeric NOT NULL DEFAULT 0,
  affiliate_commission_amount numeric NOT NULL DEFAULT 0,
  final_price numeric NOT NULL,
  selected_tier_id uuid REFERENCES service_tiers(id) ON DELETE SET NULL,
  customization_options jsonb,
  buyer_requirements text,
  delivery_url text,
  download_token text,
  referrer_id uuid,
  referrer_role text,
  is_free_order boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_orders" ON orders;
CREATE POLICY "select_own_orders" ON orders FOR SELECT
  TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_orders" ON orders;
CREATE POLICY "insert_own_orders" ON orders FOR INSERT
  TO authenticated WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "update_own_orders" ON orders;
CREATE POLICY "update_own_orders" ON orders FOR UPDATE
  TO authenticated USING (buyer_id = auth.uid() OR seller_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
