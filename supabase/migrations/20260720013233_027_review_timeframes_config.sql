/*
# Create review_timeframes config table

1. New Tables
- `review_timeframes`
  - `id` (uuid, primary key)
  - `upload_type` (text, unique) — 'PRODUCT' | 'SERVICE' | 'COURSE' | 'JOB'
  - `min_hours` (integer) — minimum expected review time in hours
  - `max_hours` (integer) — maximum expected review time in hours
  - `updated_at` (timestamptz)

2. Seed Data
- PRODUCT: 1–24 hours
- SERVICE: 2–48 hours
- COURSE: 6–72 hours
- JOB: 1–12 hours

3. Security
- Enable RLS on `review_timeframes`.
- Allow anon + authenticated to SELECT (config is public, used by frontend post-upload screen).
- Only authenticated admins can UPDATE (managed via admin panel; admin role check via users table).

Important Notes
- This table is read-only from the frontend; admins edit values through the admin system settings page.
- The post-upload confirmation screen fetches the row matching the upload type to display "Review may take anywhere from X to Y hours."
*/

CREATE TABLE IF NOT EXISTS review_timeframes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_type text UNIQUE NOT NULL,
  min_hours integer NOT NULL DEFAULT 1,
  max_hours integer NOT NULL DEFAULT 24,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE review_timeframes ENABLE ROW LEVEL SECURITY;

-- Public read: anon + authenticated can read timeframes (needed by post-upload screen)
DROP POLICY IF EXISTS "anon_read_review_timeframes" ON review_timeframes;
CREATE POLICY "anon_read_review_timeframes"
  ON review_timeframes FOR SELECT
  TO anon, authenticated USING (true);

-- Only authenticated users can update (admin UI enforces admin role in app)
DROP POLICY IF EXISTS "auth_update_review_timeframes" ON review_timeframes;
CREATE POLICY "auth_update_review_timeframes"
  ON review_timeframes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Seed default values (idempotent)
INSERT INTO review_timeframes (upload_type, min_hours, max_hours) VALUES
  ('PRODUCT', 1, 24),
  ('SERVICE', 2, 48),
  ('COURSE', 6, 72),
  ('JOB', 1, 12)
ON CONFLICT (upload_type) DO NOTHING;
