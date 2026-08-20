-- ─────────────────────────────────────────────────────────────────────────────
-- DRIGHT Referral, Creator Campaign, Affiliate Score, Benchmarking, Alerts RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- REFERRAL PROGRAM ANALYTICS
CREATE OR REPLACE FUNCTION get_referral_program_analytics(
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
BEGIN
  RETURN jsonb_build_object(
    'referral_link_clicks', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_click' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start),
    'unique_clicks', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE event_type = 'referral_click' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start),
    'registered_users', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_signup' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start),
    'verified_users', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_verified' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start),
    'activated_users', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_activated' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start),
    'first_purchase', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_first_purchase' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start),
    'second_purchase', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_second_purchase' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start),
    'third_purchase', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_third_purchase' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start),
    'conversion_rate', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'referral_first_purchase')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE event_type IN ('referral_click','referral_first_purchase') AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start
    ),
    'referral_earnings', (SELECT COALESCE(sum(amount), 0) FROM referral_earnings WHERE (p_user_id IS NULL OR user_id = p_user_id) AND created_at >= v_start),
    'pending_earnings', (SELECT COALESCE(sum(amount), 0) FROM referral_earnings WHERE status = 'pending' AND (p_user_id IS NULL OR user_id = p_user_id) AND created_at >= v_start),
    'paid_earnings', (SELECT COALESCE(sum(amount), 0) FROM referral_earnings WHERE status = 'paid' AND (p_user_id IS NULL OR user_id = p_user_id) AND created_at >= v_start),
    'cancelled_rewards', (SELECT count(*) FROM referral_earnings WHERE status = 'cancelled' AND (p_user_id IS NULL OR user_id = p_user_id) AND created_at >= v_start),
    'fraud_detected', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_fraud' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start),
    'referral_quality_score', (
      SELECT LEAST(100, ROUND(
        (count(*) FILTER (WHERE event_type = 'referral_first_purchase')::numeric * 20 +
        count(*) FILTER (WHERE event_type = 'referral_second_purchase')::numeric * 15 +
        count(*) FILTER (WHERE event_type = 'referral_third_purchase')::numeric * 10 +
        count(*) FILTER (WHERE event_type = 'referral_verified')::numeric * 5
      ), 2))
      FROM analytics_events WHERE event_type LIKE 'referral_%' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start
    ),
    'top_referrers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', seller_id, 'clicks', clicks, 'signups', signups) ORDER BY clicks DESC), '[]'::jsonb)
      FROM (
        SELECT seller_id, count(*) FILTER (WHERE event_type = 'referral_click') AS clicks,
          count(*) FILTER (WHERE event_type = 'referral_signup') AS signups
        FROM analytics_events WHERE event_type IN ('referral_click','referral_signup') AND seller_id IS NOT NULL AND created_at >= v_start
        GROUP BY seller_id ORDER BY clicks DESC LIMIT 10
      ) t
    ),
    'top_countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM analytics_events WHERE event_type = 'referral_click' AND country IS NOT NULL AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'referral_funnel', jsonb_build_array(
      jsonb_build_object('step', 'Link Clicks', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_click' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start)),
      jsonb_build_object('step', 'Signups', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_signup' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start)),
      jsonb_build_object('step', 'Verified', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_verified' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start)),
      jsonb_build_object('step', 'First Purchase', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_first_purchase' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start)),
      jsonb_build_object('step', 'Second Purchase', 'count', (SELECT count(*) FROM analytics_events WHERE event_type = 'referral_second_purchase' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start))
    ),
    'daily_clicks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM analytics_events WHERE event_type = 'referral_click' AND (p_user_id IS NULL OR seller_id = p_user_id) AND created_at >= v_start GROUP BY d ORDER BY d) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_program_analytics TO authenticated;

-- CREATOR CAMPAIGN ANALYTICS
CREATE OR REPLACE FUNCTION get_creator_campaign_analytics(
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
    'campaign_reach', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_impression' AND created_at >= v_start),
    'impressions', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_impression' AND created_at >= v_start),
    'views', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_view' AND created_at >= v_start),
    'clicks', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_click' AND created_at >= v_start),
    'ctr', (
      SELECT CASE WHEN count(*) > 0 THEN ROUND((count(*) FILTER (WHERE event_type = 'campaign_click')::numeric / count(*) * 100), 2) ELSE 0 END
      FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type IN ('campaign_impression','campaign_click') AND created_at >= v_start
    ),
    'shares', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'share' AND created_at >= v_start),
    'likes', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_like' AND created_at >= v_start),
    'comments', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_comment' AND created_at >= v_start),
    'conversions', (SELECT count(*) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_conversion' AND created_at >= v_start),
    'revenue', (SELECT COALESCE(sum((metadata->>'amount')::numeric), 0) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_conversion' AND created_at >= v_start),
    'cost', (SELECT COALESCE(sum((metadata->>'cost')::numeric), 0) FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_spend' AND created_at >= v_start),
    'roi', (
      SELECT CASE WHEN COALESCE(sum((metadata->>'cost')::numeric), 0) > 0 THEN
        ROUND(((sum((metadata->>'amount')::numeric) - sum((metadata->>'cost')::numeric)) / sum((metadata->>'cost')::numeric) * 100), 2)
      ELSE 0 END
      FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type IN ('campaign_conversion','campaign_spend') AND created_at >= v_start
    ),
    'roas', (
      SELECT CASE WHEN COALESCE(sum((metadata->>'cost')::numeric), 0) > 0 THEN
        ROUND((sum((metadata->>'amount')::numeric) / sum((metadata->>'cost')::numeric)), 2)
      ELSE 0 END
      FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type IN ('campaign_conversion','campaign_spend') AND created_at >= v_start
    ),
    'audience_demographics', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_view' AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'traffic_sources', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT source, count(*) AS cnt FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND event_type = 'campaign_view' AND created_at >= v_start GROUP BY source ORDER BY cnt DESC) t
    ),
    'daily_timeline', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'impressions', imp, 'clicks', clk, 'conversions', conv) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at) AS d,
          count(*) FILTER (WHERE event_type = 'campaign_impression') AS imp,
          count(*) FILTER (WHERE event_type = 'campaign_click') AS clk,
          count(*) FILTER (WHERE event_type = 'campaign_conversion') AS conv
        FROM analytics_events WHERE entity_id = p_campaign_id AND entity_type = 'campaign' AND created_at >= v_start
        GROUP BY d ORDER BY d
      ) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_creator_campaign_analytics TO authenticated;

-- AFFILIATE SCORE
CREATE OR REPLACE FUNCTION get_affiliate_score(
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
  v_clicks INT;
  v_conversions INT;
  v_revenue NUMERIC;
BEGIN
  SELECT count(*) INTO v_clicks FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND created_at >= v_start;
  SELECT count(*) INTO v_conversions FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND created_at >= v_start;
  SELECT COALESCE(sum((metadata->>'amount')::numeric), 0) INTO v_revenue FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND created_at >= v_start;

  RETURN jsonb_build_object(
    'affiliate_score', LEAST(100, ROUND((v_clicks * 0.5 + v_conversions * 10 + v_revenue * 0.01), 2)),
    'trust_score', LEAST(100, ROUND((v_conversions * 5 + CASE WHEN v_clicks > 0 THEN (v_conversions::numeric / v_clicks * 50) ELSE 0 END), 2)),
    'conversion_score', CASE WHEN v_clicks > 0 THEN LEAST(100, ROUND((v_conversions::numeric / v_clicks * 100), 2)) ELSE 0 END,
    'clicks', v_clicks,
    'conversions', v_conversions,
    'revenue', v_revenue,
    'commission', (SELECT COALESCE(sum((metadata->>'commission')::numeric), 0) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND created_at >= v_start),
    'pending_commission', (SELECT COALESCE(sum((metadata->>'commission')::numeric), 0) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND metadata->>'status' = 'pending' AND created_at >= v_start),
    'paid_commission', (SELECT COALESCE(sum((metadata->>'commission')::numeric), 0) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_conversion' AND metadata->>'status' = 'paid' AND created_at >= v_start),
    'unique_clicks', (SELECT count(DISTINCT COALESCE(viewer_id::text, session_id)) FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type = 'affiliate_click' AND created_at >= v_start),
    'ctr', CASE WHEN v_clicks > 0 THEN ROUND((v_conversions::numeric / v_clicks * 100), 2) ELSE 0 END,
    'leaderboard_position', (
      SELECT rank FROM (
        SELECT seller_id, ROW_NUMBER() OVER (ORDER BY count(*) DESC) AS rank
        FROM analytics_events WHERE event_type = 'affiliate_conversion' AND created_at >= v_start
        GROUP BY seller_id
      ) r WHERE seller_id = p_affiliate_id
    ),
    'daily_performance', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'clicks', clk, 'conversions', conv, 'earnings', earn) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', created_at) AS d,
          count(*) FILTER (WHERE event_type = 'affiliate_click') AS clk,
          count(*) FILTER (WHERE event_type = 'affiliate_conversion') AS conv,
          COALESCE(sum((metadata->>'commission')::numeric) FILTER (WHERE event_type = 'affiliate_conversion'), 0) AS earn
        FROM analytics_events WHERE seller_id = p_affiliate_id AND event_type IN ('affiliate_click','affiliate_conversion') AND created_at >= v_start
        GROUP BY d ORDER BY d
      ) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_affiliate_score TO authenticated;

-- ANALYTICS ALERTS
CREATE OR REPLACE FUNCTION get_analytics_alerts(
  p_seller_id UUID,
  p_days INT DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
  v_today_views INT;
  v_yesterday_views INT;
  v_today_sales INT;
  v_yesterday_sales INT;
  v_today_conversion NUMERIC;
  v_week_conversion NUMERIC;
BEGIN
  SELECT count(*) INTO v_today_views FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'product_view' AND created_at >= now() - '1 day'::interval;
  SELECT count(*) INTO v_yesterday_views FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'product_view' AND created_at >= now() - '2 days'::interval AND created_at < now() - '1 day'::interval;
  SELECT count(*) INTO v_today_sales FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND created_at >= now() - '1 day'::interval;
  SELECT count(*) INTO v_yesterday_sales FROM analytics_events WHERE seller_id = p_seller_id AND event_type = 'purchase' AND created_at >= now() - '2 days'::interval AND created_at < now() - '1 day'::interval;

  RETURN jsonb_build_array(
    CASE WHEN v_today_views > v_yesterday_views * 2 AND v_yesterday_views > 0 THEN
      jsonb_build_object('type', 'views_spike', 'severity', 'positive', 'message', 'Views spiked ' || ROUND((v_today_views::numeric / v_yesterday_views - 1) * 100) || '% today', 'value', v_today_views)
    END,
    CASE WHEN v_yesterday_views > 0 AND v_today_views < v_yesterday_views * 0.5 THEN
      jsonb_build_object('type', 'views_drop', 'severity', 'warning', 'message', 'Views dropped ' || ROUND((1 - v_today_views::numeric / v_yesterday_views) * 100) || '% today', 'value', v_today_views)
    END,
    CASE WHEN v_today_sales > v_yesterday_sales * 2 AND v_yesterday_sales > 0 THEN
      jsonb_build_object('type', 'sales_spike', 'severity', 'positive', 'message', 'Sales spiked ' || ROUND((v_today_sales::numeric / v_yesterday_sales - 1) * 100) || '% today', 'value', v_today_sales)
    END,
    CASE WHEN v_yesterday_sales > 0 AND v_today_sales < v_yesterday_sales * 0.5 THEN
      jsonb_build_object('type', 'sales_drop', 'severity', 'critical', 'message', 'Sales dropped ' || ROUND((1 - v_today_sales::numeric / v_yesterday_sales) * 100) || '% today', 'value', v_today_sales)
    END,
    CASE WHEN (SELECT count(*) FROM products WHERE uploaded_by = p_seller_id AND is_active = true AND approval_status = 'approved' AND stock_count < 5) > 0 THEN
      jsonb_build_object('type', 'low_inventory', 'severity', 'warning', 'message', 'Some products are running low on inventory')
    END,
    CASE WHEN (SELECT count(*) FROM orders WHERE seller_id = p_seller_id AND status = 'CANCELLED' AND created_at >= v_start) > 5 THEN
      jsonb_build_object('type', 'high_refund_rate', 'severity', 'critical', 'message', 'High refund rate detected in the last ' || p_days || ' days')
    END
  ) - 'null';
END;
$$;

GRANT EXECUTE ON FUNCTION get_analytics_alerts TO authenticated;
