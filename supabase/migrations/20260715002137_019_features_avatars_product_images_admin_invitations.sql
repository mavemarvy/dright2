/*
# Feature Migrations: Avatar storage, Product Images, Admin Invitations, Remove Physical type
*/

-- ============================================================
-- 1. Avatars storage bucket + avatar_url column on users
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

-- RLS policies for avatars bucket
DROP POLICY IF EXISTS "avatar_public_read" ON storage.objects;
CREATE POLICY "avatar_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatar_owner_insert" ON storage.objects;
CREATE POLICY "avatar_owner_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND owner = auth.uid());

DROP POLICY IF EXISTS "avatar_owner_update" ON storage.objects;
CREATE POLICY "avatar_owner_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND owner = auth.uid());

DROP POLICY IF EXISTS "avatar_owner_delete" ON storage.objects;
CREATE POLICY "avatar_owner_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND owner = auth.uid());

-- ============================================================
-- 2. product_images table for multi-image galleries
-- ============================================================
CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_images_public_read" ON product_images;
CREATE POLICY "product_images_public_read" ON product_images
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "product_images_owner_insert" ON product_images;
CREATE POLICY "product_images_owner_insert" ON product_images
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "product_images_owner_update" ON product_images;
CREATE POLICY "product_images_owner_update" ON product_images
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "product_images_owner_delete" ON product_images;
CREATE POLICY "product_images_owner_delete" ON product_images
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.uploaded_by = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_position ON product_images(position);

-- ============================================================
-- 3. admin_invitations table for invite-only admin system
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  invite_token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

ALTER TABLE admin_invitations ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
DROP POLICY IF EXISTS "admin_invitations_super_admin_all" ON admin_invitations;
CREATE POLICY "admin_invitations_super_admin_all" ON admin_invitations
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.admin_role = 'super_admin' AND u.admin_status = 'active')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.admin_role = 'super_admin' AND u.admin_status = 'active')
  );

-- Anyone can look up an invitation by token (for the acceptance page)
DROP POLICY IF EXISTS "admin_invitations_token_lookup" ON admin_invitations;
CREATE POLICY "admin_invitations_token_lookup" ON admin_invitations
  FOR SELECT TO anon, authenticated USING (true);

-- Insert allowed for super admins (covered by the ALL policy above)

CREATE INDEX IF NOT EXISTS idx_admin_invitations_token ON admin_invitations(invite_token);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_status ON admin_invitations(status);

-- ============================================================
-- 4. Migrate existing PHYSICAL products to DIGITAL
-- ============================================================
UPDATE products SET product_type = 'DIGITAL' WHERE product_type = 'PHYSICAL';

-- Add a CHECK constraint to prevent future PHYSICAL products
ALTER TABLE products DROP CONSTRAINT IF EXISTS product_type_check;
ALTER TABLE products ADD CONSTRAINT product_type_check
  CHECK (product_type IN ('DIGITAL', 'SERVICE', 'COURSE'));
