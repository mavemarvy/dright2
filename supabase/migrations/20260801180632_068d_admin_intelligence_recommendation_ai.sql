-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN INTELLIGENCE V2 — Platform growth, churn, LTV, CAC, DAU/WAU/MAU, fraud
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_admin_intelligence_v2(
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
  v_today TIMESTAMP := date_trunc('day', now());
BEGIN
  SELECT (is_admin = true AND admin_status = 'active') OR role IN ('admin', 'super_admin', 'moderator')
  INTO v_is_admin FROM users WHERE id = v_admin_id;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN jsonb_build_object(
    'platform_growth', jsonb_build_object(
      'user_growth_rate', (
        SELECT CASE WHEN count(*) FILTER (WHERE created_at < v_start) > 0 THEN
          ROUND((count(*)::numeric - count(*) FILTER (WHERE created_at < v_start)) / count(*) FILTER (WHERE created_at < v_start) * 100, 2) ELSE 0 END
        FROM users
      ),
      'revenue_growth', (
        SELECT CASE WHEN COALESCE(sum(final_price) FILTER (WHERE created_at < v_start), 0) > 0 THEN
          ROUND((sum(final_price) - sum(final_price) FILTER (WHERE created_at < v_start)) / sum(final_price) FILTER (WHERE created_at < v_start) * 100, 2) ELSE 0 END
        FROM orders WHERE status = 'COMPLETED' AND created_at >= now() - (p_days * 2 || ' days')::interval
      ),
      'listing_growth', (
        SELECT CASE WHEN count(*) FILTER (WHERE created_at < v_start) > 0 THEN
          ROUND((count(*)::numeric - count(*) FILTER (WHERE created_at < v_start)) / count(*) FILTER (WHERE created_at < v_start) * 100, 2) ELSE 0 END
        FROM products
      )
    ),
    'dau', (SELECT count(DISTINCT viewer_id) FROM analytics_events WHERE viewer_id IS NOT NULL AND created_at >= v_today),
    'wau', (SELECT count(DISTINCT viewer_id) FROM analytics_events WHERE viewer_id IS NOT NULL AND created_at >= now() - '7 days'::interval),
    'mau', (SELECT count(DISTINCT viewer_id) FROM analytics_events WHERE viewer_id IS NOT NULL AND created_at >= now() - '30 days'::interval),
    'churn_rate', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND(
        (count(*) FILTER (WHERE last_seen < now() - '30 days'::interval)::numeric / count(*) * 100), 2
      ) ELSE 0 END FROM users WHERE last_seen IS NOT NULL
    ),
    'retention_rate', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND(
        (count(*) FILTER (WHERE last_seen >= now() - '30 days'::interval)::numeric / count(*) * 100), 2
      ) ELSE 0 END FROM users WHERE last_seen IS NOT NULL
    ),
    'ltv', (
      SELECT COALESCE(ROUND(avg(total_spent)), 0) FROM (
        SELECT buyer_id, sum(final_price) AS total_spent FROM orders WHERE status = 'COMPLETED' GROUP BY buyer_id
      ) t
    ),
    'cac', (
      SELECT CASE WHEN (SELECT count(*) FROM users WHERE created_at >= v_start) > 0 THEN
        ROUND((SELECT COALESCE(sum(amount), 0) FROM referral_earnings WHERE created_at >= v_start) /
        (SELECT count(*) FROM users WHERE created_at >= v_start), 2) ELSE 0 END
    ),
    'category_growth', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'listings', cnt, 'growth', growth) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT p.category, count(*) AS cnt,
          CASE WHEN count(*) FILTER (WHERE p.created_at < v_start) > 0 THEN
            ROUND((count(*)::numeric - count(*) FILTER (WHERE p.created_at < v_start)) / count(*) FILTER (WHERE p.created_at < v_start) * 100, 2) ELSE 0 END AS growth
        FROM products p WHERE p.category IS NOT NULL GROUP BY p.category ORDER BY cnt DESC LIMIT 10
      ) t
    ),
    'country_growth', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'users', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM users WHERE country IS NOT NULL GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'ai_usage', jsonb_build_object(
      'total_requests', (SELECT count(*) FROM analytics_events WHERE event_type = 'ai_request' AND created_at >= v_start),
      'daily_requests', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
        FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE event_type = 'ai_request' AND created_at >= v_start GROUP BY d ORDER BY d) t
      )
    ),
    'push_performance', jsonb_build_object(
      'sent', (SELECT count(*) FROM analytics_events WHERE event_type = 'notification_sent' AND created_at >= v_start),
      'opened', (SELECT count(*) FROM analytics_events WHERE event_type = 'notification_open' AND created_at >= v_start),
      'open_rate', (
        SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'notification_open')::numeric / count(*) * 100), 2) ELSE 0 END
        FROM analytics_events WHERE event_type IN ('notification_sent','notification_open') AND created_at >= v_start
      )
    ),
    'email_performance', jsonb_build_object(
      'sent', (SELECT count(*) FROM analytics_events WHERE event_type = 'email_sent' AND created_at >= v_start),
      'opened', (SELECT count(*) FROM analytics_events WHERE event_type = 'email_open' AND created_at >= v_start),
      'open_rate', (
        SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'email_open')::numeric / count(*) * 100), 2) ELSE 0 END
        FROM analytics_events WHERE event_type IN ('email_sent','email_open') AND created_at >= v_start
      )
    ),
    'fraud_alerts', jsonb_build_object(
      'suspicious_sellers', (SELECT count(*) FROM analytics_events WHERE event_type = 'suspicious_activity' AND metadata->>'type' = 'seller' AND created_at >= v_start),
      'fake_reviews', (SELECT count(*) FROM analytics_events WHERE event_type = 'fake_review_detected' AND created_at >= v_start),
      'fake_clicks', (SELECT count(*) FROM analytics_events WHERE event_type = 'fake_click_detected' AND created_at >= v_start),
      'bot_detection', (SELECT count(*) FROM analytics_events WHERE is_bot = true AND created_at >= v_start),
      'recent_alerts', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('type', event_type, 'severity', metadata->>'severity', 'detail', metadata->>'detail', 'created_at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM analytics_events WHERE event_type IN ('suspicious_activity','fake_review_detected','fake_click_detected') AND created_at >= v_start ORDER BY created_at DESC LIMIT 20) sub
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_intelligence_v2 TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RECOMMENDATION AI — Best time to post, suggested price, etc.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_recommendation_ai(
  p_seller_id UUID,
  p_entity_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - '30 days'::interval;
  v_best_hour INT;
  v_best_day TEXT;
  v_avg_price NUMERIC;
  v_avg_conv NUMERIC;
  v_product RECORD;
BEGIN
  -- Best time to post (hour with most views)
  SELECT EXTRACT(HOUR FROM created_at)::int INTO v_best_hour
  FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start
  GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY count(*) DESC LIMIT 1;

  -- Best day to promote
  SELECT TO_CHAR(created_at, 'Day') INTO v_best_day
  FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND created_at >= v_start
  GROUP BY TO_CHAR(created_at, 'Day') ORDER BY count(*) DESC LIMIT 1;

  -- Average price in category
  SELECT * INTO v_product FROM products WHERE id = COALESCE(p_entity_id, (SELECT id FROM products WHERE uploaded_by = p_seller_id ORDER BY created_at DESC LIMIT 1));
  SELECT COALESCE(avg(price), 0) INTO v_avg_price FROM products WHERE category = v_product.category AND is_active = true;

  -- Average conversion rate
  SELECT CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE event_type = 'purchase')::numeric / count(*) ELSE 0 END INTO v_avg_conv
  FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('product_view','purchase') AND created_at >= v_start;

  RETURN jsonb_build_object(
    'best_time_to_post', v_best_hour,
    'best_time_label', CASE WHEN v_best_hour IS NULL THEN 'Not enough data' ELSE 'Around ' || v_best_hour || ':00' END,
    'best_day_to_promote', COALESCE(TRIM(v_best_day), 'Not enough data'),
    'suggested_price', CASE
      WHEN v_product.price > v_avg_price * 1.3 THEN ROUND(v_avg_price, 2)
      WHEN v_product.price < v_avg_price * 0.7 THEN ROUND(v_avg_price * 0.9, 2)
      ELSE v_product.price
    END,
    'price_analysis', CASE
      WHEN v_product.price > v_avg_price * 1.3 THEN 'Your price is above category average. Consider lowering to ' || ROUND(v_avg_price, 2) || ' to be competitive.'
      WHEN v_product.price < v_avg_price * 0.7 THEN 'Your price is below average. You could increase to ' || ROUND(v_avg_price * 0.9, 2) || ' without losing sales.'
      ELSE 'Your price is in line with category average.'
    END,
    'suggested_affiliate_commission', CASE
      WHEN v_avg_conv < 0.02 THEN 15
      WHEN v_avg_conv < 0.05 THEN 10
      ELSE 5
    END,
    'suggested_discount', CASE
      WHEN v_avg_conv < 0.01 THEN 15
      WHEN v_avg_conv < 0.03 THEN 10
      WHEN v_avg_conv < 0.05 THEN 5
      ELSE 0
    END,
    'estimated_sales_if_promoted', ROUND(
      (SELECT count(*)::numeric / 30 FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'product_view' AND created_at >= v_start) * 0.03 * 1.5, 0
    ),
    'estimated_roi', ROUND(
      CASE WHEN v_avg_conv > 0 THEN (v_avg_conv * 100 * v_product.price / LEAST(v_product.price * 0.1, 50)) ELSE 0 END, 2
    ),
    'best_countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'conversions', conv) ORDER BY conv DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS conv FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY conv DESC LIMIT 5) t
    ),
    'best_audience', jsonb_build_object(
      'top_age_group', (SELECT metadata->>'age_group' FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND metadata->>'age_group' IS NOT NULL AND created_at >= v_start GROUP BY metadata->>'age_group' ORDER BY count(*) DESC LIMIT 1),
      'top_device', (SELECT device_type FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND device_type IS NOT NULL AND created_at >= v_start GROUP BY device_type ORDER BY count(*) DESC LIMIT 1)
    ),
    'suggested_campaign_budget', LEAST(v_product.price * 10, 500),
    'suggested_ad_budget', LEAST(v_product.price * 5, 200)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_recommendation_ai TO authenticated;
