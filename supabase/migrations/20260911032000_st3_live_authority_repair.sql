-- ST-3 live authority repair.
--
-- Production drift left portions of the earlier ST-3 hardening unapplied, while
-- the later ST-6 Paystack dispatcher preserved an older payment core. This
-- forward-only migration intentionally does NOT rewrite historical migrations.
-- It restores the existing architecture's authoritative boundaries:
--   checkout -> immutable order snapshot -> verified Paystack payment -> payout
--   -> exactly-once sale/conversion evidence -> bounded refund reversal.
--
-- Safety/idempotency principles:
-- * browser roles cannot create authoritative orders or sales records directly;
-- * browser roles cannot mark an order COMPLETED or alter a completed order;
-- * financial/attribution fields are immutable after order creation;
-- * payout RPCs remain service-role only;
-- * commission_rate_rules remain the source of attributed payout percentages;
-- * Paystack/order row locks plus existing unique indexes serialize retries;
-- * refund reversals are bounded by amounts actually credited in ledger_entries.

-- =============================================================================
-- 1. Restore immutable server-created financial/attribution snapshots.
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

REVOKE ALL ON FUNCTION public.guard_order_financial_attribution_snapshot()
FROM PUBLIC, anon, authenticated;

-- A browser may still perform permitted non-financial order updates through the
-- existing UPDATE policy, but only verified server-side financial code may create
-- the conversion boundary or mutate an already-completed paid order.
CREATE OR REPLACE FUNCTION public.guard_order_client_conversion_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF OLD.completed_at IS DISTINCT FROM NEW.completed_at THEN
      RAISE EXCEPTION 'Order completion timestamp is server-authoritative';
    END IF;

    IF upper(coalesce(NEW.status, '')) = 'COMPLETED'
       AND upper(coalesce(OLD.status, '')) <> 'COMPLETED' THEN
      RAISE EXCEPTION 'Order completion requires verified server-side conversion';
    END IF;

    IF upper(coalesce(OLD.status, '')) = 'COMPLETED'
       AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Completed order status is server-authoritative';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_order_client_conversion_state ON public.orders;
CREATE TRIGGER trg_guard_order_client_conversion_state
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_client_conversion_state();

REVOKE ALL ON FUNCTION public.guard_order_client_conversion_state()
FROM PUBLIC, anon, authenticated;

-- Checkout uses the service-role Edge Function and remains able to insert orders.
-- Remove the obsolete browser insert path that could bypass server pricing and
-- attribution resolution.
DROP POLICY IF EXISTS insert_own_orders ON public.orders;
REVOKE INSERT ON public.orders FROM anon, authenticated;
GRANT INSERT ON public.orders TO service_role;

-- sales_records is authoritative paid/free conversion evidence. Browser-created
-- rows could pre-claim the unique order_id and suppress the server record.
DROP POLICY IF EXISTS "Promoters can insert own sales records" ON public.sales_records;
REVOKE INSERT ON public.sales_records FROM anon, authenticated;
GRANT INSERT ON public.sales_records TO service_role;

-- Advisor warning remediation: clients already had no privileges on this table.
-- Enabling RLS therefore does not remove a working browser/admin path; service_role
-- and SECURITY DEFINER financial functions retain their intended access.
ALTER TABLE public.commission_rate_rules ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. Restore rule-driven attributed distribution and validate current eligibility.
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
  v_required_grade text;
  v_required_marketer_level integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Commission distribution requires service_role';
  END IF;

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

  IF NOT FOUND OR upper(coalesce(v_account_status, '')) <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Attributed recipient is not active');
  END IF;

  IF v_source = 'sales_team' THEN
    IF lower(coalesce(v_marketer_status, '')) <> 'approved' OR coalesce(v_marketer_level, 0) < 3 THEN
      RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Sales Team recipient is not approved/eligible');
    END IF;

    IF coalesce(o.source_level, '') ~* '^Mkt L[3-5]$' THEN
      v_required_marketer_level := substring(o.source_level from '([3-5])$')::integer;
      IF v_marketer_level <> v_required_marketer_level THEN
        RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Sales Team level no longer matches attribution');
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.sales_team_members stm
      JOIN public.sales_teams st ON st.id = stm.sales_team_id
      WHERE stm.user_id = v_recipient
        AND lower(coalesce(stm.status, '')) = 'active'
        AND lower(coalesce(st.status, '')) = 'active'
        AND (o.sales_team_id IS NULL OR stm.sales_team_id = o.sales_team_id)
    ) THEN
      RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Sales Team membership is no longer active');
    END IF;
  ELSE
    IF lower(coalesce(v_advertiser_status, '')) <> 'approved' THEN
      RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Advertiser recipient is not approved');
    END IF;

    v_required_grade := CASE v_source
      WHEN 'pro_advertiser' THEN 'Pro'
      WHEN 'super_advertiser' THEN 'Super'
      WHEN 'partnership' THEN 'Partnership'
      WHEN 'advertiser' THEN CASE
        WHEN coalesce(o.source_level, '') ~* '(Adv[[:space:]]+)?A$' THEN 'A'
        WHEN coalesce(o.source_level, '') ~* '(Adv[[:space:]]+)?B$' THEN 'B'
        WHEN coalesce(o.source_level, '') ~* '(Adv[[:space:]]+)?C$' THEN 'C'
        ELSE NULL
      END
      ELSE NULL
    END;

    IF v_required_grade IS NOT NULL
       AND lower(coalesce(v_advertiser_grade, '')) <> lower(v_required_grade) THEN
      RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Advertiser grade no longer matches attribution');
    END IF;

    IF v_source = 'advertiser'
       AND v_required_grade IS NULL
       AND upper(coalesce(v_advertiser_grade, '')) NOT IN ('A','B','C') THEN
      RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'Advertiser grade is not eligible for base advertiser attribution');
    END IF;
  END IF;

  v_basis := greatest(0, coalesce(o.final_price, 0));
  v_pool := greatest(0, coalesce(o.sales_team_task_amount, 0));

  -- Compatibility for legacy pending attributed orders whose task pool was
  -- included in final_price but not persisted into sales_team_task_amount.
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

  IF v_basis <= 0 OR v_pool <= 0 THEN
    RETURN jsonb_build_object('success', true, 'distributed', false, 'reason', 'No attributed commission basis/pool');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.commission_splits
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

  v_amount := least(round(v_basis * r.percentage / 100, 2), v_pool);
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
    order_id, recipient_id, recipient_role, amount, percentage, balance_field,
    status, distributed_at, source_type, source_id, rate_rule_id,
    rate_basis_amount, attribution_metadata
  ) VALUES (
    o.id, v_recipient, v_role, v_amount, r.percentage, 'balance',
    'distributed', now(), v_source, v_recipient, r.id, v_basis,
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

REVOKE ALL ON FUNCTION public.distribute_order_commission_splits(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_order_commission_splits(uuid)
TO service_role;

-- =============================================================================
-- 3. Repair the ST-6 internal Paystack core while preserving the dispatcher.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_paystack_payment_core_st6(
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
  v_tx public.paystack_transactions%ROWTYPE;
  v_wallet_id uuid;
  v_result jsonb;
  v_order public.orders%ROWTYPE;
  v_seller_wallet_id uuid;
  v_affiliate_wallet_id uuid;
  v_sale_id uuid;
  v_commission numeric := 0;
  v_seller_earnings numeric := 0;
  v_order_final numeric := 0;
  v_effective_sales_task_amount numeric := 0;
  v_effective_affiliate_commission numeric := 0;
  v_attributed_split jsonb := '{}'::jsonb;
  v_referrer_account_status text;
  v_affiliate_eligible boolean := false;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Payment processing requires service_role';
  END IF;

  SELECT * INTO v_tx
  FROM public.paystack_transactions
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical Paystack transaction not found';
  END IF;
  IF v_tx.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Payment user mismatch'; END IF;
  IF v_tx.purpose IS DISTINCT FROM p_purpose THEN RAISE EXCEPTION 'Payment purpose mismatch'; END IF;
  IF v_tx.reference_id IS DISTINCT FROM p_reference_id THEN RAISE EXCEPTION 'Payment reference target mismatch'; END IF;
  IF abs(coalesce(v_tx.amount,0) - coalesce(p_amount,0)) > 0.01 THEN RAISE EXCEPTION 'Payment amount mismatch'; END IF;
  IF v_tx.status <> 'success' THEN RAISE EXCEPTION 'Paystack transaction is not verified successful'; END IF;

  IF v_tx.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already processed', 'idempotent', true);
  END IF;

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
      SELECT id INTO v_wallet_id FROM public.cc_wallets WHERE user_id=p_user_id FOR UPDATE;
    END IF;
  END IF;

  IF p_purpose IN ('wallet_funding','advertiser_funding') THEN
    SELECT public.process_wallet_transaction(
      p_user_id,v_wallet_id,'credit',p_amount,'Wallet funding via Paystack',
      'deposit',p_reference_id,coalesce(v_tx.metadata,'{}'::jsonb),'balance'
    ) INTO v_result;
    IF NOT coalesce((v_result->>'success')::boolean,false) THEN
      RAISE EXCEPTION 'Unable to credit funded wallet';
    END IF;

  ELSIF p_purpose IN ('product_purchase','escrow') THEN
    IF p_reference_id IS NULL THEN RAISE EXCEPTION 'Marketplace order reference is required'; END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id=p_reference_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace order not found for payment'; END IF;
    IF v_order.buyer_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Payment order buyer mismatch'; END IF;

    v_order_final := coalesce(v_order.final_price,0);
    IF abs(v_order_final-p_amount)>0.01 THEN RAISE EXCEPTION 'Payment amount does not match order total'; END IF;

    -- A different successful Paystack reference for an already-completed order
    -- must never create a second escrow/seller/commission credit.
    IF upper(coalesce(v_order.status,''))='COMPLETED' THEN
      UPDATE public.paystack_transactions
      SET processed_at=now(), updated_at=now()
      WHERE reference=p_reference;

      INSERT INTO public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
      VALUES('duplicate_order_payment','order',v_order.id,v_order.seller_id,v_order.buyer_id,
        jsonb_build_object('payment_reference',p_reference,'amount',p_amount,'purpose',p_purpose,'requires_reconciliation',true));

      RETURN jsonb_build_object('success',true,'order_id',v_order.id,'idempotent',true,'duplicate_order_payment',true,'requires_reconciliation',true);
    END IF;

    IF upper(coalesce(v_order.status,'')) <> 'PENDING' THEN
      RAISE EXCEPTION 'Marketplace order is not payable in its current state';
    END IF;

    -- Revalidate the affiliate at the verified-payment boundary. Affiliate
    -- verification is not required to earn, but the account must still be active;
    -- when a persistent link exists it must still belong to the snapshotted user.
    IF lower(coalesce(v_order.source_type,''))='affiliate'
       AND v_order.referrer_id IS NOT NULL
       AND v_order.referrer_id<>v_order.buyer_id
       AND coalesce(v_order.affiliate_commission_amount,0)>0 THEN
      SELECT account_status INTO v_referrer_account_status
      FROM public.users WHERE id=v_order.referrer_id;

      v_affiliate_eligible := FOUND AND upper(coalesce(v_referrer_account_status,''))='ACTIVE';

      IF v_affiliate_eligible AND v_order.referral_link_id IS NOT NULL THEN
        v_affiliate_eligible := EXISTS (
          SELECT 1 FROM public.referral_links rl
          WHERE rl.id=v_order.referral_link_id
            AND rl.user_id=v_order.referrer_id
            AND lower(coalesce(rl.source_type,'affiliate'))='affiliate'
            AND (rl.product_id IS NULL OR rl.product_id=v_order.product_id)
        );
      END IF;
    END IF;

    v_effective_affiliate_commission := CASE
      WHEN v_affiliate_eligible THEN greatest(0,coalesce(v_order.affiliate_commission_amount,0))
      ELSE 0
    END;

    v_effective_sales_task_amount := greatest(0,coalesce(v_order.sales_team_task_amount,0));
    IF v_effective_sales_task_amount<=0
       AND lower(coalesce(v_order.source_type,'')) IN ('sales_team','advertiser','pro_advertiser','super_advertiser','partnership')
       AND coalesce(v_order.admin_task_amount,0)<=0 THEN
      v_effective_sales_task_amount := greatest(
        0,
        coalesce(v_order.final_price,0)
        - coalesce(v_order.base_price,0)
        - coalesce(v_order.tier_price,0)
        - coalesce(v_order.customization_price,0)
      );
    END IF;

    -- If an affiliate became ineligible before verified payment, its potential
    -- commission is not withheld from the seller.
    v_seller_earnings := greatest(
      0,
      coalesce(v_order.final_price,0)
      - coalesce(v_order.admin_task_amount,0)
      - v_effective_sales_task_amount
      - v_effective_affiliate_commission
    );

    SELECT public.process_wallet_transaction(
      p_user_id,v_wallet_id,'credit',p_amount,'Payment for marketplace order',
      'deposit',p_reference_id,coalesce(v_tx.metadata,'{}'::jsonb),'escrow_balance'
    ) INTO v_result;
    IF NOT coalesce((v_result->>'success')::boolean,false) THEN
      RAISE EXCEPTION 'Unable to credit buyer escrow wallet';
    END IF;

    UPDATE public.orders
    SET status='COMPLETED', completed_at=coalesce(completed_at,now())
    WHERE id=v_order.id;

    UPDATE public.products
    SET total_sales=coalesce(total_sales,0)+1,
        stock_quantity=CASE WHEN stock_quantity IS NULL THEN NULL WHEN stock_quantity>0 THEN stock_quantity-1 ELSE 0 END,
        updated_at=now()
    WHERE id=v_order.product_id;

    SELECT id INTO v_seller_wallet_id
    FROM public.cc_wallets WHERE user_id=v_order.seller_id FOR UPDATE;
    IF v_seller_wallet_id IS NULL THEN
      INSERT INTO public.cc_wallets(user_id) VALUES(v_order.seller_id)
      ON CONFLICT (user_id) DO NOTHING RETURNING id INTO v_seller_wallet_id;
      IF v_seller_wallet_id IS NULL THEN
        SELECT id INTO v_seller_wallet_id FROM public.cc_wallets WHERE user_id=v_order.seller_id FOR UPDATE;
      END IF;
    END IF;

    IF v_seller_earnings>0 THEN
      SELECT public.process_wallet_transaction(
        v_order.seller_id,v_seller_wallet_id,'credit',v_seller_earnings,
        'Marketplace sale earnings','order',v_order.id,
        jsonb_build_object('payment_reference',p_reference,'product_id',v_order.product_id),
        'seller_earnings'
      ) INTO v_result;
      IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to credit seller earnings'; END IF;
    END IF;

    UPDATE public.users
    SET weekly_sales_count=coalesce(weekly_sales_count,0)+1,
        total_sales_count=coalesce(total_sales_count,0)+1
    WHERE id=v_order.seller_id;

    IF v_effective_affiliate_commission>0 THEN
      v_commission := v_effective_affiliate_commission;

      SELECT id INTO v_affiliate_wallet_id
      FROM public.cc_wallets WHERE user_id=v_order.referrer_id FOR UPDATE;
      IF v_affiliate_wallet_id IS NULL THEN
        INSERT INTO public.cc_wallets(user_id) VALUES(v_order.referrer_id)
        ON CONFLICT (user_id) DO NOTHING RETURNING id INTO v_affiliate_wallet_id;
        IF v_affiliate_wallet_id IS NULL THEN
          SELECT id INTO v_affiliate_wallet_id FROM public.cc_wallets WHERE user_id=v_order.referrer_id FOR UPDATE;
        END IF;
      END IF;

      SELECT public.process_wallet_transaction(
        v_order.referrer_id,v_affiliate_wallet_id,'credit',v_commission,
        'Affiliate commission','order',v_order.id,
        jsonb_build_object('payment_reference',p_reference,'product_id',v_order.product_id,'tracking_code',v_order.tracking_code,'referral_link_id',v_order.referral_link_id),
        'affiliate_balance'
      ) INTO v_result;
      IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to credit affiliate commission'; END IF;

      UPDATE public.users
      SET balance=coalesce(balance,0)+v_commission,
          available_balance=coalesce(available_balance,0)+v_commission,
          affiliate_earnings=coalesce(affiliate_earnings,0)+v_commission
      WHERE id=v_order.referrer_id;

      INSERT INTO public.sales_records(
        order_id,promoter_id,buyer_name,product_name,commission_amount,sale_amount,
        referrer_id,referrer_role,product_id,status,sale_date
      )
      SELECT v_order.id,v_order.referrer_id,coalesce(u.full_name,'Buyer'),p.name,
             v_commission,v_order.final_price,v_order.referrer_id,v_order.referrer_role,
             v_order.product_id,'paid',CURRENT_DATE
      FROM public.users u
      JOIN public.products p ON p.id=v_order.product_id
      WHERE u.id=v_order.buyer_id
      ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING
      RETURNING id INTO v_sale_id;

      -- Conversion counter advances only when this transaction created the
      -- authoritative sale record; a conflict can never double-increment it.
      IF v_sale_id IS NOT NULL AND v_order.referral_link_id IS NOT NULL THEN
        UPDATE public.referral_links
        SET total_conversions=coalesce(total_conversions,0)+1
        WHERE id=v_order.referral_link_id;
      END IF;
    END IF;

    IF lower(coalesce(v_order.source_type,'')) IN ('sales_team','advertiser','pro_advertiser','super_advertiser','partnership') THEN
      SELECT public.distribute_order_commission_splits(v_order.id) INTO v_attributed_split;
      IF NOT coalesce((v_attributed_split->>'success')::boolean,false) THEN
        RAISE EXCEPTION 'Unable to distribute attributed commission';
      END IF;
    END IF;

    INSERT INTO public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
    VALUES('purchase','order',v_order.id,v_order.seller_id,v_order.buyer_id,
      jsonb_build_object(
        'payment_reference',p_reference,
        'amount',v_order.final_price,
        'product_id',v_order.product_id,
        'source_type',v_order.source_type,
        'source_level',v_order.source_level,
        'referrer_id',v_order.referrer_id,
        'referral_link_id',v_order.referral_link_id,
        'tracking_code',v_order.tracking_code,
        'campaign_id',v_order.campaign_id,
        'sales_team_id',v_order.sales_team_id,
        'team_member_id',v_order.team_member_id,
        'team_lead_id',v_order.team_lead_id,
        'commission',v_commission,
        'affiliate_eligible_at_payment',v_affiliate_eligible,
        'effective_sales_task_amount',v_effective_sales_task_amount,
        'attributed_split',v_attributed_split
      ));

  ELSIF p_purpose IN ('subscription','affiliate_subscription','vendor_subscription') THEN
    SELECT public.process_wallet_transaction(
      p_user_id,v_wallet_id,'credit',p_amount,'Subscription payment','deposit',p_reference_id,
      coalesce(v_tx.metadata,'{}'::jsonb),'balance'
    ) INTO v_result;
    IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to credit subscription payment'; END IF;
  ELSE
    SELECT public.process_wallet_transaction(
      p_user_id,v_wallet_id,'credit',p_amount,'Payment received','deposit',p_reference_id,
      coalesce(v_tx.metadata,'{}'::jsonb),'balance'
    ) INTO v_result;
    IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to credit payment'; END IF;
  END IF;

  UPDATE public.paystack_transactions
  SET processed_at=now(), updated_at=now()
  WHERE reference=p_reference;

  INSERT INTO public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
  VALUES('payment_processed','paystack_transaction',v_tx.id,p_user_id,p_user_id,
    jsonb_build_object('reference',p_reference,'amount',p_amount,'purpose',p_purpose,'source','rpc'));

  RETURN jsonb_build_object(
    'success',true,
    'order_id',CASE WHEN p_purpose IN ('product_purchase','escrow') THEN p_reference_id ELSE NULL END,
    'commission',v_commission,
    'seller_earnings',v_seller_earnings,
    'attributed_split',v_attributed_split,
    'wallet_result',v_result,
    'processed_at',now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_paystack_payment_core_st6(text,uuid,numeric,text,uuid,jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_paystack_payment_core_st6(text,uuid,numeric,text,uuid,jsonb)
TO service_role;

-- Preserve the existing ST-6/ST-5 dispatcher as the public internal entry point;
-- it remains service-role only and routes product purchases to the repaired core.
REVOKE ALL ON FUNCTION public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_paystack_payment(text,uuid,numeric,text,uuid,jsonb)
TO service_role;

-- =============================================================================
-- 4. Refund only amounts that were actually credited, never snapshot maxima.
-- =============================================================================
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
  v_seller_original numeric := 0;
  v_seller_reversed numeric := 0;
  v_seller_remaining numeric := 0;
  v_seller_reversal numeric := 0;
  v_affiliate_original numeric := 0;
  v_affiliate_reversed numeric := 0;
  v_affiliate_remaining numeric := 0;
  v_affiliate_reversal numeric := 0;
  v_attributed_reversal numeric := 0;
  v_seller_wallet uuid;
  v_affiliate_wallet uuid;
  v_recipient_wallet uuid;
  v_result jsonb;
  v_full boolean := false;
  v_split_reversal numeric;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Refund processing requires service_role';
  END IF;

  SELECT * INTO r
  FROM public.refund_records
  WHERE id=p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Refund not found'); END IF;
  IF r.status<>'completed' THEN RETURN jsonb_build_object('success',false,'error','Refund is not completed'); END IF;
  IF r.financial_processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'idempotent',true,'refund_id',r.id,'order_id',r.order_id);
  END IF;
  IF r.order_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','Refund has no marketplace order'); END IF;

  SELECT * INTO o
  FROM public.orders
  WHERE id=r.order_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Order not found'); END IF;
  IF coalesce(o.final_price,0)<=0 THEN RETURN jsonb_build_object('success',false,'error','Invalid order total'); END IF;

  SELECT coalesce(sum(amount),0) INTO v_total_refunded
  FROM public.refund_records
  WHERE order_id=o.id AND status='completed' AND id<>r.id;

  IF v_total_refunded+r.amount>o.final_price+0.01 THEN
    RAISE EXCEPTION 'Cumulative refunds exceed order total';
  END IF;

  v_increment := least(r.amount,greatest(0,o.final_price-v_total_refunded));
  v_ratio := v_increment/o.final_price;
  v_full := (v_total_refunded+r.amount>=o.final_price-0.01);

  -- Ledger entries are authoritative proof of what was credited. Refund debits
  -- carry order_id in metadata, so remaining attributable balances can be bounded.
  SELECT coalesce(sum(le.amount),0) INTO v_seller_original
  FROM public.ledger_entries le
  WHERE le.user_id=o.seller_id
    AND le.entry_type='credit'
    AND le.account='seller_earnings'
    AND le.reference_type='order'
    AND le.reference_id=o.id;

  SELECT coalesce(sum(le.amount),0) INTO v_seller_reversed
  FROM public.ledger_entries le
  WHERE le.user_id=o.seller_id
    AND le.entry_type='debit'
    AND le.account='seller_earnings'
    AND le.reference_type='refund'
    AND le.metadata->>'order_id'=o.id::text;

  v_seller_remaining := greatest(0,v_seller_original-v_seller_reversed);
  v_seller_reversal := CASE
    WHEN v_full THEN v_seller_remaining
    ELSE least(v_seller_remaining,round(v_seller_original*v_ratio,2))
  END;

  IF o.referrer_id IS NOT NULL AND o.referrer_id<>o.buyer_id AND lower(coalesce(o.source_type,''))='affiliate' THEN
    SELECT coalesce(sum(le.amount),0) INTO v_affiliate_original
    FROM public.ledger_entries le
    WHERE le.user_id=o.referrer_id
      AND le.entry_type='credit'
      AND le.account='affiliate_balance'
      AND le.reference_type='order'
      AND le.reference_id=o.id;

    SELECT coalesce(sum(le.amount),0) INTO v_affiliate_reversed
    FROM public.ledger_entries le
    WHERE le.user_id=o.referrer_id
      AND le.entry_type='debit'
      AND le.account='affiliate_balance'
      AND le.reference_type='refund'
      AND le.metadata->>'order_id'=o.id::text;
  END IF;

  v_affiliate_remaining := greatest(0,v_affiliate_original-v_affiliate_reversed);
  v_affiliate_reversal := CASE
    WHEN v_full THEN v_affiliate_remaining
    ELSE least(v_affiliate_remaining,round(v_affiliate_original*v_ratio,2))
  END;

  IF v_seller_reversal>0 THEN
    SELECT id INTO v_seller_wallet FROM public.cc_wallets WHERE user_id=o.seller_id FOR UPDATE;
    IF v_seller_wallet IS NULL THEN RAISE EXCEPTION 'Seller wallet not found'; END IF;
    SELECT public.process_wallet_transaction(
      o.seller_id,v_seller_wallet,'debit',v_seller_reversal,'Marketplace refund reversal','refund',r.id,
      jsonb_build_object('order_id',o.id,'refund_id',r.id,'gateway_reference',r.gateway_reference,'amount',r.amount),
      'seller_earnings'
    ) INTO v_result;
    IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to reverse seller earnings'; END IF;
  END IF;

  IF v_affiliate_reversal>0 THEN
    SELECT id INTO v_affiliate_wallet FROM public.cc_wallets WHERE user_id=o.referrer_id FOR UPDATE;
    IF v_affiliate_wallet IS NULL THEN RAISE EXCEPTION 'Affiliate wallet not found'; END IF;
    SELECT public.process_wallet_transaction(
      o.referrer_id,v_affiliate_wallet,'debit',v_affiliate_reversal,'Affiliate commission refund reversal','refund',r.id,
      jsonb_build_object('order_id',o.id,'refund_id',r.id,'gateway_reference',r.gateway_reference,'amount',r.amount,'tracking_code',o.tracking_code,'referral_link_id',o.referral_link_id),
      'affiliate_balance'
    ) INTO v_result;
    IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to reverse affiliate commission'; END IF;

    UPDATE public.users
    SET balance=greatest(0,coalesce(balance,0)-v_affiliate_reversal),
        available_balance=greatest(0,coalesce(available_balance,0)-v_affiliate_reversal),
        affiliate_earnings=greatest(0,coalesce(affiliate_earnings,0)-v_affiliate_reversal)
    WHERE id=o.referrer_id;
  END IF;

  FOR s IN
    SELECT * FROM public.commission_splits
    WHERE order_id=o.id AND status='distributed'
    FOR UPDATE
  LOOP
    v_split_reversal := CASE
      WHEN v_full THEN greatest(0,coalesce(s.amount,0)-coalesce(s.reversed_amount,0))
      ELSE greatest(0,least(coalesce(s.amount,0)-coalesce(s.reversed_amount,0),round(coalesce(s.amount,0)*v_ratio,2)))
    END;

    IF v_split_reversal>0 THEN
      SELECT id INTO v_recipient_wallet FROM public.cc_wallets WHERE user_id=s.recipient_id FOR UPDATE;
      IF v_recipient_wallet IS NULL THEN RAISE EXCEPTION 'Commission recipient wallet not found'; END IF;
      SELECT public.process_wallet_transaction(
        s.recipient_id,v_recipient_wallet,'debit',v_split_reversal,'Commission refund reversal','refund',r.id,
        jsonb_build_object('order_id',o.id,'refund_id',r.id,'gateway_reference',r.gateway_reference,'source_type',s.source_type,'recipient_role',s.recipient_role),
        'balance'
      ) INTO v_result;
      IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to reverse attributed commission'; END IF;

      UPDATE public.users
      SET balance=greatest(0,coalesce(balance,0)-v_split_reversal),
          available_balance=greatest(0,coalesce(available_balance,0)-v_split_reversal)
      WHERE id=s.recipient_id;

      UPDATE public.commission_splits
      SET reversed_amount=least(amount,coalesce(reversed_amount,0)+v_split_reversal)
      WHERE id=s.id;

      v_attributed_reversal:=v_attributed_reversal+v_split_reversal;
    END IF;
  END LOOP;

  UPDATE public.sales_records
  SET status=CASE WHEN v_full THEN 'refunded' ELSE status END,
      commission_amount=greatest(0,coalesce(commission_amount,0)-v_affiliate_reversal)
  WHERE order_id=o.id AND status NOT IN ('cancelled');

  IF v_full THEN
    UPDATE public.orders SET status='CANCELLED',completed_at=coalesce(completed_at,now()) WHERE id=o.id;
    UPDATE public.products
    SET total_sales=greatest(0,coalesce(total_sales,0)-1),
        stock_quantity=CASE WHEN stock_quantity IS NULL THEN NULL ELSE stock_quantity+1 END,
        updated_at=now()
    WHERE id=o.product_id;
  END IF;

  UPDATE public.refund_records
  SET financial_processed_at=now(),
      financial_reversal_metadata=jsonb_build_object(
        'order_id',o.id,
        'refund_amount',r.amount,
        'seller_original_credit',v_seller_original,
        'seller_reversal',v_seller_reversal,
        'affiliate_original_credit',v_affiliate_original,
        'affiliate_reversal',v_affiliate_reversal,
        'attributed_commission_reversal',v_attributed_reversal,
        'cumulative_refunded_before',v_total_refunded,
        'processed_at',now()
      ),
      updated_at=now()
  WHERE id=r.id;

  INSERT INTO public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
  VALUES('refund_processed','refund',r.id,o.seller_id,o.buyer_id,
    jsonb_build_object(
      'order_id',o.id,
      'refund_amount',r.amount,
      'seller_reversal',v_seller_reversal,
      'affiliate_reversal',v_affiliate_reversal,
      'attributed_commission_reversal',v_attributed_reversal,
      'source_type',o.source_type,
      'referrer_id',o.referrer_id,
      'referral_link_id',o.referral_link_id,
      'campaign_id',o.campaign_id,
      'sales_team_id',o.sales_team_id,
      'team_member_id',o.team_member_id,
      'team_lead_id',o.team_lead_id
    ));

  RETURN jsonb_build_object(
    'success',true,
    'refund_id',r.id,
    'order_id',o.id,
    'seller_reversal',v_seller_reversal,
    'affiliate_reversal',v_affiliate_reversal,
    'attributed_commission_reversal',v_attributed_reversal,
    'fully_refunded',v_full
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_marketplace_refund(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_marketplace_refund(uuid)
TO service_role;
