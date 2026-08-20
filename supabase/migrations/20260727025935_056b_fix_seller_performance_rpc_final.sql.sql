-- Final fix: ensure view_count returns actual view_count, not total_sales duplicate
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
    p.id,
    p.name,
    p.image_url,
    p.price,
    p.is_free,
    COALESCE(p.view_count, 0),
    COALESCE(p.total_sales, 0),
    COALESCE(p.average_rating, 0),
    COALESCE(p.total_reviews, 0),
    COALESCE(w.wc, 0),
    COALESCE(s.rev, 0),
    CASE WHEN COALESCE(p.view_count, 0) > 0
      THEN (COALESCE(p.total_sales, 0)::numeric / p.view_count::numeric) * 100
      ELSE 0
    END,
    COALESCE(imp.imp_cnt, 0),
    COALESCE(clk.clk_cnt, 0),
    COALESCE(rch.rch_cnt, 0),
    COALESCE(afc.afc_cnt, 0)
  FROM products p
  LEFT JOIN (
    SELECT wl.product_id AS wpid, COUNT(*) AS wc
    FROM wishlist wl GROUP BY wl.product_id
  ) w ON w.wpid = p.id
  LEFT JOIN (
    SELECT sr.product_id AS spid, COALESCE(SUM(sr.sale_amount), 0) AS rev
    FROM sales_records sr WHERE sr.status = 'completed' GROUP BY sr.product_id
  ) s ON s.spid = p.id
  LEFT JOIN (
    SELECT ce.listing_id AS implid, COUNT(*) AS imp_cnt
    FROM campaign_events ce WHERE ce.event_type = 'impression' GROUP BY ce.listing_id
  ) imp ON imp.implid = p.id
  LEFT JOIN (
    SELECT ce2.listing_id AS clklid, COUNT(*) AS clk_cnt
    FROM campaign_events ce2 WHERE ce2.event_type = 'click' GROUP BY ce2.listing_id
  ) clk ON clk.clklid = p.id
  LEFT JOIN (
    SELECT ce3.listing_id AS rchlid, COUNT(DISTINCT ce3.user_id) AS rch_cnt
    FROM campaign_events ce3 WHERE ce3.event_type = 'impression' GROUP BY ce3.listing_id
  ) rch ON rch.rchlid = p.id
  LEFT JOIN (
    SELECT ac.product_id AS afcpid, COUNT(*) AS afc_cnt
    FROM affiliate_clicks ac GROUP BY ac.product_id
  ) afc ON afc.afcpid = p.id
  WHERE p.uploaded_by = p_seller_id AND p.is_active = true
  ORDER BY p.view_count DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_seller_product_performance(uuid) TO authenticated;
