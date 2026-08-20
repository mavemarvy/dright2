/*
# Create product_drafts table for draft saving system

## Purpose
Enables sellers to save product drafts (partially-completed upload forms) to both
localStorage (offline) and the Supabase cloud (cross-device sync). Drafts can be
reopened, edited, and published directly from the draft view.

## New Tables
- `product_drafts`
  - `id` (uuid, primary key) — unique draft identifier
  - `user_id` (uuid, NOT NULL, DEFAULT auth.uid()) — owner of the draft
  - `draft_name` (text) — optional human-friendly label for the draft
  - `draft_data` (jsonb, NOT NULL) — full form state: name, description, price,
    commission_rate, category, stock, productType, step, isFree, deliveryType,
    downloadFileUrl, accessLink, fileFormat, downloadLimit, expiryDays,
    includesBonus, demoVideoUrl, serviceCategory, serviceDeliveryDays,
    requiresConsultation, hasDrightSalesTeam, tiers, customizations,
    portfolioLinks, affiliateCommission, selectedTier, adminTaskAgreed,
    imagePreviews (base64 data URLs)
  - `status` (text, DEFAULT 'draft') — 'draft' or 'published'
  - `created_at` (timestamptz, DEFAULT now())
  - `updated_at` (timestamptz, DEFAULT now()) — used for conflict resolution
  - `last_synced_at` (timestamptz) — when local draft was last synced to cloud

## Security
- RLS enabled on `product_drafts`.
- Owner-scoped CRUD: each authenticated user can only access their own drafts.
- `user_id` defaults to `auth.uid()` so inserts omitting it still satisfy policy.

## Notes
1. `updated_at` is maintained by the client (set on every save). Conflict
   resolution compares this timestamp between local and cloud versions.
2. `draft_data` stores image previews as base64 data URLs so drafts are fully
   restorable offline without needing the uploaded image files.
3. When a draft is published, `status` flips to 'published' and the draft row
   may be deleted by the client.
*/

CREATE TABLE IF NOT EXISTS product_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_name text,
  draft_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz
);

ALTER TABLE product_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_drafts" ON product_drafts;
CREATE POLICY "select_own_drafts" ON product_drafts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_drafts" ON product_drafts;
CREATE POLICY "insert_own_drafts" ON product_drafts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_drafts" ON product_drafts;
CREATE POLICY "update_own_drafts" ON product_drafts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_drafts" ON product_drafts;
CREATE POLICY "delete_own_drafts" ON product_drafts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_product_drafts_user_id ON product_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_product_drafts_updated_at ON product_drafts(updated_at DESC);
