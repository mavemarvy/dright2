-- Authoritative guest checkout state and payout processing.
ALTER TABLE public.guest_orders
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS base_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_commission_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_earnings numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referrer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_link_id uuid REFERENCES public.referral_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_level text,
  ADD COLUMN IF NOT EXISTS visitor_id text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS gateway_response text,
  ADD COLUMN IF NOT EXISTS payment_channel text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS guest_orders_payment_reference_unique
  ON public.guest_orders(payment_reference)
  WHERE payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS guest_orders_seller_created_idx
  ON public.guest_orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guest_orders_referrer_created_idx
  ON public.guest_orders(referrer_id, created_at DESC)
  WHERE referrer_id IS NOT NULL;

ALTER TABLE public.sales_records
  ADD COLUMN IF NOT EXISTS guest_order_id uuid REFERENCES public.guest_orders(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_records_guest_order_unique
  ON public.sales_records(guest_order_id)
  WHERE guest_order_id IS NOT NULL;

-- The browser must no longer write authoritative guest orders directly.
DROP POLICY IF EXISTS go_anon_insert ON public.guest_orders;
DROP POLICY IF EXISTS go_guest_insert ON public.guest_orders;

CREATE OR REPLACE FUNCTION public.process_verified_guest_order(
  p_reference text,
  p_amount numeric,
  p_currency text,
  p_gateway_response text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now(),
  p_channel text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  g public.guest_orders%ROWTYPE;
  p public.products%ROWTYPE;
  v_seller_wallet uuid;
  v_affiliate_wallet uuid;
  v_result jsonb;
  v_affiliate_ok boolean:=false;
  v_commission numeric:=0;
  v_seller_amount numeric:=0;
  v_account_status text;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'guest payment processing requires service_role';
  END IF;
  IF p_reference IS NULL OR btrim(p_reference)='' THEN RAISE EXCEPTION 'payment reference required'; END IF;

  SELECT * INTO g
  FROM public.guest_orders
  WHERE payment_reference=p_reference
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guest order not found'; END IF;

  IF g.processed_at IS NOT NULL AND g.payment_status='success' THEN
    RETURN jsonb_build_object('success',true,'idempotent',true,'guest_order_id',g.id,'product_id',g.product_id);
  END IF;

  IF upper(coalesce(p_currency,''))<>upper(coalesce(g.currency,'NGN')) THEN
    RAISE EXCEPTION 'guest payment currency mismatch';
  END IF;
  IF abs(coalesce(p_amount,0)-coalesce(g.total_amount,0))>0.01 THEN
    RAISE EXCEPTION 'guest payment amount mismatch';
  END IF;

  SELECT * INTO p FROM public.products WHERE id=g.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;

  IF lower(coalesce(g.source_type,''))='affiliate' AND g.referrer_id IS NOT NULL THEN
    SELECT account_status INTO v_account_status FROM public.users WHERE id=g.referrer_id;
    v_affiliate_ok:=FOUND AND upper(coalesce(v_account_status,''))='ACTIVE';
    IF v_affiliate_ok AND g.referral_link_id IS NOT NULL THEN
      v_affiliate_ok:=EXISTS(
        SELECT 1 FROM public.referral_links rl
        WHERE rl.id=g.referral_link_id
          AND rl.user_id=g.referrer_id
          AND lower(coalesce(rl.source_type,'affiliate'))='affiliate'
          AND (rl.product_id IS NULL OR rl.product_id=g.product_id)
      );
    END IF;
  END IF;

  v_commission:=CASE WHEN v_affiliate_ok THEN greatest(0,coalesce(g.affiliate_commission_amount,0)) ELSE 0 END;
  v_seller_amount:=greatest(0,coalesce(g.base_price,0)-v_commission);

  IF g.seller_id IS NOT NULL AND v_seller_amount>0 THEN
    SELECT id INTO v_seller_wallet FROM public.cc_wallets WHERE user_id=g.seller_id FOR UPDATE;
    IF v_seller_wallet IS NULL THEN
      INSERT INTO public.cc_wallets(user_id) VALUES(g.seller_id)
      ON CONFLICT(user_id) DO NOTHING RETURNING id INTO v_seller_wallet;
      IF v_seller_wallet IS NULL THEN SELECT id INTO v_seller_wallet FROM public.cc_wallets WHERE user_id=g.seller_id FOR UPDATE; END IF;
    END IF;
    SELECT public.process_wallet_transaction(
      g.seller_id,v_seller_wallet,'credit',v_seller_amount,
      'Guest marketplace sale earnings','guest_order',g.id,
      jsonb_build_object('payment_reference',p_reference,'product_id',g.product_id,'guest_checkout',true),
      'seller_earnings'
    ) INTO v_result;
    IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'unable to credit guest sale seller earnings'; END IF;
    UPDATE public.users
      SET weekly_sales_count=coalesce(weekly_sales_count,0)+1,
          total_sales_count=coalesce(total_sales_count,0)+1
      WHERE id=g.seller_id;
  END IF;

  IF v_commission>0 THEN
    SELECT id INTO v_affiliate_wallet FROM public.cc_wallets WHERE user_id=g.referrer_id FOR UPDATE;
    IF v_affiliate_wallet IS NULL THEN
      INSERT INTO public.cc_wallets(user_id) VALUES(g.referrer_id)
      ON CONFLICT(user_id) DO NOTHING RETURNING id INTO v_affiliate_wallet;
      IF v_affiliate_wallet IS NULL THEN SELECT id INTO v_affiliate_wallet FROM public.cc_wallets WHERE user_id=g.referrer_id FOR UPDATE; END IF;
    END IF;
    SELECT public.process_wallet_transaction(
      g.referrer_id,v_affiliate_wallet,'credit',v_commission,
      'Affiliate commission from guest purchase','guest_order',g.id,
      jsonb_build_object('payment_reference',p_reference,'product_id',g.product_id,'tracking_code',g.tracking_code,'referral_link_id',g.referral_link_id,'guest_checkout',true),
      'affiliate_balance'
    ) INTO v_result;
    IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'unable to credit guest affiliate commission'; END IF;

    UPDATE public.users
      SET balance=coalesce(balance,0)+v_commission,
          available_balance=coalesce(available_balance,0)+v_commission,
          affiliate_earnings=coalesce(affiliate_earnings,0)+v_commission
      WHERE id=g.referrer_id;

    INSERT INTO public.sales_records(
      promoter_id,buyer_name,product_name,commission_amount,sale_amount,
      referrer_id,referrer_role,product_id,status,sale_date,guest_order_id
    ) VALUES(
      g.referrer_id,coalesce(nullif(g.buyer_name,''),'Guest buyer'),coalesce(g.product_name,p.name),
      v_commission,g.total_amount,g.referrer_id,'affiliate',g.product_id,'paid',current_date,g.id
    ) ON CONFLICT(guest_order_id) WHERE guest_order_id IS NOT NULL DO NOTHING;

    IF g.referral_link_id IS NOT NULL THEN
      UPDATE public.referral_links
      SET total_conversions=coalesce(total_conversions,0)+1
      WHERE id=g.referral_link_id;
    END IF;
  END IF;

  UPDATE public.products
    SET total_sales=coalesce(total_sales,0)+1,
        stock_quantity=CASE
          WHEN stock_quantity IS NULL THEN NULL
          WHEN stock_quantity>=coalesce(g.quantity,1) THEN stock_quantity-coalesce(g.quantity,1)
          ELSE 0
        END,
        updated_at=now()
    WHERE id=g.product_id;

  UPDATE public.guest_orders
  SET status='completed',
      payment_status='success',
      gateway_response=p_gateway_response,
      payment_channel=p_channel,
      paid_at=coalesce(p_paid_at,now()),
      processed_at=now(),
      seller_earnings=v_seller_amount,
      affiliate_commission_amount=v_commission
  WHERE id=g.id;

  INSERT INTO public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
  VALUES(
    'purchase','guest_order',g.id,g.seller_id,NULL,
    jsonb_build_object(
      'payment_reference',p_reference,'amount',g.total_amount,'currency',g.currency,
      'product_id',g.product_id,'guest_checkout',true,'source_type',g.source_type,
      'referrer_id',g.referrer_id,'referral_link_id',g.referral_link_id,
      'tracking_code',g.tracking_code,'commission',v_commission
    )
  );

  IF g.seller_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,notification_type,title,message,priority,metadata)
    VALUES(
      g.seller_id,'new_order','Guest Order Paid',
      format('A guest customer paid for %s.',coalesce(g.product_name,p.name)),
      'high',jsonb_build_object('guest_order_id',g.id,'product_id',g.product_id,'amount',g.total_amount,'currency',g.currency)
    );
  END IF;

  RETURN jsonb_build_object(
    'success',true,'idempotent',false,'guest_order_id',g.id,'product_id',g.product_id,
    'seller_earnings',v_seller_amount,'affiliate_commission',v_commission
  );
END;
$$;
REVOKE ALL ON FUNCTION public.process_verified_guest_order(text,numeric,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;

-- Sellers and authorized admins may inspect guest orders; authenticated buyers can still see legacy guest orders tied to their email.
DROP POLICY IF EXISTS go_seller_read_own ON public.guest_orders;
CREATE POLICY go_seller_read_own ON public.guest_orders FOR SELECT TO authenticated
USING (seller_id=auth.uid());
