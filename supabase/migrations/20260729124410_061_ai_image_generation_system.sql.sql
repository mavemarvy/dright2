/*
# AI Image Generation System

1. New Tables
- `ai_images` — stores all AI-generated and AI-analyzed images
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner of the image, defaults to auth.uid())
  - `prompt` (text, the prompt used to generate or analyze)
  - `image_url` (text, public URL of the generated/stored image)
  - `type` (text, one of: generated | edited | analyzed | banner | marketing | product | background_removed | enhanced)
  - `provider` (text, which AI provider was used: groq | gemini | openai)
  - `model` (text, specific model name)
  - `status` (text, pending | completed | failed | flagged | removed)
  - `metadata` (jsonb, extra info: original_image_url, analysis_result, suggestions, etc.)
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `ai_images`.
- Owner-scoped CRUD: authenticated users can only access their own images.
- Admin override: admins can read all images and update status (moderation).
- Uses a security definer function `is_admin_user()` to check admin status.

3. Indexes
- `idx_ai_images_user_id` — fast lookup by owner
- `idx_ai_images_status` — filter by moderation status
- `idx_ai_images_created_at` — sort by newest
*/

CREATE TABLE IF NOT EXISTS ai_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'generated' CHECK (type IN ('generated','edited','analyzed','banner','marketing','product','background_removed','enhanced')),
  provider text NOT NULL DEFAULT 'groq' CHECK (provider IN ('groq','gemini','openai','none')),
  model text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','flagged','removed')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_images ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.is_admin = true
    AND users.admin_status = 'active'
  );
$$;

-- Owner-scoped CRUD policies
DROP POLICY IF EXISTS "select_own_ai_images" ON ai_images;
CREATE POLICY "select_own_ai_images"
ON ai_images FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_admin_user());

DROP POLICY IF EXISTS "insert_own_ai_images" ON ai_images;
CREATE POLICY "insert_own_ai_images"
ON ai_images FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_ai_images" ON ai_images;
CREATE POLICY "update_own_ai_images"
ON ai_images FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR is_admin_user())
WITH CHECK (auth.uid() = user_id OR is_admin_user());

DROP POLICY IF EXISTS "delete_own_ai_images" ON ai_images;
CREATE POLICY "delete_own_ai_images"
ON ai_images FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR is_admin_user());

CREATE INDEX IF NOT EXISTS idx_ai_images_user_id ON ai_images(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_images_status ON ai_images(status);
CREATE INDEX IF NOT EXISTS idx_ai_images_created_at ON ai_images(created_at DESC);
