/*
# DRIGHT Phase 6 Prep — Product Performance Tracking Fixes

1. Add view_source to listing_events for source tracking
2. Add source column to affiliate_clicks for source tracking
3. Create sync_product_stats RPC to update product aggregate fields
4. Create get_product_view_sources RPC for view source breakdown
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Add view_source to listing_events
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE listing_events ADD COLUMN IF NOT EXISTS view_source text DEFAULT 'marketplace';
-- marketplace | affiliate | profile | store | recommendation | search | direct

CREATE INDEX IF NOT EXISTS idx_listing_events_source ON listing_events(view_source, event_type) WHERE view_source IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Add source to affiliate_clicks
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE affiliate_clicks ADD COLUMN IF NOT EXISTS source text DEFAULT 'affiliate_link';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RPC: Sync product stats from real data
-- Recalculates total_sales, average_rating, total_reviews, view_count
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_product_stats(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_count integer;
  v_avg_rating numeric;
  v_view_count integer;
BEGIN
  -- Count reviews and calculate average rating
  SELECT COUNT(*), COALESCE(AVG(rating), 0)
  INTO v_review_count, v_avg_rating
  FROM reviews WHERE target_id = p_product_id AND target_type = 'product';

  -- Count views from listing_events
  SELECT COUNT(*)
  INTO v_view_count
  FROM listing_events WHERE listing_id = p_product_id AND event_type = 'view';

  -- Update the product
  UPDATE products SET
    total_reviews = v_review_count,
    average_rating = ROUND(v_avg_rating, 2),
    view_count = v_view_count,
    updated_at = now()
  WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_product_stats(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RPC: Get product view sources breakdown
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_product_view_sources(p_product_id uuid)
RETURNS TABLE(view_source text, view_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(NULLIF(le.view_source, ''), 'marketplace') AS view_source,
    COUNT(*)::bigint AS view_count
  FROM listing_events le
  WHERE le.listing_id = p_product_id AND le.event_type = 'view'
  GROUP BY COALESCE(NULLIF(le.view_source, ''), 'marketplace')
  ORDER BY view_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_view_sources(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RPC: Get seller product performance (real revenue from sales_records)
-- ════════════════════════════════════════════════════════════════════════════

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
    COALESCE(p.total_sales, 0),
    COALESCE(p.total_sales, 0) AS total_sales,
    COALESCE(p.average_rating, 0),
    COALESCE(p.total_reviews, 0),
    COALESCE(w.wishlist_count, 0),
    COALESCE(s.revenue, 0),
    CASE WHEN COALESCE(p.view_count, 0) > 0
      THEN (COALESCE(p.total_sales, 0)::numeric / p.view_count::numeric) * 100
      ELSE 0
    END,
    COALESCE(imp.impressions, 0),
    COALESCE(clk.clicks, 0),
    COALESCE(rch.reach, 0),
    COALESCE(afc.affiliate_clicks, 0)
  FROM products p
  LEFT JOIN (
    SELECT product_id, COUNT(*) AS wishlist_count
    FROM wishlist GROUP BY product_id
  ) w ON w.product_id = p.id
  LEFT JOIN (
    SELECT product_id, COALESCE(SUM(sale_amount), 0) AS revenue
    FROM sales_records WHERE status = 'completed' GROUP BY product_id
  ) s ON s.product_id = p.id
  LEFT JOIN (
    SELECT listing_id, COUNT(*) AS impressions
    FROM campaign_events WHERE event_type = 'impression' GROUP BY listing_id
  ) imp ON imp.listing_id = p.id
  LEFT JOIN (
    SELECT listing_id, COUNT(*) AS clicks
    FROM campaign_events WHERE event_type = 'click' GROUP BY listing_id
  ) clk ON clk.listing_id = p.id
  LEFT JOIN (
    SELECT listing_id, COUNT(DISTINCT user_id) AS reach
    FROM campaign_events WHERE event_type = 'impression' GROUP BY listing_id
  ) rch ON rch.listing_id = p.id
  LEFT JOIN (
    SELECT product_id, COUNT(*) AS affiliate_clicks
    FROM affiliate_clicks GROUP BY product_id
  ) afc ON afc.product_id = p.id
  WHERE p.uploaded_by = p_seller_id AND p.is_active = true
  ORDER BY p.view_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_seller_product_performance(uuid) TO authenticated;
