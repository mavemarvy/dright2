-- ST-5A — Promotion / advertising authority hardening.
--
-- Goals:
--   * keep DRIGHT's existing promotion_campaigns / packages / pricing system;
--   * make seller-created campaigns canonical on the database side;
--   * prevent browser clients from forging paid/active state, spend or conversion metrics;
--   * preserve seller pause/resume/cancel UX where financially safe;
--   * preserve admin campaign moderation while keeping payment state server-only;
--   * keep promotion billing currency explicit instead of pretending Paystack NGN == USD.
--
-- IMPORTANT: this migration intentionally does not add a second payment system. The current
-- promotion pricing catalog is USD while the existing Paystack initializer is NGN-only and
-- has no promotion-specific authoritative payment purpose. Paid activation is therefore
-- restricted to service_role until a server payment adapter can verify the correct provider,
-- currency and amount.

ALTER TABLE public.promotion_campaigns
  ADD COLUMN IF NOT EXISTS billing_currency text,
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_promotion_campaigns_payment_state
  ON public.promotion_campaigns(payment_status, status, end_date);

CREATE INDEX IF NOT EXISTS idx_promotion_campaigns_payment_id
  ON public.promotion_campaigns(payment_id)
  WHERE payment_id IS NOT NULL;

-- Canonicalize and protect campaign writes. service_role is the only caller allowed to
-- mutate payment state and runtime delivery counters directly. Admins retain moderation
-- controls but cannot mark a campaign paid from a browser session.
CREATE OR REPLACE FUNCTION public.guard_promotion_campaign_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_pricing record;
  v_package record;
  v_cpm numeric;
  v_content_changed boolean := false;
BEGIN
  IF v_role = 'service_role' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required for promotion campaign changes';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.users u WHERE u.id = v_uid AND coalesce(u.is_admin, false) = true
  ) INTO v_is_admin;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_admin AND NEW.seller_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Campaign seller must match authenticated user';
    END IF;

    SELECT * INTO v_pricing
    FROM public.promotion_pricing
    WHERE is_singleton = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Promotion pricing is not configured';
    END IF;

    IF NEW.duration_days IS NULL OR NEW.duration_days < 1 OR NEW.duration_days > 90 THEN
      RAISE EXCEPTION 'Promotion duration must be between 1 and 90 days';
    END IF;

    IF NEW.goal NOT IN ('more_views','more_clicks','more_sales','more_messages','more_job_applications','more_course_enrollments') THEN
      RAISE EXCEPTION 'Unsupported promotion goal';
    END IF;

    IF NEW.audience_type NOT IN ('everyone','country','state','city','category','interests','followers') THEN
      RAISE EXCEPTION 'Unsupported promotion audience type';
    END IF;

    -- Product/service/course promotions belong to the listing owner. These listing types
    -- are all backed by the existing products table in DRIGHT. Other listing systems keep
    -- their existing ownership validation until their own authoritative registries are wired.
    IF lower(coalesce(NEW.listing_type, 'product')) IN ('product','service','course') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.id = NEW.listing_id
          AND p.uploaded_by = NEW.seller_id
      ) THEN
        RAISE EXCEPTION 'Promotion listing does not belong to campaign seller';
      END IF;
    END IF;

    IF NEW.package_id IS NOT NULL THEN
      SELECT * INTO v_package
      FROM public.promotion_packages pp
      WHERE pp.id = NEW.package_id
        AND pp.is_active = true;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Promotion package is unavailable';
      END IF;

      NEW.budget := v_package.price;
      NEW.duration_days := v_package.duration_days;
      NEW.estimated_reach := greatest(0, coalesce(v_package.estimated_reach, 0));
      NEW.estimated_impressions := greatest(0, coalesce(v_package.estimated_impressions, 0) + coalesce(v_package.bonus_impressions, 0));
      NEW.estimated_clicks := greatest(0, coalesce(v_package.estimated_clicks, 0));
      NEW.estimated_conversions := floor(NEW.estimated_clicks * greatest(0, coalesce(v_pricing.default_conversion_rate, 0)))::int;
    ELSE
      IF NEW.budget IS NULL
         OR NEW.budget < greatest(0, coalesce(v_pricing.daily_minimum_budget, 0))
         OR NEW.budget > greatest(coalesce(v_pricing.maximum_campaign_budget, 0), coalesce(v_pricing.daily_minimum_budget, 0)) THEN
        RAISE EXCEPTION 'Campaign budget is outside configured promotion limits';
      END IF;

      v_cpm := coalesce(v_pricing.cost_per_1000_impressions, 0);
      IF v_cpm <= 0 THEN
        RAISE EXCEPTION 'Promotion CPM must be greater than zero';
      END IF;

      NEW.estimated_impressions := floor((NEW.budget / v_cpm) * 1000)::int;
      NEW.estimated_clicks := floor(NEW.estimated_impressions * greatest(0, coalesce(v_pricing.default_ctr, 0)))::int;
      NEW.estimated_reach := floor(NEW.estimated_impressions * 0.70)::int;
      NEW.estimated_conversions := floor(NEW.estimated_clicks * greatest(0, coalesce(v_pricing.default_conversion_rate, 0)))::int;
    END IF;

    -- Browser/admin creation can only create an unpaid pending campaign. A trusted server
    -- payment boundary is responsible for paid activation.
    NEW.status := 'pending';
    NEW.payment_status := 'pending';
    NEW.payment_id := NULL;
    NEW.payment_verified_at := NULL;
    NEW.actual_impressions := 0;
    NEW.actual_clicks := 0;
    NEW.actual_conversions := 0;
    NEW.actual_reach := 0;
    NEW.actual_spend := 0;
    NEW.is_featured := false;
    NEW.admin_notes := NULL;
    NEW.start_date := now();
    NEW.end_date := now() + (NEW.duration_days * interval '1 day');
    NEW.billing_currency := upper(coalesce(v_pricing.currency, 'USD'));
    NEW.pricing_snapshot := jsonb_build_object(
      'currency', upper(coalesce(v_pricing.currency, 'USD')),
      'cost_per_impression', coalesce(v_pricing.cost_per_impression, 0),
      'cost_per_100_impressions', coalesce(v_pricing.cost_per_100_impressions, 0),
      'cost_per_1000_impressions', coalesce(v_pricing.cost_per_1000_impressions, 0),
      'cost_per_click', coalesce(v_pricing.cost_per_click, 0),
      'cost_per_reach', coalesce(v_pricing.cost_per_reach, 0),
      'default_ctr', coalesce(v_pricing.default_ctr, 0),
      'default_conversion_rate', coalesce(v_pricing.default_conversion_rate, 0),
      'captured_at', now()
    );
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- UPDATE authority.
  IF NOT v_is_admin AND OLD.seller_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Campaign does not belong to authenticated user';
  END IF;

  -- Financial state, delivery counters and canonical estimates are server-only, including
  -- for browser-authenticated admins.
  IF NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_verified_at IS DISTINCT FROM OLD.payment_verified_at
     OR NEW.actual_impressions IS DISTINCT FROM OLD.actual_impressions
     OR NEW.actual_clicks IS DISTINCT FROM OLD.actual_clicks
     OR NEW.actual_conversions IS DISTINCT FROM OLD.actual_conversions
     OR NEW.actual_reach IS DISTINCT FROM OLD.actual_reach
     OR NEW.actual_spend IS DISTINCT FROM OLD.actual_spend
     OR NEW.estimated_reach IS DISTINCT FROM OLD.estimated_reach
     OR NEW.estimated_impressions IS DISTINCT FROM OLD.estimated_impressions
     OR NEW.estimated_clicks IS DISTINCT FROM OLD.estimated_clicks
     OR NEW.estimated_conversions IS DISTINCT FROM OLD.estimated_conversions
     OR NEW.billing_currency IS DISTINCT FROM OLD.billing_currency
     OR NEW.pricing_snapshot IS DISTINCT FROM OLD.pricing_snapshot THEN
    RAISE EXCEPTION 'Promotion financial and delivery fields are server-authoritative';
  END IF;

  IF NOT v_is_admin THEN
    IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
       OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
       OR NEW.listing_type IS DISTINCT FROM OLD.listing_type
       OR NEW.budget IS DISTINCT FROM OLD.budget
       OR NEW.duration_days IS DISTINCT FROM OLD.duration_days
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.package_id IS DISTINCT FROM OLD.package_id
       OR NEW.is_featured IS DISTINCT FROM OLD.is_featured
       OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
      RAISE EXCEPTION 'Campaign identity, budget, dates and moderation fields cannot be changed directly';
    END IF;

    v_content_changed :=
      NEW.goal IS DISTINCT FROM OLD.goal
      OR NEW.audience_type IS DISTINCT FROM OLD.audience_type
      OR NEW.audience_country IS DISTINCT FROM OLD.audience_country
      OR NEW.audience_state IS DISTINCT FROM OLD.audience_state
      OR NEW.audience_city IS DISTINCT FROM OLD.audience_city
      OR NEW.audience_category IS DISTINCT FROM OLD.audience_category
      OR NEW.audience_interests IS DISTINCT FROM OLD.audience_interests
      OR NEW.audience_followers_only IS DISTINCT FROM OLD.audience_followers_only;

    IF v_content_changed AND NOT (OLD.status = 'pending' AND OLD.payment_status = 'pending') THEN
      RAISE EXCEPTION 'Campaign targeting can only be edited before payment';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'pending' AND NEW.status = 'cancelled' THEN
        NULL;
      ELSIF OLD.status = 'active' AND NEW.status IN ('paused','cancelled') THEN
        NULL;
      ELSIF OLD.status = 'paused' AND NEW.status = 'cancelled' THEN
        NULL;
      ELSIF OLD.status = 'paused' AND NEW.status = 'active' THEN
        IF OLD.payment_status <> 'paid' OR OLD.end_date <= now() OR OLD.actual_spend >= OLD.budget THEN
          RAISE EXCEPTION 'Campaign is not eligible to resume';
        END IF;
      ELSE
        RAISE EXCEPTION 'Unsupported seller campaign status transition';
      END IF;
    END IF;
  ELSE
    -- Admins may moderate status/featured/note fields, but cannot bypass payment eligibility.
    IF NEW.seller_id IS DISTINCT FROM OLD.seller_id
       OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
       OR NEW.listing_type IS DISTINCT FROM OLD.listing_type THEN
      RAISE EXCEPTION 'Campaign ownership and listing identity are immutable';
    END IF;

    IF NEW.status = 'active'
       AND (OLD.payment_status <> 'paid' OR OLD.end_date <= now() OR OLD.actual_spend >= OLD.budget) THEN
      RAISE EXCEPTION 'Unpaid, expired or exhausted campaigns cannot be activated';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_promotion_campaign_write ON public.promotion_campaigns;
CREATE TRIGGER trg_guard_promotion_campaign_write
BEFORE INSERT OR UPDATE ON public.promotion_campaigns
FOR EACH ROW EXECUTE FUNCTION public.guard_promotion_campaign_write();

-- Paid campaigns are audit/financial records and may not be deleted by sellers. Unpaid pending
-- campaigns may still be deleted; otherwise sellers should cancel them.
DROP POLICY IF EXISTS "delete_own_campaigns" ON public.promotion_campaigns;
DROP POLICY IF EXISTS "delete_unpaid_own_campaigns" ON public.promotion_campaigns;
CREATE POLICY "delete_unpaid_own_campaigns"
  ON public.promotion_campaigns FOR DELETE TO authenticated
  USING (
    auth.uid() = seller_id
    AND status = 'pending'
    AND payment_status = 'pending'
    AND coalesce(actual_spend, 0) = 0
  );

-- Replace the historical browser-callable activation function. The signature is preserved so
-- existing server code can migrate without a second campaign system, but only service_role can
-- execute it. Provider/currency/amount verification must happen before this RPC is called.
CREATE OR REPLACE FUNCTION public.activate_campaign(p_campaign_id uuid, p_payment_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign public.promotion_campaigns%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Campaign activation requires server-verified payment';
  END IF;

  IF p_payment_id IS NULL OR btrim(p_payment_id) = '' THEN
    RAISE EXCEPTION 'Verified payment reference is required';
  END IF;

  SELECT * INTO v_campaign
  FROM public.promotion_campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion campaign not found';
  END IF;

  IF v_campaign.payment_status = 'paid' AND v_campaign.status IN ('active','paused') THEN
    IF v_campaign.payment_id IS DISTINCT FROM p_payment_id THEN
      RAISE EXCEPTION 'Campaign is already bound to a different payment reference';
    END IF;
    RETURN;
  END IF;

  IF v_campaign.status <> 'pending' OR v_campaign.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'Campaign is not awaiting payment';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.promotion_campaigns pc
    WHERE pc.id <> p_campaign_id
      AND pc.payment_id = p_payment_id
  ) THEN
    RAISE EXCEPTION 'Payment reference is already bound to another campaign';
  END IF;

  UPDATE public.promotion_campaigns
  SET status = 'active',
      payment_status = 'paid',
      payment_id = p_payment_id,
      payment_verified_at = now(),
      start_date = now(),
      end_date = now() + (duration_days * interval '1 day'),
      updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_campaign(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_campaign(uuid, text) TO service_role;

-- Browser telemetry may report view/click observations, but it cannot report conversions,
-- payment outcomes, fraud conclusions, IP hashes or device fingerprints as authoritative facts.
CREATE OR REPLACE FUNCTION public.guard_campaign_event_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_window interval;
BEGIN
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required for promotion telemetry';
  END IF;

  IF lower(coalesce(NEW.event_type, '')) NOT IN ('impression','click') THEN
    RAISE EXCEPTION 'Conversion and outcome events are server-authoritative';
  END IF;

  SELECT * INTO v_campaign
  FROM public.promotion_campaigns
  WHERE id = NEW.campaign_id;

  IF NOT FOUND
     OR v_campaign.listing_id IS DISTINCT FROM NEW.listing_id
     OR v_campaign.status <> 'active'
     OR v_campaign.payment_status <> 'paid'
     OR v_campaign.end_date <= now()
     OR v_campaign.actual_spend >= v_campaign.budget THEN
    RAISE EXCEPTION 'Campaign is not eligible for telemetry';
  END IF;

  NEW.user_id := v_uid;
  NEW.ip_hash := NULL;
  NEW.device_fingerprint := NULL;
  NEW.is_fraudulent := false;
  NEW.fraud_reason := NULL;

  v_window := CASE WHEN lower(NEW.event_type) = 'impression' THEN interval '30 seconds' ELSE interval '5 seconds' END;
  IF EXISTS (
    SELECT 1
    FROM public.campaign_events ce
    WHERE ce.campaign_id = NEW.campaign_id
      AND ce.user_id = v_uid
      AND lower(ce.event_type) = lower(NEW.event_type)
      AND ce.created_at >= now() - v_window
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_campaign_event_insert ON public.campaign_events;
CREATE TRIGGER trg_guard_campaign_event_insert
BEFORE INSERT ON public.campaign_events
FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_event_insert();

DROP POLICY IF EXISTS "insert_campaign_events" ON public.campaign_events;
CREATE POLICY "insert_campaign_events"
  ON public.campaign_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Sponsored placement logs get the same ownership/state validation and cannot impersonate a
-- different viewer. A short dedupe window keeps repeated component renders from inflating logs.
CREATE OR REPLACE FUNCTION public.guard_sponsored_listing_log_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
  v_campaign public.promotion_campaigns%ROWTYPE;
BEGIN
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required for sponsored listing telemetry';
  END IF;

  SELECT * INTO v_campaign
  FROM public.promotion_campaigns
  WHERE id = NEW.campaign_id;

  IF NOT FOUND
     OR v_campaign.listing_id IS DISTINCT FROM NEW.listing_id
     OR v_campaign.status <> 'active'
     OR v_campaign.payment_status <> 'paid'
     OR v_campaign.end_date <= now()
     OR v_campaign.actual_spend >= v_campaign.budget THEN
    RAISE EXCEPTION 'Sponsored campaign is not eligible for display logging';
  END IF;

  NEW.user_id := v_uid;

  IF EXISTS (
    SELECT 1
    FROM public.sponsored_listing_logs sl
    WHERE sl.campaign_id = NEW.campaign_id
      AND sl.user_id = v_uid
      AND sl.placement IS NOT DISTINCT FROM NEW.placement
      AND sl.created_at >= now() - interval '30 seconds'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sponsored_listing_log_insert ON public.sponsored_listing_logs;
CREATE TRIGGER trg_guard_sponsored_listing_log_insert
BEFORE INSERT ON public.sponsored_listing_logs
FOR EACH ROW EXECUTE FUNCTION public.guard_sponsored_listing_log_insert();

DROP POLICY IF EXISTS "insert_sponsored_listing_logs" ON public.sponsored_listing_logs;
CREATE POLICY "insert_sponsored_listing_logs"
  ON public.sponsored_listing_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Trigger functions are internal implementation details, not RPC surfaces.
REVOKE ALL ON FUNCTION public.guard_promotion_campaign_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_campaign_event_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_sponsored_listing_log_insert() FROM PUBLIC, anon, authenticated;
