-- Updated track_analytics_event with extended fields
CREATE OR REPLACE FUNCTION track_analytics_event(
  p_event_type      TEXT,
  p_entity_type     TEXT DEFAULT 'product',
  p_entity_id       UUID DEFAULT NULL,
  p_seller_id       UUID DEFAULT NULL,
  p_session_id      TEXT DEFAULT NULL,
  p_device_hash     TEXT DEFAULT NULL,
  p_browser         TEXT DEFAULT NULL,
  p_country         TEXT DEFAULT NULL,
  p_city            TEXT DEFAULT NULL,
  p_referrer        TEXT DEFAULT NULL,
  p_source          TEXT DEFAULT 'direct',
  p_metadata        JSONB DEFAULT '{}'::jsonb,
  p_is_bot          BOOLEAN DEFAULT false,
  p_device_type     TEXT DEFAULT 'desktop',
  p_os              TEXT DEFAULT NULL,
  p_browser_name    TEXT DEFAULT NULL,
  p_state           TEXT DEFAULT NULL,
  p_language        TEXT DEFAULT NULL,
  p_timezone        TEXT DEFAULT NULL,
  p_session_duration INTEGER DEFAULT NULL,
  p_is_bounce       BOOLEAN DEFAULT false,
  p_keywords        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_id UUID := auth.uid();
  v_cooldown_interval INTERVAL := '30 minutes';
  v_existing TIMESTAMP;
  v_result JSONB;
  v_bot_keywords TEXT[] := ARRAY[
    'bot','crawler','spider','slurp','bingpreview','facebookexternalhit',
    'twitterbot','linkedinbot','whatsapp','telegrambot','googlebot',
    'monitor','uptime','healthcheck','curl','wget','python-requests',
    'node-fetch','axios','postman','headless'
  ];
  v_ref_lower TEXT;
BEGIN
  v_ref_lower := COALESCE(lower(p_referrer), '');
  IF NOT p_is_bot THEN
    FOR i IN 1..array_length(v_bot_keywords, 1) LOOP
      IF v_ref_lower LIKE '%' || v_bot_keywords[i] || '%' THEN
        p_is_bot := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF p_is_bot THEN
    RETURN jsonb_build_object('tracked', false, 'reason', 'bot');
  END IF;

  SELECT created_at INTO v_existing
  FROM analytics_events
  WHERE entity_id = p_entity_id
    AND event_type = p_event_type
    AND (
      (v_viewer_id IS NOT NULL AND viewer_id = v_viewer_id)
      OR (v_viewer_id IS NULL AND session_id = p_session_id)
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL AND now() - v_existing < v_cooldown_interval THEN
    RETURN jsonb_build_object('tracked', false, 'reason', 'cooldown', 'last_event', v_existing);
  END IF;

  INSERT INTO analytics_events (
    event_type, entity_type, entity_id, seller_id,
    viewer_id, session_id, ip_hash, device_hash,
    browser, country, city, referrer, source, metadata, is_bot,
    device_type, os, browser_name, state, language, timezone,
    session_duration, is_bounce, keywords
  ) VALUES (
    p_event_type, p_entity_type, p_entity_id, p_seller_id,
    v_viewer_id, p_session_id,
    encode(digest(COALESCE(current_setting('request.headers', true), ''), 'sha256'), 'hex'),
    p_device_hash, p_browser, p_country, p_city, p_referrer, p_source, p_metadata, false,
    p_device_type, p_os, p_browser_name, p_state, p_language, p_timezone,
    p_session_duration, p_is_bounce, p_keywords
  )
  RETURNING id, created_at INTO v_result;

  RETURN jsonb_build_object('tracked', true, 'event_id', v_result->'id', 'created_at', v_result->'created_at');
END;
$$;

GRANT EXECUTE ON FUNCTION track_analytics_event TO authenticated;
GRANT EXECUTE ON FUNCTION track_analytics_event TO anon;
