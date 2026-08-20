/*
# Storage RLS policies for chat-attachments bucket

Allows authenticated users to upload and read chat attachments.
Files are stored under chat/{conversation_id}/{user_id}/ path structure.
*/

DROP POLICY IF EXISTS "chat_attach_upload" ON storage.objects;
CREATE POLICY "chat_attach_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "chat_attach_read" ON storage.objects;
CREATE POLICY "chat_attach_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS "chat_attach_delete_own" ON storage.objects;
CREATE POLICY "chat_attach_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[3]);
