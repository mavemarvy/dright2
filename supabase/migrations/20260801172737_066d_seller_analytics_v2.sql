-- COMPREHENSIVE SELLER ANALYTICS V2
CREATE OR REPLACE FUNCTION get_seller_analytics_v2(
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
  v_view_types TEXT[] := ARRAY['product_view','service_view','job_view','course_view','profile_view'];
BEGIN
  RETURN jsonb_build_object(
    'live_views',          (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= now() - '5 minutes'::interval),
    'total_views',         (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_start),
    'today_views',         (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_today_start),
    'unique_visitors',     (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_start),
    'returning_visitors',  (
      SELECT count(*) FROM (
        SELECT COALESCE(viewer_id::text, session_id) AS vid
        FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_start
        GROUP BY COALESCE(viewer_id::text, session_id) HAVING count(*) > 1
      ) t
    ),
    'favorites',           (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'favorite' AND created_at >= v_start),
    'shares',              (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'share' AND created_at >= v_start),
    'chat_requests',       (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'chat_started' AND created_at >= v_start),
    'phone_clicks',        (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'phone_click' AND created_at >= v_start),
    'website_clicks',      (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'website_click' AND created_at >= v_start),
    'product_saves',       (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'product_save' AND created_at >= v_start),
    'cart_adds',           (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'cart_add' AND created_at >= v_start),
    'checkout_starts',     (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'checkout_started' AND created_at >= v_start),
    'purchases',           (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND created_at >= v_start),
    'avg_session_time',    (SELECT COALESCE(ROUND(avg(session_duration)), 0) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND session_duration IS NOT NULL AND created_at >= v_start),
    'bounce_rate',         (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE is_bounce = true)::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_start
    ),
    'orders_total',        (SELECT count(*) FROM orders WHERE seller_id = p_seller_id),
    'orders_pending',      (SELECT count(*) FROM orders WHERE seller_id = p_seller_id AND status IN ('PENDING','IN_PROGRESS','DELIVERED','REVISION_REQUESTED')),
    'orders_completed',    (SELECT count(*) FROM orders WHERE seller_id = p_seller_id AND status = 'COMPLETED'),
    'orders_cancelled',    (SELECT count(*) FROM orders WHERE seller_id = p_seller_id AND status = 'CANCELLED'),
    'revenue',             (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE seller_id = p_seller_id AND status = 'COMPLETED'),
    'conversion_rate',     (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'purchase')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_start
    ),
    'traffic_sources',    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT source, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_start GROUP BY source ORDER BY cnt DESC) t
    ),
    'top_countries',      (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'top_states',         (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('state', state, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT state, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND state IS NOT NULL AND created_at >= v_start GROUP BY state ORDER BY cnt DESC LIMIT 10) t
    ),
    'top_cities',         (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('city', city, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT city, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND city IS NOT NULL AND created_at >= v_start GROUP BY city ORDER BY cnt DESC LIMIT 10) t
    ),
    'device_breakdown',   (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('device', device_type, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT device_type, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_start GROUP BY device_type) t
    ),
    'os_breakdown',       (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('os', os, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT os, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND os IS NOT NULL AND created_at >= v_start GROUP BY os) t
    ),
    'browser_breakdown',  (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('browser', browser_name, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT browser_name, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND browser_name IS NOT NULL AND created_at >= v_start GROUP BY browser_name) t
    ),
    'daily_views',        (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'daily_sales',        (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'daily_revenue',      (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'revenue', rev) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, COALESCE(sum((metadata->>'amount')::numeric), 0) AS rev FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'hourly_activity',    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h, 'count', cnt) ORDER BY h), '[]'::jsonb)
      FROM (SELECT EXTRACT(HOUR FROM created_at)::int AS h, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND created_at >= v_start GROUP BY h ORDER BY h) t
    ),
    'languages',          (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('language', language, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT language, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND language IS NOT NULL AND created_at >= v_start GROUP BY language ORDER BY cnt DESC LIMIT 10) t
    ),
    'timezones',          (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('timezone', timezone, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT timezone, count(*) AS cnt FROM analytics_events WHERE seller_id = p_seller_id AND event_type = ANY(v_view_types) AND timezone IS NOT NULL AND created_at >= v_start GROUP BY timezone ORDER BY cnt DESC LIMIT 10) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_seller_analytics_v2 TO authenticated;
