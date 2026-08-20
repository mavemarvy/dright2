-- ─────────────────────────────────────────────────────────────────────────────
-- DRIGHT Analytics Rebuild — Unified Event System
-- Replaces client-side counter increments with server-authoritative event tracking
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Unified analytics_events table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL,
  entity_type   TEXT NOT NULL DEFAULT 'product',  -- product|service|job|course|profile|platform
  entity_id     UUID,                               -- the listing/profile being viewed
  seller_id     UUID,                               -- owner of the entity (for fast seller queries)
  viewer_id     UUID,                               -- auth user id (nullable for anonymous)
  session_id    TEXT,                               -- anonymous session identifier
  ip_hash       TEXT,                               -- SHA-256 hash of IP (never raw IP)
  device_hash   TEXT,                               -- lightweight device fingerprint hash
  browser       TEXT,
  country       TEXT,
  city          TEXT,
  referrer      TEXT,
  source        TEXT DEFAULT 'direct',              -- marketplace|affiliate|search|profile|store|recommendation|direct
  metadata      JSONB DEFAULT '{}'::jsonb,
  is_bot        BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for dashboard query performance
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created   ON analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_entity_type   ON analytics_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_seller_created ON analytics_events (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_viewer_created ON analytics_events (viewer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at     ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_dedup          ON analytics_events (entity_id, event_type, viewer_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_entity_type_id  ON analytics_events (entity_type, entity_id, created_at DESC);

-- Enable RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own view events (for "recently viewed" etc.)
CREATE POLICY "select_own_analytics_events" ON analytics_events
  FOR SELECT TO authenticated
  USING (viewer_id = auth.uid());

-- Users can insert their own events
CREATE POLICY "insert_own_analytics_events" ON analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (viewer_id = auth.uid());

-- Anon can insert (for anonymous view tracking — the RPC validates)
CREATE POLICY "insert_anon_analytics_events" ON analytics_events
  FOR INSERT TO anon
  WITH CHECK (true);

-- No updates or deletes from client
-- (No UPDATE or DELETE policies = blocked)

-- ─── 2. track_analytics_event SECURITY DEFINER function ──────────────────────
-- Server-side event tracking with dedup, cooldown, and bot detection.
-- This is the ONLY way events should be created.

CREATE OR REPLACE FUNCTION track_analytics_event(
  p_event_type  TEXT,
  p_entity_type TEXT DEFAULT 'product',
  p_entity_id   UUID DEFAULT NULL,
  p_seller_id   UUID DEFAULT NULL,
  p_session_id  TEXT DEFAULT NULL,
  p_device_hash TEXT DEFAULT NULL,
  p_browser     TEXT DEFAULT NULL,
  p_country     TEXT DEFAULT NULL,
  p_city        TEXT DEFAULT NULL,
  p_referrer    TEXT DEFAULT NULL,
  p_source      TEXT DEFAULT 'direct',
  p_metadata    JSONB DEFAULT '{}'::jsonb,
  p_is_bot      BOOLEAN DEFAULT false
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
  -- Auto-detect bots from referrer/user-agent patterns
  v_ref_lower := COALESCE(lower(p_referrer), '');
  IF NOT p_is_bot THEN
    FOR i IN 1..array_length(v_bot_keywords, 1) LOOP
      IF v_ref_lower LIKE '%' || v_bot_keywords[i] || '%' THEN
        p_is_bot := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- Skip bot events entirely
  IF p_is_bot THEN
    RETURN jsonb_build_object('tracked', false, 'reason', 'bot');
  END IF;

  -- Dedup check: same entity + event_type + viewer/session within cooldown
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

  -- Insert the event
  INSERT INTO analytics_events (
    event_type, entity_type, entity_id, seller_id,
    viewer_id, session_id, ip_hash, device_hash,
    browser, country, city, referrer, source, metadata, is_bot
  ) VALUES (
    p_event_type, p_entity_type, p_entity_id, p_seller_id,
    v_viewer_id, p_session_id,
    -- Hash the client IP from the request header (set by Supabase)
    encode(digest(COALESCE(current_setting('request.headers', true), ''), 'sha256'), 'hex'),
    p_device_hash, p_browser, p_country, p_city, p_referrer, p_source, p_metadata, false
  )
  RETURNING id, created_at INTO v_result;

  RETURN jsonb_build_object('tracked', true, 'event_id', v_result->'id', 'created_at', v_result->'created_at');
END;
$$;

-- Grant execute to authenticated and anon
GRANT EXECUTE ON FUNCTION track_analytics_event TO authenticated;
GRANT EXECUTE ON FUNCTION track_analytics_event TO anon;

-- ─── 3. Seller Dashboard Analytics RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_seller_analytics(
  p_seller_id UUID,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
  v_today_start TIMESTAMP := date_trunc('day', now());
  v_7d_start TIMESTAMP := now() - '7 days'::INTERVAL;
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_product_views',  (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'product_view' AND entity_type = 'product'),
    'total_service_views',  (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'service_view' AND entity_type = 'service'),
    'total_job_views',      (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'job_view' AND entity_type = 'job'),
    'total_course_views',   (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'course_view' AND entity_type = 'course'),
    'total_profile_views', (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'profile_view' AND entity_type = 'profile'),
    'today_views',          (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_today_start),
    '7d_views',             (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_7d_start),
    '30d_views',            (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start),
    'unique_visitors',      (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start),
    'returning_visitors',   (
      SELECT count(*) FROM (
        SELECT COALESCE(viewer_id::text, session_id) AS vid
        FROM analytics_events
        WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start
        GROUP BY COALESCE(viewer_id::text, session_id)
        HAVING count(*) > 1
      ) t
    ),
    'favorites',            (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'favorite' AND created_at >= v_start),
    'shares',               (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'share' AND created_at >= v_start),
    'contact_clicks',       (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'contact_seller' AND created_at >= v_start),
    'chat_starts',          (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'chat_started' AND created_at >= v_start),
    'checkout_starts',      (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'checkout_started' AND created_at >= v_start),
    'purchases',            (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND created_at >= v_start),
    'top_countries',        (
      SELECT jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT country, count(*) AS cnt
        FROM analytics_events
        WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start AND country IS NOT NULL
        GROUP BY country ORDER BY cnt DESC LIMIT 10
      ) t
    ),
    'top_cities',           (
      SELECT jsonb_agg(jsonb_build_object('city', city, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT city, count(*) AS cnt
        FROM analytics_events
        WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start AND city IS NOT NULL
        GROUP BY city ORDER BY cnt DESC LIMIT 10
      ) t
    ),
    'top_sources',          (
      SELECT jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT source, count(*) AS cnt
        FROM analytics_events
        WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start
        GROUP BY source ORDER BY cnt DESC LIMIT 10
      ) t
    ),
    'daily_views',          (
      SELECT jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d)
      FROM (
        SELECT date_trunc('day', created_at) AS d, count(*) AS cnt
        FROM analytics_events
        WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start
        GROUP BY d ORDER BY d
      ) t
    )
  ) INTO v_result;

  -- Add sales data from orders table (verified source)
  SELECT jsonb_set(
    v_result,
    '{orders,total}',
    to_jsonb(COALESCE((SELECT count(*) FROM orders WHERE seller_id = p_seller_id), 0))
  ) INTO v_result;

  SELECT jsonb_set(
    v_result,
    '{orders,pending}',
    to_jsonb(COALESCE((SELECT count(*) FROM orders WHERE seller_id = p_seller_id AND status IN ('PENDING','IN_PROGRESS','DELIVERED','REVISION_REQUESTED')), 0))
  ) INTO v_result;

  SELECT jsonb_set(
    v_result,
    '{orders,completed}',
    to_jsonb(COALESCE((SELECT count(*) FROM orders WHERE seller_id = p_seller_id AND status = 'COMPLETED'), 0))
  ) INTO v_result;

  SELECT jsonb_set(
    v_result,
    '{orders,cancelled}',
    to_jsonb(COALESCE((SELECT count(*) FROM orders WHERE seller_id = p_seller_id AND status = 'CANCELLED'), 0))
  ) INTO v_result;

  SELECT jsonb_set(
    v_result,
    '{revenue}',
    to_jsonb(COALESCE((SELECT COALESCE(sum(final_price), 0) FROM orders WHERE seller_id = p_seller_id AND status = 'COMPLETED'), 0))
  ) INTO v_result;

  -- Conversion rate
  SELECT jsonb_set(
    v_result,
    '{conversion_rate}',
    to_jsonb(
      CASE
        WHEN (v_result->>'30d_views')::int > 0
          THEN ROUND((((v_result->>'purchases')::numeric / (v_result->>'30d_views')::numeric) * 100), 2)
        ELSE 0
      END
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_seller_analytics TO authenticated;

-- ─── 4. Buyer Dashboard Analytics RPC ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_buyer_analytics(
  p_buyer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'orders',          (SELECT count(*) FROM orders WHERE buyer_id = p_buyer_id),
    'pending_orders',  (SELECT count(*) FROM orders WHERE buyer_id = p_buyer_id AND status IN ('PENDING','IN_PROGRESS','DELIVERED','REVISION_REQUESTED')),
    'completed_orders',(SELECT count(*) FROM orders WHERE buyer_id = p_buyer_id AND status = 'COMPLETED'),
    'total_spent',     (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE buyer_id = p_buyer_id AND status = 'COMPLETED'),
    'wishlist_count',  (SELECT count(*) FROM wishlist WHERE user_id = p_buyer_id),
    'viewed_products', (
      SELECT jsonb_agg(jsonb_build_object('entity_id', entity_id, 'name', name, 'image_url', image_url, 'viewed_at', max_viewed) ORDER BY max_viewed DESC)
      FROM (
        SELECT ae.entity_id, p.name, p.image_url, max(ae.created_at) AS max_viewed
        FROM analytics_events ae
        LEFT JOIN products p ON p.id = ae.entity_id
        WHERE ae.viewer_id = p_buyer_id AND ae.event_type = 'product_view' AND ae.entity_type = 'product'
        GROUP BY ae.entity_id, p.name, p.image_url
        ORDER BY max_viewed DESC
        LIMIT 10
      ) t
    ),
    'recently_contacted', (
      SELECT jsonb_agg(jsonb_build_object('seller_id', seller_id, 'last_contact', last_contact))
      FROM (
        SELECT ae.entity_id AS seller_id, max(ae.created_at) AS last_contact
        FROM analytics_events ae
        WHERE ae.viewer_id = p_buyer_id AND ae.event_type = 'contact_seller'
        GROUP BY ae.entity_id
        ORDER BY last_contact DESC
        LIMIT 5
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_buyer_analytics TO authenticated;

-- ─── 5. Admin Dashboard Analytics RPC ─────────────────────────────────────────
-- Verifies admin status before returning platform-wide data.

CREATE OR REPLACE FUNCTION get_admin_analytics(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
  v_today_start TIMESTAMP := date_trunc('day', now());
  v_result JSONB;
BEGIN
  -- Verify caller is an admin
  SELECT (is_admin = true AND admin_status = 'active') OR role IN ('admin', 'super_admin', 'moderator')
  INTO v_is_admin
  FROM users WHERE id = v_admin_id;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT jsonb_build_object(
    'total_users',         (SELECT count(*) FROM users),
    'new_users_today',     (SELECT count(*) FROM users WHERE created_at >= v_today_start),
    'active_users_today',  (SELECT count(DISTINCT viewer_id) FROM analytics_events WHERE viewer_id IS NOT NULL AND created_at >= v_today_start),
    'total_sellers',       (SELECT count(*) FROM users WHERE is_seller = true OR uploaded_products_count > 0),
    'total_buyers',        (SELECT count(DISTINCT buyer_id) FROM orders),
    'total_listings',      (SELECT count(*) FROM products),
    'active_listings',     (SELECT count(*) FROM products WHERE is_active = true AND is_hidden = false AND approval_status = 'approved'),
    'pending_listings',    (SELECT count(*) FROM products WHERE approval_status = 'pending'),
    'total_orders',        (SELECT count(*) FROM orders),
    'completed_orders',   (SELECT count(*) FROM orders WHERE status = 'COMPLETED'),
    'pending_orders',     (SELECT count(*) FROM orders WHERE status IN ('PENDING','IN_PROGRESS','DELIVERED','REVISION_REQUESTED')),
    'cancelled_orders',   (SELECT count(*) FROM orders WHERE status = 'CANCELLED'),
    'total_revenue',      (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE status = 'COMPLETED'),
    'total_views',        (SELECT count(*) FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view','profile_view')),
    'total_searches',     (SELECT count(*) FROM analytics_events WHERE event_type = 'search'),
    'unique_visitors_30d',(SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE created_at >= v_start),
    'daily_visitors',     (
      SELECT jsonb_agg(jsonb_build_object('date', d::date, 'visitors', cnt) ORDER BY d)
      FROM (
        SELECT date_trunc('day', created_at) AS d, count(DISTINCT COALESCE(viewer_id::text, session_id)) AS cnt
        FROM analytics_events WHERE created_at >= v_start
        GROUP BY d ORDER BY d
      ) t
    ),
    'daily_views',        (
      SELECT jsonb_agg(jsonb_build_object('date', d::date, 'views', cnt) ORDER BY d)
      FROM (
        SELECT date_trunc('day', created_at) AS d, count(*) AS cnt
        FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start
        GROUP BY d ORDER BY d
      ) t
    ),
    'daily_signups',      (
      SELECT jsonb_agg(jsonb_build_object('date', d::date, 'signups', cnt) ORDER BY d)
      FROM (
        SELECT date_trunc('day', created_at) AS d, count(*) AS cnt
        FROM users WHERE created_at >= v_start
        GROUP BY d ORDER BY d
      ) t
    ),
    'top_categories',     (
      SELECT jsonb_agg(jsonb_build_object('category', category, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT p.category, count(*) AS cnt
        FROM products p WHERE p.category IS NOT NULL
        GROUP BY p.category ORDER BY cnt DESC LIMIT 10
      ) t
    ),
    'conversion_rate',    (
      SELECT CASE
        WHEN count(*) FILTER (WHERE event_type IN ('product_view','service_view','job_view','course_view')) > 0
        THEN ROUND(
          (count(*) FILTER (WHERE event_type = 'purchase')::numeric /
           count(*) FILTER (WHERE event_type IN ('product_view','service_view','job_view','course_view')) * 100), 2)
        ELSE 0
      END
      FROM analytics_events WHERE created_at >= v_start
    )
  ) INTO v_result;

  -- Pending items
  SELECT jsonb_set(v_result, '{pending_verifications}',
    to_jsonb(COALESCE((SELECT count(*) FROM verifications WHERE status = 'pending'), 0))
  ) INTO v_result;

  SELECT jsonb_set(v_result, '{pending_withdrawals}',
    to_jsonb(COALESCE((SELECT count(*) FROM referral_withdrawals WHERE status = 'pending'), 0))
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_analytics TO authenticated;

-- ─── 6. Product view count RPC (computed from events) ─────────────────────────

CREATE OR REPLACE FUNCTION get_product_view_count(
  p_product_id UUID
)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM analytics_events
  WHERE entity_id = p_product_id AND event_type = 'product_view' AND is_bot = false;
$$;

GRANT EXECUTE ON FUNCTION get_product_view_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_view_count TO anon;

-- ─── 7. Seller product performance from events ────────────────────────────────

CREATE OR REPLACE FUNCTION get_seller_product_performance_v2(
  p_seller_id UUID,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'product_id', p.id,
        'name', p.name,
        'image_url', p.image_url,
        'price', p.price,
        'is_free', p.is_free,
        'view_count', COALESCE(v.cnt, 0),
        'total_sales', COALESCE(s.cnt, 0),
        'revenue', COALESCE(s.rev, 0),
        'wishlist_count', COALESCE(w.cnt, 0),
        'average_rating', COALESCE(p.average_rating, 0),
        'total_reviews', COALESCE(p.total_reviews, 0),
        'conversion_rate', CASE WHEN COALESCE(v.cnt, 0) > 0 THEN ROUND((COALESCE(s.cnt, 0)::numeric / v.cnt) * 100, 2) ELSE 0 END,
        'favorites', COALESCE(f.cnt, 0),
        'shares', COALESCE(sh.cnt, 0),
        'contact_clicks', COALESCE(c.cnt, 0),
        'chat_starts', COALESCE(ch.cnt, 0)
      ) ORDER BY COALESCE(v.cnt, 0) DESC
    )
    FROM products p
    LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'product_view' AND seller_id = p_seller_id AND created_at >= v_start GROUP BY entity_id) v ON v.entity_id = p.id
    LEFT JOIN (SELECT product_id, count(*) AS cnt, sum(final_price) AS rev FROM orders WHERE seller_id = p_seller_id AND status = 'COMPLETED' AND created_at >= v_start GROUP BY product_id) s ON s.product_id = p.id
    LEFT JOIN (SELECT product_id, count(*) AS cnt FROM wishlist WHERE product_id IS NOT NULL GROUP BY product_id) w ON w.product_id = p.id
    LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'favorite' AND seller_id = p_seller_id AND created_at >= v_start GROUP BY entity_id) f ON f.entity_id = p.id
    LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'share' AND seller_id = p_seller_id AND created_at >= v_start GROUP BY entity_id) sh ON sh.entity_id = p.id
    LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'contact_seller' AND seller_id = p_seller_id AND created_at >= v_start GROUP BY entity_id) c ON c.entity_id = p.id
    LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'chat_started' AND seller_id = p_seller_id AND created_at >= v_start GROUP BY entity_id) ch ON ch.entity_id = p.id
    WHERE p.uploaded_by = p_seller_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_seller_product_performance_v2 TO authenticated;

-- ─── 8. View sources breakdown (from events) ──────────────────────────────────

CREATE OR REPLACE FUNCTION get_product_view_sources_v2(
  p_product_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC)
  FROM (
    SELECT source, count(*) AS cnt
    FROM analytics_events
    WHERE entity_id = p_product_id AND event_type = 'product_view' AND is_bot = false
    GROUP BY source ORDER BY cnt DESC
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_product_view_sources_v2 TO authenticated;

-- ─── 9. Daily activity for admin charts (from events) ──────────────────────────

CREATE OR REPLACE FUNCTION get_daily_activity_v2(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
BEGIN
  SELECT (is_admin = true AND admin_status = 'active') OR role IN ('admin', 'super_admin', 'moderator')
  INTO v_is_admin FROM users WHERE id = v_admin_id;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'date', d::date,
      'views', COALESCE(v.cnt, 0),
      'purchases', COALESCE(p.cnt, 0),
      'signups', COALESCE(s.cnt, 0)
    ) ORDER BY d)
    FROM (
      SELECT generate_series(date_trunc('day', v_start), date_trunc('day', now()), '1 day'::interval) AS d
    ) days
    LEFT JOIN (
      SELECT date_trunc('day', created_at) AS d, count(*) AS cnt
      FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start
      GROUP BY d
    ) v ON v.d = days.d
    LEFT JOIN (
      SELECT date_trunc('day', created_at) AS d, count(*) AS cnt
      FROM analytics_events WHERE event_type = 'purchase' AND created_at >= v_start
      GROUP BY d
    ) p ON p.d = days.d
    LEFT JOIN (
      SELECT date_trunc('day', created_at) AS d, count(*) AS cnt
      FROM users WHERE created_at >= v_start
      GROUP BY d
    ) s ON s.d = days.d
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_activity_v2 TO authenticated;
