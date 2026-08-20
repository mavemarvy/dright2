-- Fix get_live_leaderboards: u.name -> u.full_name
CREATE OR REPLACE FUNCTION public.get_live_leaderboards(
  p_category text DEFAULT 'products',
  p_period text DEFAULT '30d'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start TIMESTAMP;
BEGIN
  CASE p_period
    WHEN '7d' THEN v_start := now() - '7 days'::interval;
    WHEN '24h' THEN v_start := now() - '1 day'::interval;
    ELSE v_start := now() - '30 days'::interval;
  END CASE;

  RETURN jsonb_build_object(
    'top_sellers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'seller_id', t.seller_id, 'name', u.full_name, 'avatar_url', u.avatar_url,
        'views', t.views, 'sales', t.sales, 'score', t.score
      ) ORDER BY t.score DESC), '[]'::jsonb)
      FROM (
        SELECT seller_id,
        count(*) AS views,
        count(*) FILTER (WHERE event_type = 'purchase') AS sales,
        count(*) * 2 + count(*) FILTER (WHERE event_type = 'purchase') * 10 AS score
        FROM analytics_events
        WHERE seller_id IS NOT NULL AND created_at >= v_start
        GROUP BY seller_id
      ) t
      JOIN users u ON u.id = t.seller_id
    ),
    'top_products', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'entity_id', t.entity_id, 'name', p.name, 'views', t.views, 'sales', t.sales, 'score', t.score
      ) ORDER BY t.score DESC), '[]'::jsonb)
      FROM (
        SELECT entity_id,
        count(*) AS views,
        count(*) FILTER (WHERE event_type = 'purchase') AS sales,
        count(*) * 2 + count(*) FILTER (WHERE event_type = 'purchase') * 10 AS score
        FROM analytics_events
        WHERE entity_id IS NOT NULL AND created_at >= v_start
        GROUP BY entity_id
      ) t
      LEFT JOIN products p ON p.id = t.entity_id
    )
  );
END;
$function$;