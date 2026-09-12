-- Harden global content visibility and add an admin-only public media bucket.
-- Forward-only follow-up to 20260912054500_news_announcements_publishing_system.sql.

DROP POLICY IF EXISTS read_announcements ON public.global_announcements;
DROP POLICY IF EXISTS authenticated_read_active_global_content ON public.global_announcements;
CREATE POLICY authenticated_read_active_global_content
ON public.global_announcements
FOR SELECT
TO authenticated
USING (is_active = true OR public.can_manage_global_content(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_global_content_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  IF TG_OP = 'INSERT' THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  END IF;

  IF NEW.content_kind = 'news' THEN
    NEW.show_in_news := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_global_content_updated_at ON public.global_announcements;
CREATE TRIGGER trg_global_content_updated_at
BEFORE INSERT OR UPDATE ON public.global_announcements
FOR EACH ROW
EXECUTE FUNCTION public.set_global_content_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'news-media',
  'news-media',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS public_read_news_media ON storage.objects;
CREATE POLICY public_read_news_media
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'news-media');

DROP POLICY IF EXISTS authorized_admin_upload_news_media ON storage.objects;
CREATE POLICY authorized_admin_upload_news_media
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'news-media'
  AND public.can_manage_global_content(auth.uid())
);

DROP POLICY IF EXISTS authorized_admin_update_news_media ON storage.objects;
CREATE POLICY authorized_admin_update_news_media
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'news-media'
  AND public.can_manage_global_content(auth.uid())
)
WITH CHECK (
  bucket_id = 'news-media'
  AND public.can_manage_global_content(auth.uid())
);

DROP POLICY IF EXISTS authorized_admin_delete_news_media ON storage.objects;
CREATE POLICY authorized_admin_delete_news_media
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'news-media'
  AND public.can_manage_global_content(auth.uid())
);
