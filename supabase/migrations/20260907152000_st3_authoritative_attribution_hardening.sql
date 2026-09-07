-- ST-3: Authoritative attribution and Paystack conversion hardening.
-- This migration is additive and intentionally comes after the Sep-6 payment/commission migrations.
-- It does not create a second order, affiliate, wallet, payment, or commission system.

-- =============================================================================
-- 1. Make the server-resolved order pricing/attribution snapshot immutable.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.guard_order_financial_attribution_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.buyer_id IS DISTINCT FROM NEW.buyer_id
     OR OLD.product_id IS DISTINCT FROM NEW.product_id
     OR OLD.seller_id IS DISTINCT FROM NEW.seller_id
     OR OLD.order_type IS DISTINCT FROM NEW.order_type
     OR OLD.base_price IS DISTINCT FROM NEW.base_price
     OR OLD.tier_price IS DISTINCT FROM NEW.tier_price
     OR OLD.customization_price IS DISTINCT FROM NEW.customization_price
     OR OLD.admin_task_amount IS DISTINCT FROM NEW.admin_task_amount
     OR OLD.sales_team_task_amount IS DISTINCT FROM NEW.sales_team_task_amount
     OR OLD.affiliate_commission_amount IS DISTINCT FROM NEW.affiliate_commission_amount
     OR OLD.final_price IS DISTINCT FROM NEW.final_price
     OR OLD.selected_tier_id IS DISTINCT FROM NEW.selected_tier_id
     OR OLD.customization_options IS DISTINCT FROM NEW.customization_options
     OR OLD.referrer_id IS DISTINCT FROM NEW.referrer_id
     OR OLD.referrer_role IS DISTINCT FROM NEW.referrer_role
     OR OLD.referral_link_id IS DISTINCT FROM NEW.referral_link_id
     OR OLD.tracking_code IS DISTINCT FROM NEW.tracking_code
     OR OLD.source_type IS DISTINCT FROM NEW.source_type
     OR OLD.source_level IS DISTINCT FROM NEW.source_level
     OR OLD.campaign_id IS DISTINCT FROM NEW.campaign_id
     OR OLD.sales_team_id IS DISTINCT FROM NEW.sales_team_id
     OR OLD.team_member_id IS DISTINCT FROM NEW.team_member_id
     OR OLD.team_lead_id IS DISTINCT FROM NEW.team_lead_id
     OR OLD.visitor_id IS DISTINCT FROM NEW.visitor_id
     OR OLD.session_id IS DISTINCT FROM NEW.session_id
     OR OLD.attribution_at IS DISTINCT FROM NEW.attribution_at
     OR OLD.checkout_id IS DISTINCT FROM NEW.checkout_id
     OR OLD.is_free_order IS DISTINCT FROM NEW.is_free_order
  THEN
    RAISE EXCEPTION 'Order financial and attribution snapshot is immutable after creation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_order_financial_attribution_snapshot ON public.orders;
CREATE TRIGGER trg_guard_order_financial_attribution_snapshot
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_financial_attribution_snapshot();

REVOKE ALL ON FUNCTION public.guard_order_financial_attribution_snapshot() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. Restore admin-configured commission_rate_rules as the authoritative
--    distribution source for Sales Team / advertiser / partnership attribution.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.distribute_order_commission_splits(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  r record;
  v_amount numeric;
  v_recipient uuid;
  v_role text;
  v_source text;
  v_basis numeric;
  v_pool numeric;
  v_result jsonb;
  v_wallet_id uuid;
  v_account_status text;
  v_marketer_status text;
  v_marketer_level integer;
  v_advertiser_status text;
  v_advertiser_grade text;
BEGIN
  SELECT * INTO o
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF upper(coalesce(o.status, '')) <> 'COMPLETED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not completed');
  END IF;

  IF o.referrer_id IS NULL OR o.referrer_id = o.buyer_id THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'No eligible attributed recipient');
  END IF;

  v_source := lower(coalesce(o.source_type, ''));
  IF v_source NOT IN ('affiliate', 'sales_team', 'advertiser', 'pro_advertiser', 'super_advertiser', 'partnership') THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Unsupported attribution source');
  END IF;

  -- Affiliate conversion is handled by process_paystack_payment(), exactly once
  -- at the verified payment boundary. Do not double-credit it here.
  IF v_source = 'affiliate' THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Affiliate payout handled by payment conversion engine');
  END IF;

  v_recipient := CASE
    WHEN v_source = 'sales_team' THEN coalesce(o.team_member_id, o.referrer_id)
    ELSE o.referrer_id
  END;
  v_role := v_source;

  IF v_recipient IS NULL OR v_recipient = o.buyer_id THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Self attribution or missing recipient');
  END IF;

  SELECT account_status, marketer_status, marketer_level, advertiser_status, advertiser_grade
  INTO v_account_status, v_marketer_status, v_marketer_level, v_advertiser_status, v_advertiser_grade
  FROM public.users
  WHERE id = v_recipient;

  IF NOT FOUND OR coalesce(v_account_status, '') <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Attributed recipient is not active');
  END IF;

  IF v_source = 'sales_team'
     AND (coalesce(v_marketer_status, '') <> 'approved' OR coalesce(v_marketer_level, 0) < 3) THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Sales Team recipient is not approved/eligible');
  END IF;

  IF v_source IN ('advertiser', 'pro_advertiser', 'super_advertiser', 'partnership')
     AND coalesce(v_advertiser_status, '') <> 'approved' THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Advertiser recipient is not approved');
  END IF;

  v_basis := greatest(0, coalesce(o.final_price, 0));
  v_pool := greatest(0, coalesce(o.sales_team_task_amount, 0));

  -- Compatibility for pending orders created before the ST-3 checkout fix:
  -- older checkout code added the attributed task amount to final_price but left
  -- sales_team_task_amount at zero for advertiser/partnership sources.
  IF v_pool <= 0
     AND v_source IN ('sales_team', 'advertiser', 'pro_advertiser', 'super_advertiser', 'partnership')
     AND coalesce(o.admin_task_amount, 0) <= 0 THEN
    v_pool := greatest(
      0,
      coalesce(o.final_price, 0)
      - coalesce(o.base_price, 0)
      - coalesce(o.tier_price, 0)
      - coalesce(o.customization_price, 0)
    );
  END IF;

  IF v_basis <= 0 THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'No commission basis');
  END IF;

  IF v_pool <= 0 THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'No attributed commission pool');
  END IF;

  -- One financial distribution per order/source. Order row locking serializes
  -- retries, while the existing unique index provides an additional DB boundary.
  IF EXISTS (
    SELECT 1
    FROM public.commission_splits
    WHERE order_id = o.id
      AND source_type = v_source
      AND status = 'distributed'
  ) THEN
    RETURN jsonb_build_object('success', true, 'distributed', true, 'idempotent', true);
  END IF;

  SELECT * INTO r
  FROM public.commission_rate_rules
  WHERE source_type = v_source
    AND status = 'active'
    AND (source_level IS NULL OR source_level = o.source_level)
    AND (advertiser_grade IS NULL OR advertiser_grade = v_advertiser_grade)
    AND (product_id IS NULL OR product_id = o.product_id)
    AND (campaign_id IS NULL OR campaign_id = o.campaign_id)
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  ORDER BY
    (campaign_id IS NOT NULL) DESC,
    (product_id IS NOT NULL) DESC,
    (advertiser_grade IS NOT NULL) DESC,
    (source_level IS NOT NULL) DESC,
    priority ASC,
    created_at DESC
  LIMIT 1;

  IF r.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'No active commission rate rule');
  END IF;

  v_amount := round(v_basis * r.percentage / 100, 2);

  -- The buyer-funded task amount is the maximum pool available to every
  -- Sales Team / advertiser / partnership payout.
  v_amount := least(v_amount, v_pool);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Rule produced zero commission');
  END IF;

  SELECT id INTO v_wallet_id
  FROM public.cc_wallets
  WHERE user_id = v_recipient
  LIMIT 1
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.cc_wallets(user_id)
    VALUES(v_recipient)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      SELECT id INTO v_wallet_id
      FROM public.cc_wallets
      WHERE user_id = v_recipient
      LIMIT 1
      FOR UPDATE;
    END IF;
  END IF;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Unable to initialize commission recipient wallet';
  END IF;

  SELECT public.process_wallet_transaction(
    v_recipient,
    v_wallet_id,
    'credit',
    v_amount,
    'Attributed marketplace commission',
    'order',
    o.id,
    jsonb_build_object(
      'order_id', o.id,
      'source_type', v_source,
      'source_level', o.source_level,
      'tracking_code', o.tracking_code,
      'referral_link_id', o.referral_link_id,
      'campaign_id', o.campaign_id,
      'sales_team_id', o.sales_team_id,
      'team_member_id', o.team_member_id,
      'team_lead_id', o.team_lead_id,
      'rate_rule_id', r.id,
      'rate_basis_amount', v_basis
    ),
    'balance'
  ) INTO v_result;

  IF NOT coalesce((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'Unable to credit attributed commission';
  END IF;

  UPDATE public.users
  SET balance = coalesce(balance, 0) + v_amount,
      available_balance = coalesce(available_balance, 0) + v_amount
  WHERE id = v_recipient;

  INSERT INTO public.commission_splits(
    order_id,
    recipient_id,
    recipient_role,
    amount,
    percentage,
    balance_field,
    status,
    distributed_at,
    source_type,
    source_id,
    rate_rule_id,
    rate_basis_amount,
    attribution_metadata
  )
  VALUES(
    o.id,
    v_recipient,
    v_role,
    v_amount,
    r.percentage,
    'balance',
    'distributed',
    now(),
    v_source,
    v_recipient,
    r.id,
    v_basis,
    jsonb_build_object(
      'source_level', o.source_level,
      'referrer_id', o.referrer_id,
      'sales_team_id', o.sales_team_id,
      'team_member_id', o.team_member_id,
      'team_lead_id', o.team_lead_id,
      'tracking_code', o.tracking_code,
      'referral_link_id', o.referral_link_id,
      'campaign_id', o.campaign_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'distributed', true,
    'recipient_id', v_recipient,
    'recipient_role', v_role,
    'amount', v_amount,
    'percentage', r.percentage,
    'rate_rule_id', r.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.distribute_order_commission_splits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_order_commission_splits(uuid) TO service_role;

-- =============================================================================
-- 3. Harden the authoritative Paystack conversion boundary.
--    No browser/session role may invoke this SECURITY DEFINER finalizer.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_paystack_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_purpose text DEFAULT 'wallet_funding'::text,
  p_reference_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx record;
  v_wallet_id uuid;
  v_result jsonb;
  v_order record;
  v_seller_wallet_id uuid;
  v_affiliate_wallet_id uuid;
  v_sale_id uuid;
  v_commission numeric := 0;
  v_seller_earnings numeric := 0;
  v_order_final numeric := 0;
  v_effective_sales_task_amount numeric := 0;
  v_attributed_split jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_tx
  FROM public.paystack_transactions
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Payment user mismatch';
  END IF;

  IF abs(coalesce(v_tx.amount, 0) - coalesce(p_amount, 0)) > 0.01 THEN
    RAISE EXCEPTION 'Payment amount does not match stored transaction';
  END IF;

  IF coalesce(v_tx.purpose, '') IS DISTINCT FROM coalesce(p_purpose, '') THEN
    RAISE EXCEPTION 'Payment purpose mismatch';
  END IF;

  IF v_tx.status = 'success' AND v_tx.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Already processed',
      'idempotent', true
    );
  END IF;

  -- Wallet rows are created lazily, but no balance mutation occurs until the
  -- transaction/order binding checks below are complete.
  SELECT id INTO v_wallet_id
  FROM public.cc_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.cc_wallets(user_id)
    VALUES(p_user_id)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO v_wallet_id;

    IF v_wallet_id IS NULL THEN
      SELECT id INTO v_wallet_id
      FROM public.cc_wallets
      WHERE user_id = p_user_id
      FOR UPDATE;
    END IF;
  END IF;

  IF p_purpose IN ('wallet_funding', 'advertiser_funding') THEN
    SELECT public.process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Wallet funding via Paystack', 'deposit', p_reference_id,
      p_metadata, 'balance'
    ) INTO v_result;

    IF NOT coalesce((v_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'Unable to credit funded wallet';
    END IF;

  ELSIF p_purpose IN ('product_purchase', 'escrow') THEN
    IF p_reference_id IS NULL THEN
      RAISE EXCEPTION 'Marketplace order reference is required';
    END IF;

    IF v_tx.reference_id IS DISTINCT FROM p_reference_id THEN
      RAISE EXCEPTION 'Payment transaction is not bound to this order';
    END IF;

    -- Lock and validate the order BEFORE any escrow/seller/commission credit.
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_reference_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Marketplace order not found for payment';
    END IF;

    IF v_order.buyer_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Payment order buyer mismatch';
    END IF;

    v_order_final := coalesce(v_order.final_price, 0);
    IF abs(v_order_final - p_amount) > 0.01 THEN
      RAISE EXCEPTION 'Payment amount does not match order total';
    END IF;

    -- A second successful transaction for an already-completed order must not
    -- credit escrow, seller earnings, analytics conversion, or commission again.
    IF upper(coalesce(v_order.status, '')) = 'COMPLETED' THEN
      UPDATE public.paystack_transactions
      SET status = 'success',
          paid_at = coalesce(paid_at, now()),
          processed_at = now(),
          updated_at = now()
      WHERE reference = p_reference;

      INSERT INTO public.analytics_events(
        event_type, entity_type, entity_id, seller_id, viewer_id, metadata
      )
      VALUES(
        'duplicate_order_payment',
        'order',
        v_order.id,
        v_order.seller_id,
        v_order.buyer_id,
        jsonb_build_object(
          'payment_reference', p_reference,
          'amount', p_amount,
          'purpose', p_purpose,
          'requires_reconciliation', true
        )
      );

      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order.id,
        'idempotent', true,
        'duplicate_order_payment', true,
        'requires_reconciliation', true
      );
    END IF;

    IF upper(coalesce(v_order.status, '')) <> 'PENDING' THEN
      RAISE EXCEPTION 'Marketplace order is not payable in its current state';
    END IF;

    SELECT public.process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Payment for marketplace order', 'deposit', p_reference_id,
      p_metadata, 'escrow_balance'
    ) INTO v_result;

    IF NOT coalesce((v_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'Unable to credit buyer escrow wallet';
    END IF;

    UPDATE public.orders
    SET status = 'COMPLETED',
        completed_at = coalesce(completed_at, now())
    WHERE id = v_order.id;

    UPDATE public.products
    SET total_sales = coalesce(total_sales, 0) + 1,
        stock_quantity = CASE
          WHEN stock_quantity IS NULL THEN NULL
          WHEN stock_quantity > 0 THEN stock_quantity - 1
          ELSE 0
        END,
        updated_at = now()
    WHERE id = v_order.product_id;

    v_effective_sales_task_amount := greatest(0, coalesce(v_order.sales_team_task_amount, 0));

    -- Repair the financial interpretation of legacy pending advertiser/
    -- partnership orders without mutating their immutable attribution snapshot.
    IF v_effective_sales_task_amount <= 0
       AND coalesce(v_order.source_type, '') IN ('sales_team', 'advertiser', 'pro_advertiser', 'super_advertiser', 'partnership')
       AND coalesce(v_order.admin_task_amount, 0) <= 0 THEN
      v_effective_sales_task_amount := greatest(
        0,
        coalesce(v_order.final_price, 0)
        - coalesce(v_order.base_price, 0)
        - coalesce(v_order.tier_price, 0)
        - coalesce(v_order.customization_price, 0)
      );
    END IF;

    v_seller_earnings := greatest(
      0,
      coalesce(v_order.final_price, 0)
      - coalesce(v_order.admin_task_amount, 0)
      - v_effective_sales_task_amount
      - coalesce(v_order.affiliate_commission_amount, 0)
    );

    SELECT id INTO v_seller_wallet_id
    FROM public.cc_wallets
    WHERE user_id = v_order.seller_id
    FOR UPDATE;

    IF v_seller_wallet_id IS NULL THEN
      INSERT INTO public.cc_wallets(user_id)
      VALUES(v_order.seller_id)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING id INTO v_seller_wallet_id;

      IF v_seller_wallet_id IS NULL THEN
        SELECT id INTO v_seller_wallet_id
        FROM public.cc_wallets
        WHERE user_id = v_order.seller_id
        FOR UPDATE;
      END IF;
    END IF;

    IF v_seller_earnings > 0 THEN
      SELECT public.process_wallet_transaction(
        v_order.seller_id,
        v_seller_wallet_id,
        'credit',
        v_seller_earnings,
        'Marketplace sale earnings',
        'order',
        v_order.id,
        jsonb_build_object(
          'payment_reference', p_reference,
          'product_id', v_order.product_id
        ),
        'seller_earnings'
      ) INTO v_result;

      IF NOT coalesce((v_result->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'Unable to credit seller earnings';
      END IF;
    END IF;

    UPDATE public.users
    SET weekly_sales_count = coalesce(weekly_sales_count, 0) + 1,
        total_sales_count = coalesce(total_sales_count, 0) + 1
    WHERE id = v_order.seller_id;

    IF v_order.source_type = 'affiliate'
       AND v_order.referrer_id IS NOT NULL
       AND v_order.referrer_id <> v_order.buyer_id
       AND coalesce(v_order.affiliate_commission_amount, 0) > 0 THEN
      v_commission := v_order.affiliate_commission_amount;

      SELECT id INTO v_affiliate_wallet_id
      FROM public.cc_wallets
      WHERE user_id = v_order.referrer_id
      FOR UPDATE;

      IF v_affiliate_wallet_id IS NULL THEN
        INSERT INTO public.cc_wallets(user_id)
        VALUES(v_order.referrer_id)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING id INTO v_affiliate_wallet_id;

        IF v_affiliate_wallet_id IS NULL THEN
          SELECT id INTO v_affiliate_wallet_id
          FROM public.cc_wallets
          WHERE user_id = v_order.referrer_id
          FOR UPDATE;
        END IF;
      END IF;

      SELECT public.process_wallet_transaction(
        v_order.referrer_id,
        v_affiliate_wallet_id,
        'credit',
        v_commission,
        'Affiliate commission',
        'order',
        v_order.id,
        jsonb_build_object(
          'payment_reference', p_reference,
          'product_id', v_order.product_id,
          'tracking_code', v_order.tracking_code,
          'referral_link_id', v_order.referral_link_id
        ),
        'affiliate_balance'
      ) INTO v_result;

      IF NOT coalesce((v_result->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'Unable to credit affiliate commission';
      END IF;

      UPDATE public.users
      SET balance = coalesce(balance, 0) + v_commission,
          available_balance = coalesce(available_balance, 0) + v_commission,
          affiliate_earnings = coalesce(affiliate_earnings, 0) + v_commission
      WHERE id = v_order.referrer_id;

      INSERT INTO public.sales_records(
        order_id,
        promoter_id,
        buyer_name,
        product_name,
        commission_amount,
        sale_amount,
        referrer_id,
        referrer_role,
        product_id,
        status,
        sale_date
      )
      SELECT
        v_order.id,
        v_order.referrer_id,
        coalesce(u.full_name, 'Buyer'),
        p.name,
        v_commission,
        v_order.final_price,
        v_order.referrer_id,
        v_order.referrer_role,
        v_order.product_id,
        'paid',
        CURRENT_DATE
      FROM public.users u
      JOIN public.products p ON p.id = v_order.product_id
      WHERE u.id = v_order.buyer_id
      ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING
      RETURNING id INTO v_sale_id;

      IF v_order.referral_link_id IS NOT NULL THEN
        UPDATE public.referral_links
        SET total_conversions = coalesce(total_conversions, 0) + 1
        WHERE id = v_order.referral_link_id;
      END IF;
    END IF;

    IF coalesce(v_order.source_type, '') IN (
      'sales_team',
      'advertiser',
      'pro_advertiser',
      'super_advertiser',
      'partnership'
    ) THEN
      SELECT public.distribute_order_commission_splits(v_order.id)
      INTO v_attributed_split;

      IF NOT coalesce((v_attributed_split->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'Unable to distribute attributed commission';
      END IF;
    END IF;

    INSERT INTO public.analytics_events(
      event_type, entity_type, entity_id, seller_id, viewer_id, metadata
    )
    VALUES(
      'purchase',
      'order',
      v_order.id,
      v_order.seller_id,
      v_order.buyer_id,
      jsonb_build_object(
        'payment_reference', p_reference,
        'amount', v_order.final_price,
        'product_id', v_order.product_id,
        'source_type', v_order.source_type,
        'source_level', v_order.source_level,
        'referrer_id', v_order.referrer_id,
        'referral_link_id', v_order.referral_link_id,
        'tracking_code', v_order.tracking_code,
        'campaign_id', v_order.campaign_id,
        'sales_team_id', v_order.sales_team_id,
        'team_member_id', v_order.team_member_id,
        'team_lead_id', v_order.team_lead_id,
        'commission', v_commission,
        'effective_sales_task_amount', v_effective_sales_task_amount,
        'attributed_split', v_attributed_split
      )
    );

  ELSIF p_purpose IN ('subscription', 'affiliate_subscription', 'vendor_subscription') THEN
    SELECT public.process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Subscription payment', 'deposit', p_reference_id,
      p_metadata, 'balance'
    ) INTO v_result;

    IF NOT coalesce((v_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'Unable to credit subscription payment';
    END IF;

  ELSE
    SELECT public.process_wallet_transaction(
      p_user_id, v_wallet_id, 'credit', p_amount,
      'Payment received', 'deposit', p_reference_id,
      p_metadata, 'balance'
    ) INTO v_result;

    IF NOT coalesce((v_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'Unable to credit payment';
    END IF;
  END IF;

  UPDATE public.paystack_transactions
  SET status = 'success',
      paid_at = coalesce(paid_at, now()),
      processed_at = now(),
      updated_at = now()
  WHERE reference = p_reference;

  INSERT INTO public.analytics_events(
    event_type, entity_type, entity_id, seller_id, viewer_id, metadata
  )
  VALUES(
    'payment_processed',
    'paystack_transaction',
    v_tx.id,
    p_user_id,
    p_user_id,
    jsonb_build_object(
      'reference', p_reference,
      'amount', p_amount,
      'purpose', p_purpose,
      'source', 'rpc'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', CASE
      WHEN p_purpose IN ('product_purchase', 'escrow') THEN p_reference_id
      ELSE NULL
    END,
    'commission', v_commission,
    'seller_earnings', v_seller_earnings,
    'attributed_split', v_attributed_split,
    'wallet_result', v_result,
    'processed_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_paystack_payment(text, uuid, numeric, text, uuid, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_paystack_payment(text, uuid, numeric, text, uuid, jsonb)
TO service_role;
