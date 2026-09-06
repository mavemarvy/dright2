-- Harden commission distribution against affiliate double-crediting and missing wallets.
-- Applied to DRIGHT2 production via Supabase migration.

CREATE OR REPLACE FUNCTION public.distribute_order_commission_splits(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  o record; r record; v_amount numeric; v_recipient uuid; v_role text; v_source text; v_basis numeric; v_result jsonb; v_wallet_id uuid;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found then return jsonb_build_object('success',false,'error','Order not found'); end if;
  if o.status <> 'COMPLETED' then return jsonb_build_object('success',false,'error','Order is not completed'); end if;
  if o.referrer_id is null or o.referrer_id=o.buyer_id then return jsonb_build_object('success',true,'distributed',false,'reason','No eligible attributed recipient'); end if;
  v_source:=lower(coalesce(o.source_type,''));
  if v_source not in ('affiliate','sales_team','advertiser','pro_advertiser','super_advertiser','partnership') then return jsonb_build_object('success',true,'distributed',false,'reason','Unsupported attribution source'); end if;

  -- Affiliate conversion/earnings are handled by the authoritative payment processor.
  -- This distributor is only for the separate Sales Team / advertiser commission layer.
  if v_source='affiliate' then
    return jsonb_build_object('success',true,'distributed',false,'reason','Affiliate payout handled by payment conversion engine');
  end if;

  v_recipient:=case when v_source='sales_team' then coalesce(o.team_member_id,o.referrer_id) else o.referrer_id end;
  v_role:=v_source;
  if v_recipient is null or v_recipient=o.buyer_id then return jsonb_build_object('success',true,'distributed',false,'reason','Self attribution or missing recipient'); end if;
  v_basis:=greatest(0,coalesce(o.final_price,0));
  if v_basis<=0 then return jsonb_build_object('success',true,'distributed',false,'reason','No commission basis'); end if;

  -- Strong idempotency boundary: never create a second distributed split for this order/source.
  if exists(select 1 from public.commission_splits where order_id=o.id and source_type=v_source and status='distributed') then
    return jsonb_build_object('success',true,'distributed',true,'idempotent',true);
  end if;

  select * into r from public.commission_rate_rules
  where source_type=v_source and status='active'
    and (source_level is null or source_level=o.source_level)
    and (advertiser_grade is null or advertiser_grade=(select advertiser_grade from public.users where id=v_recipient))
    and (product_id is null or product_id=o.product_id)
    and (campaign_id is null or campaign_id=o.campaign_id)
    and (starts_at is null or starts_at<=now())
    and (ends_at is null or ends_at>=now())
  order by (campaign_id is not null) desc,(product_id is not null) desc,(advertiser_grade is not null) desc,(source_level is not null) desc,priority asc,created_at desc
  limit 1;
  if r.id is null then return jsonb_build_object('success',true,'distributed',false,'reason','No active commission rate rule'); end if;
  if v_source='sales_team' and coalesce(o.sales_team_task_amount,0)<=0 then return jsonb_build_object('success',true,'distributed',false,'reason','No Sales Team commission pool'); end if;
  v_amount:=round(v_basis*r.percentage/100,2);
  if v_source='sales_team' then v_amount:=least(v_amount,coalesce(o.sales_team_task_amount,0)); end if;
  if v_amount<=0 then return jsonb_build_object('success',true,'distributed',false,'reason','Rule produced zero commission'); end if;

  -- Commission recipients must have a wallet. Create the canonical wallet row if missing.
  select id into v_wallet_id from public.cc_wallets where user_id=v_recipient limit 1 for update;
  if v_wallet_id is null then
    insert into public.cc_wallets(user_id) values(v_recipient)
    on conflict (user_id) do nothing
    returning id into v_wallet_id;
    if v_wallet_id is null then
      select id into v_wallet_id from public.cc_wallets where user_id=v_recipient limit 1 for update;
    end if;
  end if;
  if v_wallet_id is null then raise exception 'Unable to initialize commission recipient wallet'; end if;

  select public.process_wallet_transaction(v_recipient,v_wallet_id,'credit',v_amount,'Attributed marketplace commission','order',o.id,
    jsonb_build_object('order_id',o.id,'source_type',v_source,'source_level',o.source_level,'tracking_code',o.tracking_code,'referral_link_id',o.referral_link_id,'campaign_id',o.campaign_id,'sales_team_id',o.sales_team_id,'team_member_id',o.team_member_id,'team_lead_id',o.team_lead_id,'rate_rule_id',r.id,'rate_basis_amount',v_basis), 'balance') into v_result;
  if not coalesce((v_result->>'success')::boolean,false) then raise exception 'Unable to credit attributed commission'; end if;

  update public.users set balance=coalesce(balance,0)+v_amount,available_balance=coalesce(available_balance,0)+v_amount where id=v_recipient;
  insert into public.commission_splits(order_id,recipient_id,recipient_role,amount,percentage,balance_field,status,distributed_at,source_type,source_id,rate_rule_id,rate_basis_amount,attribution_metadata)
  values(o.id,v_recipient,v_role,v_amount,r.percentage,'balance','distributed',now(),v_source,v_recipient,r.id,v_basis,jsonb_build_object('source_level',o.source_level,'referrer_id',o.referrer_id,'sales_team_id',o.sales_team_id,'team_member_id',o.team_member_id,'team_lead_id',o.team_lead_id,'tracking_code',o.tracking_code,'referral_link_id',o.referral_link_id,'campaign_id',o.campaign_id));
  return jsonb_build_object('success',true,'distributed',true,'recipient_id',v_recipient,'recipient_role',v_role,'amount',v_amount,'percentage',r.percentage,'rate_rule_id',r.id);
end;$function$;

REVOKE ALL ON FUNCTION public.distribute_order_commission_splits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_order_commission_splits(uuid) TO service_role;
