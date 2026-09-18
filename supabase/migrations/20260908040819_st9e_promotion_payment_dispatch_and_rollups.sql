-- ST-9E: route verified promotion payments to the dedicated adapter and make
-- campaign/asset/placement analytics use the universal promotion schema.

CREATE OR REPLACE FUNCTION public.process_paystack_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_purpose text,
  p_reference_id uuid,
  p_metadata jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx public.paystack_transactions%ROWTYPE;
  v_currency text;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Payment processing requires service_role';
  END IF;

  SELECT * INTO v_tx
  FROM public.paystack_transactions
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Canonical Paystack transaction not found'; END IF;
  IF v_tx.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Payment user mismatch'; END IF;
  IF v_tx.purpose IS DISTINCT FROM p_purpose THEN RAISE EXCEPTION 'Payment purpose mismatch'; END IF;
  IF v_tx.reference_id IS DISTINCT FROM p_reference_id THEN RAISE EXCEPTION 'Payment reference target mismatch'; END IF;
  IF abs(COALESCE(v_tx.amount,0) - COALESCE(p_amount,0)) > 0.01 THEN RAISE EXCEPTION 'Payment amount mismatch'; END IF;
  IF v_tx.status <> 'success' THEN RAISE EXCEPTION 'Paystack transaction is not verified successful'; END IF;

  v_currency := upper(v_tx.currency);

  IF p_purpose = 'promotion_campaign' THEN
    RETURN public.process_verified_promotion_payment(
      p_reference, p_user_id, v_tx.amount, v_currency, 'paystack'
    );
  END IF;

  IF p_purpose = 'sales_team_contract' THEN
    RETURN public.process_verified_sales_team_contract_payment(
      p_reference, p_user_id, v_tx.amount, v_currency, 'paystack'
    );
  END IF;

  RETURN public.process_paystack_payment_core_st6(
    p_reference,
    p_user_id,
    v_tx.amount,
    v_tx.purpose,
    v_tx.reference_id,
    COALESCE(v_tx.metadata,'{}'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.rollup_promotion_campaign_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_event text := lower(coalesce(NEW.event_type, ''));
  v_reach_delta integer := 0;
  v_spend_delta numeric := 0;
  v_effective_impression_cost numeric := 0;
  v_revenue numeric := 0;
  v_asset_id uuid := nullif(NEW.metadata->>'campaign_asset_id','')::uuid;
  v_placement text := lower(nullif(NEW.metadata->>'placement',''));
  v_old_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF coalesce(NEW.is_fraudulent, false) OR v_event NOT IN ('impression','click','conversion') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_campaign
  FROM public.promotion_campaigns
  WHERE id = NEW.campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_asset_id IS NULL THEN
    SELECT ca.id INTO v_asset_id
    FROM public.campaign_assets ca
    WHERE ca.campaign_id = NEW.campaign_id
      AND ca.asset_id = NEW.listing_id
    ORDER BY ca.sort_order, ca.created_at
    LIMIT 1;
  END IF;

  IF v_event = 'impression' THEN
    IF coalesce(v_campaign.estimated_impressions, 0) > 0 THEN
      v_effective_impression_cost := coalesce(v_campaign.media_budget, v_campaign.budget, 0) / v_campaign.estimated_impressions;
    ELSE
      v_effective_impression_cost := coalesce(
        nullif((v_campaign.pricing_snapshot->>'cost_per_1000_impressions')::numeric, 0) / 1000,
        nullif((v_campaign.pricing_snapshot->>'cost_per_impression')::numeric, 0),
        0
      );
    END IF;
    v_spend_delta := greatest(
      0,
      least(
        v_effective_impression_cost,
        greatest(0, coalesce(v_campaign.media_budget, v_campaign.budget, 0) - coalesce(v_campaign.actual_spend, 0))
      )
    );

    IF NEW.user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.campaign_events prior
      WHERE prior.campaign_id = NEW.campaign_id
        AND prior.user_id = NEW.user_id
        AND lower(prior.event_type) = 'impression'
        AND coalesce(prior.is_fraudulent, false) = false
        AND prior.id <> NEW.id
        AND prior.created_at <= NEW.created_at
    ) THEN
      v_reach_delta := 1;
    END IF;
  ELSIF v_event = 'conversion' THEN
    v_revenue := greatest(0, coalesce(nullif(NEW.metadata->>'order_amount', '')::numeric, 0));
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  UPDATE public.promotion_campaigns
  SET actual_impressions = actual_impressions + CASE WHEN v_event = 'impression' THEN 1 ELSE 0 END,
      actual_clicks = actual_clicks + CASE WHEN v_event = 'click' THEN 1 ELSE 0 END,
      actual_conversions = actual_conversions + CASE WHEN v_event = 'conversion' THEN 1 ELSE 0 END,
      actual_reach = actual_reach + v_reach_delta,
      actual_spend = least(coalesce(media_budget, budget), actual_spend + v_spend_delta),
      updated_at = now()
  WHERE id = NEW.campaign_id;

  IF v_asset_id IS NOT NULL THEN
    UPDATE public.campaign_assets
    SET actual_impressions = actual_impressions + CASE WHEN v_event = 'impression' THEN 1 ELSE 0 END,
        actual_clicks = actual_clicks + CASE WHEN v_event = 'click' THEN 1 ELSE 0 END,
        actual_conversions = actual_conversions + CASE WHEN v_event = 'conversion' THEN 1 ELSE 0 END,
        actual_spend = least(allocation_amount, actual_spend + v_spend_delta),
        updated_at = now()
    WHERE id = v_asset_id AND campaign_id = NEW.campaign_id;
  END IF;

  IF v_placement IS NOT NULL THEN
    UPDATE public.campaign_placements
    SET actual_impressions = actual_impressions + CASE WHEN v_event = 'impression' THEN 1 ELSE 0 END,
        actual_clicks = actual_clicks + CASE WHEN v_event = 'click' THEN 1 ELSE 0 END,
        actual_conversions = actual_conversions + CASE WHEN v_event = 'conversion' THEN 1 ELSE 0 END,
        actual_spend = actual_spend + v_spend_delta,
        updated_at = now()
    WHERE campaign_id = NEW.campaign_id AND placement_code = v_placement;
  END IF;

  PERFORM set_config('request.jwt.claim.role', coalesce(v_old_role, ''), true);

  INSERT INTO public.campaign_statistics (
    campaign_id, stat_date, impressions, clicks, conversions, reach, spend,
    ctr, cpc, cpa, sales_revenue, messages, applications, enrollments
  ) VALUES (
    NEW.campaign_id, NEW.created_at::date,
    CASE WHEN v_event = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN v_event = 'click' THEN 1 ELSE 0 END,
    CASE WHEN v_event = 'conversion' THEN 1 ELSE 0 END,
    v_reach_delta, v_spend_delta, 0, 0, 0,
    CASE WHEN v_event = 'conversion' THEN v_revenue ELSE 0 END,
    0, 0, 0
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
$function$;

CREATE OR REPLACE FUNCTION public.get_promotion_analytics(p_promotion_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.role(),'');
  v_is_admin boolean := false;
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_start timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days,30),365)));
  v_revenue numeric := 0;
BEGIN
  SELECT * INTO v_campaign
  FROM public.promotion_campaigns
  WHERE id = p_promotion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promotion campaign not found'; END IF;

  IF v_role <> 'service_role' THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    SELECT coalesce(u.is_admin,false) INTO v_is_admin FROM public.users u WHERE u.id = v_uid;
    IF v_campaign.seller_id IS DISTINCT FROM v_uid AND NOT coalesce(v_is_admin,false) THEN
      RAISE EXCEPTION 'Not authorized to view this campaign';
    END IF;
  END IF;

  SELECT coalesce(sum(cs.sales_revenue),0)
  INTO v_revenue
  FROM public.campaign_statistics cs
  WHERE cs.campaign_id = p_promotion_id AND cs.stat_date >= v_start::date;

  RETURN jsonb_build_object(
    'campaign_id', v_campaign.id,
    'status', v_campaign.status,
    'tier', v_campaign.tier_code,
    'media_budget', coalesce(v_campaign.media_budget,v_campaign.budget,0),
    'total_payable', coalesce(v_campaign.total_payable,v_campaign.budget,0),
    'money_spent', coalesce(v_campaign.actual_spend,0),
    'remaining_budget', greatest(0,coalesce(v_campaign.media_budget,v_campaign.budget,0)-coalesce(v_campaign.actual_spend,0)),
    'impressions', coalesce(v_campaign.actual_impressions,0),
    'reach', coalesce(v_campaign.actual_reach,0),
    'clicks', coalesce(v_campaign.actual_clicks,0),
    'conversions', coalesce(v_campaign.actual_conversions,0),
    'ctr', CASE WHEN coalesce(v_campaign.actual_impressions,0)>0 THEN round(v_campaign.actual_clicks::numeric/v_campaign.actual_impressions*100,2) ELSE 0 END,
    'cpc', CASE WHEN coalesce(v_campaign.actual_clicks,0)>0 THEN round(v_campaign.actual_spend/v_campaign.actual_clicks,2) ELSE 0 END,
    'cpa', CASE WHEN coalesce(v_campaign.actual_conversions,0)>0 THEN round(v_campaign.actual_spend/v_campaign.actual_conversions,2) ELSE 0 END,
    'revenue_generated', v_revenue,
    'roas', CASE WHEN coalesce(v_campaign.actual_spend,0)>0 THEN round(v_revenue/v_campaign.actual_spend,2) ELSE 0 END,
    'assets', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'campaign_asset_id',ca.id,'asset_type',ca.asset_type,'asset_id',ca.asset_id,
        'title',ca.title_snapshot,'allocation_amount',ca.allocation_amount,
        'spend',ca.actual_spend,'impressions',ca.actual_impressions,'clicks',ca.actual_clicks,'conversions',ca.actual_conversions
      ) ORDER BY ca.sort_order)
      FROM public.campaign_assets ca WHERE ca.campaign_id=p_promotion_id
    ),'[]'::jsonb),
    'placements', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'placement',cp.placement_code,'tier',cp.tier_code,'placement_fee',cp.placement_fee,
        'spend',cp.actual_spend,'impressions',cp.actual_impressions,'clicks',cp.actual_clicks,'conversions',cp.actual_conversions
      ) ORDER BY ap.sort_order)
      FROM public.campaign_placements cp
      LEFT JOIN public.ad_placements ap ON ap.code=cp.placement_code
      WHERE cp.campaign_id=p_promotion_id
    ),'[]'::jsonb),
    'daily_breakdown', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'date',cs.stat_date,'impressions',cs.impressions,'clicks',cs.clicks,
        'conversions',cs.conversions,'reach',cs.reach,'spend',cs.spend,'revenue',cs.sales_revenue
      ) ORDER BY cs.stat_date)
      FROM public.campaign_statistics cs
      WHERE cs.campaign_id=p_promotion_id AND cs.stat_date>=v_start::date
    ),'[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_promotion_analytics(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promotion_analytics(uuid,integer) TO authenticated, service_role;
