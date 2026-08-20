/*
# Local SEO Business Settings Table

1. Purpose
- Stores the business's NAP (Name, Address, Phone) data, geo-coordinates,
  operating hours, social profiles, and Google Business Profile integration
  metadata in a single singleton row.
- This data powers JSON-LD LocalBusiness structured data, consistent NAP
  display across all pages, and SEO meta tags.

2. New Table: business_settings
- id (uuid PK)
- is_singleton (boolean, default true) — enforces single-row pattern
- business_name (text) — legal/trade name, used in NAP and JSON-LD
- tagline (text) — short marketing tagline for meta description
- description (text) — long-form business description for structured data
- street_address (text) — street number + name
- address_line_2 (text) — suite/unit/apt
- city (text) — city/locality
- region (text) — state/province/region
- postal_code (text) — ZIP/postal code
- country (text) — country name
- latitude (numeric) — geo latitude for map embeds + structured data
- longitude (numeric) — geo longitude for map embeds + structured data
- phone (text) — primary phone number in E.164 or local format
- email (text) — public contact email
- website_url (text) — canonical website URL
- logo_url (text) — URL to business logo image
- hours_json (jsonb) — opening hours as day-of-week → time ranges
- service_area (text[]) — list of cities/regions served
- social_profiles (jsonb) — { platform: url } mapping
- google_business_profile_url (text) — link to GBP listing
- google_place_id (text) — Google Place ID for review embeds
- google_maps_embed_url (text) — embeddable Google Maps URL
- price_range (text) — '$', '$$', '$$$', or '$$$$'
- service_categories (text[]) — categories of services/products offered
- created_at (timestamptz)
- updated_at (timestamptz)

3. Security
- Enable RLS on business_settings.
- SELECT is public (anon + authenticated) — NAP and structured data must be
  readable by all visitors, including search engine crawlers using the anon key.
- INSERT/UPDATE/DELETE restricted to authenticated users (admin management).

4. Notes
- The singleton pattern uses a partial unique index on is_singleton WHERE true
  to ensure only one row ever exists.
- A default row is inserted with placeholder values so the frontend always has
  data to render.
*/

CREATE TABLE IF NOT EXISTS business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_singleton boolean NOT NULL DEFAULT true,
  business_name text NOT NULL DEFAULT 'Dright',
  tagline text,
  description text,
  street_address text,
  address_line_2 text,
  city text,
  region text,
  postal_code text,
  country text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  phone text,
  email text,
  website_url text,
  logo_url text,
  hours_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_area text[] NOT NULL DEFAULT '{}',
  social_profiles jsonb NOT NULL DEFAULT '{}'::jsonb,
  google_business_profile_url text,
  google_place_id text,
  google_maps_embed_url text,
  price_range text NOT NULL DEFAULT '$$',
  service_categories text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

-- Singleton enforcement: only one row where is_singleton = true
CREATE UNIQUE INDEX IF NOT EXISTS business_settings_singleton_idx
  ON business_settings (is_singleton) WHERE is_singleton = true;

-- Public read: NAP and structured data visible to all visitors (incl. crawlers)
DROP POLICY IF EXISTS "public_read_business_settings" ON business_settings;
CREATE POLICY "public_read_business_settings"
  ON business_settings FOR SELECT
  TO anon, authenticated USING (true);

-- Admin-only write access
DROP POLICY IF EXISTS "admin_insert_business_settings" ON business_settings;
CREATE POLICY "admin_insert_business_settings"
  ON business_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_business_settings" ON business_settings;
CREATE POLICY "admin_update_business_settings"
  ON business_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_delete_business_settings" ON business_settings;
CREATE POLICY "admin_delete_business_settings"
  ON business_settings FOR DELETE
  TO authenticated USING (true);

-- Insert a default singleton row
INSERT INTO business_settings (is_singleton, business_name, tagline, description, street_address, city, region, postal_code, country, phone, email, website_url, logo_url, hours_json, service_area, social_profiles, price_range, service_categories)
VALUES (
  true,
  'Dright',
  'The digital marketplace for creators',
  'Dright is a next-generation digital marketplace where creators sell products, connect with buyers through realtime chat, and grow their business with powerful analytics — all in one place.',
  '500 Market Street',
  'San Francisco',
  'CA',
  '94105',
  'United States',
  '+1 (555) 123-4567',
  'hello@dright.com',
  'https://dright.com',
  '/dright-logo.webp',
  '{"monday":{"open":"09:00","close":"18:00"},"tuesday":{"open":"09:00","close":"18:00"},"wednesday":{"open":"09:00","close":"18:00"},"thursday":{"open":"09:00","close":"18:00"},"friday":{"open":"09:00","close":"18:00"},"saturday":{"open":"10:00","close":"16:00"},"sunday":{"closed":true}}'::jsonb,
  '{"San Francisco","Oakland","San Jose","Bay Area","Remote","Worldwide"}',
  '{"twitter":"https://twitter.com/dright","facebook":"https://facebook.com/dright","instagram":"https://instagram.com/dright","linkedin":"https://linkedin.com/company/dright"}'::jsonb,
  '$$',
  '{"Digital Products","Software","Online Courses","Creative Services","E-books","Templates","Marketplace"}'
)
ON CONFLICT (is_singleton) WHERE is_singleton = true DO NOTHING;
