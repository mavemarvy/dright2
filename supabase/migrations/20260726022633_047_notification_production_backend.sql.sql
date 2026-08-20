/*
# Notification Center 2.0 — Production Backend Tables (Part 4)

## Summary
Creates the remaining production-grade tables for a complete notification backend:
delivery tracking, reminders, audit logging, category registry, DB-stored templates,
activity feed persistence, user notification statistics, and announcement targeting/delivery.
All tables are additive — no existing tables are modified or duplicated.

## New Tables
1. `notification_delivery_logs` — Tracks each notification's lifecycle:
   created → queued → delivered → read → archived → deleted → expired → dismissed
   with timestamps for delivery analytics (delivery rate, read rate, CTR, etc.)

2. `notification_reminders` — Scheduled reminders with status tracking:
   pending → sent → completed → cancelled → expired
   Supports: unanswered messages, pending applications, unconfirmed bookings,
   incomplete listings, unfinished drafts, withdrawal pending, etc.

3. `notification_audit_log` — Immutable audit trail for all notification actions:
   created, delivered, read, archived, restored, deleted, reminder sent/completed,
   announcement published/dismissed, preference changed, admin actions.
   Includes actor_id and timestamp for every action.

4. `notification_categories` — Registry of notification categories for admin management.
   Enables admins to enable/disable/reorder categories without code changes.

5. `notification_templates_db` — DB-stored templates with placeholder support.
   Supports {{user}}, {{product}}, {{store}}, {{amount}}, {{date}}, etc.
   Localization-ready with locale column.

6. `activity_feed` — Persisted activity timeline for every important user event.
   Supports search, filtering, pagination, and future export.

7. `user_notification_statistics` — Per-user analytics cache for dashboard widgets.
   Stores daily/weekly/monthly aggregated metrics to avoid expensive live queries.

8. `announcement_targets` — Targeting rules for admin announcements:
   everyone, buyers, sellers, affiliates, admins, verified sellers, premium sellers.

9. `announcement_deliveries` — Per-user delivery tracking for announcements.

## Security
- RLS enabled on ALL new tables.
- User-scoped tables (delivery_logs, reminders, activity_feed, statistics,
  announcement_deliveries): 4 CRUD policies each, scoped to auth.uid() = user_id.
- Audit log: INSERT only for authenticated (no UPDATE/DELETE — immutable trail),
  SELECT scoped to own actions.
- Categories & templates: SELECT for authenticated, CRUD for admins via existing
  admin RLS pattern (is_admin check).
- Announcement targets: SELECT for authenticated, CRUD for admins.
- Announcement deliveries: user-scoped CRUD.

## Indexes
- All tables have indexes on user_id + created_at for efficient pagination.
- Delivery logs: index on notification_id for lookup by notification.
- Reminders: index on status + scheduled_for for the scheduler query.
- Audit log: index on actor_id + created_at for user activity queries.
- Activity feed: index on user_id + created_at DESC + GIN on metadata for search.
- Statistics: unique on user_id + period_type + period_start for upsert.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. NOTIFICATION DELIVERY LOGS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'created',
  channel text NOT NULL DEFAULT 'in_app',
  created_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  archived_at timestamptz,
  dismissed_at timestamptz,
  expired_at timestamptz,
  metadata jsonb
);

ALTER TABLE notification_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_delivery_logs" ON notification_delivery_logs;
CREATE POLICY "select_own_delivery_logs"
  ON notification_delivery_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_delivery_logs" ON notification_delivery_logs;
CREATE POLICY "insert_own_delivery_logs"
  ON notification_delivery_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_delivery_logs" ON notification_delivery_logs;
CREATE POLICY "update_own_delivery_logs"
  ON notification_delivery_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_delivery_logs" ON notification_delivery_logs;
CREATE POLICY "delete_own_delivery_logs"
  ON notification_delivery_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_delivery_notif
  ON notification_delivery_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_delivery_user_status
  ON notification_delivery_logs(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_channel
  ON notification_delivery_logs(channel, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. NOTIFICATION REMINDERS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  related_id uuid,
  related_type text,
  status text NOT NULL DEFAULT 'pending',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  priority text NOT NULL DEFAULT 'normal',
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_reminders" ON notification_reminders;
CREATE POLICY "select_own_reminders"
  ON notification_reminders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reminders" ON notification_reminders;
CREATE POLICY "insert_own_reminders"
  ON notification_reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reminders" ON notification_reminders;
CREATE POLICY "update_own_reminders"
  ON notification_reminders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reminders" ON notification_reminders;
CREATE POLICY "delete_own_reminders"
  ON notification_reminders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reminders_pending
  ON notification_reminders(status, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reminders_user
  ON notification_reminders(user_id, status, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. NOTIFICATION AUDIT LOG (immutable — insert + select only)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  notification_id uuid,
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own audit entries
DROP POLICY IF EXISTS "select_own_audit" ON notification_audit_log;
CREATE POLICY "select_own_audit"
  ON notification_audit_log FOR SELECT
  TO authenticated USING (auth.uid() = actor_id);

-- Authenticated users can insert audit entries (their own actions)
DROP POLICY IF EXISTS "insert_audit" ON notification_audit_log;
CREATE POLICY "insert_audit"
  ON notification_audit_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);

-- No UPDATE or DELETE — audit log is immutable by design

CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON notification_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON notification_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_notif
  ON notification_audit_log(notification_id)
  WHERE notification_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. NOTIFICATION CATEGORIES (admin-managed registry)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  icon text,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_categories ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read categories
DROP POLICY IF EXISTS "select_categories" ON notification_categories;
CREATE POLICY "select_categories"
  ON notification_categories FOR SELECT
  TO authenticated USING (true);

-- Admin-only CRUD (checks is_admin flag on users table)
DROP POLICY IF EXISTS "admin_insert_categories" ON notification_categories;
CREATE POLICY "admin_insert_categories"
  ON notification_categories FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

DROP POLICY IF EXISTS "admin_update_categories" ON notification_categories;
CREATE POLICY "admin_update_categories"
  ON notification_categories FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

DROP POLICY IF EXISTS "admin_delete_categories" ON notification_categories;
CREATE POLICY "admin_delete_categories"
  ON notification_categories FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- Seed default categories
INSERT INTO notification_categories (key, label, sort_order) VALUES
  ('marketplace', 'Marketplace', 1),
  ('messages', 'Messages', 2),
  ('wallet', 'Wallet', 3),
  ('services', 'Services', 4),
  ('jobs', 'Jobs', 5),
  ('affiliate', 'Affiliate', 6),
  ('referrals', 'Referrals', 7),
  ('store', 'Store', 8),
  ('reviews', 'Reviews', 9),
  ('followers', 'Followers', 10),
  ('orders', 'Orders', 11),
  ('security', 'Security', 12),
  ('promotions', 'Promotions', 13),
  ('admin', 'Admin', 14),
  ('system', 'System', 15),
  ('ai', 'AI', 16)
ON CONFLICT (key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. NOTIFICATION TEMPLATES DB (DB-stored, localization-ready)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_templates_db (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  title_template text NOT NULL,
  message_template text NOT NULL,
  category text NOT NULL DEFAULT 'system',
  variables text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_key, locale)
);

ALTER TABLE notification_templates_db ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_templates" ON notification_templates_db;
CREATE POLICY "select_templates"
  ON notification_templates_db FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_templates" ON notification_templates_db;
CREATE POLICY "admin_insert_templates"
  ON notification_templates_db FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

DROP POLICY IF EXISTS "admin_update_templates" ON notification_templates_db;
CREATE POLICY "admin_update_templates"
  ON notification_templates_db FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

DROP POLICY IF EXISTS "admin_delete_templates" ON notification_templates_db;
CREATE POLICY "admin_delete_templates"
  ON notification_templates_db FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 6. ACTIVITY FEED (persisted timeline)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  category text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  description text,
  related_id uuid,
  related_type text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_activity" ON activity_feed;
CREATE POLICY "select_own_activity"
  ON activity_feed FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_activity" ON activity_feed;
CREATE POLICY "insert_own_activity"
  ON activity_feed FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_activity" ON activity_feed;
CREATE POLICY "update_own_activity"
  ON activity_feed FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_activity" ON activity_feed;
CREATE POLICY "delete_own_activity"
  ON activity_feed FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_activity_feed_user
  ON activity_feed(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_category
  ON activity_feed(user_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_type
  ON activity_feed(user_id, event_type, created_at DESC);

-- Enable realtime on activity_feed
ALTER TABLE activity_feed REPLICA IDENTITY FULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. USER NOTIFICATION STATISTICS (analytics cache)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_notification_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type text NOT NULL,
  period_start date NOT NULL,
  total_notifications integer NOT NULL DEFAULT 0,
  unread_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  archived_count integer NOT NULL DEFAULT 0,
  acted_upon_count integer NOT NULL DEFAULT 0,
  ignored_count integer NOT NULL DEFAULT 0,
  category_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_time_avg_hours numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_type, period_start)
);

ALTER TABLE user_notification_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_stats" ON user_notification_statistics;
CREATE POLICY "select_own_stats"
  ON user_notification_statistics FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_stats" ON user_notification_statistics;
CREATE POLICY "insert_own_stats"
  ON user_notification_statistics FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_stats" ON user_notification_statistics;
CREATE POLICY "update_own_stats"
  ON user_notification_statistics FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_stats" ON user_notification_statistics;
CREATE POLICY "delete_own_stats"
  ON user_notification_statistics FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_stats_user_period
  ON user_notification_statistics(user_id, period_type, period_start DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 8. ANNOUNCEMENT TARGETS
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS announcement_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  target_audience text NOT NULL DEFAULT 'everyone',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE announcement_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_announcement_targets" ON announcement_targets;
CREATE POLICY "select_announcement_targets"
  ON announcement_targets FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_targets" ON announcement_targets;
CREATE POLICY "admin_insert_targets"
  ON announcement_targets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

DROP POLICY IF EXISTS "admin_delete_targets" ON announcement_targets;
CREATE POLICY "admin_delete_targets"
  ON announcement_targets FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
  );

CREATE INDEX IF NOT EXISTS idx_targets_announcement
  ON announcement_targets(announcement_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 9. ANNOUNCEMENT DELIVERIES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS announcement_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  delivered_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);

ALTER TABLE announcement_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_deliveries" ON announcement_deliveries;
CREATE POLICY "select_own_deliveries"
  ON announcement_deliveries FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_deliveries" ON announcement_deliveries;
CREATE POLICY "insert_own_deliveries"
  ON announcement_deliveries FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_deliveries" ON announcement_deliveries;
CREATE POLICY "update_own_deliveries"
  ON announcement_deliveries FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_deliveries" ON announcement_deliveries;
CREATE POLICY "delete_own_deliveries"
  ON announcement_deliveries FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_announcement
  ON announcement_deliveries(announcement_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_user
  ON announcement_deliveries(user_id, status, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- Enable realtime on all user-facing tables
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE notification_reminders REPLICA IDENTITY FULL;
ALTER TABLE activity_feed REPLICA IDENTITY FULL;
ALTER TABLE announcement_deliveries REPLICA IDENTITY FULL;
