-- Fix: column reference "product_id" is ambiguous in get_seller_product_performance
-- The PL/pgSQL variable name clashed with subquery column names.
-- Resolve by prefixing all subquery columns with unique aliases.

CREATE OR REPLACE FUNCTION get_seller_product_performance(p_seller_id uuid)
RETURNS TABLE(
  product_id uuid, name text, image_url text, price numeric, is_free boolean,
  view_count integer, total_sales integer, average_rating numeric, total_reviews integer,
  wishlist_count bigint, revenue numeric, conversion_rate numeric,
  impressions bigint, clicks bigint, reach bigint, affiliate_clicks bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.name,
    p.image_url,
    p.price,
    p.is_free,
    COALESCE(p.total_sales, 0) AS view_count_placeholder,
    COALESCE(p.total_sales, 0) AS total_sales,
    COALESCE(p.average_rating, 0) AS average_rating,
    COALESCE(p.total_reviews, 0) AS total_reviews,
    COALESCE(w.wc, 0) AS wishlist_count,
    COALESCE(s.rev, 0) AS revenue,
    CASE WHEN COALESCE(p.view_count, 0) > 0
      THEN (COALESCE(p.total_sales, 0)::numeric / p.view_count::numeric) * 100
      ELSE 0
    END AS conversion_rate,
    COALESCE(imp.imp_cnt, 0) AS impressions,
    COALESCE(clk.clk_cnt, 0) AS clicks,
    COALESCE(rch.rch_cnt, 0) AS reach,
    COALESCE(afc.afc_cnt, 0) AS affiliate_clicks
  FROM products p
  LEFT JOIN (
    SELECT w_prod.product_id AS wpid, COUNT(*) AS wc
    FROM wishlist w_prod GROUP BY w_prod.product_id
  ) w ON w.wpid = p.id
  LEFT JOIN (
    SELECT s_prod.product_id AS spid, COALESCE(SUM(sale_amount), 0) AS rev
    FROM sales_records s_prod WHERE status = 'completed' GROUP BY s_prod.product_id
  ) s ON s.spid = p.id
  LEFT JOIN (
    SELECT imp_le.listing_id AS implid, COUNT(*) AS imp_cnt
    FROM campaign_events imp_le WHERE event_type = 'impression' GROUP BY imp_le.listing_id
  ) imp ON imp.implid = p.id
  LEFT JOIN (
    SELECT clk_le.listing_id AS clklid, COUNT(*) AS clk_cnt
    FROM campaign_events clk_le WHERE event_type = 'click' GROUP BY clk_le.listing_id
  ) clk ON clk.clklid = p.id
  LEFT JOIN (
    SELECT rch_le.listing_id AS rchlid, COUNT(DISTINCT user_id) AS rch_cnt
    FROM campaign_events rch_le WHERE event_type = 'impression' GROUP BY rch_le.listing_id
  ) rch ON rch.rchlid = p.id
  LEFT JOIN (
    SELECT afc_prod.product_id AS afcpid, COUNT(*) AS afc_cnt
    FROM affiliate_clicks afc_prod GROUP BY afc_prod.product_id
  ) afc ON afc.afcpid = p.id
  WHERE p.uploaded_by = p_seller_id AND p.is_active = true
  ORDER BY p.view_count DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_seller_product_performance(uuid) TO authenticated;
