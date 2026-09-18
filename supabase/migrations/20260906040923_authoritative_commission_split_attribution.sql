ALTER TABLE public.commission_splits ADD COLUMN IF NOT EXISTS source_type text, ADD COLUMN IF NOT EXISTS source_id uuid, ADD COLUMN IF NOT EXISTS attribution_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.commission_splits DROP CONSTRAINT IF EXISTS commission_splits_recipient_role_check;
ALTER TABLE public.commission_splits ADD CONSTRAINT commission_splits_recipient_role_check CHECK (recipient_role = ANY (ARRAY['platform','seller','affiliate','referrer','creator','admin','sales_team','advertiser','pro_advertiser','super_advertiser','partnership']));
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_splits_order_source_recipient ON public.commission_splits(order_id, source_type, recipient_id, recipient_role) WHERE order_id IS NOT NULL AND source_type IS NOT NULL;

CREATE OR REPLACE FUNCTION public.distribute_order_commission_splits(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  o record;
  v_amount numeric := 0;
  v_role text;
  v_recipient uuid;
  v_source text;
  v_balance text := 'balance';
  v_wallet uuid;
  v_result jsonb;
  v_split_id uuid;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Order not found'); END IF;
  IF o.status <> 'COMPLETED' THEN RETURN jsonb_build_object('success',false,'error','Order is not completed'); END IF;

  IF o.referrer_id IS NULL OR o.referrer_id=o.buyer_id THEN
    RETURN jsonb_build_object('success',true,'distributed',false,'reason','No eligible attributed recipient');
  END IF;

  v_source := lower(coalesce(o.source_type,''));
  IF v_source='sales_team' THEN
    v_recipient := coalesce(o.team_member_id,o.referrer_id);
    v_role := 'sales_team';
    v_amount := greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSIF v_source='advertiser' THEN
    v_recipient := o.referrer_id;
    v_role := 'advertiser';
    v_amount := greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSIF v_source='pro_advertiser' THEN
    v_recipient := o.referrer_id;
    v_role := 'pro_advertiser';
    v_amount := greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSIF v_source='super_advertiser' THEN
    v_recipient := o.referrer_id;
    v_role := 'super_advertiser';
    v_amount := greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSIF v_source='partnership' THEN
    v_recipient := o.referrer_id;
    v_role := 'partnership';
    v_amount := greatest(0,coalesce(o.sales_team_task_amount,0));
  ELSE
    RETURN jsonb_build_object('success',true,'distributed',false,'reason','Source has no commission split rule');
  END IF;

  IF v_amount <= 0 OR v_recipient IS NULL OR v_recipient=o.buyer_id THEN
    RETURN jsonb_build_object('success',true,'distributed',false,'reason','No positive eligible commission');
  END IF;

  SELECT id INTO v_split_id FROM public.commission_splits
    WHERE order_id=o.id AND source_type=v_source AND recipient_id=v_recipient AND recipient_role=v_role
    FOR UPDATE;
  IF v_split_id IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'distributed',true,'idempotent',true,'split_id',v_split_id,'amount',v_amount);
  END IF;

  SELECT id INTO v_wallet FROM public.cc_wallets WHERE user_id=v_recipient FOR UPDATE;
  IF v_wallet IS NULL THEN INSERT INTO public.cc_wallets(user_id) VALUES(v_recipient) RETURNING id INTO v_wallet; END IF;
  SELECT public.process_wallet_transaction(v_recipient,v_wallet,'credit',v_amount,'Attributed marketplace commission','order',o.id,
    jsonb_build_object('order_id',o.id,'source_type',v_source,'source_level',o.source_level,'tracking_code',o.tracking_code,'referral_link_id',o.referral_link_id,'campaign_id',o.campaign_id,'sales_team_id',o.sales_team_id,'team_member_id',o.team_member_id,'team_lead_id',o.team_lead_id),v_balance) INTO v_result;
  IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION 'Unable to credit attributed commission'; END IF;

  UPDATE public.users SET balance=coalesce(balance,0)+v_amount, available_balance=coalesce(available_balance,0)+v_amount WHERE id=v_recipient;
  INSERT INTO public.commission_splits(order_id,recipient_id,recipient_role,amount,percentage,balance_field,status,distributed_at,source_type,source_id,attribution_metadata)
  VALUES(o.id,v_recipient,v_role,v_amount,CASE WHEN o.final_price>0 THEN (v_amount/o.final_price)*100 ELSE 0 END,v_balance,'distributed',now(),v_source,
    coalesce(o.team_member_id,o.referrer_id),jsonb_build_object('source_level',o.source_level,'referrer_id',o.referrer_id,'sales_team_id',o.sales_team_id,'team_member_id',o.team_member_id,'team_lead_id',o.team_lead_id,'tracking_code',o.tracking_code,'referral_link_id',o.referral_link_id,'campaign_id',o.campaign_id))
  RETURNING id INTO v_split_id;

  RETURN jsonb_build_object('success',true,'distributed',true,'split_id',v_split_id,'recipient_id',v_recipient,'recipient_role',v_role,'amount',v_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.distribute_order_commission_splits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_order_commission_splits(uuid) TO service_role;