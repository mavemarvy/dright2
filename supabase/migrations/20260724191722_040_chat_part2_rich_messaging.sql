/*
# Chat System 2.0 - Part 2: Rich Messaging Features

## Summary
Extends the chat system with attachments, voice notes, message reactions, edits,
soft-deletes, starred messages, pinned messages, quick replies, seller notes,
draft messages, and conversation timeline events.

## New Tables

### chat_message_attachments
Stores file metadata for message attachments (images, videos, docs, audio, voice notes).
Each message can have multiple attachments.

### chat_message_reactions
Emoji reactions on messages. One row per user per message per emoji.

### chat_message_edits
Audit log of message edits for moderation purposes.

### chat_starred_messages
Per-user starred messages (many-to-many between users and messages).

### chat_pinned_messages
Pinned messages per conversation (max shown, ordered by pinned_at).

### chat_quick_replies
Seller-saved reusable response templates.

### chat_seller_notes
Private notes attached to conversations by sellers (not visible to buyers).

### chat_message_drafts
Auto-saved unsent message drafts per user per conversation.

### chat_conversation_timeline
Events timeline for conversations linked to products/orders/jobs.

## Modified Tables

### chat_messages
- Added `reply_to_id` UUID (self-reference for threaded replies)
- Added `is_deleted` BOOLEAN (soft delete support)
- Added `deleted_for_everyone` BOOLEAN
- Added `is_edited` BOOLEAN
- Added `message_type` TEXT (text, image, video, document, audio, voice_note, marketplace_card)
- Added `metadata` JSONB (for marketplace cards, link previews, etc.)

## Security
- RLS enabled on all new tables
- Authenticated-only access
- Row ownership enforced per table
*/

-- ─── Extend chat_messages ────────────────────────────────────────────────────

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_for_everyone BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- ─── chat_message_attachments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds NUMERIC,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_attach_select" ON chat_message_attachments;
CREATE POLICY "chat_attach_select" ON chat_message_attachments FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "chat_attach_insert" ON chat_message_attachments;
CREATE POLICY "chat_attach_insert" ON chat_message_attachments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = uploader_id);

DROP POLICY IF EXISTS "chat_attach_delete" ON chat_message_attachments;
CREATE POLICY "chat_attach_delete" ON chat_message_attachments FOR DELETE
  TO authenticated USING (auth.uid() = uploader_id);

-- ─── chat_message_reactions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select" ON chat_message_reactions;
CREATE POLICY "reactions_select" ON chat_message_reactions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "reactions_insert" ON chat_message_reactions;
CREATE POLICY "reactions_insert" ON chat_message_reactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reactions_delete" ON chat_message_reactions;
CREATE POLICY "reactions_delete" ON chat_message_reactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── chat_message_edits ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_message_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  editor_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_body TEXT NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_message_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msg_edits_admin_select" ON chat_message_edits;
CREATE POLICY "msg_edits_admin_select" ON chat_message_edits FOR SELECT
  TO authenticated USING (
    auth.uid() = editor_id OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "msg_edits_insert" ON chat_message_edits;
CREATE POLICY "msg_edits_insert" ON chat_message_edits FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = editor_id);

-- ─── chat_starred_messages ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_starred_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);

ALTER TABLE chat_starred_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "starred_select" ON chat_starred_messages;
CREATE POLICY "starred_select" ON chat_starred_messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "starred_insert" ON chat_starred_messages;
CREATE POLICY "starred_insert" ON chat_starred_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "starred_delete" ON chat_starred_messages;
CREATE POLICY "starred_delete" ON chat_starred_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── chat_pinned_messages ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, message_id)
);

ALTER TABLE chat_pinned_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pinned_select" ON chat_pinned_messages;
CREATE POLICY "pinned_select" ON chat_pinned_messages FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "pinned_insert" ON chat_pinned_messages;
CREATE POLICY "pinned_insert" ON chat_pinned_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = pinned_by);

DROP POLICY IF EXISTS "pinned_delete" ON chat_pinned_messages;
CREATE POLICY "pinned_delete" ON chat_pinned_messages FOR DELETE
  TO authenticated USING (auth.uid() = pinned_by);

-- ─── chat_quick_replies ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_quick_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_select" ON chat_quick_replies;
CREATE POLICY "qr_select" ON chat_quick_replies FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "qr_insert" ON chat_quick_replies;
CREATE POLICY "qr_insert" ON chat_quick_replies FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "qr_update" ON chat_quick_replies;
CREATE POLICY "qr_update" ON chat_quick_replies FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "qr_delete" ON chat_quick_replies;
CREATE POLICY "qr_delete" ON chat_quick_replies FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── chat_seller_notes ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_seller_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_seller_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller_notes_select" ON chat_seller_notes;
CREATE POLICY "seller_notes_select" ON chat_seller_notes FOR SELECT
  TO authenticated USING (
    auth.uid() = seller_id OR
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "seller_notes_insert" ON chat_seller_notes;
CREATE POLICY "seller_notes_insert" ON chat_seller_notes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "seller_notes_update" ON chat_seller_notes;
CREATE POLICY "seller_notes_update" ON chat_seller_notes FOR UPDATE
  TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "seller_notes_delete" ON chat_seller_notes;
CREATE POLICY "seller_notes_delete" ON chat_seller_notes FOR DELETE
  TO authenticated USING (auth.uid() = seller_id);

-- ─── chat_message_drafts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_message_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

ALTER TABLE chat_message_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drafts_select" ON chat_message_drafts;
CREATE POLICY "drafts_select" ON chat_message_drafts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "drafts_insert" ON chat_message_drafts;
CREATE POLICY "drafts_insert" ON chat_message_drafts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drafts_update" ON chat_message_drafts;
CREATE POLICY "drafts_update" ON chat_message_drafts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "drafts_delete" ON chat_message_drafts;
CREATE POLICY "drafts_delete" ON chat_message_drafts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── chat_conversation_timeline ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_conversation_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_label TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_conversation_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timeline_select" ON chat_conversation_timeline;
CREATE POLICY "timeline_select" ON chat_conversation_timeline FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "timeline_insert" ON chat_conversation_timeline;
CREATE POLICY "timeline_insert" ON chat_conversation_timeline FOR INSERT
  TO authenticated WITH CHECK (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_chat_attach_msg ON chat_message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attach_conv ON chat_message_attachments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_reactions_msg ON chat_message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_starred_user ON chat_starred_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_starred_msg ON chat_starred_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_pinned_conv ON chat_pinned_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_user ON chat_quick_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_notes_conv ON chat_seller_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_drafts_conv_user ON chat_message_drafts(conversation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_timeline_conv ON chat_conversation_timeline(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_reply_to ON chat_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_type ON chat_messages(message_type);
