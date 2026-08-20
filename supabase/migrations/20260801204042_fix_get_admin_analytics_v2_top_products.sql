-- Fix get_admin_analytics_v2: top_products subquery references v.cnt outside its scope
DO $$
DECLARE
  new_def TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO new_def FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'get_admin_analytics_v2';
  
  -- The issue: the top_products subquery has an inner FROM with alias v for views, 
  -- but the outer SELECT references v.cnt which is out of scope
  -- Fix: move the COALESCE into the inner subquery
  new_def := replace(new_def, 
    '''top_products'',       (
SELECT COALESCE(jsonb_agg(jsonb_build_object(''id'', p.id, ''name'', p.name, ''views'', COALESCE(v.cnt, 0), ''sales'', COALESCE(s.cnt, 0)) ORDER BY COALESCE(v.cnt, 0) DESC), ''[]''::jsonb)
FROM (
SELECT p.id, p.name, v.cnt, s.cnt AS s_cnt FROM products p
LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = ''product_view'' AND created_at >= v_start GROUP BY entity_id) v ON v.entity_id = p.id
LEFT JOIN (SELECT product_id, count(*) AS cnt FROM orders WHERE status = ''COMPLETED'' GROUP BY product_id) s ON s.product_id = p.id
WHERE p.is_active = true ORDER BY COALESCE(v.cnt, 0) DESC LIMIT 10
) p
)',
    '''top_products'',       (
SELECT COALESCE(jsonb_agg(jsonb_build_object(''id'', p.id, ''name'', p.name, ''views'', COALESCE(p.view_cnt, 0), ''sales'', COALESCE(p.sale_cnt, 0)) ORDER BY COALESCE(p.view_cnt, 0) DESC), ''[]''::jsonb)
FROM (
SELECT p.id, p.name, COALESCE(v.cnt, 0) AS view_cnt, COALESCE(s.cnt, 0) AS sale_cnt FROM products p
LEFT JOIN (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE event_type = ''product_view'' AND created_at >= v_start GROUP BY entity_id) v ON v.entity_id = p.id
LEFT JOIN (SELECT product_id, count(*) AS cnt FROM orders WHERE status = ''COMPLETED'' GROUP BY product_id) s ON s.product_id = p.id
WHERE p.is_active = true ORDER BY COALESCE(v.cnt, 0) DESC LIMIT 10
) p
)');
  
  EXECUTE new_def;
  RAISE NOTICE 'Fixed get_admin_analytics_v2';
END;
$$;