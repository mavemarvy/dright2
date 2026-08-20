/*
# Integration Support Tables

Creates tables for: email event logging, FCM token storage, Turnstile verification logging, Algolia sync state, voice synthesis preferences.

1. New Tables
- `email_logs` — logs every email sent via Resend
- `fcm_tokens` — stores Firebase Cloud Messaging tokens per user per device
- `turnstile_verifications` — logs Turnstile CAPTCHA verifications and rate-limit failures
- `algolia_sync_state` — tracks which records have been synced to Algolia
- `voice_preferences` — stores per-user voice synthesis settings

2. Security
- RLS enabled on all tables
- Owner-scoped CRUD for email_logs, voice_preferences
- Owner-scoped INSERT/SELECT for fcm_tokens
- Owner-scoped INSERT for turnstile_verifications
- Admin full access on all tables via is_admin_user()
*/

-- Email event logs
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  template_type text NOT NULL,
  subject text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','retry','pending')),
  provider text NOT NULL DEFAULT 'resend',
  message_id text,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_email_logs" ON email_logs;
CREATE POLICY "select_own_email_logs" ON email_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin_user());

DROP POLICY IF EXISTS "insert_own_email_logs" ON email_logs;
CREATE POLICY "insert_own_email_logs" ON email_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR is_admin_user());

DROP POLICY IF EXISTS "update_own_email_logs" ON email_logs;
CREATE POLICY "update_own_email_logs" ON email_logs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin_user()) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_template_type ON email_logs(template_type);

-- FCM tokens
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  device_type text NOT NULL DEFAULT 'web' CHECK (device_type IN ('web','android','ios','desktop')),
  device_name text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(token)
);

ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fcm_tokens" ON fcm_tokens;
CREATE POLICY "select_own_fcm_tokens" ON fcm_tokens FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin_user());

DROP POLICY IF EXISTS "insert_own_fcm_tokens" ON fcm_tokens;
CREATE POLICY "insert_own_fcm_tokens" ON fcm_tokens FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_fcm_tokens" ON fcm_tokens;
CREATE POLICY "update_own_fcm_tokens" ON fcm_tokens FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR is_admin_user()) WITH CHECK (auth.uid() = user_id OR is_admin_user());

DROP POLICY IF EXISTS "delete_own_fcm_tokens" ON fcm_tokens;
CREATE POLICY "delete_own_fcm_tokens" ON fcm_tokens FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR is_admin_user());

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON fcm_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_active ON fcm_tokens(is_active) WHERE is_active = true;

-- Turnstile verifications
CREATE TABLE IF NOT EXISTS turnstile_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address text,
  action text NOT NULL,
  token_hash text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  error_codes text[],
  verified_at timestamptz DEFAULT now()
);

ALTER TABLE turnstile_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_turnstile_verifications" ON turnstile_verifications;
CREATE POLICY "insert_turnstile_verifications" ON turnstile_verifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "select_own_turnstile_verifications" ON turnstile_verifications;
CREATE POLICY "select_own_turnstile_verifications" ON turnstile_verifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR is_admin_user());

CREATE INDEX IF NOT EXISTS idx_turnstile_verifications_action ON turnstile_verifications(action);
CREATE INDEX IF NOT EXISTS idx_turnstile_verifications_verified_at ON turnstile_verifications(verified_at DESC);

-- Algolia sync state
CREATE TABLE IF NOT EXISTS algolia_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  index_name text NOT NULL,
  last_synced_at timestamptz DEFAULT now(),
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','synced','error','deleted')),
  error_message text,
  object_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(table_name, record_id)
);

ALTER TABLE algolia_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_algolia_sync_state" ON algolia_sync_state;
CREATE POLICY "select_algolia_sync_state" ON algolia_sync_state FOR SELECT
  TO authenticated USING (is_admin_user());

DROP POLICY IF EXISTS "insert_algolia_sync_state" ON algolia_sync_state;
CREATE POLICY "insert_algolia_sync_state" ON algolia_sync_state FOR INSERT
  TO authenticated WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "update_algolia_sync_state" ON algolia_sync_state;
CREATE POLICY "update_algolia_sync_state" ON algolia_sync_state FOR UPDATE
  TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "delete_algolia_sync_state" ON algolia_sync_state;
CREATE POLICY "delete_algolia_sync_state" ON algolia_sync_state FOR DELETE
  TO authenticated USING (is_admin_user());

CREATE INDEX IF NOT EXISTS idx_algolia_sync_state_table ON algolia_sync_state(table_name);
CREATE INDEX IF NOT EXISTS idx_algolia_sync_state_status ON algolia_sync_state(sync_status);
CREATE INDEX IF NOT EXISTS idx_algolia_sync_state_index ON algolia_sync_state(index_name);

-- Voice preferences
CREATE TABLE IF NOT EXISTS voice_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  voice_uri text,
  rate real NOT NULL DEFAULT 1.0 CHECK (rate >= 0.5 AND rate <= 2.0),
  pitch real NOT NULL DEFAULT 1.0 CHECK (pitch >= 0 AND pitch <= 2.0),
  volume real NOT NULL DEFAULT 1.0 CHECK (volume >= 0 AND volume <= 1.0),
  auto_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE voice_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_voice_preferences" ON voice_preferences;
CREATE POLICY "select_own_voice_preferences" ON voice_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_voice_preferences" ON voice_preferences;
CREATE POLICY "insert_own_voice_preferences" ON voice_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_voice_preferences" ON voice_preferences;
CREATE POLICY "update_own_voice_preferences" ON voice_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_voice_preferences" ON voice_preferences;
CREATE POLICY "delete_own_voice_preferences" ON voice_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
