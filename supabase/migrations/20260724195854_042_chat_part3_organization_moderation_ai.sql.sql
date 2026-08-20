/*
# Chat System 2.0 - Part 3: Organization, Moderation, AI & Productivity

## Summary
Extends the chat system with conversation archiving, favorites, per-user pinned
conversations with drag-and-drop ordering, labels, user blocking, reporting,
spam detection flags, seller follow-up reminders, customer tags, AI conversation
summaries cache, and moderation audit logs.

## New Tables

### chat_archived_conversations
Per-user archive state. Both participants (customer & seller) can independently
archive a conversation. Archived conversations remain in the DB, retain all
messages, and can still receive new messages. Excluded from default inbox view.

### chat_favorite_conversations
Per-user favorites. Users mark important conversations as favorites. Syncs
across devices via Supabase.

### chat_pinned_conversations
Per-user pinned conversations with sort_order for drag-and-drop reordering.
Default pin limit: 5 (enforced client-side). The existing is_pinned column on
chat_conversations remains for backward compatibility.

### chat_labels
Label definitions. System labels are pre-seeded (Product Inquiry, High Priority,
VIP Customer, etc.). Admins can create custom labels.

### chat_conversation_labels
Many-to-many junction between conversations and labels. Multiple labels per
conversation supported.

### chat_user_blocks
User blocking. Blocked users cannot start new conversations. Existing
conversations remain visible. Admin retains visibility for moderation.

### chat_reports
User reports for spam, scam, harassment, fake listings, etc. Creates moderation
tickets for admins. Linked to conversation and optional message.

### chat_follow_up_reminders
Seller-scheduled reminders tied to conversations. Integrate with Notification
Center. Types: reply_tomorrow, call_customer, send_quotation, confirm_payment.

### chat_customer_tags
Seller-applied tags on customers. Private to the seller. Useful for CRM-like
organization.

### chat_spam_flags
Spam detection flags. Flagged conversations surface for moderation review
instead of auto-deleting. Flag types: duplicate_message, excessive_rate,
suspicious_link, unsafe_file, promotional_repeat.

### chat_conversation_summaries
Cache for AI-generated conversation summaries. Regenerated on demand. Visible
only to conversation participants.

### chat_audit_logs
Moderation action audit trail. Records admin actions on conversations, messages,
and users for accountability.

## Modified Tables
### chat_conversations
- Added spam_score INTEGER (0-100, higher = more suspicious)
- Added is_flagged BOOLEAN (true when flagged for moderation review)

## Security
- RLS enabled on all new tables
- Authenticated-only access with ownership or participant checks
- Admin override on reports, spam flags, and audit logs
- Blocks: only blocker can manage their own blocks
- Labels: all authenticated can read; only admins can create/update/delete
*/

-- ─── Extend chat_conversations ──────────────────────────────────────────────

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS spam_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chat_conv_flagged ON chat_conversations(is_flagged) WHERE is_flagged = true;

-- ─── chat_archived_conversations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_archived_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

ALTER TABLE chat_archived_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "archived_select_own" ON chat_archived_conversations;
CREATE POLICY "archived_select_own" ON chat_archived_conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "archived_insert_own" ON chat_archived_conversations;
CREATE POLICY "archived_insert_own" ON chat_archived_conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "archived_delete_own" ON chat_archived_conversations;
CREATE POLICY "archived_delete_own" ON chat_archived_conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_archived_user ON chat_archived_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_archived_conv ON chat_archived_conversations(conversation_id);

-- ─── chat_favorite_conversations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_favorite_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  favorited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (conversation_id, user_id)
);

ALTER TABLE chat_favorite_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fav_select_own" ON chat_favorite_conversations;
CREATE POLICY "fav_select_own" ON chat_favorite_conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_insert_own" ON chat_favorite_conversations;
CREATE POLICY "fav_insert_own" ON chat_favorite_conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_update_own" ON chat_favorite_conversations;
CREATE POLICY "fav_update_own" ON chat_favorite_conversations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_delete_own" ON chat_favorite_conversations;
CREATE POLICY "fav_delete_own" ON chat_favorite_conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fav_user ON chat_favorite_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_conv ON chat_favorite_conversations(conversation_id);

-- ─── chat_pinned_conversations ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_pinned_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (conversation_id, user_id)
);

ALTER TABLE chat_pinned_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pin_conv_select_own" ON chat_pinned_conversations;
CREATE POLICY "pin_conv_select_own" ON chat_pinned_conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pin_conv_insert_own" ON chat_pinned_conversations;
CREATE POLICY "pin_conv_insert_own" ON chat_pinned_conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pin_conv_update_own" ON chat_pinned_conversations;
CREATE POLICY "pin_conv_update_own" ON chat_pinned_conversations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pin_conv_delete_own" ON chat_pinned_conversations;
CREATE POLICY "pin_conv_delete_own" ON chat_pinned_conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_pin_conv_user ON chat_pinned_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_pin_conv_conv ON chat_pinned_conversations(conversation_id);

-- ─── chat_labels ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT 'gray',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labels_select_all" ON chat_labels;
CREATE POLICY "labels_select_all" ON chat_labels FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "labels_insert_admin" ON chat_labels;
CREATE POLICY "labels_insert_admin" ON chat_labels FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "labels_update_admin" ON chat_labels;
CREATE POLICY "labels_update_admin" ON chat_labels FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "labels_delete_admin" ON chat_labels;
CREATE POLICY "labels_delete_admin" ON chat_labels FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Seed system labels
INSERT INTO chat_labels (name, color, is_system) VALUES
  ('Product Inquiry', 'blue', true),
  ('Service Booking', 'purple', true),
  ('Job Application', 'green', true),
  ('Store Support', 'orange', true),
  ('Payment Question', 'yellow', true),
  ('Refund Request', 'red', true),
  ('Affiliate Inquiry', 'indigo', true),
  ('VIP Customer', 'amber', true),
  ('Returning Customer', 'teal', true),
  ('High Priority', 'rose', true),
  ('Awaiting Reply', 'cyan', true),
  ('Completed', 'green', true)
ON CONFLICT (name) DO NOTHING;

-- ─── chat_conversation_labels ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_conversation_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES chat_labels(id) ON DELETE CASCADE,
  applied_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, label_id)
);

ALTER TABLE chat_conversation_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conv_labels_select" ON chat_conversation_labels;
CREATE POLICY "conv_labels_select" ON chat_conversation_labels FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "conv_labels_insert" ON chat_conversation_labels;
CREATE POLICY "conv_labels_insert" ON chat_conversation_labels FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = applied_by);

DROP POLICY IF EXISTS "conv_labels_delete" ON chat_conversation_labels;
CREATE POLICY "conv_labels_delete" ON chat_conversation_labels FOR DELETE
  TO authenticated USING (auth.uid() = applied_by);

CREATE INDEX IF NOT EXISTS idx_conv_labels_conv ON chat_conversation_labels(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_labels_label ON chat_conversation_labels(label_id);

-- ─── chat_user_blocks ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

ALTER TABLE chat_user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_select_own" ON chat_user_blocks;
CREATE POLICY "blocks_select_own" ON chat_user_blocks FOR SELECT
  TO authenticated USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocks_insert_own" ON chat_user_blocks;
CREATE POLICY "blocks_insert_own" ON chat_user_blocks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocks_delete_own" ON chat_user_blocks;
CREATE POLICY "blocks_delete_own" ON chat_user_blocks FOR DELETE
  TO authenticated USING (auth.uid() = blocker_id);

-- Admin override for moderation
DROP POLICY IF EXISTS "blocks_admin_select" ON chat_user_blocks;
CREATE POLICY "blocks_admin_select" ON chat_user_blocks FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON chat_user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON chat_user_blocks(blocked_id);

-- ─── chat_reports ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_insert_own" ON chat_reports;
CREATE POLICY "reports_insert_own" ON chat_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "reports_select_own" ON chat_reports;
CREATE POLICY "reports_select_own" ON chat_reports FOR SELECT
  TO authenticated USING (auth.uid() = reporter_id);

-- Admin full access
DROP POLICY IF EXISTS "reports_admin_all" ON chat_reports;
CREATE POLICY "reports_admin_all" ON chat_reports FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "reports_admin_update" ON chat_reports;
CREATE POLICY "reports_admin_update" ON chat_reports FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE INDEX IF NOT EXISTS idx_reports_status ON chat_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON chat_reports(reported_user_id);

-- ─── chat_follow_up_reminders ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_follow_up_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL DEFAULT 'reply_tomorrow',
  title TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_follow_up_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_select_own" ON chat_follow_up_reminders;
CREATE POLICY "reminders_select_own" ON chat_follow_up_reminders FOR SELECT
  TO authenticated USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "reminders_insert_own" ON chat_follow_up_reminders;
CREATE POLICY "reminders_insert_own" ON chat_follow_up_reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "reminders_update_own" ON chat_follow_up_reminders;
CREATE POLICY "reminders_update_own" ON chat_follow_up_reminders FOR UPDATE
  TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "reminders_delete_own" ON chat_follow_up_reminders;
CREATE POLICY "reminders_delete_own" ON chat_follow_up_reminders FOR DELETE
  TO authenticated USING (auth.uid() = seller_id);

CREATE INDEX IF NOT EXISTS idx_reminders_seller ON chat_follow_up_reminders(seller_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON chat_follow_up_reminders(seller_id, due_at) WHERE is_completed = false;

-- ─── chat_customer_tags ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_customer_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seller_id, customer_id, tag)
);

ALTER TABLE chat_customer_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cust_tags_select_own" ON chat_customer_tags;
CREATE POLICY "cust_tags_select_own" ON chat_customer_tags FOR SELECT
  TO authenticated USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "cust_tags_insert_own" ON chat_customer_tags;
CREATE POLICY "cust_tags_insert_own" ON chat_customer_tags FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "cust_tags_delete_own" ON chat_customer_tags;
CREATE POLICY "cust_tags_delete_own" ON chat_customer_tags FOR DELETE
  TO authenticated USING (auth.uid() = seller_id);

CREATE INDEX IF NOT EXISTS idx_cust_tags_seller ON chat_customer_tags(seller_id, customer_id);

-- ─── chat_spam_flags ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_spam_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL,
  details JSONB,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE chat_spam_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spam_flags_insert" ON chat_spam_flags;
CREATE POLICY "spam_flags_insert" ON chat_spam_flags FOR INSERT
  TO authenticated WITH CHECK (true);

-- Admin full access
DROP POLICY IF EXISTS "spam_flags_admin_select" ON chat_spam_flags;
CREATE POLICY "spam_flags_admin_select" ON chat_spam_flags FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "spam_flags_admin_update" ON chat_spam_flags;
CREATE POLICY "spam_flags_admin_update" ON chat_spam_flags FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- Participants can see flags on their own conversations
DROP POLICY IF EXISTS "spam_flags_participant_select" ON chat_spam_flags;
CREATE POLICY "spam_flags_participant_select" ON chat_spam_flags FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
        AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_spam_conv ON chat_spam_flags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_spam_unresolved ON chat_spam_flags(is_resolved) WHERE is_resolved = false;

-- ─── chat_conversation_summaries ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE REFERENCES chat_conversations(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  bullet_points JSONB,
  message_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_conversation_summaries ENABLE ROW LEVEL SECURITY;

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
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "summary_update" ON chat_conversation_summaries;
CREATE POLICY "summary_update" ON chat_conversation_summaries FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "summary_delete" ON chat_conversation_summaries;
CREATE POLICY "summary_delete" ON chat_conversation_summaries FOR DELETE
  TO authenticated USING (true);

-- ─── chat_audit_logs ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_admin_select" ON chat_audit_logs;
CREATE POLICY "audit_admin_select" ON chat_audit_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "audit_admin_insert" ON chat_audit_logs;
CREATE POLICY "audit_admin_insert" ON chat_audit_logs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE INDEX IF NOT EXISTS idx_audit_admin ON chat_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON chat_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_conv ON chat_audit_logs(conversation_id);