-- Authoritative commission attribution and reversal support.
-- Reuses existing commission_splits, wallets, ledgers, orders and refund_records.

ALTER TABLE public.commission_splits
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS attribution_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reversed_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.commission_splits DROP CONSTRAINT IF EXISTS commission_splits_recipient_role_check;
ALTER TABLE public.commission_splits ADD CONSTRAINT commission_splits_recipient_role_check CHECK (recipient_role = ANY (ARRAY['platform','seller','affiliate','referrer','creator','admin','sales_team','advertiser','pro_advertiser','super_advertiser','partnership']));
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_splits_order_source_recipient ON public.commission_splits(order_id, source_type, recipient_id, recipient_role) WHERE order_id IS NOT NULL AND source_type IS NOT NULL;

ALTER TABLE public.refund_records
  ADD COLUMN IF NOT EXISTS financial_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS financial_reversal_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_records_financial_processed ON public.refund_records(id) WHERE financial_processed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.distribute_order_commission_splits(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o record; v_amount numeric := 0; v_role text; v_recipient uuid; v_source text; v_balance text := 'balance';
  v_wallet uuid; v_result jsonb; v_split_id uuid;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Order not found'); END IF;
  IF o.status <> 'COMPLETED' THEN RETURN jsonb_build_object('success',false,'error','Order is not completed'); END IF;
  IF o.referrer_id IS NULL OR o.referrer_id=o.buyer_id THEN RETURN jsonb_build_object('success',true,'distributed',false,'reason','No eligible attributed recipient'); END IF;
  v_source := lower(coalesce(o.source_type,''));
  IF v_source='sales_team' THEN v_recipient:=coalesce(o.team_member_id,o.referrer_id); v_role:='sales_team'; v_amount:=greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSIF v_source='advertiser' THEN v_recipient:=o.referrer_id; v_role:='advertiser'; v_amount:=greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSIF v_source='pro_advertiser' THEN v_recipient:=o.referrer_id; v_role:='pro_advertiser'; v_amount:=greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSIF v_source='super_advertiser' THEN v_recipient:=o.referrer_id; v_role:='super_advertiser'; v_amount:=greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSIF v_source='partnership' THEN v_recipient:=o.referrer_id; v_role:='partnership'; v_amount:=greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSE RETURN jsonb_build_object('success',true,'distributed',false,'reason','Source has no commission split rule'); END IF;
  IF v_amount<=0 OR v_recipient IS NULL OR v_recipient=o.buyer_id THEN RETURN jsonb_build_object('success',true,'distributed',false,'reason','No positive eligible commission'); END IF;
  SELECT id INTO v_split_id FROM public.commission_splits WHERE order_id=o.id AND source_type=v_source AND recipient_id=v_recipient AND recipient_role=v_role FOR UPDATE;
  IF v_split_id IS NOT NULL THEN RETURN jsonb_build_object('success',true,'distributed',true,'idempotent',true,'split_id',v_split_id,'amount',v_amount); END IF;
  SELECT id INTO v_wallet FROM public.cc_wallets WHERE user_id=v_recipient FOR UPDATE;
  IF v_wallet IS NULL THEN INSERT INTO public.cc_wallets(user_id) VALUES(v_recipient) RETURNING id INTO v_wallet; END IF;
  SELECT public.process_wallet_transaction(v_recipient,v_wallet,'credit',v_amount,'Attributed marketplace commission','order',o.id,jsonb_build_object('order_id',o.id,'source_type',v_source,'source_level',o.source_level,'tracking_code',o.tracking_code,'referral_link_id',o.referral_link_id,'campaign_id',o.campaign_id,'sales_team_id',o.sales_team_id,'team_member_id',o.team_member_id,'team_lead_id',o.team_lead_id),v_balance) INTO v_result;
  IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to credit attributed commission'; END IF;
  UPDATE public.users SET balance=coalesce(balance,0)+v_amount, available_balance=coalesce(available_balance,0)+v_amount WHERE id=v_recipient;
  INSERT INTO public.commission_splits(order_id,recipient_id,recipient_role,amount,percentage,balance_field,status,distributed_at,source_type,source_id,attribution_metadata)
  VALUES(o.id,v_recipient,v_role,v_amount,CASE WHEN o.final_price>0 THEN (v_amount/o.final_price)*100 ELSE 0 END,v_balance,'distributed',now(),v_source,coalesce(o.team_member_id,o.referrer_id),jsonb_build_object('source_level',o.source_level,'referrer_id',o.referrer_id,'sales_team_id',o.sales_team_id,'team_member_id',o.team_member_id,'team_lead_id',o.team_lead_id,'tracking_code',o.tracking_code,'referral_link_id',o.referral_link_id,'campaign_id',o.campaign_id)) RETURNING id INTO v_split_id;
  RETURN jsonb_build_object('success',true,'distributed',true,'split_id',v_split_id,'recipient_id',v_recipient,'recipient_role',v_role,'amount',v_amount);
END; $$;
REVOKE ALL ON FUNCTION public.distribute_order_commission_splits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_order_commission_splits(uuid) TO service_role;

-- The authoritative Paystack conversion boundary calls distribute_order_commission_splits
-- for Sales Team / advertiser / partnership sources after the order is completed.
-- The production function body is maintained by the deployed migration/runtime and must
-- remain server-authoritative; no client can invoke commission distribution directly.

CREATE OR REPLACE FUNCTION public.process_marketplace_refund(p_refund_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  r record; o record; s record; v_total_refunded numeric:=0; v_increment numeric:=0; v_ratio numeric:=0;
  v_seller_earnings numeric:=0; v_affiliate_commission numeric:=0; v_attributed_reversal numeric:=0;
  v_seller_wallet uuid; v_affiliate_wallet uuid; v_recipient_wallet uuid; v_result jsonb; v_full boolean:=false; v_split_reversal numeric;
begin
  select * into r from public.refund_records where id=p_refund_id for update;
  if not found then return jsonb_build_object('success',false,'error','Refund not found'); end if;
  if r.status<>'completed' then return jsonb_build_object('success',false,'error','Refund is not completed'); end if;
  if r.financial_processed_at is not null then return jsonb_build_object('success',true,'idempotent',true,'refund_id',r.id,'order_id',r.order_id); end if;
  if r.order_id is null then return jsonb_build_object('success',false,'error','Refund has no marketplace order'); end if;
  select * into o from public.orders where id=r.order_id for update;
  if not found then return jsonb_build_object('success',false,'error','Order not found'); end if;
  if coalesce(o.final_price,0)<=0 then return jsonb_build_object('success',false,'error','Invalid order total'); end if;
  select coalesce(sum(amount),0) into v_total_refunded from public.refund_records where order_id=o.id and status='completed' and id<>r.id;
  if v_total_refunded+r.amount>o.final_price+0.01 then raise exception 'Cumulative refunds exceed order total'; end if;
  v_increment:=least(r.amount,greatest(0,o.final_price-v_total_refunded)); v_ratio:=v_increment/o.final_price; v_full:=(v_total_refunded+r.amount>=o.final_price-0.01);
  v_seller_earnings:=greatest(0,coalesce(o.final_price,0)-coalesce(o.admin_task_amount,0)-coalesce(o.sales_team_task_amount,0)-coalesce(o.affiliate_commission_amount,0))*v_ratio;
  v_affiliate_commission:=greatest(0,coalesce(o.affiliate_commission_amount,0))*v_ratio;
  if v_seller_earnings>0 then
    select id into v_seller_wallet from public.cc_wallets where user_id=o.seller_id for update;
    if v_seller_wallet is null then raise exception 'Seller wallet not found'; end if;
    select public.process_wallet_transaction(o.seller_id,v_seller_wallet,'debit',v_seller_earnings,'Marketplace refund reversal','refund',r.id,jsonb_build_object('order_id',o.id,'refund_id',r.id,'gateway_reference',r.gateway_reference,'amount',r.amount),'seller_earnings') into v_result;
    if not coalesce((v_result->>'success')::boolean,false) then raise exception 'Unable to reverse seller earnings'; end if;
  end if;
  if v_affiliate_commission>0 and o.referrer_id is not null and o.referrer_id<>o.buyer_id and o.source_type='affiliate' then
    select id into v_affiliate_wallet from public.cc_wallets where user_id=o.referrer_id for update;
    if v_affiliate_wallet is null then raise exception 'Affiliate wallet not found'; end if;
    select public.process_wallet_transaction(o.referrer_id,v_affiliate_wallet,'debit',v_affiliate_commission,'Affiliate commission refund reversal','refund',r.id,jsonb_build_object('order_id',o.id,'refund_id',r.id,'gateway_reference',r.gateway_reference,'amount',r.amount,'tracking_code',o.tracking_code,'referral_link_id',o.referral_link_id),'affiliate_balance') into v_result;
    if not coalesce((v_result->>'success')::boolean,false) then raise exception 'Unable to reverse affiliate commission'; end if;
    update public.users set balance=greatest(0,coalesce(balance,0)-v_affiliate_commission),available_balance=greatest(0,coalesce(available_balance,0)-v_affiliate_commission),affiliate_earnings=greatest(0,coalesce(affiliate_earnings,0)-v_affiliate_commission) where id=o.referrer_id;
  end if;
  for s in select * from public.commission_splits where order_id=o.id and status='distributed' for update loop
    v_split_reversal:=greatest(0,least(coalesce(s.amount,0)-coalesce(s.reversed_amount,0),coalesce(s.amount,0)*v_ratio));
    if v_split_reversal>0 then
      select id into v_recipient_wallet from public.cc_wallets where user_id=s.recipient_id for update;
      if v_recipient_wallet is null then raise exception 'Commission recipient wallet not found'; end if;
      select public.process_wallet_transaction(s.recipient_id,v_recipient_wallet,'debit',v_split_reversal,'Commission refund reversal','refund',r.id,jsonb_build_object('order_id',o.id,'refund_id',r.id,'gateway_reference',r.gateway_reference,'source_type',s.source_type,'recipient_role',s.recipient_role),'balance') into v_result;
      if not coalesce((v_result->>'success')::boolean,false) then raise exception 'Unable to reverse attributed commission'; end if;
      update public.users set balance=greatest(0,coalesce(balance,0)-v_split_reversal),available_balance=greatest(0,coalesce(available_balance,0)-v_split_reversal) where id=s.recipient_id;
      update public.commission_splits set reversed_amount=coalesce(reversed_amount,0)+v_split_reversal where id=s.id;
      v_attributed_reversal:=v_attributed_reversal+v_split_reversal;
    end if;
  end loop;
  update public.sales_records set status='refunded',commission_amount=greatest(0,coalesce(commission_amount,0)-v_affiliate_commission) where order_id=o.id and status not in ('refunded','cancelled');
  if v_full then
    update public.orders set status='CANCELLED',completed_at=coalesce(completed_at,now()) where id=o.id;
    update public.products set total_sales=greatest(0,coalesce(total_sales,0)-1),stock_quantity=case when stock_quantity is null then null else stock_quantity+1 end,updated_at=now() where id=o.product_id;
  end if;
  update public.refund_records set financial_processed_at=now(),financial_reversal_metadata=jsonb_build_object('order_id',o.id,'refund_amount',r.amount,'seller_reversal',v_seller_earnings,'affiliate_reversal',v_affiliate_commission,'attributed_commission_reversal',v_attributed_reversal,'cumulative_refunded_before',v_total_refunded,'processed_at',now()),updated_at=now() where id=r.id;
  insert into public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata) values('refund_processed','refund',r.id,o.seller_id,o.buyer_id,jsonb_build_object('order_id',o.id,'refund_amount',r.amount,'seller_reversal',v_seller_earnings,'affiliate_reversal',v_affiliate_commission,'attributed_commission_reversal',v_attributed_reversal,'source_type',o.source_type,'referrer_id',o.referrer_id,'referral_link_id',o.referral_link_id,'campaign_id',o.campaign_id,'sales_team_id',o.sales_team_id,'team_member_id',o.team_member_id,'team_lead_id',o.team_lead_id));
  return jsonb_build_object('success',true,'refund_id',r.id,'order_id',o.id,'seller_reversal',v_seller_earnings,'affiliate_reversal',v_affiliate_commission,'attributed_commission_reversal',v_attributed_reversal,'fully_refunded',v_full);
end; $$;
REVOKE ALL ON FUNCTION public.process_marketplace_refund(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_marketplace_refund(uuid) TO service_role;