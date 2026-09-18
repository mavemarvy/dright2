-- Social post media must respect post visibility. Public object URLs would bypass friends/followers/private rules.
UPDATE storage.buckets SET public = false WHERE id = 'social-media';

DROP POLICY IF EXISTS social_media_public_read ON storage.objects;
DROP POLICY IF EXISTS social_media_visible_read ON storage.objects;
CREATE POLICY social_media_visible_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'social-media'
  AND (
    owner = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.social_posts p
      WHERE p.media_path = storage.objects.name
        AND public.social_can_view_post(p.id, auth.uid())
    )
  )
);