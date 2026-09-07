-- ST-5B — Verified promotion payment binding.
-- Extends DRIGHT's existing Paystack payment path; does not create a second payment ledger.

-- Backfill campaigns created before ST-5A captured canonical billing state.
ALTER TABLE public.promotion_campaigns DISABLE TRIGGER trg_guard_promotion_campaign_write;

WITH pricing AS (
  SELECT *
  FROM public.promotion_pricing
  WHERE is_singleton = true
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
)
UPDATE public.promotion_campaigns pc
SET billing_currency = upper(coalesce(pc.billing_currency, pricing.currency, 'USD')),
    pricing_snapshot = CASE
      WHEN pc.pricing_snapshot IS NULL OR pc.pricing_snapshot = '{}'::jsonb THEN
        jsonb_build_object(
          'currency', upper(coalesce(pricing.currency, 'USD')),
          'cost_per_impression', coalesce(pricing.cost_per_impression, 0),
          'cost_per_100_impressions', coalesce(pricing.cost_per_100_impressions, 0),
          'cost_per_1000_impressions', coalesce(pricing.cost_per_1000_impressions, 0),
          'cost_per_click', coalesce(pricing.cost_per_click, 0),
          'cost_per_reach', coalesce(pricing.cost_per_reach, 0),
          'default_ctr', coalesce(pricing.default_ctr, 0),
          'default_conversion_rate', coalesce(pricing.default_conversion_rate, 0),
          'captured_at', now(),
          'backfilled_by', 'st5b'
        )
      ELSE pc.pricing_snapshot
    END,
    updated_at = now()
FROM pricing
WHERE pc.billing_currency IS NULL
   OR pc.pricing_snapshot IS NULL
   OR pc.pricing_snapshot = '{}'::jsonb;

ALTER TABLE public.promotion_campaigns ENABLE TRIGGER trg_guard_promotion_campaign_write;

-- A verified provider reference may activate at most one promotion campaign.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotion_campaigns_payment_id
  ON public.promotion_campaigns(payment_id)
  WHERE payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.process_verified_promotion_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_provider text DEFAULT 'paystack'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.paystack_transactions%ROWTYPE;
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_provider public.payment_providers%ROWTYPE;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_provider_slug text := lower(btrim(coalesce(p_provider, '')));
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Verified promotion payment processing requires service role';
  END IF;

  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'Payment reference is required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Payment user is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Verified payment amount must be greater than zero';
  END IF;

  IF v_currency = '' THEN
    RAISE EXCEPTION 'Verified payment currency is required';
  END IF;

  IF v_provider_slug <> 'paystack' THEN
    RAISE EXCEPTION 'Unsupported promotion payment provider';
  END IF;

  SELECT * INTO v_provider
  FROM public.payment_providers pp
  WHERE lower(pp.slug) = v_provider_slug
    AND pp.status = 'enabled'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion payment provider is not enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM unnest(coalesce(v_provider.supported_currencies, ARRAY[]::text[])) AS c(currency)
    WHERE upper(c.currency) = v_currency
  ) THEN
    RAISE EXCEPTION 'Promotion currency is not supported by payment provider';
  END IF;

  SELECT * INTO v_tx
  FROM public.paystack_transactions
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paystack transaction not found';
  END IF;

  IF v_tx.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Payment user mismatch';
  END IF;

  IF v_tx.purpose IS DISTINCT FROM 'promotion_campaign' THEN
    RAISE EXCEPTION 'Payment purpose is not promotion_campaign';
  END IF;

  IF v_tx.reference_id IS NULL THEN
    RAISE EXCEPTION 'Promotion campaign reference is missing';
  END IF;

  IF lower(coalesce(v_tx.status, '')) <> 'success' THEN
    RAISE EXCEPTION 'Promotion payment has not been provider-verified';
  END IF;

  IF v_tx.paystack_reference IS NULL OR btrim(v_tx.paystack_reference) = '' THEN
    RAISE EXCEPTION 'Verified Paystack reference is missing';
  END IF;

  IF abs(coalesce(v_tx.amount, 0) - p_amount) > 0.01 THEN
    RAISE EXCEPTION 'Verified amount does not match canonical Paystack transaction';
  END IF;

  IF upper(coalesce(v_tx.currency, '')) <> v_currency THEN
    RAISE EXCEPTION 'Verified currency does not match canonical Paystack transaction';
  END IF;

  SELECT * INTO v_campaign
  FROM public.promotion_campaigns
  WHERE id = v_tx.reference_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion campaign not found';
  END IF;

  IF v_campaign.seller_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Promotion campaign does not belong to payment user';
  END IF;

  IF upper(coalesce(v_campaign.billing_currency, '')) <> v_currency THEN
    RAISE EXCEPTION 'Verified currency does not match campaign billing currency';
  END IF;

  IF abs(coalesce(v_campaign.budget, 0) - p_amount) > 0.01 THEN
    RAISE EXCEPTION 'Verified amount does not match campaign budget';
  END IF;

  IF v_campaign.payment_status = 'paid' AND v_campaign.payment_id = p_reference THEN
    UPDATE public.paystack_transactions
    SET processed_at = coalesce(processed_at, now()),
        updated_at = now()
    WHERE reference = p_reference;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'campaign_id', v_campaign.id,
      'payment_reference', p_reference
    );
  END IF;

  IF v_campaign.status <> 'pending' OR v_campaign.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'Promotion campaign is not awaiting payment';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.promotion_campaigns pc
    WHERE pc.id <> v_campaign.id
      AND pc.payment_id = p_reference
  ) THEN
    RAISE EXCEPTION 'Payment reference is already bound to another campaign';
  END IF;

  PERFORM public.activate_campaign(v_campaign.id, p_reference);

  UPDATE public.paystack_transactions
  SET processed_at = coalesce(processed_at, now()),
      updated_at = now()
  WHERE reference = p_reference;

  INSERT INTO public.analytics_events(
    event_type,
    entity_type,
    entity_id,
    seller_id,
    viewer_id,
    metadata
  ) VALUES (
    'promotion_payment_processed',
    'promotion_campaign',
    v_campaign.id,
    v_campaign.seller_id,
    v_campaign.seller_id,
    jsonb_build_object(
      'payment_reference', p_reference,
      'provider', v_provider_slug,
      'amount', p_amount,
      'currency', v_currency,
      'source', 'verified_payment_adapter'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'campaign_id', v_campaign.id,
    'payment_reference', p_reference,
    'amount', p_amount,
    'currency', v_currency,
    'provider', v_provider_slug
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_verified_promotion_payment(text, uuid, numeric, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_verified_promotion_payment(text, uuid, numeric, text, text)
TO service_role;
