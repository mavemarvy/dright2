-- ─────────────────────────────────────────────────────────────────────────────
-- Promotion Analytics + Affiliate Deep Analytics + Creator Campaign V2
-- ─────────────────────────────────────────────────────────────────────────────

-- PROMOTION ANALYTICS
CREATE OR REPLACE FUNCTION get_promotion_analytics(
  p_promotion_id UUID,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
  v_impressions INT;
  v_clicks INT;
  v_purchases INT;
  v_revenue NUMERIC;
  v_cost NUMERIC;
BEGIN
  SELECT count(*) INTO v_impressions FROM analytics_events WHERE entity_id = p_promotion_id AND event_type = 'promotion_impression' AND created_at >= v_start;
  SELECT count(*) INTO v_clicks FROM analytics_events WHERE entity_id = p_promotion_id AND event_type = 'promotion_click' AND created_at >= v_start;
  SELECT count(*) INTO v_purchases FROM analytics_events WHERE entity_id = p_promotion_id AND event_type = 'promotion_purchase' AND created_at >= v_start;
  SELECT COALESCE(sum((metadata->>'amount')::numeric), 0) INTO v_revenue FROM analytics_events WHERE entity_id = p_promotion_id AND event_type = 'promotion_purchase' AND created_at >= v_start;
  SELECT COALESCE(sum((metadata->>'cost')::numeric), 0) INTO v_cost FROM analytics_events WHERE entity_id = p_promotion_id AND event_type = 'promotion_spend' AND created_at >= v_start;

  RETURN jsonb_build_object(
    'money_spent', v_cost,
    'remaining_budget', (SELECT COALESCE(budget, 0) FROM promotions WHERE id = p_promotion_id) - v_cost,
    'cpm', CASE WHEN v_impressions > 0 THEN ROUND(v_cost / v_impressions * 1000, 2) ELSE 0 END,
    'cpc', CASE WHEN v_clicks > 0 THEN ROUND(v_cost / v_clicks, 2) ELSE 0 END,
    'cpa', CASE WHEN v_purchases > 0 THEN ROUND(v_cost / v_purchases, 2) ELSE 0 END,
    'ctr', CASE WHEN v_impressions > 0 THEN ROUND(v_clicks::numeric / v_impressions * 100, 2) ELSE 0 END,
    'reach', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE entity_id = p_promotion_id AND event_type = 'promotion_impression' AND created_at >= v_start),
    'impressions', v_impressions,
    'purchases', v_purchases,
    'revenue_generated', v_revenue,
    'profit', v_revenue - v_cost,
    'roas', CASE WHEN v_cost > 0 THEN ROUND(v_revenue / v_cost, 2) ELSE 0 END,
    'campaign_health', CASE
      WHEN v_cost > 0 AND v_revenue > v_cost THEN 'profitable'
      WHEN v_cost > 0 AND v_revenue > v_cost * 0.7 THEN 'break_even'
      WHEN v_ctr < 1 THEN 'underperforming'
      ELSE 'monitoring'
    END,
    'daily_breakdown', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'impressions', imp, 'clicks', clk, 'spend', spend, 'revenue', rev) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at) AS d,
          count(*) FILTER (WHERE event_type = 'promotion_impression') AS imp,
          count(*) FILTER (WHERE event_type = 'promotion_click') AS clk,
          COALESCE(sum((metadata->>'cost')::numeric) FILTER (WHERE event_type = 'promotion_spend'), 0) AS spend,
          COALESCE(sum((metadata->>'amount')::numeric) FILTER (WHERE event_type = 'promotion_purchase'), 0) AS rev
        FROM analytics_events WHERE entity_id = p_promotion_id AND created_at >= v_start
        GROUP BY d ORDER BY d
      ) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_promotion_analytics TO authenticated;

-- AFFILIATE DEEP ANALYTICS (with funnel)
CREATE OR REPLACE FUNCTION get_affiliate_deep_analytics(
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
    'funnel', jsonb_build_array(
      jsonb_build_object('step', 'Click', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND created_at >= v_start)),
      jsonb_build_object('step', 'Landing Page', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_landing' AND created_at >= v_start)),
      jsonb_build_object('step', 'Product View', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'product_view' AND created_at >= v_start)),
      jsonb_build_object('step', 'Wishlist', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'favorite' AND created_at >= v_start)),
      jsonb_build_object('step', 'Cart', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'cart_add' AND created_at >= v_start)),
      jsonb_build_object('step', 'Checkout', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'checkout_started' AND created_at >= v_start)),
      jsonb_build_object('step', 'Purchase', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND created_at >= v_start))
    ),
    'top_products', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', entity_id, 'name', p.name, 'clicks', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND entity_id IS NOT NULL AND created_at >= v_start GROUP BY entity_id ORDER BY cnt DESC LIMIT 10) t
      LEFT JOIN products p ON p.id = t.entity_id
    ),
    'top_countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'top_traffic_source', (SELECT source FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND created_at >= v_start GROUP BY source ORDER BY count(*) DESC LIMIT 1),
    'top_device', (SELECT device_type FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND device_type IS NOT NULL AND created_at >= v_start GROUP BY device_type ORDER BY count(*) DESC LIMIT 1),
    'commission_forecast', ROUND(
      (SELECT COALESCE(sum((metadata->>'commission')::numeric), 0)::numeric / 30 FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND created_at >= v_start) * 30, 2
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_affiliate_deep_analytics TO authenticated;

-- CREATOR CAMPAIGN ANALYTICS V2 (with video metrics)
CREATE OR REPLACE FUNCTION get_creator_campaign_analytics_v2(
  p_campaign_id UUID,
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
    'video_views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_view' AND created_at >= v_start),
    'average_watch_time', (SELECT COALESCE(ROUND(avg(session_duration)), 0) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_view' AND session_duration IS NOT NULL AND created_at >= v_start),
    'viewer_retention', (SELECT COALESCE(ROUND(avg((metadata->>'retention_pct')::numeric)), 0) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_view' AND metadata->>'retention_pct' IS NOT NULL AND created_at >= v_start),
    'likes', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_like' AND created_at >= v_start),
    'comments', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_comment' AND created_at >= v_start),
    'shares', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'share' AND created_at >= v_start),
    'saves', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'favorite' AND created_at >= v_start),
    'ctr', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'campaign_click')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type IN ('campaign_impression','campaign_click') AND created_at >= v_start
    ),
    'purchases_generated', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_conversion' AND created_at >= v_start),
    'revenue_generated', (SELECT COALESCE(sum((metadata->>'amount')::numeric), 0) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_conversion' AND created_at >= v_start),
    'creator_roi', (
      SELECT CASE WHEN COALESCE(sum((metadata->>'cost')::numeric) FILTER (WHERE event_type = 'campaign_spend'), 0) > 0 THEN
        ROUND((sum((metadata->>'amount')::numeric) FILTER (WHERE event_type = 'campaign_conversion') / sum((metadata->>'cost')::numeric) FILTER (WHERE event_type = 'campaign_spend') * 100), 2)
      ELSE 0 END
      FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type IN ('campaign_conversion','campaign_spend') AND created_at >= v_start
    ),
    'best_content', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('content_id', entity_id, 'views', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE entity_type = 'campaign' AND event_type = 'campaign_view' AND created_at >= v_start GROUP BY entity_id ORDER BY cnt DESC LIMIT 5) t
    ),
    'creator_ranking', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('creator_id', seller_id, 'score', score) ORDER BY score DESC), '[]'::jsonb)
      FROM (
        SELECT seller_id, count(*) FILTER (WHERE event_type = 'campaign_view') * 1 + count(*) FILTER (WHERE event_type = 'campaign_conversion') * 10 AS score
        FROM analytics_events WHERE entity_type = 'campaign' AND created_at >= v_start AND seller_id IS NOT NULL
        GROUP BY seller_id ORDER BY score DESC LIMIT 10
      ) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_creator_campaign_analytics_v2 TO authenticated;

-- REFERRAL INTELLIGENCE (11-stage funnel)
CREATE OR REPLACE FUNCTION get_referral_intelligence(
  p_user_id UUID DEFAULT NULL,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
  v_uid UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  RETURN jsonb_build_object(
    'funnel', jsonb_build_array(
      jsonb_build_object('step', 'Invitation Sent', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_invite_sent' AND created_at >= v_start)),
      jsonb_build_object('step', 'Invitation Opened', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_invite_opened' AND created_at >= v_start)),
      jsonb_build_object('step', 'Registration', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_signup' AND created_at >= v_start)),
      jsonb_build_object('step', 'Email Verified', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_verified' AND created_at >= v_start)),
      jsonb_build_object('step', 'Phone Verified', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_phone_verified' AND created_at >= v_start)),
      jsonb_build_object('step', 'First Login', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_first_login' AND created_at >= v_start)),
      jsonb_build_object('step', 'Profile Completed', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_profile_complete' AND created_at >= v_start)),
      jsonb_build_object('step', 'First Purchase', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_first_purchase' AND created_at >= v_start)),
      jsonb_build_object('step', 'First Withdrawal', 'count', (SELECT count(*) FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_first_withdrawal' AND created_at >= v_start)),
      jsonb_build_object('step', 'Reward Paid', 'count', (SELECT count(*) FROM referral_earnings WHERE user_id = v_uid AND status = 'paid' AND created_at >= v_start))
    ),
    'stage_conversion_rates', jsonb_build_object(
      'invite_to_signup', (
        SELECT CASE WHEN count(*) FILTER (WHERE event_type = 'referral_invite_sent') > 0 THEN
          ROUND(count(*) FILTER (WHERE event_type = 'referral_signup')::numeric / count(*) FILTER (WHERE event_type = 'referral_invite_sent') * 100, 2) ELSE 0 END
        FROM analytics_events WHERE seller_id = v_uid AND event_type IN ('referral_invite_sent','referral_signup') AND created_at >= v_start
      ),
      'signup_to_purchase', (
        SELECT CASE WHEN count(*) FILTER (WHERE event_type = 'referral_signup') > 0 THEN
          ROUND(count(*) FILTER (WHERE event_type = 'referral_first_purchase')::numeric / count(*) FILTER (WHERE event_type = 'referral_signup') * 100, 2) ELSE 0 END
        FROM analytics_events WHERE seller_id = v_uid AND event_type IN ('referral_signup','referral_first_purchase') AND created_at >= v_start
      ),
      'purchase_to_reward', (
        SELECT CASE WHEN count(*) FILTER (WHERE event_type = 'referral_first_purchase') > 0 THEN
          ROUND((SELECT count(*) FROM referral_earnings WHERE user_id = v_uid AND status = 'paid' AND created_at >= v_start)::numeric /
          count(*) FILTER (WHERE event_type = 'referral_first_purchase') * 100, 2) ELSE 0 END
        FROM analytics_events WHERE seller_id = v_uid AND event_type = 'referral_first_purchase' AND created_at >= v_start
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_intelligence TO authenticated;
