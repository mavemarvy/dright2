-- Phase 7: Time-range product performance RPC + critical performance indexes

-- ════════════════════════════════════════════════════════════════════════════
-- Time-range product performance RPC
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_seller_product_performance_ranged(
  p_seller_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  product_id uuid, name text, image_url text, price numeric, is_free boolean,
  view_count bigint, total_sales bigint, average_rating numeric, total_reviews integer,
  wishlist_count bigint, revenue numeric, conversion_rate numeric,
  impressions bigint, clicks bigint, reach bigint, affiliate_clicks bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
BEGIN
  v_start := CURRENT_DATE - p_days;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.image_url,
    p.price,
    p.is_free,
    COALESCE(rvc.cnt, 0),
    COALESCE(src.cnt, 0),
    COALESCE(p.average_rating, 0),
    COALESCE(p.total_reviews, 0),
    COALESCE(wlc.cnt, 0),
    COALESCE(srev.amt, 0),
    CASE WHEN COALESCE(rvc.cnt, 0) > 0
      THEN (COALESCE(src.cnt, 0)::numeric / rvc.cnt::numeric) * 100
      ELSE 0
    END,
    COALESCE(imp_cnt, 0),
    COALESCE(clk_cnt, 0),
    COALESCE(rch_cnt, 0),
    COALESCE(afc_cnt, 0)
  FROM products p
  LEFT JOIN (
    SELECT le.listing_id AS lid, COUNT(*) AS cnt
    FROM listing_events le
    WHERE le.event_type = 'view' AND le.created_at >= v_start
    GROUP BY le.listing_id
  ) rvc ON rvc.lid = p.id
  LEFT JOIN (
    SELECT sr.product_id AS spid, COUNT(*) AS cnt
    FROM sales_records sr
    WHERE sr.status = 'completed' AND sr.sale_date >= v_start
    GROUP BY sr.product_id
  ) src ON src.spid = p.id
  LEFT JOIN (
    SELECT sr2.product_id AS spid2, COALESCE(SUM(sr2.sale_amount), 0) AS amt
    FROM sales_records sr2
    WHERE sr2.status = 'completed' AND sr2.sale_date >= v_start
    GROUP BY sr2.product_id
  ) srev ON srev.spid2 = p.id
  LEFT JOIN (
    SELECT wl.product_id AS wpid, COUNT(*) AS cnt
    FROM wishlist wl
    WHERE wl.created_at >= v_start
    GROUP BY wl.product_id
  ) wlc ON wlc.wpid = p.id
  LEFT JOIN (
    SELECT ce.listing_id AS implid, COUNT(*) AS imp_cnt
    FROM campaign_events ce
    WHERE ce.event_type = 'impression' AND ce.created_at >= v_start
    GROUP BY ce.listing_id
  ) imp ON imp.implid = p.id
  LEFT JOIN (
    SELECT ce2.listing_id AS clklid, COUNT(*) AS clk_cnt
    FROM campaign_events ce2
    WHERE ce2.event_type = 'click' AND ce2.created_at >= v_start
    GROUP BY ce2.listing_id
  ) clk ON clk.clklid = p.id
  LEFT JOIN (
    SELECT ce3.listing_id AS rchlid, COUNT(DISTINCT ce3.user_id) AS rch_cnt
    FROM campaign_events ce3
    WHERE ce3.event_type = 'impression' AND ce3.created_at >= v_start
    GROUP BY ce3.listing_id
  ) rch ON rch.rchlid = p.id
  LEFT JOIN (
    SELECT ac.product_id AS afcpid, COUNT(*) AS afc_cnt
    FROM affiliate_clicks ac
    WHERE ac.created_at >= v_start
    GROUP BY ac.product_id
  ) afc ON afc.afcpid = p.id
  WHERE p.uploaded_by = p_seller_id AND p.is_active = true
  ORDER BY rvc.cnt DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_seller_product_performance_ranged(uuid, integer) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Critical Performance Indexes
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_products_seller_active
  ON products(uploaded_by, is_active)
  WHERE approval_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_products_category_approved
  ON products(category)
  WHERE approval_status = 'approved' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_view_count
  ON products(view_count DESC NULLS LAST)
  WHERE approval_status = 'approved' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_listing_events_listing_type
  ON listing_events(listing_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_records_product_status
  ON sales_records(product_id, status, sale_date DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_events_listing_type_date
  ON campaign_events(listing_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wishlist_product_created
  ON wishlist(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_product
  ON affiliate_clicks(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_target
  ON reviews(target_id, target_type);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_date
  ON ai_conversations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_is_admin
  ON users(is_admin)
  WHERE is_admin = true;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_date
  ON referrals(referrer_id, created_at DESC);
