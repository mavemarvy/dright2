/*
# Create products table and product-images storage bucket

1. Purpose
- Stores products that promoters can upload and affiliate with for selling.
- Products are visible to ALL authenticated promoters via the Market page.
- Each product has a name, description, price, commission rate, image, and category.
- Any promoter can upload a product; all promoters can view and affiliate all products.

2. New Tables
- `products`
  - `id` (uuid, primary key)
  - `uploaded_by` (uuid, not null, references auth.users) - who uploaded the product
  - `name` (text, not null)
  - `description` (text)
  - `price` (numeric, not null) - full product price in USD
  - `commission_rate` (numeric, not null, default 10) - percentage (e.g. 10 = 10%)
  - `image_url` (text) - public URL from Supabase Storage
  - `category` (text, default 'General')
  - `is_active` (boolean, default true)
  - `created_at` (timestamptz, default now())

3. Security (RLS)
- Enable RLS on products table.
- SELECT: all authenticated users can view all active products (public catalog).
- INSERT: authenticated users can upload products; uploaded_by defaults to auth.uid().
- UPDATE/DELETE: only the uploader can modify or remove their own products.

4. Storage Bucket
- Name: product-images
- Public: true (so product images load in the market without auth headers)

5. Notes
- commission_rate is stored as a decimal percentage (10.0 = 10%).
- commission_amount = price * commission_rate / 100.
- Products uploaded by any promoter are shared across the entire marketplace.
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL,
  commission_rate numeric(5, 2) NOT NULL DEFAULT 10.00,
  image_url text,
  category text NOT NULL DEFAULT 'General',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_uploaded_by ON products(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all active products (shared marketplace)
DROP POLICY IF EXISTS "All promoters can view active products" ON products;
CREATE POLICY "All promoters can view active products"
ON products FOR SELECT
TO authenticated
USING (is_active = true);

-- Uploaders can also see their own inactive products
DROP POLICY IF EXISTS "Uploaders can view own inactive products" ON products;
CREATE POLICY "Uploaders can view own inactive products"
ON products FOR SELECT
TO authenticated
USING (auth.uid() = uploaded_by);

-- Any authenticated user can upload a product
DROP POLICY IF EXISTS "Promoters can upload products" ON products;
CREATE POLICY "Promoters can upload products"
ON products FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = uploaded_by);

-- Only the uploader can update their own products
DROP POLICY IF EXISTS "Uploaders can update own products" ON products;
CREATE POLICY "Uploaders can update own products"
ON products FOR UPDATE
TO authenticated
USING (auth.uid() = uploaded_by)
WITH CHECK (auth.uid() = uploaded_by);

-- Only the uploader can delete their own products
DROP POLICY IF EXISTS "Uploaders can delete own products" ON products;
CREATE POLICY "Uploaders can delete own products"
ON products FOR DELETE
TO authenticated
USING (auth.uid() = uploaded_by);

-- Create the public storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view product images (public bucket)
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Authenticated users can upload product images
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;
CREATE POLICY "Authenticated users can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

-- Uploaders can delete their own product images
DROP POLICY IF EXISTS "Uploaders can delete own product images" ON storage.objects;
CREATE POLICY "Uploaders can delete own product images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);