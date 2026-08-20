/*
# Portfolio Items & DRIGHT Sales Team Support

## Summary
This migration adds the seller portfolio feature and optional DRIGHT sales team support
to the existing Ads Service module. No existing tables or data are modified destructively.

## Changes

### Modified Tables
- `products`
  - Added `has_dright_sales_team` (boolean, default false): flag indicating the seller
    has opted in for DRIGHT sales team to assist with customer inquiries on this service

### New Tables
- `portfolio_items`
  - `id` (uuid, primary key)
  - `product_id` (uuid, FK → products): the service listing this portfolio belongs to
  - `seller_id` (uuid, FK → auth.users): the seller who owns this portfolio item
  - `item_type` (text, CHECK IN IMAGE|VIDEO|PDF|LINK): media type
  - `file_url` (text, nullable): Supabase storage public URL for uploaded files
  - `external_url` (text, nullable): external link for LINK type items
  - `link_platform` (text, nullable): e.g. "Behance", "YouTube", "Instagram"
  - `title` (text, nullable): optional title for the portfolio piece
  - `description` (text, nullable): optional description/caption
  - `position` (integer, default 0): display sort order
  - `is_approved` (boolean, default true): admin can reject inappropriate content
  - `created_at`, `updated_at` (timestamptz)

### New Storage
- `seller-portfolio` bucket (public): stores uploaded portfolio files (images, videos, PDFs)

## Security
- RLS enabled on `portfolio_items`
- SELECT: anon + authenticated can view approved items (is_approved = true)
- INSERT: authenticated sellers can insert their own items (seller_id = auth.uid())
- UPDATE: sellers can update their own items
- DELETE: sellers can delete their own items
- Admin bypass: admins use service role to manage all items

## Notes
1. Portfolio is completely optional — services can be published without any portfolio items
2. The `has_dright_sales_team` column defaults to false, so no existing services are affected
3. Storage bucket is public so portfolio media URLs work without auth tokens
*/

-- Add DRIGHT sales team support flag to products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'has_dright_sales_team'
  ) THEN
    ALTER TABLE products ADD COLUMN has_dright_sales_team BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Create portfolio_items table
CREATE TABLE IF NOT EXISTS portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('IMAGE', 'VIDEO', 'PDF', 'LINK')),
  file_url TEXT,
  external_url TEXT,
  link_platform TEXT,
  title TEXT,
  description TEXT,
  position INTEGER DEFAULT 0,
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;

-- SELECT: public can view approved portfolio items
DROP POLICY IF EXISTS "select_approved_portfolio_items" ON portfolio_items;
CREATE POLICY "select_approved_portfolio_items" ON portfolio_items FOR SELECT
TO anon, authenticated USING (is_approved = TRUE);

-- INSERT: authenticated sellers can add their own portfolio items
DROP POLICY IF EXISTS "insert_own_portfolio_items" ON portfolio_items;
CREATE POLICY "insert_own_portfolio_items" ON portfolio_items FOR INSERT
TO authenticated WITH CHECK (auth.uid() = seller_id);

-- UPDATE: sellers can update their own portfolio items
DROP POLICY IF EXISTS "update_own_portfolio_items" ON portfolio_items;
CREATE POLICY "update_own_portfolio_items" ON portfolio_items FOR UPDATE
TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

-- DELETE: sellers can delete their own portfolio items
DROP POLICY IF EXISTS "delete_own_portfolio_items" ON portfolio_items;
CREATE POLICY "delete_own_portfolio_items" ON portfolio_items FOR DELETE
TO authenticated USING (auth.uid() = seller_id);

-- Create seller-portfolio storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('seller-portfolio', 'seller-portfolio', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for seller-portfolio bucket
DROP POLICY IF EXISTS "portfolio_public_read" ON storage.objects;
CREATE POLICY "portfolio_public_read" ON storage.objects FOR SELECT
TO anon, authenticated USING (bucket_id = 'seller-portfolio');

DROP POLICY IF EXISTS "portfolio_authenticated_upload" ON storage.objects;
CREATE POLICY "portfolio_authenticated_upload" ON storage.objects FOR INSERT
TO authenticated WITH CHECK (bucket_id = 'seller-portfolio' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "portfolio_owner_update" ON storage.objects;
CREATE POLICY "portfolio_owner_update" ON storage.objects FOR UPDATE
TO authenticated USING (bucket_id = 'seller-portfolio' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "portfolio_owner_delete" ON storage.objects;
CREATE POLICY "portfolio_owner_delete" ON storage.objects FOR DELETE
TO authenticated USING (bucket_id = 'seller-portfolio' AND auth.uid()::text = (storage.foldername(name))[1]);
