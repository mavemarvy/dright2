-- Fix get_trending_engine: u.name -> u.full_name
CREATE OR REPLACE FUNCTION public.get_trending_engine(
  p_scope text DEFAULT 'marketplace',
  p_seller_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
        'name', u.full_name
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
$function$;