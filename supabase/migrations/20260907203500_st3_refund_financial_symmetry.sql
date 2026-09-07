-- ST-3: keep marketplace refund reversals financially symmetric with the
-- authoritative Paystack payout calculation.
--
-- Older/current advertiser and partnership checkout rows can have the buyer-funded
-- attributed task pool encoded in final_price while sales_team_task_amount remains 0.
-- process_paystack_payment() already reconstructs that effective pool before crediting
-- seller earnings. Refunds must use the identical interpretation or they can debit a
-- seller for money the seller was never credited, while also reversing the attributed
-- commission separately.

CREATE OR REPLACE FUNCTION public.process_marketplace_refund(p_refund_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  o record;
  s record;
  v_total_refunded numeric := 0;
  v_increment numeric := 0;
  v_ratio numeric := 0;
  v_effective_sales_task_amount numeric := 0;
  v_seller_earnings numeric := 0;
  v_affiliate_commission numeric := 0;
  v_attributed_reversal numeric := 0;
  v_seller_wallet uuid;
  v_affiliate_wallet uuid;
  v_recipient_wallet uuid;
  v_result jsonb;
  v_full boolean := false;
  v_split_reversal numeric;
BEGIN
  SELECT * INTO r
  FROM public.refund_records
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Refund not found');
  END IF;

  IF r.status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Refund is not completed');
  END IF;

  IF r.financial_processed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'refund_id', r.id,
      'order_id', r.order_id
    );
  END IF;

  IF r.order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Refund has no marketplace order');
  END IF;

  SELECT * INTO o
  FROM public.orders
  WHERE id = r.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF coalesce(o.final_price, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid order total');
  END IF;

  SELECT coalesce(sum(amount), 0)
  INTO v_total_refunded
  FROM public.refund_records
  WHERE order_id = o.id
    AND status = 'completed'
    AND id <> r.id;

  IF v_total_refunded + r.amount > o.final_price + 0.01 THEN
    RAISE EXCEPTION 'Cumulative refunds exceed order total';
  END IF;

  v_increment := least(r.amount, greatest(0, o.final_price - v_total_refunded));
  v_ratio := v_increment / o.final_price;
  v_full := (v_total_refunded + r.amount >= o.final_price - 0.01);

  -- Mirror process_paystack_payment() exactly. For legacy/current attributed
  -- advertiser-style orders, reconstruct the buyer-funded task pool without
  -- mutating the immutable order snapshot.
  v_effective_sales_task_amount := greatest(0, coalesce(o.sales_team_task_amount, 0));

  IF v_effective_sales_task_amount <= 0
     AND coalesce(o.source_type, '') IN (
       'sales_team',
       'advertiser',
       'pro_advertiser',
       'super_advertiser',
       'partnership'
     )
     AND coalesce(o.admin_task_amount, 0) <= 0 THEN
    v_effective_sales_task_amount := greatest(
      0,
      coalesce(o.final_price, 0)
      - coalesce(o.base_price, 0)
      - coalesce(o.tier_price, 0)
      - coalesce(o.customization_price, 0)
    );
  END IF;

  v_seller_earnings := greatest(
    0,
    coalesce(o.final_price, 0)
    - coalesce(o.admin_task_amount, 0)
    - v_effective_sales_task_amount
    - coalesce(o.affiliate_commission_amount, 0)
  ) * v_ratio;

  v_affiliate_commission := greatest(
    0,
    coalesce(o.affiliate_commission_amount, 0)
  ) * v_ratio;

  IF v_seller_earnings > 0 THEN
    SELECT id INTO v_seller_wallet
    FROM public.cc_wallets
    WHERE user_id = o.seller_id
    FOR UPDATE;

    IF v_seller_wallet IS NULL THEN
      RAISE EXCEPTION 'Seller wallet not found';
    END IF;

    SELECT public.process_wallet_transaction(
      o.seller_id,
      v_seller_wallet,
      'debit',
      v_seller_earnings,
      'Marketplace refund reversal',
      'refund',
      r.id,
      jsonb_build_object(
        'order_id', o.id,
        'refund_id', r.id,
        'gateway_reference', r.gateway_reference,
        'amount', r.amount,
        'effective_sales_task_amount', v_effective_sales_task_amount
      ),
      'seller_earnings'
    ) INTO v_result;

    IF NOT coalesce((v_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'Unable to reverse seller earnings';
    END IF;
  END IF;

  IF v_affiliate_commission > 0
     AND o.referrer_id IS NOT NULL
     AND o.referrer_id <> o.buyer_id
     AND o.source_type = 'affiliate' THEN
    SELECT id INTO v_affiliate_wallet
    FROM public.cc_wallets
    WHERE user_id = o.referrer_id
    FOR UPDATE;

    IF v_affiliate_wallet IS NULL THEN
      RAISE EXCEPTION 'Affiliate wallet not found';
    END IF;

    SELECT public.process_wallet_transaction(
      o.referrer_id,
      v_affiliate_wallet,
      'debit',
      v_affiliate_commission,
      'Affiliate commission refund reversal',
      'refund',
      r.id,
      jsonb_build_object(
        'order_id', o.id,
        'refund_id', r.id,
        'gateway_reference', r.gateway_reference,
        'amount', r.amount,
        'tracking_code', o.tracking_code,
        'referral_link_id', o.referral_link_id
      ),
      'affiliate_balance'
    ) INTO v_result;

    IF NOT coalesce((v_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'Unable to reverse affiliate commission';
    END IF;

    UPDATE public.users
    SET balance = greatest(0, coalesce(balance, 0) - v_affiliate_commission),
        available_balance = greatest(0, coalesce(available_balance, 0) - v_affiliate_commission),
        affiliate_earnings = greatest(0, coalesce(affiliate_earnings, 0) - v_affiliate_commission)
    WHERE id = o.referrer_id;
  END IF;

  FOR s IN
    SELECT *
    FROM public.commission_splits
    WHERE order_id = o.id
      AND status = 'distributed'
    FOR UPDATE
  LOOP
    v_split_reversal := greatest(
      0,
      least(
        coalesce(s.amount, 0) - coalesce(s.reversed_amount, 0),
        coalesce(s.amount, 0) * v_ratio
      )
    );

    IF v_split_reversal > 0 THEN
      SELECT id INTO v_recipient_wallet
      FROM public.cc_wallets
      WHERE user_id = s.recipient_id
      FOR UPDATE;

      IF v_recipient_wallet IS NULL THEN
        RAISE EXCEPTION 'Commission recipient wallet not found';
      END IF;

      SELECT public.process_wallet_transaction(
        s.recipient_id,
        v_recipient_wallet,
        'debit',
        v_split_reversal,
        'Commission refund reversal',
        'refund',
        r.id,
        jsonb_build_object(
          'order_id', o.id,
          'refund_id', r.id,
          'gateway_reference', r.gateway_reference,
          'source_type', s.source_type,
          'recipient_role', s.recipient_role
        ),
        'balance'
      ) INTO v_result;

      IF NOT coalesce((v_result->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'Unable to reverse attributed commission';
      END IF;

      UPDATE public.users
      SET balance = greatest(0, coalesce(balance, 0) - v_split_reversal),
          available_balance = greatest(0, coalesce(available_balance, 0) - v_split_reversal)
      WHERE id = s.recipient_id;

      UPDATE public.commission_splits
      SET reversed_amount = coalesce(reversed_amount, 0) + v_split_reversal
      WHERE id = s.id;

      v_attributed_reversal := v_attributed_reversal + v_split_reversal;
    END IF;
  END LOOP;

  UPDATE public.sales_records
  SET status = 'refunded',
      commission_amount = greatest(0, coalesce(commission_amount, 0) - v_affiliate_commission)
  WHERE order_id = o.id
    AND status NOT IN ('refunded', 'cancelled');

  IF v_full THEN
    UPDATE public.orders
    SET status = 'CANCELLED',
        completed_at = coalesce(completed_at, now())
    WHERE id = o.id;

    UPDATE public.products
    SET total_sales = greatest(0, coalesce(total_sales, 0) - 1),
        stock_quantity = CASE
          WHEN stock_quantity IS NULL THEN NULL
          ELSE stock_quantity + 1
        END,
        updated_at = now()
    WHERE id = o.product_id;
  END IF;

  UPDATE public.refund_records
  SET financial_processed_at = now(),
      financial_reversal_metadata = jsonb_build_object(
        'order_id', o.id,
        'refund_amount', r.amount,
        'seller_reversal', v_seller_earnings,
        'affiliate_reversal', v_affiliate_commission,
        'attributed_commission_reversal', v_attributed_reversal,
        'effective_sales_task_amount', v_effective_sales_task_amount,
        'cumulative_refunded_before', v_total_refunded,
        'processed_at', now()
      ),
      updated_at = now()
  WHERE id = r.id;

  INSERT INTO public.analytics_events(
    event_type,
    entity_type,
    entity_id,
    seller_id,
    viewer_id,
    metadata
  )
  VALUES(
    'refund_processed',
    'refund',
    r.id,
    o.seller_id,
    o.buyer_id,
    jsonb_build_object(
      'order_id', o.id,
      'refund_amount', r.amount,
      'seller_reversal', v_seller_earnings,
      'affiliate_reversal', v_affiliate_commission,
      'attributed_commission_reversal', v_attributed_reversal,
      'effective_sales_task_amount', v_effective_sales_task_amount,
      'source_type', o.source_type,
      'referrer_id', o.referrer_id,
      'referral_link_id', o.referral_link_id,
      'campaign_id', o.campaign_id,
      'sales_team_id', o.sales_team_id,
      'team_member_id', o.team_member_id,
      'team_lead_id', o.team_lead_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'refund_id', r.id,
    'order_id', o.id,
    'seller_reversal', v_seller_earnings,
    'affiliate_reversal', v_affiliate_commission,
    'attributed_commission_reversal', v_attributed_reversal,
    'effective_sales_task_amount', v_effective_sales_task_amount,
    'fully_refunded', v_full
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_marketplace_refund(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_marketplace_refund(uuid)
TO service_role;
