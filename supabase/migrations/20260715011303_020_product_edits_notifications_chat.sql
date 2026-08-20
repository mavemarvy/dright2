-- ============================================================
-- 1. Product Edit Proposals (pending approval workflow)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  proposed_changes jsonb NOT NULL,
  original_snapshot jsonb,
  rejection_reason text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE product_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_edits_select_own_or_admin" ON product_edits;
CREATE POLICY "product_edits_select_own_or_admin" ON product_edits
  FOR SELECT TO authenticated USING (
    proposed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active')
  );

DROP POLICY IF EXISTS "product_edits_insert_seller" ON product_edits;
CREATE POLICY "product_edits_insert_seller" ON product_edits
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.uploaded_by = auth.uid())
  );

DROP POLICY IF EXISTS "product_edits_update_admin" ON product_edits;
CREATE POLICY "product_edits_update_admin" ON product_edits
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active')
  );

CREATE INDEX IF NOT EXISTS idx_product_edits_product ON product_edits(product_id);
CREATE INDEX IF NOT EXISTS idx_product_edits_status ON product_edits(status);
CREATE INDEX IF NOT EXISTS idx_product_edits_proposed_by ON product_edits(proposed_by);

-- ============================================================
-- 2. Product Edit Audit Log
-- ============================================================
CREATE TABLE IF NOT EXISTS product_edit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  edit_id uuid REFERENCES product_edits(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changes_summary jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_edit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_edit_logs_select" ON product_edit_logs;
CREATE POLICY "product_edit_logs_select" ON product_edit_logs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND (p.uploaded_by = auth.uid()
      OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active')))
  );

CREATE INDEX IF NOT EXISTS idx_product_edit_logs_product ON product_edit_logs(product_id);

-- ============================================================
-- 3. Notification Preferences (per user, per type, per channel)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  in_app_enabled boolean DEFAULT true,
  email_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, notification_type)
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_select_own" ON notification_preferences;
CREATE POLICY "notif_prefs_select_own" ON notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_prefs_insert_own" ON notification_preferences;
CREATE POLICY "notif_prefs_insert_own" ON notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_prefs_update_own" ON notification_preferences;
CREATE POLICY "notif_prefs_update_own" ON notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_prefs_delete_own" ON notification_preferences;
CREATE POLICY "notif_prefs_delete_own" ON notification_preferences
  FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE notifications REPLICA IDENTITY FULL;

-- ============================================================
-- 4. Chat Conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_type text NOT NULL DEFAULT 'general',
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES users(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  last_message text,
  last_message_at timestamptz,
  customer_unread_count int DEFAULT 0,
  seller_unread_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conv_participant_access" ON chat_conversations;
CREATE POLICY "chat_conv_participant_access" ON chat_conversations
  FOR SELECT TO authenticated USING (
    customer_id = auth.uid()
    OR seller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active')
  );

DROP POLICY IF EXISTS "chat_conv_insert_customer" ON chat_conversations;
CREATE POLICY "chat_conv_insert_customer" ON chat_conversations
  FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "chat_conv_update_participant" ON chat_conversations;
CREATE POLICY "chat_conv_update_participant" ON chat_conversations
  FOR UPDATE TO authenticated USING (
    customer_id = auth.uid()
    OR seller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active')
  ) WITH CHECK (
    customer_id = auth.uid()
    OR seller_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active')
  );

CREATE INDEX IF NOT EXISTS idx_chat_conv_customer ON chat_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_seller ON chat_conversations(seller_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_status ON chat_conversations(status);

-- ============================================================
-- 5. Chat Messages
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_msg_participant_read" ON chat_messages;
CREATE POLICY "chat_msg_participant_read" ON chat_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
      AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active')))
  );

DROP POLICY IF EXISTS "chat_msg_participant_insert" ON chat_messages;
CREATE POLICY "chat_msg_participant_insert" ON chat_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id
      AND (c.customer_id = auth.uid() OR c.seller_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin = true AND u.admin_status = 'active')))
  );

DROP POLICY IF EXISTS "chat_msg_sender_update" ON chat_messages;
CREATE POLICY "chat_msg_sender_update" ON chat_messages
  FOR UPDATE TO authenticated USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_created ON chat_messages(created_at);

ALTER TABLE chat_messages REPLICA IDENTITY FULL;
ALTER TABLE chat_conversations REPLICA IDENTITY FULL;
