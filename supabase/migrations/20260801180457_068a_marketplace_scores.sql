-- ─────────────────────────────────────────────────────────────────────────────
-- DRIGHT Marketplace Algorithm Scores
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_marketplace_scores(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_view_type TEXT := p_entity_type || '_view';
  v_start TIMESTAMP := now() - '30 days'::interval;
  v_views INT;
  v_unique INT;
  v_purchases INT;
  v_wishlist INT;
  v_shares INT;
  v_chats INT;
  v_cart INT;
  v_revenue NUMERIC;
  v_rating NUMERIC;
  v_review_count INT;
  v_product RECORD;
  v_created TIMESTAMP;
  v_refund_count INT;
  v_total_orders INT;
BEGIN
  SELECT count(*) INTO v_views FROM analytics_events WHERE entity_id = p_entity_id AND event_type = v_view_type AND created_at >= v_start;
  SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) INTO v_unique FROM analytics_events WHERE entity_id = p_entity_id AND event_type = v_view_type AND created_at >= v_start;
  SELECT count(*) INTO v_purchases FROM analytics_events WHERE entity_id = p_entity_id AND event_type = 'purchase' AND created_at >= v_start;
  SELECT count(*) INTO v_wishlist FROM analytics_events WHERE entity_id = p_entity_id AND event_type = 'favorite' AND created_at >= v_start;
  SELECT count(*) INTO v_shares FROM analytics_events WHERE entity_id = p_entity_id AND event_type = 'share' AND created_at >= v_start;
  SELECT count(*) INTO v_chats FROM analytics_events WHERE entity_id = p_entity_id AND event_type = 'chat_started' AND created_at >= v_start;
  SELECT count(*) INTO v_cart FROM analytics_events WHERE entity_id = p_entity_id AND event_type = 'cart_add' AND created_at >= v_start;
  SELECT COALESCE(sum(final_price), 0) INTO v_revenue FROM orders WHERE product_id = p_entity_id AND status = 'COMPLETED' AND created_at >= v_start;
  SELECT COALESCE(ROUND(avg(rating), 2), 0), count(*) INTO v_rating, v_review_count FROM product_reviews WHERE product_id = p_entity_id;
  SELECT * INTO v_product FROM products WHERE id = p_entity_id;
  v_created := v_product.created_at;
  SELECT count(*) INTO v_refund_count FROM orders WHERE product_id = p_entity_id AND status = 'CANCELLED' AND created_at >= v_start;
  SELECT count(*) INTO v_total_orders FROM orders WHERE product_id = p_entity_id AND created_at >= v_start;

  RETURN jsonb_build_object(
    'quality_score', LEAST(100, ROUND(
      (CASE WHEN v_rating > 0 THEN (v_rating / 5 * 40) ELSE 20 END) +
      (CASE WHEN v_review_count > 0 THEN LEAST(20, v_review_count * 2) ELSE 0 END) +
      (CASE WHEN v_product.image_url IS NOT NULL THEN 15 ELSE 0 END) +
      (CASE WHEN v_product.description IS NOT NULL AND length(v_product.description) > 200 THEN 15 ELSE 5 END) +
      (CASE WHEN v_refund_count = 0 AND v_total_orders > 0 THEN 10 ELSE 0 END), 2)),
    'quality_explanation', CASE WHEN v_rating >= 4 THEN 'High customer satisfaction with ' || v_review_count || ' reviews.' ELSE 'Limited reviews — encourage buyers to leave feedback.' END,

    'trust_score', LEAST(100, ROUND(
      (CASE WHEN v_product.approval_status = 'approved' THEN 30 ELSE 0 END) +
      (CASE WHEN v_product.verified = true OR v_product.is_verified = true THEN 20 ELSE 0 END) +
      (CASE WHEN v_rating >= 4 AND v_review_count >= 3 THEN 25 ELSE 10 END) +
      (CASE WHEN v_refund_count = 0 THEN 15 ELSE 0 END) +
      (CASE WHEN v_total_orders > 5 THEN 10 ELSE 0 END), 2)),
    'trust_explanation', CASE WHEN COALESCE(v_product.verified, v_product.is_verified) = true THEN 'Verified seller with approved listing.' ELSE 'Get verified to boost trust score.' END,

    'engagement_score', LEAST(100, ROUND(
      (LEAST(30, v_wishlist * 3)) +
      (LEAST(20, v_shares * 4)) +
      (LEAST(20, v_chats * 4)) +
      (LEAST(15, v_cart * 2)) +
      (LEAST(15, v_views * 0.05)), 2)),
    'engagement_explanation', v_wishlist || ' wishlist saves, ' || v_shares || ' shares, ' || v_chats || ' chats in 30 days.',

    'conversion_score', CASE WHEN v_views > 0 THEN LEAST(100, ROUND((v_purchases::numeric / v_views * 1000), 2)) ELSE 0 END,
    'conversion_explanation', CASE WHEN v_views > 0 THEN (v_purchases::numeric / v_views * 100)::text || '% conversion from ' || v_views || ' views.' ELSE 'No views yet — improve visibility.' END,

    'popularity_score', LEAST(100, ROUND(
      (LEAST(40, v_views * 0.1)) +
      (LEAST(30, v_unique * 0.15)) +
      (LEAST(20, v_purchases * 5)) +
      (LEAST(10, v_wishlist * 1)), 2)),
    'popularity_explanation', v_unique || ' unique visitors and ' || v_views || ' total views.',

    'freshness_score', LEAST(100, ROUND(
      CASE
        WHEN v_created >= now() - '7 days'::interval THEN 100
        WHEN v_created >= now() - '30 days'::interval THEN 80
        WHEN v_created >= now() - '90 days'::interval THEN 60
        WHEN v_created >= now() - '180 days'::interval THEN 40
        ELSE 20
      END, 2)),
    'freshness_explanation', CASE
        WHEN v_created >= now() - '7 days'::interval THEN 'Freshly listed — boosted in discovery.'
        WHEN v_created >= now() - '30 days'::interval THEN 'Recently listed.'
        ELSE 'Listing is aging — consider updating or relisting.'
      END,

    'seo_score', LEAST(100, ROUND(
      (CASE WHEN v_product.meta_title IS NOT NULL AND v_product.meta_description IS NOT NULL THEN 30 ELSE 0 END) +
      (CASE WHEN v_product.tags IS NOT NULL AND array_length(v_product.tags, 1) > 0 THEN LEAST(20, array_length(v_product.tags, 1) * 4) ELSE 0 END) +
      (CASE WHEN v_product.description IS NOT NULL AND length(v_product.description) > 100 THEN 25 ELSE 5 END) +
      (CASE WHEN v_product.image_url IS NOT NULL THEN 15 ELSE 0 END) +
      LEAST(10, v_views / 100), 2)),
    'seo_explanation', CASE WHEN v_product.meta_title IS NULL THEN 'Missing meta title — add one for better search visibility.' ELSE 'Meta tags present.' END,

    'recommendation_score', LEAST(100, ROUND(
      (v_views * 0.3) + (v_purchases * 8) + (v_wishlist * 3) + (v_cart * 4) + (v_rating * 2) + (CASE WHEN v_created >= now() - '7 days'::interval THEN 10 ELSE 0 END), 2)),

    'promotion_score', LEAST(100, ROUND(
      (SELECT count(*) FROM analytics_events WHERE entity_id = p_entity_id AND event_type IN ('promotion_click','campaign_click') AND created_at >= v_start) * 5 +
      (CASE WHEN v_product.featured = true THEN 30 ELSE 0 END) +
      (CASE WHEN v_product.promoted = true THEN 20 ELSE 0 END) +
      LEAST(50, v_views * 0.1), 2)),
    'promotion_explanation', (SELECT count(*) FROM analytics_events WHERE entity_id = p_entity_id AND event_type IN ('promotion_click','campaign_click') AND created_at >= v_start) || ' promotion clicks.',

    'overall_score', LEAST(100, ROUND((
      (CASE WHEN v_rating > 0 THEN (v_rating / 5 * 40) ELSE 20 END) +
      (CASE WHEN v_product.approval_status = 'approved' THEN 15 ELSE 0 END) +
      (LEAST(15, v_wishlist * 1.5)) +
      (CASE WHEN v_views > 0 THEN LEAST(15, (v_purchases::numeric / v_views * 1000)) ELSE 0 END) +
      (CASE WHEN v_created >= now() - '30 days'::interval THEN 10 ELSE 5 END) +
      (CASE WHEN v_product.meta_title IS NOT NULL THEN 5 ELSE 0 END)
    ), 2))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_marketplace_scores TO authenticated;
GRANT EXECUTE ON FUNCTION get_marketplace_scores TO anon;
