/*
# Payment Provider System

## Purpose
Creates a reusable payment provider architecture so multiple gateways (Paystack, Google Pay, Apple Pay, Flutterwave, Stripe, Wise) can be managed from one place. Super Admin can enable/disable providers, set maintenance mode, and reorder priority.

## New Tables
- `payment_providers`
  - `id` (uuid, PK)
  - `slug` (text, unique) — machine name e.g. "paystack"
  - `name` (text) — display name
  - `logo` (text) — URL or emoji for provider logo
  - `description` (text) — short description
  - `status` (text) — "enabled" | "coming_soon" | "maintenance"
  - `priority` (int) — display order, lower = higher priority
  - `supported_countries` (text[]) — ISO country codes
  - `supported_currencies` (text[]) — currency codes
  - `badge` (text, nullable) — e.g. "Recommended"
  - `is_recommended` (boolean, default false)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

## Seed Data
Inserts 6 providers: Paystack (enabled, recommended), Google Pay / Apple Pay / Flutterwave / Stripe / Wise (all coming_soon).

## Security
- RLS enabled on payment_providers
- All authenticated users can SELECT (needed to display providers in checkout)
- Only admins can INSERT / UPDATE / DELETE (admin_status = 'approved' or is_admin = true)
*/

CREATE TABLE IF NOT EXISTS payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  logo text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'coming_soon',
  priority int NOT NULL DEFAULT 99,
  supported_countries text[] NOT NULL DEFAULT '{}',
  supported_currencies text[] NOT NULL DEFAULT '{}',
  badge text,
  is_recommended boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payment_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_payment_providers" ON payment_providers;
CREATE POLICY "select_payment_providers"
  ON payment_providers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_payment_providers" ON payment_providers;
CREATE POLICY "admin_insert_payment_providers"
  ON payment_providers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))
  );

DROP POLICY IF EXISTS "admin_update_payment_providers" ON payment_providers;
CREATE POLICY "admin_update_payment_providers"
  ON payment_providers FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))
  );

DROP POLICY IF EXISTS "admin_delete_payment_providers" ON payment_providers;
CREATE POLICY "admin_delete_payment_providers"
  ON payment_providers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND (users.is_admin = true OR users.admin_status = 'approved'))
  );

-- Seed providers
INSERT INTO payment_providers (slug, name, logo, description, status, priority, supported_countries, supported_currencies, badge, is_recommended) VALUES
  ('paystack', 'Paystack', '', 'Pay with card, bank transfer, USSD, or mobile money. Nigeria''s most trusted payment gateway.', 'enabled', 1, '{NG, GH, KE, ZA, CI}', '{NGN, GHS, KES, ZAR, USD}', 'Recommended', true),
  ('google_pay', 'Google Pay', '', 'Fast, secure checkout with your Google account. Card details stay with Google.', 'coming_soon', 2, '{US, GB, CA, AU, DE, FR, JP, IN, NG}', '{USD, GBP, CAD, AUD, EUR, JPY, INR, NGN}', NULL, false),
  ('apple_pay', 'Apple Pay', '', 'One-tap checkout on iPhone, iPad, and Mac. Your card number is never shared.', 'coming_soon', 3, '{US, GB, CA, AU, DE, FR, JP, SG}', '{USD, GBP, CAD, AUD, EUR, JPY, SGD}', NULL, false),
  ('flutterwave', 'Flutterwave', '', 'Accept payments across Africa with cards, mobile money, and bank transfers.', 'coming_soon', 4, '{NG, GH, KE, UG, TZ, ZA, CI, EG}', '{NGN, GHS, KES, UGX, TZS, ZAR, USD, EUR}', NULL, false),
  ('stripe', 'Stripe', '', 'Global payments for businesses of all sizes. Supports 135+ currencies worldwide.', 'coming_soon', 5, '{US, GB, CA, AU, DE, FR, NL, ES, IT, JP, SG, AE, BR, MX}', '{USD, GBP, EUR, CAD, AUD, JPY, SGD, AED, BRL, MXN}', NULL, false),
  ('wise', 'Wise (TransferWise)', '', 'Low-cost international transfers with the real exchange rate.', 'coming_soon', 6, '{GB, US, DE, FR, ES, IT, NL, BE, IE, AU, JP, SG}', '{GBP, USD, EUR, AUD, JPY, SGD, CAD, NZD}', NULL, false)
ON CONFLICT (slug) DO NOTHING;
