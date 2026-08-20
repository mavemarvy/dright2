/*
# Creator Campaigns & Task Marketplace — Storage Policies
Adds storage bucket + policies for campaign media uploads.
Run after the main migration.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-media', 'campaign-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "campaign_media_upload" ON storage.objects;
CREATE POLICY "campaign_media_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-media');

DROP POLICY IF EXISTS "campaign_media_read" ON storage.objects;
CREATE POLICY "campaign_media_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-media');

DROP POLICY IF EXISTS "campaign_media_delete" ON storage.objects;
CREATE POLICY "campaign_media_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-media');
