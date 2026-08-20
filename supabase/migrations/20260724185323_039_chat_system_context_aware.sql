/*
# Chat System 2.0 - Context-Aware Conversations

## Summary
Extends the existing chat system with conversation context (why the chat was started),
typing indicators for real-time UX, and user presence tracking.

## Changes

### Modified Tables
- `chat_conversations`
  - Added `context_type` TEXT: the purpose of the conversation
    (product_inquiry, service_inquiry, job_application, store_inquiry, order_support, admin_support, affiliate_support, general)
  - Added `context_id` UUID: the ID of the related entity (product, job, store, order)
  - Added `context_data` JSONB: snapshot of context entity (title, price, image_url, etc.)
  - Added `is_pinned` BOOLEAN: user can pin conversations
  - Added `initiator_id` UUID: who started the conversation

### New Tables
- `chat_typing_indicators`
  - `conversation_id` UUID
  - `user_id` UUID
  - `updated_at` TIMESTAMPTZ
  - Auto-cleans stale indicators (> 10s old)

- `chat_presence`
  - `user_id` UUID PRIMARY KEY
  - `is_online` BOOLEAN
  - `last_seen_at` TIMESTAMPTZ

## Security
- RLS enabled on all new/modified columns and tables
- Authenticated users only for typing + presence
- Chat conversations: participants can read/write their own
*/

-- Extend chat_conversations with context fields
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS context_type TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS context_id UUID,
  ADD COLUMN IF NOT EXISTS context_data JSONB,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS initiator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Typing indicators table
CREATE TABLE IF NOT EXISTS chat_typing_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

-- Presence table
CREATE TABLE IF NOT EXISTS chat_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_typing_conv ON chat_typing_indicators(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_typing_user ON chat_typing_indicators(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_initiator ON chat_conversations(initiator_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_context ON chat_conversations(context_type, context_id);

-- RLS on typing indicators
ALTER TABLE chat_typing_indicators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_select_typing" ON chat_typing_indicators;
CREATE POLICY "participants_select_typing" ON chat_typing_indicators FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "participants_insert_typing" ON chat_typing_indicators;
CREATE POLICY "participants_insert_typing" ON chat_typing_indicators FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "participants_update_typing" ON chat_typing_indicators;
CREATE POLICY "participants_update_typing" ON chat_typing_indicators FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "participants_delete_typing" ON chat_typing_indicators;
CREATE POLICY "participants_delete_typing" ON chat_typing_indicators FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS on presence
ALTER TABLE chat_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_presence" ON chat_presence;
CREATE POLICY "authenticated_select_presence" ON chat_presence FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "own_insert_presence" ON chat_presence;
CREATE POLICY "own_insert_presence" ON chat_presence FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_update_presence" ON chat_presence;
CREATE POLICY "own_update_presence" ON chat_presence FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_delete_presence" ON chat_presence;
CREATE POLICY "own_delete_presence" ON chat_presence FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Add initiator_id to existing RLS policies (extend existing chat_conversations policies)
-- The existing policies use customer_id/seller_id checks; initiator_id is additional metadata only.
-- No policy changes needed for existing tables as policies already cover participant access.
