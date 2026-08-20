/*
# Chat System 2.0 - Part 4: Production RLS Fixes, Indexes, Notification Events

## Summary
Fixes security issues in chat RLS policies, adds performance indexes for
message pagination, and creates a notification_events table that the chat
system emits structured events into for the future Notification Center.

## Security Fixes

### chat_conversation_summaries
- Previous: SELECT/UPDATE/DELETE used USING(true) — any authenticated user
  could read or modify ANY conversation summary.
- Fixed: SELECT now requires conversation participation. UPDATE/DELETE
  require participation. INSERT requires participation.

### chat_spam_flags
- Previous: INSERT used WITH CHECK (true) — anyone could flag any conversation.
- Fixed: INSERT requires the user to be a participant in the conversation.

### chat_conversation_timeline
- Previous: INSERT used WITH CHECK (true) — anyone could insert timeline events.
- Fixed: INSERT requires the user to be a participant in the conversation.

## New Indexes
- chat_messages(conversation_id, created_at DESC) — composite index for
  paginated message loading (most common query pattern).
- chat_messages(conversation_id, created_at) — for ascending chronological load.

## New Table: notification_events
Structured event queue that the chat system writes to. The future
Notification Center will consume these events to build user notifications.
Events are scoped to a recipient user_id, have a type, optional
conversation/message/product references, and a read_at timestamp.
RLS: users can only read their own events. Any authenticated user can
insert (chat system writes events for other users). Admins can read all.
*/

-- ─── Fix RLS on chat_conversation_summaries ───────────────────────────────────

DROP POLICY IF EXISTS "summary_select" ON chat_conversation_summaries;
CREATE POLICY "summary_select" ON chat_conversation_summaries FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "summary_insert" ON chat_conversation_summaries;
CREATE POLICY "summary_insert" ON chat_conversation_summaries FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "summary_update" ON chat_conversation_summaries;
CREATE POLICY "summary_update" ON chat_conversation_summaries FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "summary_delete" ON chat_conversation_summaries;
CREATE POLICY "summary_delete" ON chat_conversation_summaries FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

-- ─── Fix RLS on chat_spam_flags INSERT ────────────────────────────────────────

DROP POLICY IF EXISTS "spam_flags_insert" ON chat_spam_flags;
CREATE POLICY "spam_flags_insert" ON chat_spam_flags FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

-- ─── Fix RLS on chat_conversation_timeline INSERT ─────────────────────────────

DROP POLICY IF EXISTS "timeline_insert" ON chat_conversation_timeline;
CREATE POLICY "timeline_insert" ON chat_conversation_timeline FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

-- ─── Performance Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv_created_desc
  ON chat_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv_created_asc
  ON chat_messages(conversation_id, created_at);

-- ─── Notification Events Table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  product_id UUID,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own notification events
DROP POLICY IF EXISTS "notif_events_select_own" ON notification_events;
CREATE POLICY "notif_events_select_own" ON notification_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Any authenticated user can insert (chat emits events for other users)
DROP POLICY IF EXISTS "notif_events_insert" ON notification_events;
CREATE POLICY "notif_events_insert" ON notification_events FOR INSERT
  TO authenticated WITH CHECK (true);

-- Users can mark their own events as read
DROP POLICY IF EXISTS "notif_events_update_own" ON notification_events;
CREATE POLICY "notif_events_update_own" ON notification_events FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own events
DROP POLICY IF EXISTS "notif_events_delete_own" ON notification_events;
CREATE POLICY "notif_events_delete_own" ON notification_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Admins can read all events
DROP POLICY IF EXISTS "notif_events_admin_select" ON notification_events;
CREATE POLICY "notif_events_admin_select" ON notification_events FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE INDEX IF NOT EXISTS idx_notif_events_user ON notification_events(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notif_events_type ON notification_events(event_type);
CREATE INDEX IF NOT EXISTS idx_notif_events_conv ON notification_events(conversation_id) WHERE conversation_id IS NOT NULL;

ALTER TABLE notification_events REPLICA IDENTITY FULL;
