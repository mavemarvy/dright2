/*
# Phase 4.2 — Payment Authorization Layer

## Summary
Adds recovery codes, extends fraud detection with risk scoring + device/country tracking,
and adds all supporting RPCs for the full payment authorization workflow.

## New Tables
1. **payment_recovery_codes** — 10 one-time hashed recovery codes per user
2. Columns added to **wallet_fraud_alerts**: risk_score, device_fingerprint, country, ip_address, browser

## New RPCs
- generate_recovery_codes(p_user_id) — generates 10 hashed codes, returns plaintext array
- verify_recovery_code(p_user_id, p_code_hash) — validates and burns one code
- get_recovery_codes_status(p_user_id) — how many remain, when last generated
- record_fraud_event(...) — log suspicious event + update risk score
- get_user_risk_score(p_user_id) — returns 0–100 risk score
- get_fraud_events(p_user_id, p_limit) — paginated fraud events
- check_velocity(p_user_id, p_action, p_window_minutes) — count actions in window
- get_admin_payment_security_summary() — platform-wide security stats for admin export

## Security
- RLS on all new tables (owner-scoped + admin)
- Recovery codes stored as SHA-256 hashes, never plaintext
*/

-- ============================================================
-- 1. Payment Recovery Codes
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON payment_recovery_codes(user_id, used_at);
ALTER TABLE payment_recovery_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_recovery_codes" ON payment_recovery_codes;
CREATE POLICY "select_own_recovery_codes" ON payment_recovery_codes FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_recovery_codes" ON payment_recovery_codes;
CREATE POLICY "insert_own_recovery_codes" ON payment_recovery_codes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_recovery_codes" ON payment_recovery_codes;
CREATE POLICY "update_own_recovery_codes" ON payment_recovery_codes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "admin_select_recovery_codes" ON payment_recovery_codes;
CREATE POLICY "admin_select_recovery_codes" ON payment_recovery_codes FOR SELECT TO authenticated USING (is_admin_user());

-- ============================================================
-- 2. Extend wallet_fraud_alerts with risk scoring + device info
-- ============================================================
ALTER TABLE wallet_fraud_alerts
  ADD COLUMN IF NOT EXISTS risk_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS action_type text;

-- ============================================================
-- 3. User risk score cache (avoid recomputing every time)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_risk_scores (
  user_id uuid PRIMARY KEY,
  risk_score int NOT NULL DEFAULT 0,
  last_calculated timestamptz NOT NULL DEFAULT now(),
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_risk_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all_risk_scores" ON user_risk_scores;
CREATE POLICY "admin_all_risk_scores" ON user_risk_scores FOR ALL TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
DROP POLICY IF EXISTS "select_own_risk_score" ON user_risk_scores;
CREATE POLICY "select_own_risk_score" ON user_risk_scores FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 4. RPCs
-- ============================================================

-- Generate 10 recovery codes, invalidate old ones, return plaintext codes
CREATE OR REPLACE FUNCTION generate_recovery_codes(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes text[] := ARRAY[]::text[];
  v_code text;
  v_hash text;
  i int;
BEGIN
  -- Delete old codes
  DELETE FROM payment_recovery_codes WHERE user_id = p_user_id;

  -- Generate 10 new codes
  FOR i IN 1..10 LOOP
    v_code := upper(substring(encode(gen_random_bytes(5), 'hex') FROM 1 FOR 5) || '-' || substring(encode(gen_random_bytes(5), 'hex') FROM 1 FOR 5));
    v_hash := encode(digest(v_code || p_user_id::text || 'dright_rc_salt', 'sha256'), 'hex');
    v_codes := v_codes || v_code;
    INSERT INTO payment_recovery_codes (user_id, code_hash) VALUES (p_user_id, v_hash);
  END LOOP;

  INSERT INTO payment_security_logs (user_id, event_type, description)
  VALUES (p_user_id, 'recovery_codes_generated', '10 recovery codes generated');

  RETURN jsonb_build_object('success', true, 'codes', to_jsonb(v_codes));
END;
$$;

-- Verify and burn one recovery code
CREATE OR REPLACE FUNCTION verify_recovery_code(p_user_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_rec RECORD;
BEGIN
  v_hash := encode(digest(upper(p_code) || p_user_id::text || 'dright_rc_salt', 'sha256'), 'hex');

  SELECT * INTO v_rec FROM payment_recovery_codes
  WHERE user_id = p_user_id AND code_hash = v_hash AND used_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or already used recovery code');
  END IF;

  UPDATE payment_recovery_codes SET used_at = now() WHERE id = v_rec.id;

  INSERT INTO payment_security_logs (user_id, event_type, description)
  VALUES (p_user_id, 'recovery_code_used', 'Recovery code used to reset PIN');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Recovery codes status
CREATE OR REPLACE FUNCTION get_recovery_codes_status(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'remaining', COUNT(*) FILTER (WHERE used_at IS NULL),
    'used', COUNT(*) FILTER (WHERE used_at IS NOT NULL),
    'last_generated', MIN(created_at)
  )
  FROM payment_recovery_codes WHERE user_id = p_user_id;
$$;

-- Record a fraud event and update risk score
CREATE OR REPLACE FUNCTION record_fraud_event(
  p_user_id uuid,
  p_alert_type text,
  p_severity text DEFAULT 'medium',
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip_address text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_device_fingerprint text DEFAULT NULL,
  p_browser text DEFAULT NULL,
  p_action_type text DEFAULT NULL,
  p_risk_delta int DEFAULT 10
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO wallet_fraud_alerts (
    user_id, alert_type, severity, description, metadata,
    ip_address, country, device_fingerprint, browser, action_type,
    risk_score
  ) VALUES (
    p_user_id, p_alert_type, p_severity, p_description, p_metadata,
    p_ip_address, p_country, p_device_fingerprint, p_browser, p_action_type,
    p_risk_delta
  );

  -- Update risk score cache
  INSERT INTO user_risk_scores (user_id, risk_score, flags, updated_at)
  VALUES (p_user_id, LEAST(p_risk_delta, 100), jsonb_build_array(p_alert_type), now())
  ON CONFLICT (user_id) DO UPDATE
  SET risk_score = LEAST(user_risk_scores.risk_score + p_risk_delta, 100),
      flags = CASE
        WHEN user_risk_scores.flags @> to_jsonb(ARRAY[p_alert_type]) THEN user_risk_scores.flags
        ELSE user_risk_scores.flags || to_jsonb(ARRAY[p_alert_type])
      END,
      updated_at = now();
END;
$$;

-- Get user risk score
CREATE OR REPLACE FUNCTION get_user_risk_score(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('risk_score', risk_score, 'flags', flags, 'last_calculated', updated_at)
     FROM user_risk_scores WHERE user_id = p_user_id),
    jsonb_build_object('risk_score', 0, 'flags', '[]'::jsonb, 'last_calculated', NULL)
  );
$$;

-- Get fraud events for a user
CREATE OR REPLACE FUNCTION get_fraud_events(p_user_id uuid DEFAULT auth.uid(), p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(f.*) ORDER BY f.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT id, user_id, alert_type, severity, description, metadata,
           ip_address, country, device_fingerprint, browser, action_type,
           risk_score, is_resolved, created_at
    FROM wallet_fraud_alerts WHERE user_id = p_user_id
    ORDER BY created_at DESC LIMIT p_limit
  ) f;
$$;

-- Velocity check — count actions in time window
CREATE OR REPLACE FUNCTION check_velocity(
  p_user_id uuid,
  p_action text DEFAULT 'withdrawal',
  p_window_minutes int DEFAULT 60
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'window_minutes', p_window_minutes,
    'action', p_action
  )
  FROM wallet_fraud_alerts
  WHERE user_id = p_user_id
    AND action_type = p_action
    AND created_at > now() - (p_window_minutes || ' minutes')::interval;
$$;

-- Admin: platform-wide payment security summary
CREATE OR REPLACE FUNCTION get_admin_payment_security_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_pins', (SELECT COUNT(*) FROM payment_security WHERE is_active = true),
    'locked_pins', (SELECT COUNT(*) FROM payment_security WHERE is_locked = true),
    'total_attempts_24h', (SELECT COUNT(*) FROM payment_pin_attempts WHERE created_at > now() - interval '24 hours'),
    'failed_attempts_24h', (SELECT COUNT(*) FROM payment_pin_attempts WHERE success = false AND created_at > now() - interval '24 hours'),
    'high_risk_users', (SELECT COUNT(*) FROM user_risk_scores WHERE risk_score >= 70),
    'unresolved_fraud_alerts', (SELECT COUNT(*) FROM wallet_fraud_alerts WHERE is_resolved = false),
    'recovery_codes_active', (SELECT COUNT(DISTINCT user_id) FROM payment_recovery_codes WHERE used_at IS NULL),
    'frozen_wallets', (SELECT COUNT(*) FROM cc_wallets WHERE is_frozen = true)
  );
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION generate_recovery_codes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_recovery_code(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_recovery_codes_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_fraud_event(uuid, text, text, text, jsonb, text, text, text, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_risk_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fraud_events(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION check_velocity(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_payment_security_summary() TO authenticated;