/*
# Notification Preferences & Muting System

## Summary
Creates `notification_preferences` and `notification_mutes` tables to support
user-controlled notification settings: category toggles, quiet hours, delivery
channels, smart muting of conversations/products/stores, and follow/watchlist
frequency preferences.

## New Tables
- `notification_preferences` — per-user settings (one row per user)
  - quiet_hours_start / quiet_hours_end (timestamptz)
  - quiet_hours_critical_bypass (boolean)
  - category_toggles (jsonb: { marketplace: true, messages: false, ... })
  - delivery_channels (jsonb: { in_app: true, email: false, push: false, sms: false })
  - reminder_frequency (text: 'immediate' | 'hourly' | 'daily' | 'weekly')
  - ai_summaries_enabled (boolean)
  - ai_summary_frequency (text: 'daily' | 'weekly' | 'monthly')
  - reduced_motion (boolean)
  - high_contrast (boolean)

- `notification_mutes` — temporary mutes on specific items
  - user_id, mute_type ('conversation' | 'product' | 'store' | 'service' | 'job' | 'category' | 'promotion')
  - target_id (uuid, nullable for category-level)
  - target_label (text, for display)
  - muted_until (timestamptz, nullable = indefinite)
  - created_at

## Security
- RLS enabled on both tables
- Users can CRUD only their own preferences/mutes
- No admin access needed (user-scoped only)

## Indexes
- notification_preferences(user_id) unique
- notification_mutes(user_id, mute_type, target_id) unique
- notification_mutes(user_id, muted_until) for active mute lookups
*/

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  quiet_hours_start time,
  quiet_hours_end time,
  quiet_hours_critical_bypass boolean NOT NULL DEFAULT true,
  category_toggles jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_channels jsonb NOT NULL DEFAULT '{"in_app":true,"email":false,"push":false,"sms":false}'::jsonb,
  reminder_frequency text NOT NULL DEFAULT 'daily',
  ai_summaries_enabled boolean NOT NULL DEFAULT true,
  ai_summary_frequency text NOT NULL DEFAULT 'daily',
  reduced_motion boolean NOT NULL DEFAULT false,
  high_contrast boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_prefs" ON notification_preferences;
CREATE POLICY "select_own_prefs"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_prefs" ON notification_preferences;
CREATE POLICY "insert_own_prefs"
  ON notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_prefs" ON notification_preferences;
CREATE POLICY "update_own_prefs"
  ON notification_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_prefs" ON notification_preferences;
CREATE POLICY "delete_own_prefs"
  ON notification_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── Mutes table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mute_type text NOT NULL,
  target_id uuid,
  target_label text,
  muted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, mute_type, target_id)
);

ALTER TABLE notification_mutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_mutes" ON notification_mutes;
CREATE POLICY "select_own_mutes"
  ON notification_mutes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_mutes" ON notification_mutes;
CREATE POLICY "insert_own_mutes"
  ON notification_mutes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_mutes" ON notification_mutes;
CREATE POLICY "update_own_mutes"
  ON notification_mutes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_mutes" ON notification_mutes;
CREATE POLICY "delete_own_mutes"
  ON notification_mutes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mutes_user_active
  ON notification_mutes(user_id, muted_until)
  WHERE muted_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mutes_user_type
  ON notification_mutes(user_id, mute_type, target_id);
