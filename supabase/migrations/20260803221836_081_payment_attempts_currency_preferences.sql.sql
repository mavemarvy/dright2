/*
# Payment Attempts Tracking + User Currency Preferences

## Overview
Adds two new tables:
1. `payment_attempts` — tracks every payment initialization attempt for fraud detection and duplicate prevention
2. `user_currency_preferences` — stores user's preferred currency, country, and language

## 1. payment_attempts
- Tracks each payment attempt with user_id, reference, provider, amount, status, IP, device
- Used for duplicate payment detection and rapid-funding fraud checks

## 2. user_currency_preferences
- Stores user's preferred currency, country, and language
- Linked to auth.users via user_id with ON DELETE CASCADE

## Security
- RLS enabled on both tables
- payment_attempts: admin-only read, owner insert
- user_currency_preferences: owner full CRUD
*/

-- ============================================================
-- 1. PAYMENT ATTEMPTS
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text NOT NULL,
  provider text NOT NULL DEFAULT 'paystack',
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'initialized',
  purpose text,
  attempt_time timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  device_info text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_attempts_status_check CHECK (
    status = ANY (ARRAY['initialized'::text, 'pending'::text, 'success'::text, 'failed'::text, 'cancelled'::text, 'abandoned'::text, 'reversed'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_user ON payment_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_reference ON payment_attempts(reference);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON payment_attempts(status);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_time ON payment_attempts(attempt_time DESC);

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_attempts_owner_read" ON payment_attempts;
CREATE POLICY "payment_attempts_owner_read" ON payment_attempts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "payment_attempts_admin_read" ON payment_attempts;
CREATE POLICY "payment_attempts_admin_read" ON payment_attempts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

DROP POLICY IF EXISTS "payment_attempts_owner_insert" ON payment_attempts;
CREATE POLICY "payment_attempts_owner_insert" ON payment_attempts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 2. USER CURRENCY PREFERENCES
-- ============================================================

CREATE TABLE IF NOT EXISTS user_currency_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'NGN',
  country text,
  language text DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_currency_pref_user ON user_currency_preferences(user_id);

ALTER TABLE user_currency_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_currency_pref_owner_read" ON user_currency_preferences;
CREATE POLICY "user_currency_pref_owner_read" ON user_currency_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_currency_pref_owner_upsert" ON user_currency_preferences;
CREATE POLICY "user_currency_pref_owner_upsert" ON user_currency_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_currency_pref_owner_update" ON user_currency_preferences;
CREATE POLICY "user_currency_pref_owner_update" ON user_currency_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_currency_pref_owner_delete" ON user_currency_preferences;
CREATE POLICY "user_currency_pref_owner_delete" ON user_currency_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 3. RPC: Check for duplicate payment attempts
-- ============================================================

CREATE OR REPLACE FUNCTION check_duplicate_payment_attempt(
  p_user_id uuid,
  p_amount numeric,
  p_purpose text DEFAULT NULL,
  p_window_minutes int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  recent_count int;
  recent_success boolean;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM payment_attempts
  WHERE user_id = p_user_id
    AND amount = p_amount
    AND (p_purpose IS NULL OR purpose = p_purpose)
    AND attempt_time >= now() - (p_window_minutes || ' minutes')::interval;

  SELECT EXISTS(
    SELECT 1 FROM payment_attempts
    WHERE user_id = p_user_id
      AND amount = p_amount
      AND status = 'success'
      AND attempt_time >= now() - '1 hour'::interval
  ) INTO recent_success;

  RETURN jsonb_build_object(
    'is_duplicate', recent_count > 1,
    'recent_count', recent_count,
    'already_paid', recent_success,
    'window_minutes', p_window_minutes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_duplicate_payment_attempt TO authenticated;
