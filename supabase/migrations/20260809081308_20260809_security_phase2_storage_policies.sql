/*
# Security Hardening Phase 2: Storage Policy Security Fixes

## Purpose
Fix 4 storage buckets with overly permissive policies:

1. product-images: INSERT had no ownership check — any authenticated user could upload
   to any path. Now requires the folder to match auth.uid().
2. campaign-media: DELETE had no ownership check — any authenticated user could delete
   anyone's files. Now requires folder ownership. INSERT also requires ownership.
3. chat-attachments: INSERT had no folder check — any authenticated user could upload
   to any chat folder. Now requires the user's folder path.
4. cms-media: Admin checks used hardcoded `users.role = 'admin'` string. Now uses
   is_super_admin() or has_rbac_permission('cms', 'manage').

## Policies Changed (8 policies replaced)
- product-images INSERT: add ownership check
- campaign-media INSERT: add ownership check
- campaign-media DELETE: add ownership check
- chat-attachments INSERT: add folder ownership check
- cms-media INSERT: replace hardcoded role check with RBAC
- cms-media UPDATE: replace hardcoded role check with RBAC
- cms-media DELETE: replace hardcoded role check with RBAC

## Important Notes
1. Public read on product-images and cms-media is preserved.
2. Chat attachment reads remain authenticated-only (privacy).
3. Folder structure: product-images/{user_id}/..., campaign-media/{user_id}/...,
   chat-attachments/{conversation_id}/{user_id}/...
*/

-- ============================================================
-- 1. product-images: Fix INSERT to require ownership
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload product images" ON storage.objects;

CREATE POLICY "Users can upload own product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 2. campaign-media: Fix INSERT and DELETE to require ownership
-- ============================================================
DROP POLICY IF EXISTS "campaign_media_upload" ON storage.objects;

CREATE POLICY "Users can upload own campaign media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'campaign-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "campaign_media_delete" ON storage.objects;

CREATE POLICY "Users can delete own campaign media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 3. chat-attachments: Fix INSERT to require folder ownership
-- ============================================================
DROP POLICY IF EXISTS "chat_attach_upload" ON storage.objects;

CREATE POLICY "Users can upload own chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[3] = auth.uid()::text
);

-- ============================================================
-- 4. cms-media: Replace hardcoded role checks with RBAC
-- ============================================================
DROP POLICY IF EXISTS "admin_upload_cms_media_storage" ON storage.objects;

CREATE POLICY "Admins can upload cms media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cms-media'
  AND (public.is_super_admin() OR public.has_rbac_permission('cms', 'manage'))
);

DROP POLICY IF EXISTS "admin_update_cms_media_storage" ON storage.objects;

CREATE POLICY "Admins can update cms media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'cms-media'
  AND (public.is_super_admin() OR public.has_rbac_permission('cms', 'manage'))
)
WITH CHECK (
  bucket_id = 'cms-media'
  AND (public.is_super_admin() OR public.has_rbac_permission('cms', 'manage'))
);

DROP POLICY IF EXISTS "admin_delete_cms_media_storage" ON storage.objects;

CREATE POLICY "Admins can delete cms media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cms-media'
  AND (public.is_super_admin() OR public.has_rbac_permission('cms', 'manage'))
);
