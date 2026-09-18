alter table public.refund_records add column if not exists financial_processed_at timestamptz, add column if not exists financial_reversal_metadata jsonb not null default '{}'::jsonb;
create unique index if not exists idx_refund_records_financial_processed on public.refund_records(id) where financial_processed_at is not null;

create or replace function public.process_marketplace_refund(p_refund_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  o record;
  v_total_refunded numeric := 0;
  v_increment numeric := 0;
  v_ratio numeric := 0;
  v_seller_earnings numeric := 0;
  v_affiliate_commission numeric := 0;
  v_seller_wallet uuid;
  v_affiliate_wallet uuid;
  v_result jsonb;
  v_sale record;
begin
  select * into r from public.refund_records where id=p_refund_id for update;
  if not found then return jsonb_build_object('success',false,'error','Refund not found'); end if;
  if r.status <> 'completed' then return jsonb_build_object('success',false,'error','Refund is not completed'); end if;
  if r.financial_processed_at is not null then
    return jsonb_build_object('success',true,'idempotent',true,'refund_id',r.id,'order_id',r.order_id);
  end if;
  if r.order_id is null then return jsonb_build_object('success',false,'error','Refund has no marketplace order'); end if;

  select * into o from public.orders where id=r.order_id for update;
  if not found then return jsonb_build_object('success',false,'error','Order not found'); end if;
  if coalesce(o.final_price,0) <= 0 then return jsonb_build_object('success',false,'error','Invalid order total'); end if;

  select coalesce(sum(amount),0) into v_total_refunded
  from public.refund_records
  where order_id=o.id and status='completed' and id<>r.id;

  if v_total_refunded + r.amount > o.final_price + 0.01 then
    raise exception 'Cumulative refunds exceed order total';
  end if;

  v_increment := least(r.amount, greatest(0,o.final_price-v_total_refunded));
  v_ratio := v_increment / o.final_price;
  v_seller_earnings := greatest(0,
    coalesce(o.final_price,0)
    - coalesce(o.admin_task_amount,0)
    - coalesce(o.sales_team_task_amount,0)
    - coalesce(o.affiliate_commission_amount,0)
  ) * v_ratio;
  v_affiliate_commission := greatest(0,coalesce(o.affiliate_commission_amount,0)) * v_ratio;

  if v_seller_earnings > 0 then
    select id into v_seller_wallet from public.cc_wallets where user_id=o.seller_id for update;
    if v_seller_wallet is null then raise exception 'Seller wallet not found'; end if;
    select public.process_wallet_transaction(
      o.seller_id,v_seller_wallet,'debit',v_seller_earnings,
      'Marketplace refund reversal','refund',r.id,
      jsonb_build_object('order_id',o.id,'refund_id',r.id,'gateway_reference',r.gateway_reference,'amount',r.amount),
      'seller_earnings'
    ) into v_result;
    if not coalesce((v_result->>'success')::boolean,false) then raise exception 'Unable to reverse seller earnings'; end if;
  end if;

  if v_affiliate_commission > 0 and o.referrer_id is not null and o.referrer_id <> o.buyer_id then
    select id into v_affiliate_wallet from public.cc_wallets where user_id=o.referrer_id for update;
    if v_affiliate_wallet is null then raise exception 'Affiliate wallet not found'; end if;
    select public.process_wallet_transaction(
      o.referrer_id,v_affiliate_wallet,'debit',v_affiliate_commission,
      'Affiliate commission refund reversal','refund',r.id,
      jsonb_build_object('order_id',o.id,'refund_id',r.id,'gateway_reference',r.gateway_reference,'amount',r.amount,'tracking_code',o.tracking_code,'referral_link_id',o.referral_link_id),
      'affiliate_balance'
    ) into v_result;
    if not coalesce((v_result->>'success')::boolean,false) then raise exception 'Unable to reverse affiliate commission'; end if;
    update public.users
      set balance=greatest(0,coalesce(balance,0)-v_affiliate_commission),
          available_balance=greatest(0,coalesce(available_balance,0)-v_affiliate_commission),
          affiliate_earnings=greatest(0,coalesce(affiliate_earnings,0)-v_affiliate_commission)
      where id=o.referrer_id;
  end if;

  update public.sales_records
    set status='refunded', commission_amount=greatest(0,coalesce(commission_amount,0)-v_affiliate_commission)
    where order_id=o.id and status not in ('refunded','cancelled');

  if v_total_refunded + r.amount >= o.final_price - 0.01 then
    update public.orders set status='CANCELLED', completed_at=coalesce(completed_at,now()) where id=o.id;
    update public.products set total_sales=greatest(0,coalesce(total_sales,0)-1), stock_quantity=case when stock_quantity is null then null else stock_quantity+1 end, updated_at=now() where id=o.product_id;
  end if;

  update public.refund_records
    set financial_processed_at=now(),
        financial_reversal_metadata=jsonb_build_object(
          'order_id',o.id,'refund_amount',r.amount,'seller_reversal',v_seller_earnings,
          'affiliate_reversal',v_affiliate_commission,'cumulative_refunded_before',v_total_refunded,
          'processed_at',now()
        ), updated_at=now()
    where id=r.id;

  insert into public.analytics_events(event_type,entity_type,entity_id,seller_id,viewer_id,metadata)
  values('refund_processed','refund',r.id,o.seller_id,o.buyer_id,jsonb_build_object(
    'order_id',o.id,'refund_amount',r.amount,'seller_reversal',v_seller_earnings,
    'affiliate_reversal',v_affiliate_commission,'source_type',o.source_type,
    'referrer_id',o.referrer_id,'referral_link_id',o.referral_link_id,
    'campaign_id',o.campaign_id,'sales_team_id',o.sales_team_id,
    'team_member_id',o.team_member_id,'team_lead_id',o.team_lead_id
  ));

  return jsonb_build_object('success',true,'refund_id',r.id,'order_id',o.id,'seller_reversal',v_seller_earnings,'affiliate_reversal',v_affiliate_commission,'fully_refunded',(v_total_refunded+r.amount >= o.final_price-0.01));
end;
$$;