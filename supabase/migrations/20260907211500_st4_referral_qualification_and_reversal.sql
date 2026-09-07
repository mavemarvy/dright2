-- ST-4B: Authoritative one-time referral qualification and refund reversal.
-- Uses the existing referral_relationships / referral_rewards / referral_stats tables.
-- Rewards are 10% / 5% / 1% of DRIGHT's immutable order admin/platform fee,
-- never of the full sale price and never of browser-provided values.

-- =============================================================================
-- 1. Award one qualifying action across the existing 3-level sponsor chain.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_referral_reward_for_action(
  p_user_id uuid,
  p_reward_type text,
  p_order_id uuid,
  p_platform_fee numeric,
  p_action_at timestamptz,
  p_window_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user record;
  v_rel record;
  v_referrer record;
  v_rate numeric;
  v_amount numeric;
  v_reward_id uuid;
  v_created integer := 0;
  v_total numeric := 0;
  v_deadline timestamptz;
BEGIN
  IF p_reward_type NOT IN ('first_purchase','first_sale') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported referral reward type');
  END IF;

  IF p_platform_fee IS NULL OR p_platform_fee <= 0 THEN
    RETURN jsonb_build_object('success', true, 'created', 0, 'reason', 'No DRIGHT platform fee basis');
  END IF;

  SELECT id, created_at, account_status, referred_by
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referred user not found');
  END IF;

  IF coalesce(v_user.account_status, '') <> 'ACTIVE' THEN
    INSERT INTO public.referral_fraud_logs(referrer_id, referred_user_id, reason, details)
    VALUES(
      v_user.referred_by,
      p_user_id,
      'banned_account',
      jsonb_build_object('reward_type', p_reward_type, 'order_id', p_order_id, 'stage', 'qualification')
    );
    RETURN jsonb_build_object('success', true, 'created', 0, 'reason', 'Referred account is not active');
  END IF;

  IF v_user.referred_by IS NULL THEN
    RETURN jsonb_build_object('success', true, 'created', 0, 'reason', 'User has no signup referral sponsor');
  END IF;

  v_deadline := v_user.created_at + make_interval(days => p_window_days);
  IF p_action_at > v_deadline THEN
    RETURN jsonb_build_object(
      'success', true,
      'created', 0,
      'reason', 'Qualification window expired',
      'deadline', v_deadline
    );
  END IF;

  PERFORM public.sync_referral_relationships_for_user(p_user_id);

  FOR v_rel IN
    SELECT referrer_id, level
    FROM public.referral_relationships
    WHERE referred_id = p_user_id
      AND level BETWEEN 1 AND 3
    ORDER BY level ASC
  LOOP
    IF v_rel.referrer_id IS NULL OR v_rel.referrer_id = p_user_id THEN
      INSERT INTO public.referral_fraud_logs(referrer_id, referred_user_id, reason, details)
      VALUES(
        v_rel.referrer_id,
        p_user_id,
        'self_referral',
        jsonb_build_object('reward_type', p_reward_type, 'order_id', p_order_id, 'level', v_rel.level)
      );
      CONTINUE;
    END IF;

    SELECT id, account_status
    INTO v_referrer
    FROM public.users
    WHERE id = v_rel.referrer_id;

    IF NOT FOUND OR coalesce(v_referrer.account_status, '') <> 'ACTIVE' THEN
      INSERT INTO public.referral_fraud_logs(referrer_id, referred_user_id, reason, details)
      VALUES(
        v_rel.referrer_id,
        p_user_id,
        'banned_account',
        jsonb_build_object('reward_type', p_reward_type, 'order_id', p_order_id, 'level', v_rel.level)
      );
      CONTINUE;
    END IF;

    v_rate := CASE v_rel.level
      WHEN 1 THEN 10
      WHEN 2 THEN 5
      WHEN 3 THEN 1
      ELSE 0
    END;

    v_amount := round(p_platform_fee * v_rate / 100, 2);

    -- Existing DRIGHT referral limits: rewards below $0.05 are not created;
    -- any single reward is capped at $10,000.
    IF v_amount < 0.05 THEN
      CONTINUE;
    END IF;
    v_amount := least(v_amount, 10000);

    INSERT INTO public.referral_rewards(
      referrer_id,
      referred_user_id,
      level,
      transaction_id,
      order_id,
      reward_amount,
      reward_type,
      status,
      expires_at,
      platform_fee_basis,
      reward_rate,
      reversed_amount,
      created_at,
      updated_at
    )
    VALUES(
      v_rel.referrer_id,
      p_user_id,
      v_rel.level,
      p_order_id,
      p_order_id,
      v_amount,
      p_reward_type,
      'confirmed',
      v_deadline,
      p_platform_fee,
      v_rate,
      0,
      now(),
      now()
    )
    ON CONFLICT (referred_user_id, reward_type, level) DO NOTHING
    RETURNING id INTO v_reward_id;

    IF v_reward_id IS NOT NULL THEN
      v_created := v_created + 1;
      v_total := v_total + v_amount;

      PERFORM public.refresh_referral_stats_internal(v_rel.referrer_id);

      INSERT INTO public.analytics_events(
        event_type,
        entity_type,
        entity_id,
        seller_id,
        viewer_id,
        metadata
      )
      VALUES(
        'referral_reward_confirmed',
        'referral_reward',
        v_reward_id,
        v_rel.referrer_id,
        p_user_id,
        jsonb_build_object(
          'order_id', p_order_id,
          'referred_user_id', p_user_id,
          'reward_type', p_reward_type,
          'level', v_rel.level,
          'rate_percent', v_rate,
          'platform_fee_basis', p_platform_fee,
          'reward_amount', v_amount,
          'qualification_deadline', v_deadline
        )
      );
    END IF;

    v_reward_id := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'created', v_created,
    'total_reward', v_total,
    'reward_type', p_reward_type,
    'referred_user_id', p_user_id,
    'order_id', p_order_id,
    'platform_fee_basis', p_platform_fee,
    'deadline', v_deadline
  );
END;
$function$;

-- =============================================================================
-- 2. A completed paid order is the authoritative qualification boundary.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_referral_order_qualification(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_action_at timestamptz;
  v_platform_fee numeric := 0;
  v_first_purchase boolean := false;
  v_first_sale boolean := false;
  v_purchase_result jsonb := '{}'::jsonb;
  v_sale_result jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO o
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF upper(coalesce(o.status, '')) <> 'COMPLETED' THEN
    RETURN jsonb_build_object('success', true, 'processed', false, 'reason', 'Order is not completed');
  END IF;

  IF coalesce(o.final_price, 0) <= 0 THEN
    RETURN jsonb_build_object('success', true, 'processed', false, 'reason', 'Free order has no referral reward');
  END IF;

  -- admin_task_amount is created by the server checkout snapshot and locked by
  -- ST-3. Sales-team/advertiser pools are not treated as DRIGHT platform fee.
  v_platform_fee := greatest(0, coalesce(o.admin_task_amount, 0));
  IF v_platform_fee <= 0 THEN
    RETURN jsonb_build_object('success', true, 'processed', false, 'reason', 'Order has no DRIGHT platform fee basis');
  END IF;

  v_action_at := coalesce(o.completed_at, now());

  -- Serialize first-action decisions for the buyer/seller so concurrent order
  -- completions cannot each claim to be the first qualifying event.
  PERFORM 1
  FROM public.users
  WHERE id IN (o.buyer_id, o.seller_id)
  ORDER BY id
  FOR UPDATE;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.orders prior
    WHERE prior.id <> o.id
      AND prior.buyer_id = o.buyer_id
      AND upper(coalesce(prior.status, '')) = 'COMPLETED'
      AND coalesce(prior.final_price, 0) > 0
      AND (
        coalesce(prior.completed_at, prior.created_at) < v_action_at
        OR (
          coalesce(prior.completed_at, prior.created_at) = v_action_at
          AND prior.id::text < o.id::text
        )
      )
  ) INTO v_first_purchase;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.orders prior
    WHERE prior.id <> o.id
      AND prior.seller_id = o.seller_id
      AND upper(coalesce(prior.status, '')) = 'COMPLETED'
      AND coalesce(prior.final_price, 0) > 0
      AND (
        coalesce(prior.completed_at, prior.created_at) < v_action_at
        OR (
          coalesce(prior.completed_at, prior.created_at) = v_action_at
          AND prior.id::text < o.id::text
        )
      )
  ) INTO v_first_sale;

  IF v_first_purchase THEN
    v_purchase_result := public.process_referral_reward_for_action(
      o.buyer_id,
      'first_purchase',
      o.id,
      v_platform_fee,
      v_action_at,
      14
    );
  END IF;

  IF v_first_sale THEN
    v_sale_result := public.process_referral_reward_for_action(
      o.seller_id,
      'first_sale',
      o.id,
      v_platform_fee,
      v_action_at,
      30
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'processed', true,
    'order_id', o.id,
    'platform_fee_basis', v_platform_fee,
    'first_purchase', v_first_purchase,
    'first_sale', v_first_sale,
    'purchase_result', v_purchase_result,
    'sale_result', v_sale_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_process_referral_order_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF upper(coalesce(NEW.status, '')) = 'COMPLETED'
     AND coalesce(NEW.final_price, 0) > 0
     AND (
       TG_OP = 'INSERT'
       OR upper(coalesce(OLD.status, '')) <> 'COMPLETED'
     ) THEN
    PERFORM public.process_referral_order_qualification(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_process_referral_order_completion ON public.orders;
CREATE TRIGGER trg_process_referral_order_completion
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_process_referral_order_completion();

REVOKE ALL ON FUNCTION public.process_referral_reward_for_action(uuid, text, uuid, numeric, timestamptz, integer)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_referral_order_qualification(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_process_referral_order_completion()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_reward_for_action(uuid, text, uuid, numeric, timestamptz, integer)
TO service_role;
GRANT EXECUTE ON FUNCTION public.process_referral_order_qualification(uuid)
TO service_role;

-- =============================================================================
-- 3. Reverse referral rewards proportionally when the existing ST-3 refund
--    processor marks a refund financially processed.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_referral_refund_reversal(p_refund_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  o record;
  rw record;
  v_ratio numeric := 0;
  v_total_processed_refunds numeric := 0;
  v_full boolean := false;
  v_remaining numeric := 0;
  v_reversal numeric := 0;
  v_total_reversed numeric := 0;
  v_count integer := 0;
  v_new_reversed numeric := 0;
  v_new_status text;
BEGIN
  SELECT * INTO r
  FROM public.refund_records
  WHERE id = p_refund_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Refund not found');
  END IF;

  IF r.status <> 'completed' OR r.financial_processed_at IS NULL OR r.order_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'processed', false, 'reason', 'Refund is not financially completed');
  END IF;

  SELECT * INTO o
  FROM public.orders
  WHERE id = r.order_id;

  IF NOT FOUND OR coalesce(o.final_price, 0) <= 0 THEN
    RETURN jsonb_build_object('success', true, 'processed', false, 'reason', 'Order is unavailable for referral reversal');
  END IF;

  v_ratio := least(1, greatest(0, r.amount / o.final_price));

  SELECT coalesce(sum(amount), 0)
  INTO v_total_processed_refunds
  FROM public.refund_records
  WHERE order_id = o.id
    AND status = 'completed'
    AND financial_processed_at IS NOT NULL;

  v_full := v_total_processed_refunds >= o.final_price - 0.01;

  FOR rw IN
    SELECT *
    FROM public.referral_rewards
    WHERE order_id = o.id
      AND status IN ('pending','confirmed','paid','reversed')
    FOR UPDATE
  LOOP
    v_remaining := greatest(0, rw.reward_amount - coalesce(rw.reversed_amount, 0));
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    IF v_full THEN
      v_reversal := v_remaining;
    ELSE
      v_reversal := least(v_remaining, round(rw.reward_amount * v_ratio, 2));
    END IF;

    IF v_reversal <= 0 THEN
      CONTINUE;
    END IF;

    v_new_reversed := least(rw.reward_amount, coalesce(rw.reversed_amount, 0) + v_reversal);
    v_new_status := CASE
      WHEN v_new_reversed >= rw.reward_amount - 0.005 THEN 'reversed'
      ELSE rw.status
    END;

    UPDATE public.referral_rewards
    SET reversed_amount = v_new_reversed,
        status = v_new_status,
        reversed_at = CASE WHEN v_new_status = 'reversed' THEN now() ELSE reversed_at END,
        reversal_reason = 'marketplace_refund',
        updated_at = now()
    WHERE id = rw.id;

    IF rw.status = 'paid' THEN
      INSERT INTO public.referral_fraud_logs(referrer_id, referred_user_id, reason, details)
      VALUES(
        rw.referrer_id,
        rw.referred_user_id,
        'refunded',
        jsonb_build_object(
          'order_id', o.id,
          'refund_id', r.id,
          'reward_id', rw.id,
          'reversed_amount', v_reversal,
          'payout_recovery_required', true
        )
      );
    END IF;

    PERFORM public.refresh_referral_stats_internal(rw.referrer_id);

    INSERT INTO public.analytics_events(
      event_type,
      entity_type,
      entity_id,
      seller_id,
      viewer_id,
      metadata
    )
    VALUES(
      'referral_reward_reversed',
      'referral_reward',
      rw.id,
      rw.referrer_id,
      rw.referred_user_id,
      jsonb_build_object(
        'order_id', o.id,
        'refund_id', r.id,
        'refund_amount', r.amount,
        'refund_ratio', v_ratio,
        'reversal_amount', v_reversal,
        'cumulative_reward_reversal', v_new_reversed,
        'reward_amount', rw.reward_amount,
        'fully_reversed', v_new_status = 'reversed',
        'payout_recovery_required', rw.status = 'paid'
      )
    );

    v_total_reversed := v_total_reversed + v_reversal;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed', true,
    'refund_id', r.id,
    'order_id', o.id,
    'rewards_reversed', v_count,
    'total_reversed', v_total_reversed,
    'fully_refunded', v_full
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_process_referral_refund_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.financial_processed_at IS NULL
     AND NEW.financial_processed_at IS NOT NULL THEN
    PERFORM public.process_referral_refund_reversal(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_process_referral_refund_reversal ON public.refund_records;
CREATE TRIGGER trg_process_referral_refund_reversal
AFTER UPDATE OF financial_processed_at ON public.refund_records
FOR EACH ROW
EXECUTE FUNCTION public.trg_process_referral_refund_reversal();

REVOKE ALL ON FUNCTION public.process_referral_refund_reversal(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_process_referral_refund_reversal()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_refund_reversal(uuid)
TO service_role;
