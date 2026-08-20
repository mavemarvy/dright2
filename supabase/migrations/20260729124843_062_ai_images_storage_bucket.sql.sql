/*
# Create ai-images storage bucket

1. Storage
- Creates a public storage bucket `ai-images` for storing AI-generated and analyzed images.
- Allows authenticated users to upload their own images.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-images', 'ai-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own ai-images" ON storage.objects;
CREATE POLICY "Users can upload own ai-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ai-images' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can read ai-images" ON storage.objects;
CREATE POLICY "Users can read ai-images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'ai-images');

DROP POLICY IF EXISTS "Users can delete own ai-images" ON storage.objects;
CREATE POLICY "Users can delete own ai-images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'ai-images' AND auth.uid() = owner);
