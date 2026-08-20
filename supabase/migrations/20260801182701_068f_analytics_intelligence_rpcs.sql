/*
# Analytics Intelligence RPCs: Leaderboards, Heatmaps, Customer Journey, Benchmarking, Financial, Profile, Fraud
*/

-- LIVE LEADERBOARDS
CREATE OR REPLACE FUNCTION get_live_leaderboards(
  p_category TEXT DEFAULT 'products',
  p_period TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := CASE p_period
    WHEN 'today' THEN date_trunc('day', now())
    WHEN '7d' THEN now() - '7 days'::interval
    WHEN '30d' THEN now() - '30 days'::interval
    WHEN '90d' THEN now() - '90 days'::interval
    WHEN '1y' THEN now() - '1 year'::interval
    ELSE now() - '30 days'::interval
  END;
BEGIN
  RETURN jsonb_build_object(
    'products', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'views', v.views, 'sales', v.sales, 'revenue', v.revenue) ORDER BY v.views DESC), '[]'::jsonb)
      FROM (
        SELECT entity_id, count(*) AS views,
          (SELECT count(*) FROM orders o WHERE o.product_id = ae.entity_id AND o.status = 'COMPLETED' AND o.created_at >= v_start) AS sales,
          (SELECT COALESCE(sum(final_price), 0) FROM orders o WHERE o.product_id = ae.entity_id AND o.status = 'COMPLETED' AND o.created_at >= v_start) AS revenue
        FROM analytics_events ae WHERE ae.event_type = 'product_view' AND ae.created_at >= v_start
        GROUP BY entity_id ORDER BY views DESC LIMIT 20
      ) v JOIN products p ON p.id = v.entity_id
    ),
    'sellers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.seller_id, 'name', u.name, 'views', t.views, 'sales', t.sales, 'revenue', t.revenue) ORDER BY t.views DESC), '[]'::jsonb)
      FROM (
        SELECT seller_id, count(*) AS views,
          (SELECT count(*) FROM orders WHERE seller_id = ae.seller_id AND status = 'COMPLETED' AND created_at >= v_start) AS sales,
          (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE seller_id = ae.seller_id AND status = 'COMPLETED' AND created_at >= v_start) AS revenue
        FROM analytics_events ae WHERE ae.event_type IN ('product_view','service_view','job_view','course_view') AND ae.seller_id IS NOT NULL AND ae.created_at >= v_start
        GROUP BY seller_id ORDER BY views DESC LIMIT 20
      ) t JOIN users u ON u.id = t.seller_id
    ),
    'affiliates', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.seller_id, 'name', u.name, 'conversions', t.conversions, 'commission', t.commission) ORDER BY t.conversions DESC), '[]'::jsonb)
      FROM (
        SELECT seller_id, count(*) FILTER (WHERE event_type = 'affiliate_conversion') AS conversions,
          COALESCE(sum((metadata->>'commission')::numeric) FILTER (WHERE event_type = 'affiliate_conversion'), 0) AS commission
        FROM analytics_events WHERE event_type IN ('affiliate_click','affiliate_conversion') AND seller_id IS NOT NULL AND created_at >= v_start
        GROUP BY seller_id ORDER BY conversions DESC LIMIT 20
      ) t JOIN users u ON u.id = t.seller_id
    ),
    'referrers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.seller_id, 'name', u.name, 'signups', t.signups, 'earnings', t.earnings) ORDER BY t.signups DESC), '[]'::jsonb)
      FROM (
        SELECT seller_id, count(*) FILTER (WHERE event_type = 'referral_signup') AS signups,
          (SELECT COALESCE(sum(amount), 0) FROM referral_earnings re WHERE re.user_id = ae.seller_id AND re.created_at >= v_start) AS earnings
        FROM analytics_events ae WHERE event_type LIKE 'referral_%' AND seller_id IS NOT NULL AND created_at >= v_start
        GROUP BY seller_id ORDER BY signups DESC LIMIT 20
      ) t JOIN users u ON u.id = t.seller_id
    ),
    'services', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'views', v.views) ORDER BY v.views DESC), '[]'::jsonb)
      FROM (SELECT entity_id, count(*) AS views FROM analytics_events WHERE event_type = 'service_view' AND created_at >= v_start GROUP BY entity_id ORDER BY views DESC LIMIT 20) v
      JOIN products p ON p.id = v.entity_id
    ),
    'jobs', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'views', v.views) ORDER BY v.views DESC), '[]'::jsonb)
      FROM (SELECT entity_id, count(*) AS views FROM analytics_events WHERE event_type = 'job_view' AND created_at >= v_start GROUP BY entity_id ORDER BY views DESC LIMIT 20) v
      JOIN products p ON p.id = v.entity_id
    ),
    'courses', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'views', v.views) ORDER BY v.views DESC), '[]'::jsonb)
      FROM (SELECT entity_id, count(*) AS views FROM analytics_events WHERE event_type = 'course_view' AND created_at >= v_start GROUP BY entity_id ORDER BY views DESC LIMIT 20) v
      JOIN products p ON p.id = v.entity_id
    ),
    'period', p_period
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_live_leaderboards TO authenticated;
GRANT EXECUTE ON FUNCTION get_live_leaderboards TO anon;

-- HEATMAP DATA
CREATE OR REPLACE FUNCTION get_heatmap_data(
  p_seller_id UUID DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
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
  RETURN jsonb_build_object(
    'hourly_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h, 'count', cnt) ORDER BY h), '[]'::jsonb)
      FROM (SELECT EXTRACT(HOUR FROM created_at)::int AS h, count(*) AS cnt FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id) GROUP BY h ORDER BY h) t
    ),
    'daily_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT EXTRACT(DOW FROM created_at)::int AS d, count(*) AS cnt FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id) GROUP BY d ORDER BY d) t
    ),
    'best_selling_hour', (SELECT EXTRACT(HOUR FROM created_at)::int FROM analytics_events WHERE event_type = 'purchase' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY count(*) DESC LIMIT 1),
    'best_selling_day', (SELECT EXTRACT(DOW FROM created_at)::int FROM analytics_events WHERE event_type = 'purchase' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) GROUP BY EXTRACT(DOW FROM created_at) ORDER BY count(*) DESC LIMIT 1),
    'best_country', (SELECT country FROM analytics_events WHERE event_type = 'product_view' AND country IS NOT NULL AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) GROUP BY country ORDER BY count(*) DESC LIMIT 1),
    'best_city', (SELECT city FROM analytics_events WHERE event_type = 'product_view' AND city IS NOT NULL AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) GROUP BY city ORDER BY count(*) DESC LIMIT 1),
    'best_device', (SELECT device_type FROM analytics_events WHERE event_type = 'product_view' AND device_type IS NOT NULL AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) GROUP BY device_type ORDER BY count(*) DESC LIMIT 1),
    'best_browser', (SELECT browser_name FROM analytics_events WHERE event_type = 'product_view' AND browser_name IS NOT NULL AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) GROUP BY browser_name ORDER BY count(*) DESC LIMIT 1),
    'traffic_sources', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT source, count(*) AS cnt FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) GROUP BY source ORDER BY cnt DESC) t
    ),
    'avg_session', (SELECT COALESCE(ROUND(avg(session_duration)), 0) FROM analytics_events WHERE event_type = 'product_view' AND session_duration IS NOT NULL AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'bounce_rate', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE is_bounce = true)::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE event_type = 'product_view' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_heatmap_data TO authenticated;

-- CUSTOMER JOURNEY FUNNEL
CREATE OR REPLACE FUNCTION get_customer_journey(
  p_seller_id UUID DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
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
  RETURN jsonb_build_object(
    'funnel', jsonb_build_array(
      jsonb_build_object('step', 'Impression', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'product_impression' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id))),
      jsonb_build_object('step', 'Click', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'product_click' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id))),
      jsonb_build_object('step', 'View', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'product_view' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id))),
      jsonb_build_object('step', 'Wishlist', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'favorite' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id))),
      jsonb_build_object('step', 'Chat', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'chat_started' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id))),
      jsonb_build_object('step', 'Cart', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'cart_add' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id))),
      jsonb_build_object('step', 'Checkout', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'checkout_started' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id))),
      jsonb_build_object('step', 'Purchase', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'purchase' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) AND (p_entity_id IS NULL OR entity_id = p_entity_id))),
      jsonb_build_object('step', 'Review', 'count', (SELECT count(*) FROM product_reviews pr JOIN products p ON p.id = pr.product_id WHERE (p_seller_id IS NULL OR p.uploaded_by = p_seller_id) AND pr.created_at >= v_start)),
      jsonb_build_object('step', 'Repeat Purchase', 'count', (
        SELECT count(*) FROM (
          SELECT buyer_id FROM orders WHERE status = 'COMPLETED' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)
          GROUP BY buyer_id HAVING count(*) > 1
        ) t
      ))
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_customer_journey TO authenticated;

-- COMPETITOR BENCHMARKING
CREATE OR REPLACE FUNCTION get_competitor_benchmarking(
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
  RETURN jsonb_build_object(
    'seller', jsonb_build_object(
      'views', (SELECT count(*) FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start),
      'ctr', (SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'product_click')::numeric / count(*) * 100), 2) ELSE 0 END FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('product_view','product_click') AND created_at >= v_start),
      'sales', (SELECT count(*) FROM orders WHERE seller_id = p_seller_id AND status = 'COMPLETED' AND created_at >= v_start),
      'revenue', (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE seller_id = p_seller_id AND status = 'COMPLETED' AND created_at >= v_start),
      'reviews', (SELECT count(*) FROM product_reviews pr JOIN products p ON p.id = pr.product_id WHERE p.uploaded_by = p_seller_id),
      'avg_rating', (SELECT COALESCE(ROUND(avg(pr.rating), 2), 0) FROM product_reviews pr JOIN products p ON p.id = pr.product_id WHERE p.uploaded_by = p_seller_id),
      'avg_price', (SELECT COALESCE(ROUND(avg(price), 2), 0) FROM products WHERE uploaded_by = p_seller_id AND is_active = true),
      'conversion', (SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'purchase')::numeric / count(*) * 100), 2) ELSE 0 END FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('product_view','purchase') AND created_at >= v_start)
    ),
    'marketplace_avg', jsonb_build_object(
      'views', (SELECT COALESCE(ROUND(avg(cnt)), 0) FROM (SELECT count(*) AS cnt FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start GROUP BY seller_id) t),
      'sales', (SELECT COALESCE(ROUND(avg(cnt)), 0) FROM (SELECT count(*) AS cnt FROM orders WHERE status = 'COMPLETED' AND created_at >= v_start GROUP BY seller_id) t),
      'revenue', (SELECT COALESCE(ROUND(avg(total)), 0) FROM (SELECT sum(final_price) AS total FROM orders WHERE status = 'COMPLETED' AND created_at >= v_start GROUP BY seller_id) t),
      'avg_price', (SELECT COALESCE(ROUND(avg(price), 2), 0) FROM products WHERE is_active = true),
      'conversion', (SELECT COALESCE(ROUND(avg(rate)), 0) FROM (SELECT CASE WHEN count(*) > 0 THEN (count(*) FILTER (WHERE event_type = 'purchase')::numeric / count(*) * 100) ELSE 0 END AS rate FROM analytics_events WHERE event_type IN ('product_view','purchase') AND created_at >= v_start GROUP BY seller_id) t)
    ),
    'ranking', (
      SELECT rank FROM (
        SELECT seller_id, ROW_NUMBER() OVER (ORDER BY count(*) DESC) AS rank
        FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start
        GROUP BY seller_id
      ) r WHERE seller_id = p_seller_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_competitor_benchmarking TO authenticated;

-- FINANCIAL DASHBOARD
CREATE OR REPLACE FUNCTION get_financial_dashboard(
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
  v_gross NUMERIC;
  v_refunds NUMERIC;
  v_spending NUMERIC;
BEGIN
  SELECT COALESCE(sum(final_price), 0) INTO v_gross FROM orders WHERE seller_id = p_seller_id AND status = 'COMPLETED' AND created_at >= v_start;
  SELECT COALESCE(sum(final_price), 0) INTO v_refunds FROM orders WHERE seller_id = p_seller_id AND status = 'CANCELLED' AND created_at >= v_start;
  SELECT COALESCE(sum((metadata->>'cost')::numeric), 0) INTO v_spending FROM analytics_events WHERE seller_id = p_seller_id AND event_type IN ('promotion_spend','campaign_spend') AND created_at >= v_start;

  RETURN jsonb_build_object(
    'gross_revenue', v_gross,
    'net_revenue', v_gross - v_refunds,
    'commission_paid', (SELECT COALESCE(sum((metadata->>'commission')::numeric), 0) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'affiliate_conversion' AND created_at >= v_start),
    'platform_fee', ROUND(v_gross * 0.05, 2),
    'refunds', v_refunds,
    'pending_revenue', (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE seller_id = p_seller_id AND status = 'PENDING' AND created_at >= v_start),
    'withdrawable_balance', (SELECT COALESCE(sum(amount), 0) FROM referral_earnings WHERE user_id = p_seller_id AND status = 'paid'),
    'affiliate_payouts', (SELECT COALESCE(sum((metadata->>'commission')::numeric) FILTER (WHERE metadata->>'status' = 'paid'), 0) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'affiliate_conversion' AND created_at >= v_start),
    'creator_payouts', (SELECT COALESCE(sum((metadata->>'cost')::numeric), 0) FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'campaign_spend' AND created_at >= v_start),
    'promotion_spending', v_spending,
    'roi', CASE WHEN v_spending > 0 THEN ROUND((v_gross - v_spending) / v_spending * 100, 2) ELSE 0 END,
    'profit_margin', CASE WHEN v_gross > 0 THEN ROUND((v_gross - v_refunds) / v_gross * 100, 2) ELSE 0 END,
    'tax_estimate', ROUND(v_gross * 0.075, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_financial_dashboard TO authenticated;

-- PROFILE ANALYTICS
CREATE OR REPLACE FUNCTION get_profile_analytics(
  p_profile_id UUID,
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
  RETURN jsonb_build_object(
    'profile_views', (SELECT count(*) FROM profile_views WHERE profile_id = p_profile_id AND created_at >= v_start),
    'unique_visitors', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM profile_views WHERE profile_id = p_profile_id AND created_at >= v_start),
    'returning_visitors', (
      SELECT count(*) FROM (
        SELECT COALESCE(viewer_id::text, session_id) AS vid FROM profile_views WHERE profile_id = p_profile_id AND created_at >= v_start
        GROUP BY COALESCE(viewer_id::text, session_id) HAVING count(*) > 1
      ) t
    ),
    'followers', (SELECT count(*) FROM user_follows WHERE following_id = p_profile_id),
    'following', (SELECT count(*) FROM user_follows WHERE follower_id = p_profile_id),
    'follow_conversion', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((SELECT count(*) FROM user_follows WHERE following_id = p_profile_id)::numeric / count(*) * 100, 2) ELSE 0 END
      FROM profile_views WHERE profile_id = p_profile_id AND created_at >= v_start
    ),
    'top_countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM profile_views WHERE profile_id = p_profile_id AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'top_devices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('device', device_type, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT device_type, count(*) AS cnt FROM profile_views WHERE profile_id = p_profile_id AND device_type IS NOT NULL AND created_at >= v_start GROUP BY device_type) t
    ),
    'traffic_sources', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT source, count(*) AS cnt FROM profile_views WHERE profile_id = p_profile_id AND created_at >= v_start GROUP BY source ORDER BY cnt DESC) t
    ),
    'daily_views', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM profile_views WHERE profile_id = p_profile_id AND created_at >= v_start GROUP BY d ORDER BY d) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_profile_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION get_profile_analytics TO anon;

-- FRAUD DETECTION
CREATE OR REPLACE FUNCTION get_fraud_detection(
  p_seller_id UUID DEFAULT NULL,
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
  RETURN jsonb_build_object(
    'fake_views', (
      SELECT count(*) FROM (
        SELECT session_id FROM analytics_events
        WHERE event_type = 'product_view' AND session_id IS NOT NULL AND created_at >= v_start
        AND (p_seller_id IS NULL OR seller_id = p_seller_id)
        GROUP BY session_id HAVING count(*) > 50
      ) t
    ),
    'fake_clicks', (
      SELECT count(*) FROM (
        SELECT session_id FROM analytics_events
        WHERE event_type = 'affiliate_click' AND session_id IS NOT NULL AND created_at >= v_start
        AND (p_seller_id IS NULL OR seller_id = p_seller_id)
        GROUP BY session_id HAVING count(*) > 20
      ) t
    ),
    'bot_traffic', (SELECT count(*) FROM analytics_events WHERE is_bot = true AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'rapid_refresh', (
      SELECT count(*) FROM (
        SELECT session_id, entity_id FROM analytics_events
        WHERE event_type = 'product_view' AND session_id IS NOT NULL AND created_at >= v_start
        AND (p_seller_id IS NULL OR seller_id = p_seller_id)
        GROUP BY session_id, entity_id HAVING count(*) > 10
      ) t
    ),
    'referral_fraud', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_fraud' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'risk_score', LEAST(100,
      (SELECT count(*) FROM analytics_events WHERE is_bot = true AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)) * 5 +
      (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_fraud' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)) * 10 +
      COALESCE((SELECT count(*) FROM (SELECT session_id FROM analytics_events WHERE event_type = 'product_view' AND session_id IS NOT NULL AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id) GROUP BY session_id HAVING count(*) > 50) t), 0) * 2
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_fraud_detection TO authenticated;
