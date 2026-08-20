-- Fix get_prediction_engine: remove referral_earnings reference (table doesn't exist)
CREATE OR REPLACE FUNCTION public.get_prediction_engine(
  p_entity_type text DEFAULT 'seller',
  p_entity_id uuid DEFAULT NULL,
  p_window text DEFAULT '30d'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_days INT := CASE p_window WHEN 'tomorrow' THEN 1 WHEN '7d' THEN 7 WHEN '30d' THEN 30 WHEN '90d' THEN 90 WHEN '1y' THEN 365 ELSE 30 END;
  v_start TIMESTAMP := now() - '30 days'::interval;
  v_seller_id UUID := COALESCE(p_entity_id, auth.uid());
  v_avg_daily_views NUMERIC;
  v_avg_daily_sales NUMERIC;
  v_avg_daily_revenue NUMERIC;
  v_views_7d INT;
  v_views_7d_prev INT;
  v_sales_30d INT;
  v_revenue_30d NUMERIC;
  v_growth_rate NUMERIC;
BEGIN
  SELECT count(*)::numeric / 30 INTO v_avg_daily_views
  FROM analytics_events WHERE seller_id = v_seller_id AND event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= v_start;

  SELECT count(*)::numeric / 30 INTO v_avg_daily_sales
  FROM analytics_events WHERE seller_id = v_seller_id AND event_type = 'purchase' AND created_at >= v_start;

  SELECT COALESCE(sum(final_price), 0)::numeric / 30 INTO v_avg_daily_revenue
  FROM orders WHERE seller_id = v_seller_id AND status = 'COMPLETED' AND created_at >= v_start;

  SELECT count(*) INTO v_views_7d FROM analytics_events WHERE seller_id = v_seller_id AND event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= now() - '7 days'::interval;
  SELECT count(*) INTO v_views_7d_prev FROM analytics_events WHERE seller_id = v_seller_id AND event_type IN ('product_view','service_view','job_view','course_view') AND created_at >= now() - '14 days'::interval AND created_at < now() - '7 days'::interval;

  v_growth_rate := CASE WHEN v_views_7d_prev > 0 THEN (v_views_7d::numeric - v_views_7d_prev) / v_views_7d_prev ELSE 0 END;

  SELECT count(*), COALESCE(sum(final_price), 0) INTO v_sales_30d, v_revenue_30d
  FROM orders WHERE seller_id = v_seller_id AND status = 'COMPLETED' AND created_at >= v_start;

  RETURN jsonb_build_object(
    'sales_forecast', ROUND(v_avg_daily_sales * v_days, 0),
    'revenue_forecast', ROUND(v_avg_daily_revenue * v_days, 2),
    'view_forecast', ROUND(v_avg_daily_views * v_days * (1 + v_growth_rate), 0),
    'inventory_forecast', jsonb_build_object(
      'current_stock', (SELECT COALESCE(sum(stock_count), 0) FROM products WHERE uploaded_by = v_seller_id AND is_active = true),
      'estimated_days_of_stock', CASE WHEN v_avg_daily_sales > 0 THEN ROUND((SELECT COALESCE(sum(stock_count), 0) FROM products WHERE uploaded_by = v_seller_id AND is_active = true) / v_avg_daily_sales) ELSE NULL END
    ),
    'affiliate_forecast', jsonb_build_object(
      'estimated_clicks', ROUND((SELECT count(*)::numeric / 30 FROM analytics_events WHERE seller_id = v_seller_id AND event_type = 'affiliate_click' AND created_at >= v_start) * v_days, 0),
      'estimated_commission', ROUND((SELECT COALESCE(sum((metadata->>'commission')::numeric), 0)::numeric / 30 FROM analytics_events WHERE seller_id = v_seller_id AND event_type = 'affiliate_conversion' AND created_at >= v_start) * v_days, 2)
    ),
    'referral_forecast', jsonb_build_object(
      'estimated_signups', ROUND((SELECT count(*)::numeric / 30 FROM analytics_events WHERE seller_id = v_seller_id AND event_type = 'referral_signup' AND created_at >= v_start) * v_days, 0),
      'estimated_earnings', 0
    ),
    'campaign_forecast', jsonb_build_object(
      'estimated_reach', ROUND(v_avg_daily_views * v_days * 1.5, 0),
      'estimated_conversions', ROUND(v_avg_daily_sales * v_days * 1.3, 0)
    ),
    'growth_rate', ROUND(v_growth_rate * 100, 2),
    'window', p_window,
    'window_days', v_days,
    'confidence', CASE
      WHEN v_sales_30d > 10 THEN 'high'
      WHEN v_sales_30d > 3 THEN 'medium'
      ELSE 'low'
    END
  );
END;
$function$;