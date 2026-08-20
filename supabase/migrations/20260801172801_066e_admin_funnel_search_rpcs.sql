-- ADMIN ANALYTICS V2
CREATE OR REPLACE FUNCTION get_admin_analytics_v2(
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
BEGIN
  SELECT (is_admin = true AND admin_status = 'active') OR role IN ('admin', 'super_admin', 'moderator')
  INTO v_is_admin FROM users WHERE id = v_admin_id;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  RETURN jsonb_build_object(
    'total_users',         (SELECT count(*) FROM users),
    'new_users_today',     (SELECT count(*) FROM users WHERE created_at >= v_today_start),
    'live_active_users',   (SELECT count(DISTINCT viewer_id) FROM analytics_events WHERE viewer_id IS NOT NULL AND created_at >= now() - '5 minutes'::interval),
    'online_sellers',      (SELECT count(DISTINCT seller_id) FROM analytics_events WHERE seller_id IS NOT NULL AND created_at >= now() - '5 minutes'::interval),
    'online_buyers',       (SELECT count(DISTINCT viewer_id) FROM analytics_events WHERE viewer_id IS NOT NULL AND event_type = 'purchase' AND created_at >= now() - '5 minutes'::interval),
    'visitors_today',      (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE created_at >= v_today_start),
    'visitors_this_month', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE created_at >= date_trunc('month', now())),
    'total_sellers',       (SELECT count(*) FROM users WHERE is_seller = true OR uploaded_products_count > 0),
    'total_buyers',        (SELECT count(DISTINCT buyer_id) FROM orders),
    'total_listings',      (SELECT count(*) FROM products),
    'active_listings',     (SELECT count(*) FROM products WHERE is_active = true AND is_hidden = false AND approval_status = 'approved'),
    'pending_listings',    (SELECT count(*) FROM products WHERE approval_status = 'pending'),
    'total_orders',        (SELECT count(*) FROM orders),
    'completed_orders',    (SELECT count(*) FROM orders WHERE status = 'COMPLETED'),
    'pending_orders',      (SELECT count(*) FROM orders WHERE status IN ('PENDING','IN_PROGRESS','DELIVERED','REVISION_REQUESTED')),
    'cancelled_orders',    (SELECT count(*) FROM orders WHERE status = 'CANCELLED'),
    'total_revenue',       (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE status = 'COMPLETED'),
    'refunds',             (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE status = 'CANCELLED'),
    'disputes',            (SELECT count(*) FROM orders WHERE status = 'DISPUTED'),
    'open_chats',          (SELECT count(*) FROM chat_conversations WHERE status = 'active'),
    'ai_requests',         (SELECT count(*) FROM analytics_events WHERE event_type = 'ai_request' AND created_at >= v_start),
    'push_notifications_sent', (SELECT count(*) FROM analytics_events WHERE event_type = 'notification_open' AND created_at >= v_start),
    'emails_sent',         (SELECT count(*) FROM analytics_events WHERE event_type = 'email_sent' AND created_at >= v_start),
    'affiliate_payouts',   (SELECT COALESCE(sum(amount), 0) FROM referral_withdrawals WHERE status = 'completed'),
    'wallet_deposits',     (SELECT COALESCE(sum(amount), 0) FROM wallet_transactions WHERE type = 'deposit' AND status = 'completed'),
    'wallet_withdrawals',  (SELECT COALESCE(sum(amount), 0) FROM referral_withdrawals WHERE status = 'completed'),
    'total_views',         (SELECT count(*) FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start),
    'total_searches',      (SELECT count(*) FROM analytics_events WHERE event_type = 'search' AND created_at >= v_start),
    'unique_visitors_30d', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE created_at >= v_start),
    'conversion_rate',     (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'purchase')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view','purchase') AND created_at >= v_start
    ),
    'top_products',       (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'views', COALESCE(v.cnt, 0), 'sales', COALESCE(s.cnt, 0)) ORDER BY COALESCE(v.cnt, 0) DESC), '[]'::jsonb)
      FROM (
        SELECT p.id, p.name, v.cnt, s.cnt AS s_cnt FROM products p
        LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'product_view' AND created_at >= v_start GROUP BY entity_id) v ON v.entity_id = p.id
        LEFT JOIN (SELECT product_id, count(*) AS cnt FROM orders WHERE status = 'COMPLETED' GROUP BY product_id) s ON s.product_id = p.id
        WHERE p.is_active = true ORDER BY COALESCE(v.cnt, 0) DESC LIMIT 10
      ) p
    ),
    'top_sellers',         (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'views', t.views, 'revenue', t.rev) ORDER BY t.views DESC), '[]'::jsonb)
      FROM (
        SELECT seller_id, count(*) AS views, COALESCE(sum((metadata->>'amount')::numeric), 0) AS rev 
        FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view') AND seller_id IS NOT NULL AND created_at >= v_start 
        GROUP BY seller_id ORDER BY views DESC LIMIT 10
      ) t
      JOIN users u ON u.id = t.seller_id
    ),
    'top_buyers',          (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'orders', t.cnt, 'spent', t.spent) ORDER BY t.spent DESC), '[]'::jsonb)
      FROM (SELECT buyer_id, count(*) AS cnt, sum(final_price) AS spent FROM orders WHERE status = 'COMPLETED' GROUP BY buyer_id ORDER BY spent DESC LIMIT 10) t
      JOIN users u ON u.id = t.buyer_id
    ),
    'top_categories',     (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT category, count(*) AS cnt FROM products WHERE category IS NOT NULL GROUP BY category ORDER BY cnt DESC LIMIT 10) t
    ),
    'top_search_keywords', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('keyword', keyword, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT metadata->>'query' AS keyword, count(*) AS cnt FROM analytics_events WHERE event_type = 'search' AND created_at >= v_start AND metadata->>'query' IS NOT NULL GROUP BY metadata->>'query' ORDER BY cnt DESC LIMIT 10) t
    ),
    'top_countries',       (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM analytics_events WHERE country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'daily_visitors',     (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'visitors', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(DISTINCT COALESCE(viewer_id::text, session_id)) AS cnt FROM analytics_events WHERE created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'daily_views',        (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'views', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view','profile_view') AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'daily_signups',      (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'signups', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM users WHERE created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'daily_revenue',      (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'revenue', rev) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, COALESCE(sum(final_price), 0) AS rev FROM orders WHERE status = 'COMPLETED' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'hourly_activity',    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h, 'count', cnt) ORDER BY h), '[]'::jsonb)
      FROM (SELECT EXTRACT(HOUR FROM created_at)::int AS h, count(*) AS cnt FROM analytics_events WHERE created_at >= v_start GROUP BY h ORDER BY h) t
    ),
    'pending_verifications', (SELECT count(*) FROM verifications WHERE status = 'pending'),
    'pending_withdrawals',   (SELECT count(*) FROM referral_withdrawals WHERE status = 'pending')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_analytics_v2 TO authenticated;

-- FUNNEL ANALYTICS
CREATE OR REPLACE FUNCTION get_funnel_analytics(
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
    'steps', jsonb_build_array(
      jsonb_build_object('step', 'View Product', 'count',
        (SELECT count(*) FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id))),
      jsonb_build_object('step', 'Open Details', 'count',
        (SELECT count(*) FROM analytics_events WHERE event_type IN ('product_view','service_view','job_view','course_view') AND metadata->>'detail' = 'true' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id))),
      jsonb_build_object('step', 'Add Wishlist', 'count',
        (SELECT count(*) FROM analytics_events WHERE event_type = 'favorite' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id))),
      jsonb_build_object('step', 'Chat Seller', 'count',
        (SELECT count(*) FROM analytics_events WHERE event_type = 'chat_started' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id))),
      jsonb_build_object('step', 'Add To Cart', 'count',
        (SELECT count(*) FROM analytics_events WHERE event_type = 'cart_add' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id))),
      jsonb_build_object('step', 'Checkout', 'count',
        (SELECT count(*) FROM analytics_events WHERE event_type = 'checkout_started' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id))),
      jsonb_build_object('step', 'Payment', 'count',
        (SELECT count(*) FROM analytics_events WHERE event_type = 'checkout_completed' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id))),
      jsonb_build_object('step', 'Completed Purchase', 'count',
        (SELECT count(*) FROM analytics_events WHERE event_type = 'purchase' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)))
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_funnel_analytics TO authenticated;

-- SEARCH ANALYTICS
CREATE OR REPLACE FUNCTION get_search_analytics(
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

  RETURN jsonb_build_object(
    'total_searches',      (SELECT count(*) FROM analytics_events WHERE event_type = 'search' AND created_at >= v_start),
    'no_result_searches',  (SELECT count(*) FROM analytics_events WHERE event_type = 'search' AND COALESCE((metadata->>'result_count')::int, 0) = 0 AND created_at >= v_start),
    'trending_searches',   (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('query', query, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT metadata->>'query' AS query, count(*) AS cnt FROM analytics_events WHERE event_type = 'search' AND created_at >= now() - '24 hours'::interval AND metadata->>'query' IS NOT NULL GROUP BY metadata->>'query' ORDER BY cnt DESC LIMIT 10) t
    ),
    'popular_searches',    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('query', query, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT metadata->>'query' AS query, count(*) AS cnt FROM analytics_events WHERE event_type = 'search' AND created_at >= v_start AND metadata->>'query' IS NOT NULL GROUP BY metadata->>'query' ORDER BY cnt DESC LIMIT 10) t
    ),
    'search_ctr',          (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE metadata->>'clicked' = 'true')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE event_type = 'search' AND created_at >= v_start
    ),
    'daily_searches',      (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE event_type = 'search' AND created_at >= v_start GROUP BY d ORDER BY d) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_search_analytics TO authenticated;
