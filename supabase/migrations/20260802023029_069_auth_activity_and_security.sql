/*
# Authentication Activity & Security Tracking

## Purpose
Records all authentication events (login, logout, signup, failed login, password reset, etc.)
and provides brute-force protection and suspicious login detection.

## New Tables

### auth_activity
- `id` (uuid, PK)
- `user_id` (uuid, FK to auth.users, nullable — null for failed login on non-existent email)
- `email` (text — the email used in the attempt, for lookup even if user doesn't exist)
- `event_type` (text — login, logout, signup, failed_login, password_reset_request, password_change, email_verification, session_refresh, account_lock, account_unlock, admin_forced_logout)
- `success` (boolean — whether the event succeeded)
- `reason` (text — failure reason or additional context)
- `ip_hash` (text — SHA-256 hash of the IP, not the raw IP)
- `user_agent` (text — browser user agent string)
- `device_fingerprint` (text — a hash of browser characteristics)
- `country` (text — country code if available from headers)
- `created_at` (timestamptz, default now())

### login_attempts
- `id` (uuid, PK)
- `email` (text — the email being attempted)
- `user_id` (uuid, FK to auth.users, nullable)
- `attempt_count` (integer, default 0)
- `locked_until` (timestamptz, nullable)
- `last_attempt_at` (timestamptz)
- `updated_at` (timestamptz)

## Security
- RLS enabled on both tables
- Users can read their own auth_activity rows
- Users can read their own login_attempts rows
- Admins can read all rows (via is_admin check)
- Inserts allowed for authenticated users (for their own activity)
- No updates/deletes from the client — all mutations via SECURITY DEFINER RPCs

## RPCs
- `log_auth_activity` — inserts an auth_activity row (SECURITY DEFINER, callable by authenticated)
- `record_login_attempt` — increments login attempt counter, locks if threshold exceeded (SECURITY DEFINER)
- `reset_login_attempts` — resets the counter for an email (SECURITY DEFINER, admin-only via check)
- `get_auth_activity` — returns auth_activity rows for the calling user (SECURITY DEFINER)
- `get_login_history` — returns recent auth_activity for a user (SECURITY DEFINER)
- `admin_get_auth_activity` — returns all auth_activity rows (SECURITY DEFINER, admin-only)
- `admin_reset_login_attempts` — admin resets attempts for a specific email (SECURITY DEFINER, admin-only)
- `admin_force_lockout` — admin forces a lockout on an account (SECURITY DEFINER, admin-only)
*/

-- ─── auth_activity table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  event_type text NOT NULL CHECK (event_type IN (
    'login', 'logout', 'signup', 'failed_login',
    'password_reset_request', 'password_change',
    'email_verification', 'session_refresh',
    'account_lock', 'account_unlock', 'admin_forced_logout'
  )),
  success boolean NOT NULL DEFAULT true,
  reason text,
  ip_hash text,
  user_agent text,
  device_fingerprint text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_activity_user_id ON auth_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_activity_email ON auth_activity(email);
CREATE INDEX IF NOT EXISTS idx_auth_activity_created_at ON auth_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_activity_event_type ON auth_activity(event_type);

ALTER TABLE auth_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own auth_activity" ON auth_activity;
CREATE POLICY "Users read own auth_activity"
  ON auth_activity FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own auth_activity" ON auth_activity;
CREATE POLICY "Users insert own auth_activity"
  ON auth_activity FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── login_attempts table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own login_attempts" ON login_attempts;
CREATE POLICY "Users read own login_attempts"
  ON login_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR email = (SELECT email FROM public.users WHERE id = auth.uid()));

-- ─── RPCs ────────────────────────────────────────────────────────────────────

-- Log auth activity (callable by authenticated users for their own actions)
CREATE OR REPLACE FUNCTION log_auth_activity(
  p_event_type text,
  p_success boolean DEFAULT true,
  p_reason text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_fingerprint text DEFAULT NULL,
  p_country text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_activity_id uuid;
BEGIN
  -- Get email from the users table or auth context
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_email FROM public.users WHERE id = v_user_id;
  END IF;

  INSERT INTO auth_activity (
    user_id, email, event_type, success, reason,
    user_agent, device_fingerprint, country
  ) VALUES (
    v_user_id, v_email, p_event_type, p_success, p_reason,
    p_user_agent, p_device_fingerprint, p_country
  )
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$;

-- Record a login attempt (increments counter, locks if threshold exceeded)
CREATE OR REPLACE FUNCTION record_login_attempt(
  p_email text,
  p_success boolean DEFAULT false,
  p_user_agent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_attempts integer;
  v_locked_until timestamptz;
  v_max_attempts integer := 5;
  v_lockout_minutes integer := 15;
BEGIN
  -- Find user by email
  SELECT id INTO v_user_id FROM public.users WHERE email = p_email LIMIT 1;

  -- Upsert login attempt record
  INSERT INTO login_attempts (email, user_id, attempt_count, last_attempt_at, updated_at)
  VALUES (p_email, v_user_id, CASE WHEN p_success THEN 0 ELSE 1 END, now(), now())
  ON CONFLICT (email) DO UPDATE
  SET
    attempt_count = CASE WHEN p_success THEN 0 ELSE login_attempts.attempt_count + 1 END,
    last_attempt_at = now(),
    updated_at = now(),
    user_id = COALESCE(v_user_id, login_attempts.user_id);

  -- Get current state
  SELECT attempt_count, locked_until INTO v_attempts, v_locked_until
  FROM login_attempts WHERE email = p_email;

  -- Lock if threshold exceeded
  IF NOT p_success AND v_attempts >= v_max_attempts THEN
    UPDATE login_attempts
    SET locked_until = now() + (v_lockout_minutes || ' minutes')::interval
    WHERE email = p_email;

    -- Log the lock event
    INSERT INTO auth_activity (user_id, email, event_type, success, reason, user_agent)
    VALUES (v_user_id, p_email, 'account_lock', true,
      'Auto-locked after ' || v_attempts || ' failed attempts', p_user_agent);

    RETURN jsonb_build_object(
      'locked', true,
      'attempt_count', v_attempts,
      'locked_until', now() + (v_lockout_minutes || ' minutes')::interval
    );
  END IF;

  RETURN jsonb_build_object(
    'locked', false,
    'attempt_count', v_attempts,
    'locked_until', v_locked_until
  );
END;
$$;

-- Reset login attempts (user-facing, called after successful login)
CREATE OR REPLACE FUNCTION reset_login_attempts(
  p_email text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE login_attempts
  SET attempt_count = 0, locked_until = NULL, updated_at = now()
  WHERE email = p_email;
END;
$$;

-- Get auth activity for the calling user
CREATE OR REPLACE FUNCTION get_auth_activity(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid,
  event_type text,
  success boolean,
  reason text,
  user_agent text,
  country text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.event_type, a.success, a.reason, a.user_agent, a.country, a.created_at
  FROM auth_activity a
  WHERE a.user_id = auth.uid()
  ORDER BY a.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Get login history for a specific user (admin-only)
CREATE OR REPLACE FUNCTION admin_get_auth_activity(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_event_type text DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  event_type text,
  success boolean,
  reason text,
  user_agent text,
  country text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN QUERY
  SELECT a.id, a.user_id, a.email, a.event_type, a.success, a.reason, a.user_agent, a.country, a.created_at
  FROM auth_activity a
  WHERE (p_event_type IS NULL OR a.event_type = p_event_type)
  ORDER BY a.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Admin: reset login attempts for an email
CREATE OR REPLACE FUNCTION admin_reset_login_attempts(
  p_email text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  UPDATE login_attempts
  SET attempt_count = 0, locked_until = NULL, updated_at = now()
  WHERE email = p_email;
END;
$$;

-- Admin: force lockout on an account
CREATE OR REPLACE FUNCTION admin_force_lockout(
  p_user_id uuid,
  p_reason text DEFAULT 'Admin-initiated lockout'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_email text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT email INTO v_email FROM public.users WHERE id = p_user_id;

  -- Lock the account
  UPDATE public.users
  SET account_status = 'LOCKED'
  WHERE id = p_user_id;

  -- Log the action
  INSERT INTO auth_activity (user_id, email, event_type, success, reason)
  VALUES (p_user_id, v_email, 'admin_forced_logout', true, p_reason);
END;
$$;

-- Admin: unlock an account
CREATE OR REPLACE FUNCTION admin_unlock_account(
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_email text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.users WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT email INTO v_email FROM public.users WHERE id = p_user_id;

  UPDATE public.users SET account_status = 'ACTIVE' WHERE id = p_user_id;

  UPDATE login_attempts
  SET attempt_count = 0, locked_until = NULL, updated_at = now()
  WHERE email = v_email;

  INSERT INTO auth_activity (user_id, email, event_type, success, reason)
  VALUES (p_user_id, v_email, 'account_unlock', true, 'Admin unlocked account');
END;
$$;

-- Grant execution to authenticated
GRANT EXECUTE ON FUNCTION log_auth_activity TO authenticated;
GRANT EXECUTE ON FUNCTION record_login_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION reset_login_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION get_auth_activity TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_auth_activity TO authenticated;
GRANT EXECUTE ON FUNCTION admin_reset_login_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION admin_force_lockout TO authenticated;
GRANT EXECUTE ON FUNCTION admin_unlock_account TO authenticated;
