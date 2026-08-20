-- ─────────────────────────────────────────────────────────────────────────────
-- TRENDING ENGINE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_trending_engine(
  p_scope TEXT DEFAULT 'marketplace',
  p_seller_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_start TIMESTAMP := date_trunc('day', now());
  v_week_start TIMESTAMP := now() - '7 days'::interval;
  v_month_start TIMESTAMP := now() - '30 days'::interval;
BEGIN
  RETURN jsonb_build_object(
    'trending_today', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'entity_id', t.entity_id, 'entity_type', t.entity_type, 'views', t.today_views,
        'growth_rate', CASE WHEN t.yesterday_views > 0 THEN ROUND((t.today_views::numeric - t.yesterday_views) / t.yesterday_views * 100, 2) ELSE 0 END,
        'momentum_score', t.today_views - t.yesterday_views,
        'name', p.name
      ) ORDER BY (t.today_views - t.yesterday_views) DESC), '[]'::jsonb)
      FROM (
        SELECT entity_id, entity_type,
          count(*) FILTER (WHERE created_at >= v_today_start) AS today_views,
          count(*) FILTER (WHERE created_at >= v_today_start - '1 day'::interval AND created_at < v_today_start) AS yesterday_views
        FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view')
          AND created_at >= v_today_start - '1 day'::interval
        GROUP BY entity_id, entity_type
      ) t
      LEFT JOIN products p ON p.id = t.entity_id
    ),
    'trending_this_week', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'entity_id', t.entity_id, 'views', t.week_views,
        'growth_rate', CASE WHEN t.last_week > 0 THEN ROUND((t.week_views::numeric - t.last_week) / t.last_week * 100, 2) ELSE 0 END,
        'name', p.name
      ) ORDER BY t.week_views DESC), '[]'::jsonb)
      FROM (
        SELECT entity_id,
          count(*) FILTER (WHERE created_at >= v_week_start) AS week_views,
          count(*) FILTER (WHERE created_at >= v_week_start - '7 days'::interval AND created_at < v_week_start) AS last_week
        FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view')
          AND created_at >= v_week_start - '7 days'::interval
        GROUP BY entity_id
      ) t
      LEFT JOIN products p ON p.id = t.entity_id
    ),
    'trending_this_month', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'entity_id', t.entity_id, 'views', t.month_views, 'name', p.name
      ) ORDER BY t.month_views DESC), '[]'::jsonb)
      FROM (
        SELECT entity_id, count(*) AS month_views
        FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view')
          AND created_at >= v_month_start
        GROUP BY entity_id ORDER BY month_views DESC LIMIT p_limit
      ) t
      LEFT JOIN products p ON p.id = t.entity_id
    ),
    'fastest_growing_products', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'entity_id', t.entity_id, 'this_week', t.this_week, 'last_week', t.last_week,
        'growth_rate', CASE WHEN t.last_week > 0 THEN ROUND((t.this_week::numeric - t.last_week) / t.last_week * 100, 2) ELSE 0 END,
        'name', p.name
      ) ORDER BY (CASE WHEN t.last_week > 0 THEN (t.this_week::numeric - t.last_week) / t.last_week ELSE 0 END) DESC), '[]'::jsonb)
      FROM (
        SELECT entity_id,
          count(*) FILTER (WHERE created_at >= v_week_start) AS this_week,
          count(*) FILTER (WHERE created_at >= v_week_start - '7 days'::interval AND created_at < v_week_start) AS last_week
        FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view')
          AND created_at >= v_week_start - '7 days'::interval
        GROUP BY entity_id
      ) t
      LEFT JOIN products p ON p.id = t.entity_id
      WHERE t.last_week > 0 OR t.this_week > 0
    ),
    'fastest_growing_sellers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'seller_id', t.seller_id, 'this_week', t.this_week, 'last_week', t.last_week,
        'growth_rate', CASE WHEN t.last_week > 0 THEN ROUND((t.this_week::numeric - t.last_week) / t.last_week * 100, 2) ELSE 0 END,
        'name', u.name
      ) ORDER BY (CASE WHEN t.last_week > 0 THEN (t.this_week::numeric - t.last_week) / t.last_week ELSE 0 END) DESC), '[]'::jsonb)
      FROM (
        SELECT seller_id,
          count(*) FILTER (WHERE created_at >= v_week_start) AS this_week,
          count(*) FILTER (WHERE created_at >= v_week_start - '7 days'::interval AND created_at < v_week_start) AS last_week
        FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view')
          AND seller_id IS NOT NULL AND created_at >= v_week_start - '7 days'::interval
        GROUP BY seller_id
      ) t
      JOIN users u ON u.id = t.seller_id
    ),
    'declining_products', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'entity_id', t.entity_id, 'this_week', t.this_week, 'last_week', t.last_week,
        'decline_rate', CASE WHEN t.last_week > 0 THEN ROUND((1 - t.this_week::numeric / t.last_week) * 100, 2) ELSE 0 END,
        'name', p.name
      ) ORDER BY (CASE WHEN t.last_week > 0 THEN (1 - t.this_week::numeric / t.last_week) ELSE 0 END) DESC), '[]'::jsonb)
      FROM (
        SELECT entity_id,
          count(*) FILTER (WHERE created_at >= v_week_start) AS this_week,
          count(*) FILTER (WHERE created_at >= v_week_start - '7 days'::interval AND created_at < v_week_start) AS last_week
        FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view')
          AND created_at >= v_week_start - '7 days'::interval
        GROUP BY entity_id
      ) t
      LEFT JOIN products p ON p.id = t.entity_id
      WHERE t.last_week > t.this_week AND t.last_week > 0
    ),
    'viral_products', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'entity_id', t.entity_id, 'viral_score', t.viral_score, 'name', p.name
      ) ORDER BY t.viral_score DESC), '[]'::jsonb)
      FROM (
        SELECT entity_id,
          (count(*) FILTER (WHERE event_type = 'share') * 10 +
           count(*) FILTER (WHERE event_type = 'favorite') * 3 +
           count(*) FILTER (WHERE event_type = 'chat_started') * 5 +
           count(*) FILTER (WHERE event_type = 'purchase') * 8) AS viral_score
        FROM analytics_events WHERE entity_id IS NOT NULL AND created_at >= v_week_start
        GROUP BY entity_id ORDER BY viral_score DESC LIMIT p_limit
      ) t
      LEFT JOIN products p ON p.id = t.entity_id
      WHERE t.viral_score > 0
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_trending_engine TO authenticated;
GRANT EXECUTE ON FUNCTION get_trending_engine TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- PREDICTION ENGINE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_prediction_engine(
  p_entity_type TEXT DEFAULT 'seller',
  p_entity_id UUID DEFAULT NULL,
  p_window TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INT := CASE p_window WHEN 'tomorrow' THEN 1 WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 WHEN '1y' THEN 365 ELSE 30 END;
  v_start TIMESTAMP := now() - '30 days'::interval;
  v_seller_id UUID := COALESCE(p_entity_id, auth.uid());
  v_avg_daily_views NUMERIC;
  v_avg_daily_sales NUMERIC;
  v_avg_daily_revenue NUMERIC;
  v_views_7d INT;
  v_views_7d_prev INT;
  v_sales_30d INT;
  v_revenue_30d NUMERIC;
  v_growth_rate NUMERIC;
BEGIN
  SELECT count(*)::numeric / 30 INTO v_avg_daily_views
  FROM analytics_events WHERE seller_id = v_seller_id AND event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start;

  SELECT count(*)::numeric / 30 INTO v_avg_daily_sales
  FROM analytics_events WHERE seller_id = v_seller_id AND event_type = 'purchase' AND created_at >= v_start;

  SELECT COALESCE(sum(final_price), 0)::numeric / 30 INTO v_avg_daily_revenue
  FROM orders WHERE seller_id = v_seller_id AND status = 'COMPLETED' AND created_at >= v_start;

  SELECT count(*) INTO v_views_7d FROM analytics_events WHERE seller_id = v_seller_id AND event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= now() - '7 days'::interval;
  SELECT count(*) INTO v_views_7d_prev FROM analytics_events WHERE seller_id = v_seller_id AND event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= now() - '14 days'::interval AND created_at < now() - '7 days'::interval;

  v_growth_rate := CASE WHEN v_views_7d_prev > 0 THEN (v_views_7d::numeric - v_views_7d_prev) / v_views_7d_prev ELSE 0 END;

  SELECT count(*), COALESCE(sum(final_price), 0) INTO v_sales_30d, v_revenue_30d
  FROM orders WHERE seller_id = v_seller_id AND status = 'COMPLETED' AND created_at >= v_start;

  RETURN jsonb_build_object(
    'sales_forecast', ROUND(v_avg_daily_sales * v_days, 0),
    'revenue_forecast', ROUND(v_avg_daily_revenue * v_days, 2),
    'view_forecast', ROUND(v_avg_daily_views * v_days * (1 + v_growth_rate), 0),
    'inventory_forecast', jsonb_build_object(
      'current_stock', (SELECT COALESCE(sum(stock_count), 0) FROM products WHERE uploaded_by = v_seller_id AND is_active = true),
      'estimated_days_of_stock', CASE WHEN v_avg_daily_sales > 0 THEN ROUND((SELECT COALESCE(sum(stock_count), 0) FROM products WHERE uploaded_by = v_seller_id AND is_active = true) / v_avg_daily_sales) ELSE NULL END
    ),
    'affiliate_forecast', jsonb_build_object(
      'estimated_clicks', ROUND((SELECT count(*)::numeric / 30 FROM analytics_events WHERE seller_id = v_seller_id AND event_type = 'affiliate_click' AND created_at >= v_start) * v_days, 0),
      'estimated_commission', ROUND((SELECT COALESCE(sum((metadata->>'commission')::numeric), 0)::numeric / 30 FROM analytics_events WHERE seller_id = v_seller_id AND event_type = 'affiliate_conversion' AND created_at >= v_start) * v_days, 2)
    ),
    'referral_forecast', jsonb_build_object(
      'estimated_signups', ROUND((SELECT count(*)::numeric / 30 FROM analytics_events WHERE seller_id = v_seller_id AND event_type = 'referral_signup' AND created_at >= v_start) * v_days, 0),
      'estimated_earnings', ROUND((SELECT COALESCE(sum(amount), 0)::numeric / 30 FROM referral_earnings WHERE user_id = v_seller_id AND created_at >= v_start) * v_days, 2)
    ),
    'campaign_forecast', jsonb_build_object(
      'estimated_reach', ROUND(v_avg_daily_views * v_days * 1.5, 0),
      'estimated_conversions', ROUND(v_avg_daily_sales * v_days * 1.3, 0)
    ),
    'growth_rate', ROUND(v_growth_rate * 100, 2),
    'window', p_window,
    'window_days', v_days,
    'confidence', CASE
      WHEN v_sales_30d > 10 THEN 'high'
      WHEN v_sales_30d > 3 THEN 'medium'
      ELSE 'low'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_prediction_engine TO authenticated;
