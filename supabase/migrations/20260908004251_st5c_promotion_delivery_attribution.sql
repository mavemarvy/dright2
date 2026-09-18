-- ST-5C — Promotion delivery, targeting, metric rollups and purchase attribution.
ALTER TABLE public.promotion_campaigns
  ADD COLUMN IF NOT EXISTS placements text[] NOT NULL DEFAULT ARRAY[
    'marketplace','search','category','product_detail','feed',
    'recommendations','notifications','leaderboard','jobs','store'
  ]::text[];

UPDATE public.promotion_campaigns
SET placements = ARRAY[
  'marketplace','search','category','product_detail','feed',
  'recommendations','notifications','leaderboard','jobs','store'
]::text[]
WHERE placements IS NULL OR cardinality(placements) = 0;

ALTER TABLE public.promotion_campaigns DROP CONSTRAINT IF EXISTS promotion_campaigns_placements_check;
ALTER TABLE public.promotion_campaigns ADD CONSTRAINT promotion_campaigns_placements_check CHECK (
  cardinality(placements) > 0
  AND placements <@ ARRAY[
    'marketplace','search','category','product_detail','feed',
    'recommendations','notifications','leaderboard','jobs','store'
  ]::text[]
);

CREATE INDEX IF NOT EXISTS idx_promotion_campaigns_placements
  ON public.promotion_campaigns USING gin (placements);

CREATE OR REPLACE FUNCTION public.guard_promotion_campaign_placements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text := coalesce(auth.role(), '');
BEGIN
  NEW.placements := ARRAY(
    SELECT DISTINCT lower(btrim(x))
    FROM unnest(coalesce(NEW.placements, ARRAY[]::text[])) AS x
    WHERE btrim(x) <> '' ORDER BY 1
  );
  IF cardinality(NEW.placements) = 0 THEN RAISE EXCEPTION 'At least one promotion placement is required'; END IF;
  IF NOT (NEW.placements <@ ARRAY[
    'marketplace','search','category','product_detail','feed',
    'recommendations','notifications','leaderboard','jobs','store'
  ]::text[]) THEN RAISE EXCEPTION 'Unsupported promotion placement'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.placements IS DISTINCT FROM OLD.placements
     AND v_role <> 'service_role'
     AND NOT (OLD.status = 'pending' AND OLD.payment_status = 'pending') THEN
    RAISE EXCEPTION 'Promotion placements can only be edited before payment';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_promotion_campaign_placements ON public.promotion_campaigns;
CREATE TRIGGER trg_guard_promotion_campaign_placements
BEFORE INSERT OR UPDATE OF placements ON public.promotion_campaigns
FOR EACH ROW EXECUTE FUNCTION public.guard_promotion_campaign_placements();
REVOKE ALL ON FUNCTION public.guard_promotion_campaign_placements() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.promotion_viewer_is_eligible(p_campaign_id uuid, p_viewer_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_country text;
  v_location text;
  v_categories text[] := ARRAY[]::text[];
  v_follows boolean := false;
BEGIN
  SELECT * INTO v_campaign FROM public.promotion_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_viewer_id IS NULL THEN
    RETURN v_campaign.audience_type = 'everyone' AND coalesce(v_campaign.audience_followers_only, false) = false;
  END IF;
  IF p_viewer_id = v_campaign.seller_id THEN RETURN false; END IF;

  SELECT lower(nullif(btrim(u.country), '')), lower(nullif(btrim(u.location), ''))
  INTO v_country, v_location FROM public.users u WHERE u.id = p_viewer_id;
  IF v_country IS NULL THEN
    SELECT lower(nullif(btrim(s.country), '')) INTO v_country
    FROM public.analytics_sessions s
    WHERE s.user_id = p_viewer_id AND s.country IS NOT NULL
    ORDER BY s.started_at DESC NULLS LAST, s.created_at DESC LIMIT 1;
  END IF;
  SELECT coalesce(uip.top_categories, ARRAY[]::text[]) INTO v_categories
  FROM public.user_interest_profiles uip WHERE uip.user_id = p_viewer_id;
  SELECT EXISTS (
    SELECT 1 FROM public.user_follows uf
    WHERE uf.follower_id = p_viewer_id AND uf.following_id = v_campaign.seller_id
  ) INTO v_follows;

  IF coalesce(v_campaign.audience_followers_only, false) AND NOT v_follows THEN RETURN false; END IF;
  CASE v_campaign.audience_type
    WHEN 'everyone' THEN RETURN true;
    WHEN 'followers' THEN RETURN v_follows;
    WHEN 'country' THEN RETURN v_country IS NOT NULL AND nullif(btrim(v_campaign.audience_country), '') IS NOT NULL
      AND v_country = lower(btrim(v_campaign.audience_country));
    WHEN 'state' THEN RETURN v_location IS NOT NULL AND nullif(btrim(v_campaign.audience_state), '') IS NOT NULL
      AND position(lower(btrim(v_campaign.audience_state)) in v_location) > 0;
    WHEN 'city' THEN RETURN v_location IS NOT NULL AND nullif(btrim(v_campaign.audience_city), '') IS NOT NULL
      AND position(lower(btrim(v_campaign.audience_city)) in v_location) > 0;
    WHEN 'category' THEN RETURN nullif(btrim(v_campaign.audience_category), '') IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(coalesce(v_categories, ARRAY[]::text[])) c
      WHERE lower(btrim(c)) = lower(btrim(v_campaign.audience_category))
    );
    WHEN 'interests' THEN RETURN EXISTS (
      SELECT 1 FROM unnest(coalesce(v_campaign.audience_interests, ARRAY[]::text[])) i
      JOIN unnest(coalesce(v_categories, ARRAY[]::text[])) c ON lower(btrim(i)) = lower(btrim(c))
    );
    ELSE RETURN false;
  END CASE;
END;
$$;
REVOKE ALL ON FUNCTION public.promotion_viewer_is_eligible(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promotion_viewer_is_eligible(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_sponsored_listings(p_placement text, p_limit integer DEFAULT 5)
RETURNS TABLE(listing_id uuid, campaign_id uuid, listing_type text, goal text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_placement text := lower(btrim(coalesce(p_placement, 'marketplace')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 50));
  v_viewer uuid := auth.uid();
BEGIN
  IF v_placement NOT IN ('marketplace','search','category','product_detail','feed','recommendations','notifications','leaderboard','jobs','store') THEN RETURN; END IF;
  RETURN QUERY
  SELECT pc.listing_id, pc.id, pc.listing_type, pc.goal
  FROM public.promotion_campaigns pc
  WHERE pc.status = 'active'
    AND pc.payment_status = 'paid'
    AND pc.payment_verified_at IS NOT NULL
    AND pc.start_date <= now()
    AND pc.end_date > now()
    AND coalesce(pc.actual_spend, 0) < pc.budget
    AND v_placement = ANY(pc.placements)
    AND public.promotion_viewer_is_eligible(pc.id, v_viewer)
  ORDER BY pc.is_featured DESC, pc.created_at DESC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.get_sponsored_listings(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sponsored_listings(text, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_campaign_event_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_window interval;
  v_event text := lower(coalesce(NEW.event_type, ''));
  v_placement text;
BEGIN
  IF v_role = 'service_role' THEN RETURN NEW; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required for promotion telemetry'; END IF;
  IF v_event NOT IN ('impression','click') THEN RAISE EXCEPTION 'Conversion and outcome events are server-authoritative'; END IF;

  SELECT * INTO v_campaign FROM public.promotion_campaigns WHERE id = NEW.campaign_id;
  IF NOT FOUND OR v_campaign.listing_id IS DISTINCT FROM NEW.listing_id OR v_campaign.status <> 'active'
     OR v_campaign.payment_status <> 'paid' OR v_campaign.payment_verified_at IS NULL
     OR v_campaign.start_date > now() OR v_campaign.end_date <= now()
     OR (v_event = 'impression' AND v_campaign.actual_spend >= v_campaign.budget) THEN
    RAISE EXCEPTION 'Campaign is not eligible for telemetry';
  END IF;
  IF NOT public.promotion_viewer_is_eligible(NEW.campaign_id, v_uid) THEN RAISE EXCEPTION 'Viewer is not eligible for this promotion'; END IF;

  v_placement := lower(btrim(coalesce(nullif(NEW.metadata->>'placement', ''), 'marketplace')));
  IF NOT (v_placement = ANY(v_campaign.placements)) THEN RAISE EXCEPTION 'Campaign is not eligible for this placement'; END IF;
  IF v_event = 'click' AND NOT EXISTS (
    SELECT 1 FROM public.campaign_events imp
    WHERE imp.campaign_id = NEW.campaign_id AND imp.user_id = v_uid
      AND lower(imp.event_type) = 'impression' AND coalesce(imp.is_fraudulent, false) = false
      AND imp.created_at >= now() - interval '24 hours'
  ) THEN RAISE EXCEPTION 'Promotion click requires a recent valid impression'; END IF;

  NEW.user_id := v_uid; NEW.ip_hash := NULL; NEW.device_fingerprint := NULL;
  NEW.is_fraudulent := false; NEW.fraud_reason := NULL;
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('placement', v_placement);
  v_window := CASE WHEN v_event = 'impression' THEN interval '30 seconds' ELSE interval '5 seconds' END;
  IF EXISTS (
    SELECT 1 FROM public.campaign_events ce
    WHERE ce.campaign_id = NEW.campaign_id AND ce.user_id = v_uid
      AND lower(ce.event_type) = v_event AND ce.created_at >= now() - v_window
  ) THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_events_promotion_order_conversion
  ON public.campaign_events ((metadata->>'order_id'))
  WHERE lower(event_type) = 'conversion' AND metadata ? 'order_id';

CREATE OR REPLACE FUNCTION public.rollup_promotion_campaign_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_event text := lower(coalesce(NEW.event_type, ''));
  v_reach_delta integer := 0;
  v_spend_delta numeric := 0;
  v_effective_impression_cost numeric := 0;
  v_revenue numeric := 0;
  v_old_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF coalesce(NEW.is_fraudulent, false) OR v_event NOT IN ('impression','click','conversion') THEN RETURN NEW; END IF;
  SELECT * INTO v_campaign FROM public.promotion_campaigns WHERE id = NEW.campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_event = 'impression' THEN
    IF coalesce(v_campaign.estimated_impressions, 0) > 0 THEN
      v_effective_impression_cost := v_campaign.budget / v_campaign.estimated_impressions;
    ELSE
      v_effective_impression_cost := coalesce(
        nullif((v_campaign.pricing_snapshot->>'cost_per_1000_impressions')::numeric, 0) / 1000,
        nullif((v_campaign.pricing_snapshot->>'cost_per_impression')::numeric, 0), 0
      );
    END IF;
    v_spend_delta := greatest(0, least(v_effective_impression_cost, greatest(0, v_campaign.budget - coalesce(v_campaign.actual_spend, 0))));
    IF NEW.user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.campaign_events prior
      WHERE prior.campaign_id = NEW.campaign_id AND prior.user_id = NEW.user_id
        AND lower(prior.event_type) = 'impression' AND coalesce(prior.is_fraudulent, false) = false
        AND prior.id <> NEW.id AND prior.created_at <= NEW.created_at
    ) THEN v_reach_delta := 1; END IF;
  ELSIF v_event = 'conversion' THEN
    v_revenue := greatest(0, coalesce(nullif(NEW.metadata->>'order_amount', '')::numeric, 0));
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  UPDATE public.promotion_campaigns
  SET actual_impressions = actual_impressions + CASE WHEN v_event = 'impression' THEN 1 ELSE 0 END,
      actual_clicks = actual_clicks + CASE WHEN v_event = 'click' THEN 1 ELSE 0 END,
      actual_conversions = actual_conversions + CASE WHEN v_event = 'conversion' THEN 1 ELSE 0 END,
      actual_reach = actual_reach + v_reach_delta,
      actual_spend = least(budget, actual_spend + v_spend_delta), updated_at = now()
  WHERE id = NEW.campaign_id;
  PERFORM set_config('request.jwt.claim.role', coalesce(v_old_role, ''), true);

  INSERT INTO public.campaign_statistics (
    campaign_id, stat_date, impressions, clicks, conversions, reach, spend, ctr, cpc, cpa, sales_revenue, messages, applications, enrollments
  ) VALUES (
    NEW.campaign_id, NEW.created_at::date,
    CASE WHEN v_event = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN v_event = 'click' THEN 1 ELSE 0 END,
    CASE WHEN v_event = 'conversion' THEN 1 ELSE 0 END,
    v_reach_delta, v_spend_delta, 0, 0, 0,
    CASE WHEN v_event = 'conversion' THEN v_revenue ELSE 0 END, 0, 0, 0
  )
  ON CONFLICT (campaign_id, stat_date) DO UPDATE SET
    impressions = campaign_statistics.impressions + EXCLUDED.impressions,
    clicks = campaign_statistics.clicks + EXCLUDED.clicks,
    conversions = campaign_statistics.conversions + EXCLUDED.conversions,
    reach = campaign_statistics.reach + EXCLUDED.reach,
    spend = campaign_statistics.spend + EXCLUDED.spend,
    sales_revenue = campaign_statistics.sales_revenue + EXCLUDED.sales_revenue,
    ctr = CASE WHEN campaign_statistics.impressions + EXCLUDED.impressions > 0
      THEN ((campaign_statistics.clicks + EXCLUDED.clicks)::numeric / (campaign_statistics.impressions + EXCLUDED.impressions)) * 100 ELSE 0 END,
    cpc = CASE WHEN campaign_statistics.clicks + EXCLUDED.clicks > 0
      THEN (campaign_statistics.spend + EXCLUDED.spend) / (campaign_statistics.clicks + EXCLUDED.clicks) ELSE 0 END,
    cpa = CASE WHEN campaign_statistics.conversions + EXCLUDED.conversions > 0
      THEN (campaign_statistics.spend + EXCLUDED.spend) / (campaign_statistics.conversions + EXCLUDED.conversions) ELSE 0 END;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.role', coalesce(v_old_role, ''), true);
  RAISE;
END;
$$;
DROP TRIGGER IF EXISTS trg_rollup_promotion_campaign_event ON public.campaign_events;
CREATE TRIGGER trg_rollup_promotion_campaign_event AFTER INSERT ON public.campaign_events
FOR EACH ROW EXECUTE FUNCTION public.rollup_promotion_campaign_event();
REVOKE ALL ON FUNCTION public.rollup_promotion_campaign_event() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.attribute_promotion_conversion_on_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_completed_at timestamptz;
  v_click record;
  v_old_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF NEW.status <> 'COMPLETED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  v_completed_at := coalesce(NEW.completed_at, now());
  IF EXISTS (
    SELECT 1 FROM public.campaign_events ce
    WHERE lower(ce.event_type) = 'conversion' AND ce.metadata->>'order_id' = NEW.id::text
  ) THEN RETURN NEW; END IF;

  SELECT ce.id AS click_event_id, ce.campaign_id, pc.billing_currency INTO v_click
  FROM public.campaign_events ce
  JOIN public.promotion_campaigns pc ON pc.id = ce.campaign_id
  WHERE lower(ce.event_type) = 'click' AND coalesce(ce.is_fraudulent, false) = false
    AND ce.user_id = NEW.buyer_id AND ce.listing_id = NEW.product_id
    AND ce.created_at <= v_completed_at AND ce.created_at >= v_completed_at - interval '7 days'
    AND pc.listing_id = NEW.product_id AND pc.seller_id = NEW.seller_id
    AND pc.payment_status = 'paid' AND pc.payment_verified_at IS NOT NULL
  ORDER BY ce.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  INSERT INTO public.campaign_events (
    campaign_id, user_id, event_type, listing_id, session_id, metadata, is_fraudulent, fraud_reason, created_at
  ) VALUES (
    v_click.campaign_id, NEW.buyer_id, 'conversion', NEW.product_id, NEW.session_id,
    jsonb_build_object(
      'order_id', NEW.id::text, 'click_event_id', v_click.click_event_id::text,
      'attribution_model', 'last_click_7d', 'order_amount', NEW.final_price,
      'campaign_billing_currency', v_click.billing_currency, 'amount_source', 'orders.final_price'
    ), false, NULL, v_completed_at
  ) ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claim.role', coalesce(v_old_role, ''), true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.role', coalesce(v_old_role, ''), true);
  RAISE;
END;
$$;
DROP TRIGGER IF EXISTS trg_attribute_promotion_conversion_on_order ON public.orders;
CREATE TRIGGER trg_attribute_promotion_conversion_on_order
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.attribute_promotion_conversion_on_order();
REVOKE ALL ON FUNCTION public.attribute_promotion_conversion_on_order() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_campaign_events_paid_promo_click_attribution
  ON public.campaign_events (user_id, listing_id, created_at DESC)
  WHERE lower(event_type) = 'click' AND coalesce(is_fraudulent, false) = false;
CREATE INDEX IF NOT EXISTS idx_campaign_events_reach_lookup
  ON public.campaign_events (campaign_id, user_id, created_at)
  WHERE lower(event_type) = 'impression' AND coalesce(is_fraudulent, false) = false;
