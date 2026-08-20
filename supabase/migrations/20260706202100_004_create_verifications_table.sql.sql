/*
# Create verifications table

1. Purpose
- Allows promoters to submit proof-of-sale screenshots for verification.
- Stores screenshot URL, transaction details, and approval status.

2. New Tables
- `verifications`
  - `id` (uuid, primary key)
  - `promoter_id` (uuid, not null, references auth.users)
  - `screenshot_url` (text, not null) - public URL from Supabase Storage
  - `transaction_details` (text, not null) - Transaction ID or buyer details
  - `status` (text, default 'pending') - 'pending', 'approved', 'rejected'
  - `submitted_at` (timestamptz, default now())

3. Security (RLS)
- Enable RLS.
- Promoters can view and create their own verifications.
- Status changes to approved/rejected handled by admin or system.

4. Notes
- Screenshots stored in Supabase Storage bucket 'verification-screenshots'.
- Status workflow: pending -> approved or pending -> rejected.
*/

CREATE TABLE IF NOT EXISTS verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  screenshot_url text NOT NULL,
  transaction_details text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verifications_promoter_id ON verifications(promoter_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON verifications(status);
CREATE INDEX IF NOT EXISTS idx_verifications_submitted_at ON verifications(submitted_at DESC);

ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Promoters can read own verifications" ON verifications;
CREATE POLICY "Promoters can read own verifications"
ON verifications FOR SELECT
TO authenticated
USING (auth.uid() = promoter_id);

DROP POLICY IF EXISTS "Promoters can insert own verifications" ON verifications;
CREATE POLICY "Promoters can insert own verifications"
ON verifications FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = promoter_id);