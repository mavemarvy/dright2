-- Fix get_seller_products_performance: product_reviews -> reviews (with correct columns)
CREATE OR REPLACE FUNCTION public.get_seller_products_performance(
  p_seller_id uuid,
  p_days integer DEFAULT 30
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
BEGIN
  RETURN COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'approval_status', p.approval_status,
    'category', p.category,
    'subcategory', p.subcategory,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'uploaded_by', p.uploaded_by,
    'price', p.price,
    'image_url', p.image_url,
    'views', COALESCE(v.cnt, 0),
    'unique_visitors', COALESCE(uv.cnt, 0),
    'purchases', COALESCE(s.cnt, 0),
    'revenue', COALESCE(s.rev, 0),
    'conversion', CASE WHEN COALESCE(v.cnt, 0) > 0 THEN ROUND((COALESCE(s.cnt, 0)::numeric / v.cnt * 100), 2) ELSE 0 END,
    'average_rating', COALESCE(r.avg_rating, 0),
    'review_count', COALESCE(r.cnt, 0),
    'wishlist_saves', COALESCE(w.cnt, 0),
    'shares', COALESCE(sh.cnt, 0),
    'chat_requests', COALESCE(c.cnt, 0),
    'trending_score', LEAST(100, COALESCE(ROUND(
      (COALESCE(v_today.cnt, 0)::numeric / NULLIF(COALESCE(v_yesterday.cnt, 0), 0) * 50), 0
    ), 0)),
    'virality_score', LEAST(100, COALESCE(ROUND(
      (COALESCE(sh.cnt, 0) * 10 + COALESCE(w.cnt, 0) * 2 + COALESCE(c.cnt, 0) * 5), 0
    ), 0)),
    'recommendation_score', LEAST(100, COALESCE(ROUND(
      (COALESCE(v.cnt, 0) * 0.5 + COALESCE(s.cnt, 0) * 10 + COALESCE(w.cnt, 0) * 3 + COALESCE(ca.cnt, 0) * 5), 0
    ), 0)),
    'seo_score', LEAST(100, COALESCE(ROUND(
      CASE WHEN p.meta_title IS NOT NULL THEN 30 ELSE 0 END +
      CASE WHEN p.tags IS NOT NULL AND array_length(p.tags, 1) > 0 THEN 20 ELSE 0 END +
      CASE WHEN p.description IS NOT NULL AND length(p.description) > 100 THEN 25 ELSE 0 END +
      CASE WHEN p.image_url IS NOT NULL THEN 15 ELSE 0 END +
      LEAST(10, COALESCE(v.cnt, 0) / 100), 0
    ), 0)),
    'marketplace_ranking', mr.rank
  ) ORDER BY COALESCE(v.cnt, 0) DESC), '[]'::jsonb)
  FROM products p
  LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'product_view' AND created_at >= v_start GROUP BY entity_id) v ON v.entity_id = p.id
  LEFT JOIN (SELECT entity_id, count(DISTINCT COALESCE(viewer_id::text, session_id)) AS cnt FROM analytics_events WHERE event_type = 'product_view' AND created_at >= v_start GROUP BY entity_id) uv ON uv.entity_id = p.id
  LEFT JOIN (SELECT product_id, count(*) AS cnt, sum(final_price) AS rev FROM orders WHERE status = 'COMPLETED' AND created_at >= v_start GROUP BY product_id) s ON s.product_id = p.id
  LEFT JOIN (SELECT target_id, ROUND(avg(rating), 2) AS avg_rating, count(*) AS cnt FROM reviews WHERE target_type = 'product' GROUP BY target_id) r ON r.target_id = p.id
  LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'favorite' AND created_at >= v_start GROUP BY entity_id) w ON w.entity_id = p.id
  LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'share' AND created_at >= v_start GROUP BY entity_id) sh ON sh.entity_id = p.id
  LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'chat_started' AND created_at >= v_start GROUP BY entity_id) c ON c.entity_id = p.id
  LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'cart_add' AND created_at >= v_start GROUP BY entity_id) ca ON ca.entity_id = p.id
  LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'product_view' AND created_at >= now() - '1 day'::interval GROUP BY entity_id) v_today ON v_today.entity_id = p.id
  LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = 'product_view' AND created_at >= now() - '2 days'::interval AND created_at < now() - '1 day'::interval GROUP BY entity_id) v_yesterday ON v_yesterday.entity_id = p.id
  LEFT JOIN (
    SELECT entity_id, ROW_NUMBER() OVER (ORDER BY count(*) DESC) AS rank
    FROM analytics_events WHERE event_type = 'product_view' AND created_at >= v_start
    GROUP BY entity_id
  ) mr ON mr.entity_id = p.id
  WHERE p.uploaded_by = p_seller_id;
END;
$function$;