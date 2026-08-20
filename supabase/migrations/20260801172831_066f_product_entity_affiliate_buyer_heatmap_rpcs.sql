-- PRODUCT ANALYTICS DETAIL
CREATE OR REPLACE FUNCTION get_product_analytics_detail(
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
BEGIN
  RETURN jsonb_build_object(
    'views',            (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start),
    'unique_visitors',  (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start),
    'ctr',             (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE metadata->>'from_search' = 'true')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start
    ),
    'wishlist',        (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'favorite' AND created_at >= v_start),
    'shares',          (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'share' AND created_at >= v_start),
    'chats',           (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'chat_started' AND created_at >= v_start),
    'purchases',       (SELECT count(*) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'purchase' AND created_at >= v_start),
    'revenue',         (SELECT COALESCE(sum((metadata->>'amount')::numeric), 0) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'purchase' AND created_at >= v_start),
    'conversion',      (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'purchase')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_product_id AND event_type IN ('product_view','purchase') AND created_at >= v_start
    ),
    'avg_viewing_time',(SELECT COALESCE(ROUND(avg(session_duration)), 0) FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND session_duration IS NOT NULL AND created_at >= v_start),
    'top_source',      (SELECT source FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start GROUP BY source ORDER BY count(*) DESC LIMIT 1),
    'top_country',     (SELECT country FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY count(*) DESC LIMIT 1),
    'top_city',        (SELECT city FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND city IS NOT NULL AND created_at >= v_start GROUP BY city ORDER BY count(*) DESC LIMIT 1),
    'top_keywords',    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('keyword', keyword, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT keywords AS keyword, count(*) AS cnt FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND keywords IS NOT NULL AND created_at >= v_start GROUP BY keywords ORDER BY cnt DESC LIMIT 5) t
    ),
    'recent_visitors', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('viewer_id', viewer_id, 'source', source, 'country', country, 'city', city, 'device', device_type, 'created_at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start ORDER BY created_at DESC LIMIT 20) sub
    ),
    'daily_views',     (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE entity_id = p_product_id AND event_type = 'product_view' AND created_at >= v_start GROUP BY d ORDER BY d) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_analytics_detail TO authenticated;
GRANT EXECUTE ON FUNCTION get_product_analytics_detail TO anon;

-- ENTITY ANALYTICS (products, services, jobs, courses)
CREATE OR REPLACE FUNCTION get_entity_analytics(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
  v_view_type TEXT := p_entity_type || '_view';
BEGIN
  RETURN jsonb_build_object(
    'views',            (SELECT count(*) FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND created_at >= v_start),
    'unique_visitors',  (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND created_at >= v_start),
    'ctr',             (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE metadata->>'from_search' = 'true')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND created_at >= v_start
    ),
    'wishlist',        (SELECT count(*) FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = 'favorite' AND created_at >= v_start),
    'shares',          (SELECT count(*) FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = 'share' AND created_at >= v_start),
    'chats',           (SELECT count(*) FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = 'chat_started' AND created_at >= v_start),
    'purchases',       (SELECT count(*) FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = 'purchase' AND created_at >= v_start),
    'revenue',         (SELECT COALESCE(sum((metadata->>'amount')::numeric), 0) FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = 'purchase' AND created_at >= v_start),
    'conversion',      (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'purchase')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type IN (v_view_type, 'purchase') AND created_at >= v_start
    ),
    'avg_viewing_time',(SELECT COALESCE(ROUND(avg(session_duration)), 0) FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND session_duration IS NOT NULL AND created_at >= v_start),
    'top_source',      (SELECT source FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND created_at >= v_start GROUP BY source ORDER BY count(*) DESC LIMIT 1),
    'top_country',     (SELECT country FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY count(*) DESC LIMIT 1),
    'top_city',        (SELECT city FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND city IS NOT NULL AND created_at >= v_start GROUP BY city ORDER BY count(*) DESC LIMIT 1),
    'top_keywords',    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('keyword', keyword, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT keywords AS keyword, count(*) AS cnt FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND keywords IS NOT NULL AND created_at >= v_start GROUP BY keywords ORDER BY cnt DESC LIMIT 5) t
    ),
    'recent_visitors', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('viewer_id', viewer_id, 'source', source, 'country', country, 'city', city, 'device', device_type, 'created_at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND created_at >= v_start ORDER BY created_at DESC LIMIT 20) sub
    ),
    'daily_views',     (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE entity_id = p_entity_id AND entity_type = p_entity_type AND event_type = v_view_type AND created_at >= v_start GROUP BY d ORDER BY d) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_entity_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION get_entity_analytics TO anon;

-- AFFILIATE ANALYTICS
CREATE OR REPLACE FUNCTION get_affiliate_analytics(
  p_affiliate_id UUID,
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
    'clicks',            (SELECT count(*) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND created_at >= v_start),
    'unique_clicks',     (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND created_at >= v_start),
    'sales',             (SELECT count(*) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND created_at >= v_start),
    'conversion',        (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'affiliate_conversion')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type IN ('affiliate_click','affiliate_conversion') AND created_at >= v_start
    ),
    'commission',        (SELECT COALESCE(sum((metadata->>'commission')::numeric), 0) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND created_at >= v_start),
    'pending_commission',(SELECT COALESCE(sum((metadata->>'commission')::numeric), 0) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND metadata->>'status' = 'pending' AND created_at >= v_start),
    'paid_commission',   (SELECT COALESCE(sum((metadata->>'commission')::numeric), 0) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND metadata->>'status' = 'paid' AND created_at >= v_start),
    'top_products',      (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', entity_id, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND entity_id IS NOT NULL AND created_at >= v_start GROUP BY entity_id ORDER BY cnt DESC LIMIT 10) t
    ),
    'top_countries',     (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'top_traffic_sources',(
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT source, count(*) AS cnt FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND created_at >= v_start GROUP BY source ORDER BY cnt DESC LIMIT 10) t
    ),
    'daily_earnings',    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'earnings', earn) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, COALESCE(sum((metadata->>'commission')::numeric), 0) AS earn FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'lifetime_earnings', (SELECT COALESCE(sum((metadata->>'commission')::numeric), 0) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_affiliate_analytics TO authenticated;

-- BUYER ANALYTICS V2
CREATE OR REPLACE FUNCTION get_buyer_analytics_v2(
  p_buyer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'orders',             (SELECT count(*) FROM orders WHERE buyer_id = p_buyer_id),
    'purchases',          (SELECT count(*) FROM orders WHERE buyer_id = p_buyer_id AND status = 'COMPLETED'),
    'downloads',         (SELECT count(*) FROM analytics_events WHERE viewer_id = p_buyer_id AND event_type = 'download' AND created_at >= now() - '30 days'::interval),
    'wishlist_count',    (SELECT count(*) FROM wishlist WHERE user_id = p_buyer_id),
    'saved_products',    (SELECT count(*) FROM wishlist WHERE user_id = p_buyer_id AND entity_type = 'product'),
    'saved_services',    (SELECT count(*) FROM wishlist WHERE user_id = p_buyer_id AND entity_type = 'service'),
    'saved_courses',     (SELECT count(*) FROM wishlist WHERE user_id = p_buyer_id AND entity_type = 'course'),
    'total_spent',       (SELECT COALESCE(sum(final_price), 0) FROM orders WHERE buyer_id = p_buyer_id AND status = 'COMPLETED'),
    'monthly_spending',  (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m, 'spent', spent) ORDER BY m), '[]'::jsonb)
      FROM (SELECT date_trunc('month', created_at) AS m, COALESCE(sum(final_price), 0) AS spent FROM orders WHERE buyer_id = p_buyer_id AND status = 'COMPLETED' GROUP BY m ORDER BY m) t
    ),
    'recently_viewed',   (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('entity_id', entity_id, 'name', name, 'image_url', image_url, 'viewed_at', max_viewed) ORDER BY max_viewed DESC), '[]'::jsonb)
      FROM (
        SELECT ae.entity_id, p.name, p.image_url, max(ae.created_at) AS max_viewed
        FROM analytics_events ae LEFT JOIN products p ON p.id = ae.entity_id
        WHERE ae.viewer_id = p_buyer_id AND ae.event_type = 'product_view' AND ae.entity_type = 'product'
        GROUP BY ae.entity_id, p.name, p.image_url ORDER BY max_viewed DESC LIMIT 10
      ) t
    ),
    'recently_purchased',(
      SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', o.id, 'product_name', p.name, 'price', o.final_price, 'date', o.created_at) ORDER BY o.created_at DESC), '[]'::jsonb)
      FROM orders o LEFT JOIN products p ON p.id = o.product_id WHERE o.buyer_id = p_buyer_id AND o.status = 'COMPLETED'
    ),
    'favorite_categories',(
      SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT p.category, count(*) AS cnt FROM orders o JOIN products p ON p.id = o.product_id WHERE o.buyer_id = p_buyer_id AND p.category IS NOT NULL GROUP BY p.category ORDER BY cnt DESC LIMIT 5) t
    ),
    'reward_history',    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'amount', amount, 'type', type, 'created_at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
      FROM wallet_transactions WHERE user_id = p_buyer_id
    ),
    'referral_earnings', (SELECT COALESCE(sum(amount), 0) FROM referral_earnings WHERE user_id = p_buyer_id),
    'wallet_balance',    (SELECT COALESCE(balance, 0) FROM wallet_balances WHERE user_id = p_buyer_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_buyer_analytics_v2 TO authenticated;

-- HEATMAP ANALYTICS
CREATE OR REPLACE FUNCTION get_heatmap_analytics(
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
    'button_clicks',    (SELECT count(*) FROM analytics_events WHERE event_type = 'button_click' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'page_scrolls',     (SELECT count(*) FROM analytics_events WHERE event_type = 'page_scroll' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'image_clicks',     (SELECT count(*) FROM analytics_events WHERE event_type = 'image_click' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'gallery_interactions', (SELECT count(*) FROM analytics_events WHERE event_type = 'gallery_interaction' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'favorite_clicks',  (SELECT count(*) FROM analytics_events WHERE event_type = 'favorite' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'chat_clicks',      (SELECT count(*) FROM analytics_events WHERE event_type = 'chat_started' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'checkout_clicks', (SELECT count(*) FROM analytics_events WHERE event_type = 'checkout_started' AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)),
    'interaction_breakdown', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('type', event_type, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT event_type, count(*) AS cnt FROM analytics_events 
        WHERE event_type IN ('button_click','page_scroll','image_click','gallery_interaction','favorite','chat_started','checkout_started') 
          AND created_at >= v_start AND (p_seller_id IS NULL OR seller_id = p_seller_id)
        GROUP BY event_type ORDER BY cnt DESC
      ) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_heatmap_analytics TO authenticated;
