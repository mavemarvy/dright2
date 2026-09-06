-- ST-1G payment conversion boundary.
-- Applied to DRIGHT2 production on 2026-09-06.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.users SET updated_at=COALESCE(updated_at,created_at,now()) WHERE updated_at IS NULL;

ALTER TABLE public.sales_records ADD COLUMN IF NOT EXISTS order_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_records_order_id_unique ON public.sales_records(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_attribution ON public.orders(referral_link_id, source_type, campaign_id, sales_team_id, team_member_id, team_lead_id);

CREATE OR REPLACE FUNCTION public.process_paystack_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_purpose text DEFAULT 'wallet_funding',
  p_reference_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tx RECORD; v_wallet_id uuid; v_result jsonb; v_order RECORD;
  v_seller_wallet_id uuid; v_affiliate_wallet_id uuid; v_sale_id uuid;
  v_commission numeric := 0; v_seller_earnings numeric := 0; v_order_final numeric := 0;
BEGIN
  SELECT * INTO v_tx FROM public.paystack_transactions WHERE reference=p_reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Transaction not found'); END IF;
  IF v_tx.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Payment user mismatch'; END IF;
  IF v_tx.status='success' AND v_tx.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'message','Already processed','idempotent',true);
  END IF;

  UPDATE public.paystack_transactions SET status='success',paid_at=COALESCE(paid_at,now()),processed_at=now(),updated_at=now() WHERE reference=p_reference;
  SELECT id INTO v_wallet_id FROM public.cc_wallets WHERE user_id=p_user_id FOR UPDATE;
  IF v_wallet_id IS NULL THEN INSERT INTO public.cc_wallets(user_id) VALUES(p_user_id) RETURNING id INTO v_wallet_id; END IF;

  IF p_purpose IN ('wallet_funding','advertiser_funding') THEN
    SELECT public.process_wallet_transaction(p_user_id,v_wallet_id,'credit',p_amount,'Wallet funding via Paystack','deposit',p_reference_id,p_metadata,'balance') INTO v_result;
  ELSIF p_purpose IN ('product_purchase','escrow') THEN
    SELECT public.process_wallet_transaction(p_user_id,v_wallet_id,'credit',p_amount,'Payment for marketplace order','deposit',p_reference_id,p_metadata,'escrow_balance') INTO v_result;
    IF NOT COALESCE((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to credit buyer escrow wallet'; END IF;

    SELECT * INTO v_order FROM public.orders WHERE id=p_reference_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace order not found for payment'; END IF;
    v_order_final:=COALESCE(v_order.final_price,0);
    IF abs(v_order_final-p_amount)>0.01 THEN RAISE EXCEPTION 'Payment amount does not match order total'; END IF;

    IF v_order.status <> 'COMPLETED' THEN
      UPDATE public.orders SET status='COMPLETED',completed_at=COALESCE(completed_at,now()) WHERE id=v_order.id;
      UPDATE public.products SET total_sales=COALESCE(total_sales,0)+1,
        stock_quantity=CASE WHEN stock_quantity IS NULL THEN NULL WHEN stock_quantity>0 THEN stock_quantity-1 ELSE 0 END,
        updated_at=now() WHERE id=v_order.product_id;

      v_seller_earnings:=GREATEST(0,COALESCE(v_order.final_price,0)-COALESCE(v_order.admin_task_amount,0)-COALESCE(v_order.sales_team_task_amount,0)-COALESCE(v_order.affiliate_commission_amount,0));
      SELECT id INTO v_seller_wallet_id FROM public.cc_wallets WHERE user_id=v_order.seller_id FOR UPDATE;
      IF v_seller_wallet_id IS NULL THEN INSERT INTO public.cc_wallets(user_id) VALUES(v_order.seller_id) RETURNING id INTO v_seller_wallet_id; END IF;
      IF v_seller_earnings>0 THEN
        SELECT public.process_wallet_transaction(v_order.seller_id,v_seller_wallet_id,'credit',v_seller_earnings,'Marketplace sale earnings','order',v_order.id,jsonb_build_object('payment_reference',p_reference,'product_id',v_order.product_id),'seller_earnings') INTO v_result;
        IF NOT COALESCE((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to credit seller earnings'; END IF;
      END IF;
      UPDATE public.users SET weekly_sales_count=COALESCE(weekly_sales_count,0)+1,total_sales_count=COALESCE(total_sales_count,0)+1 WHERE id=v_order.seller_id;

      IF v_order.source_type='affiliate' AND v_order.referrer_id IS NOT NULL AND v_order.referrer_id<>v_order.buyer_id AND COALESCE(v_order.affiliate_commission_amount,0)>0 THEN
        v_commission:=v_order.affiliate_commission_amount;
        SELECT id INTO v_affiliate_wallet_id FROM public.cc_wallets WHERE user_id=v_order.referrer_id FOR UPDATE;
        IF v_affiliate_wallet_id IS NULL THEN INSERT INTO public.cc_wallets(user_id) VALUES(v_order.referrer_id) RETURNING id INTO v_affiliate_wallet_id; END IF;
        SELECT public.process_wallet_transaction(v_order.referrer_id,v_affiliate_wallet_id,'credit',v_commission,'Affiliate commission','order',v_order.id,jsonb_build_object('payment_reference',p_reference,'product_id',v_order.product_id,'tracking_code',v_order.tracking_code,'referral_link_id',v_order.referral_link_id),'affiliate_balance') INTO v_result;
        IF NOT COALESCE((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to credit affiliate commission'; END IF;
        UPDATE public.users SET balance=COALESCE(balance,0)+v_commission,available_balance=COALESCE(available_balance,0)+v_commission,affiliate_earnings=COALESCE(affiliate_earnings,0)+v_commission WHERE id=v_order.referrer_id;
        INSERT INTO public.sales_records(order_id,promoter_id,buyer_name,product_name,commission_amount,sale_amount,referrer_id,referrer_role,product_id,status,sale_date)
        SELECT v_order.id,v_order.referrer_id,COALESCE(u.full_name,'Buyer'),p.name,v_commission,v_order.final_price,v_order.referrer_id,v_order.referrer_role,v_order.product_id,'paid',CURRENT_DATE
        FROM public.users u JOIN public.products p ON p.id=v_order.product_id WHERE u.id=v_order.buyer_id
        ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING RETURNING id INTO v_sale_id;
        UPDATE public.referral_links SET total_conversions=COALESCE(total_conversions,0)+1 WHERE id=v_order.referral_link_id;
      END IF;

      INSERT INTO public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
      VALUES('purchase','order',v_order.id,v_order.seller_id,v_order.buyer_id,jsonb_build_object('payment_reference',p_reference,'amount',v_order.final_price,'product_id',v_order.product_id,'source_type',v_order.source_type,'source_level',v_order.source_level,'referrer_id',v_order.referrer_id,'referral_link_id',v_order.referral_link_id,'tracking_code',v_order.tracking_code,'campaign_id',v_order.campaign_id,'sales_team_id',v_order.sales_team_id,'team_member_id',v_order.team_member_id,'team_lead_id',v_order.team_lead_id,'commission',v_commission));
    END IF;
  ELSIF p_purpose IN ('subscription','affiliate_subscription','vendor_subscription') THEN
    SELECT public.process_wallet_transaction(p_user_id,v_wallet_id,'credit',p_amount,'Subscription payment','deposit',p_reference_id,p_metadata,'balance') INTO v_result;
  ELSE
    SELECT public.process_wallet_transaction(p_user_id,v_wallet_id,'credit',p_amount,'Payment received','deposit',p_reference_id,p_metadata,'balance') INTO v_result;
  END IF;

  INSERT INTO public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
  VALUES('payment_processed','paystack_transaction',v_tx.id,p_user_id,p_user_id,jsonb_build_object('reference',p_reference,'amount',p_amount,'purpose',p_purpose,'source','rpc'));
  RETURN jsonb_build_object('success',true,'order_id',CASE WHEN p_purpose IN ('product_purchase','escrow') THEN p_reference_id ELSE NULL END,'commission',v_commission,'seller_earnings',v_seller_earnings,'wallet_result',v_result,'processed_at',now());
END;
$function$;
