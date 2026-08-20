-- Add missing columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_sales integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

-- Add is_verified to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
