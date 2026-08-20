/*
# Create verification-screenshots storage bucket

1. Purpose
- Creates a Supabase Storage bucket for storing verification screenshots uploaded by promoters.

2. Storage Bucket
- Name: verification-screenshots
- Public: false (files are accessible but secured via policies)

3. Security Policies
- Users can upload files to their own folder: user_id/filename
- Users can read their own files
- Public access is not allowed - files are served only to authenticated users who own them

4. Notes
- The bucket uses a user_id prefix to organize uploads
- RLS policies ensure users can only access their own uploads
*/

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-screenshots', 'verification-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Users can upload to their own folder
DROP POLICY IF EXISTS "Users can upload own screenshots" ON storage.objects;
CREATE POLICY "Users can upload own screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'verification-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy: Users can read their own files
DROP POLICY IF EXISTS "Users can read own screenshots" ON storage.objects;
CREATE POLICY "Users can read own screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'verification-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);