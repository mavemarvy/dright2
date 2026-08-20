-- ─────────────────────────────────────────────────────────────────────────────
-- DRIGHT Advanced Product Performance Analytics — Comprehensive RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_product_performance_detail(
  p_product_id UUID,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
  v_product RECORD;
  v_view_types TEXT[] := ARRAY['product_view'];
BEGIN
  SELECT * INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  RETURN jsonb_build_object(
    -- Basic info
    'product_name', v_product.name,
    'status', v_product.approval_status,
    'category', v_product.category,
    'subcategory', v_product.subcategory,
    'published_date', v_product.created_at,
    'last_updated', v_product.updated_at,
    'owner_id', v_product.uploaded_by,
    'price', v_product.price,

    -- View metrics
    'views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start),
    'unique_visitors', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start),
    'returning_visitors', (
      SELECT count(*) FROM (
        SELECT COALESCE(viewer_id::text, session_id) AS vid
        FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start
        GROUP BY COALESCE(viewer_id::text, session_id) HAVING count(*) > 1
      ) t
    ),
    'impressions', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_impression' AND created_at >= v_start),
    'reach', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_impression' AND created_at >= v_start),
    'clicks', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_click' AND created_at >= v_start),
    'ctr', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'product_click')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_product_id AND event_type IN ('product_view','product_click') AND created_at >= v_start
    ),

    -- Engagement
    'wishlist_saves', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'favorite' AND created_at >= v_start),
    'shares', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'share' AND created_at >= v_start),
    'chat_requests', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'chat_started' AND created_at >= v_start),
    'phone_clicks', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'phone_click' AND created_at >= v_start),
    'website_clicks', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'website_click' AND created_at >= v_start),
    'cart_adds', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'cart_add' AND created_at >= v_start),
    'checkout_starts', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'checkout_started' AND created_at >= v_start),

    -- Sales
    'purchases', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'purchase' AND created_at >= v_start),
    'refunds', (SELECT count(*) FROM orders WHERE product_id = p_product_id AND status = 'CANCELLED' AND created_at >= v_start),
    'revenue', (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE product_id = p_product_id AND status = 'COMPLETED' AND created_at >= v_start),
    'net_revenue', (
      SELECT COALESCE(sum(final_price), 0) - COALESCE((SELECT sum(final_price) FROM orders WHERE product_id = p_product_id AND status = 'CANCELLED' AND created_at >= v_start), 0)
      FROM orders WHERE product_id = p_product_id AND status = 'COMPLETED' AND created_at >= v_start
    ),
    'commission_paid', (SELECT COALESCE(sum((metadata->>'commission')::numeric), 0) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'affiliate_conversion' AND created_at >= v_start),

    -- Affiliate
    'affiliate_sales', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'affiliate_conversion' AND created_at >= v_start),
    'affiliate_clicks', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'affiliate_click' AND created_at >= v_start),
    'affiliate_conversion', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'affiliate_conversion')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_product_id AND event_type IN ('affiliate_click','affiliate_conversion') AND created_at >= v_start
    ),

    -- Ratings
    'average_rating', (SELECT COALESCE(ROUND(avg(rating), 2), 0) FROM product_reviews WHERE product_id = p_product_id),
    'review_count', (SELECT count(*) FROM product_reviews WHERE product_id = p_product_id),

    -- Session metrics
    'average_session_time', (SELECT COALESCE(ROUND(avg(session_duration)), 0) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND session_duration IS NOT NULL AND created_at >= v_start),
    'bounce_rate', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE is_bounce = true)::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start
    ),
    'average_scroll_depth', (SELECT COALESCE(ROUND(avg((metadata->>'scroll_depth')::numeric)), 0) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'page_scroll' AND metadata->>'scroll_depth' IS NOT NULL AND created_at >= v_start),

    -- Buyer insights
    'repeat_buyers', (
      SELECT count(*) FROM (
        SELECT buyer_id FROM orders WHERE product_id = p_product_id AND status = 'COMPLETED' AND created_at >= v_start
        GROUP BY buyer_id HAVING count(*) > 1
      ) t
    ),
    'top_buyer_country', (SELECT country FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'purchase' AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY count(*) DESC LIMIT 1),
    'top_buyer_city', (SELECT city FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'purchase' AND city IS NOT NULL AND created_at >= v_start GROUP BY city ORDER BY count(*) DESC LIMIT 1),
    'top_device', (SELECT device_type FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND device_type IS NOT NULL AND created_at >= v_start GROUP BY device_type ORDER BY count(*) DESC LIMIT 1),
    'top_browser', (SELECT browser_name FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND browser_name IS NOT NULL AND created_at >= v_start GROUP BY browser_name ORDER BY count(*) DESC LIMIT 1),
    'top_referral_source', (SELECT source FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start GROUP BY source ORDER BY count(*) DESC LIMIT 1),

    -- Scores (computed from metrics)
    'trending_score', (
      SELECT LEAST(100, ROUND(
        (count(*) FILTER (WHERE created_at >= now() - '24 hours'::interval)::numeric /
        NULLIF(count(*) FILTER (WHERE created_at >= now() - '48 hours'::interval AND created_at < now() - '24 hours'::interval), 0) * 50
      ), 2))
      FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= now() - '48 hours'::interval
    ),
    'virality_score', (
      SELECT LEAST(100, ROUND(
        (count(*) FILTER (WHERE event_type = 'share')::numeric * 10 +
        count(*) FILTER (WHERE event_type = 'favorite')::numeric * 2 +
        count(*) FILTER (WHERE event_type = 'chat_started')::numeric * 5
      ), 2))
      FROM analytics_events WHERE entity_id = p_product_id AND created_at >= v_start
    ),
    'recommendation_score', (
      SELECT LEAST(100, ROUND(
        (count(*) FILTER (WHERE event_type = 'product_view')::numeric * 0.5 +
        count(*) FILTER (WHERE event_type = 'purchase')::numeric * 10 +
        count(*) FILTER (WHERE event_type = 'favorite')::numeric * 3 +
        count(*) FILTER (WHERE event_type = 'cart_add')::numeric * 5
      ), 2))
      FROM analytics_events WHERE entity_id = p_product_id AND created_at >= v_start
    ),
    'seo_score', (
      SELECT LEAST(100, ROUND(
        CASE
          WHEN v_product.meta_title IS NOT NULL AND v_product.meta_description IS NOT NULL THEN 30
          ELSE 0
        END +
        CASE WHEN v_product.tags IS NOT NULL AND array_length(v_product.tags, 1) > 0 THEN 20 ELSE 0 END +
        CASE WHEN v_product.description IS NOT NULL AND length(v_product.description) > 100 THEN 25 ELSE 0 END +
        CASE WHEN v_product.image_url IS NOT NULL THEN 15 ELSE 0 END +
        LEAST(10, (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start) / 100)
      , 2))
    ),
    'marketplace_ranking', (
      SELECT rank FROM (
        SELECT entity_id, ROW_NUMBER() OVER (ORDER BY count(*) DESC) AS rank
        FROM analytics_events WHERE event_type = 'product_view' AND created_at >= v_start
        GROUP BY entity_id
      ) r WHERE entity_id = p_product_id
    ),

    -- Timeline data
    'hourly_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h, 'count', cnt) ORDER BY h), '[]'::jsonb)
      FROM (SELECT EXTRACT(HOUR FROM created_at)::int AS h, count(*) AS cnt FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= now() - '24 hours'::interval GROUP BY h ORDER BY h) t
    ),
    'daily_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'weekly_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('week', w, 'count', cnt) ORDER BY w), '[]'::jsonb)
      FROM (SELECT date_trunc('week', created_at) AS w, count(*) AS cnt FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start GROUP BY w ORDER BY w) t
    ),
    'monthly_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m, 'count', cnt) ORDER BY m), '[]'::jsonb)
      FROM (SELECT date_trunc('month', created_at) AS m, count(*) AS cnt FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= now() - '1 year'::interval GROUP BY m ORDER BY m) t
    ),
    'yearly_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('year', y, 'count', cnt) ORDER BY y), '[]'::jsonb)
      FROM (SELECT date_trunc('year', created_at) AS y, count(*) AS cnt FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' GROUP BY y ORDER BY y) t
    ),
    'revenue_timeline', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'revenue', rev) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, COALESCE(sum(final_price), 0) AS rev FROM orders WHERE product_id = p_product_id AND status = 'COMPLETED' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'sales_timeline', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM orders WHERE product_id = p_product_id AND status = 'COMPLETED' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'conversion_timeline', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'rate', rate) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', ae.created_at) AS d,
          CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE ae.event_type = 'purchase')::numeric / count(*) * 100), 2) ELSE 0 END AS rate
        FROM analytics_events ae WHERE ae.entity_id = p_product_id AND ae.event_type IN ('product_view','purchase') AND ae.created_at >= v_start
        GROUP BY d ORDER BY d
      ) t
    ),
    'affiliate_timeline', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'clicks', clk, 'conversions', conv) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at) AS d,
          count(*) FILTER (WHERE event_type = 'affiliate_click') AS clk,
          count(*) FILTER (WHERE event_type = 'affiliate_conversion') AS conv
        FROM analytics_events WHERE entity_id = p_product_id AND event_type IN ('affiliate_click','affiliate_conversion') AND created_at >= v_start
        GROUP BY d ORDER BY d
      ) t
    ),

    -- Top keywords
    'top_keywords', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('keyword', keyword, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT keywords AS keyword, count(*) AS cnt FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND keywords IS NOT NULL AND created_at >= v_start GROUP BY keywords ORDER BY cnt DESC LIMIT 10) t
    ),

    -- Recent visitors
    'recent_visitors', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('viewer_id', viewer_id, 'source', source, 'country', country, 'city', city, 'device', device_type, 'browser', browser_name, 'created_at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start ORDER BY created_at DESC LIMIT 20) sub
    ),

    -- Benchmark comparison
    'benchmark', jsonb_build_object(
      'prev_day_views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= now() - '2 days'::interval AND created_at < now() - '1 day'::interval),
      'today_views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= now() - '1 day'::interval),
      'prev_week_views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= now() - '14 days'::interval AND created_at < now() - '7 days'::interval),
      'this_week_views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= now() - '7 days'::interval),
      'prev_month_views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= now() - '60 days'::interval AND created_at < now() - '30 days'::interval),
      'this_month_views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= now() - '30 days'::interval),
      'category_avg_views', (
        SELECT COALESCE(ROUND(avg(cnt)), 0) FROM (
          SELECT count(*) AS cnt FROM analytics_events ae
          JOIN products p ON p.id = ae.entity_id
          WHERE ae.event_type = 'product_view' AND p.category = v_product.category AND ae.created_at >= v_start
          GROUP BY ae.entity_id
        ) t
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_performance_detail TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_performance_detail TO anon;
