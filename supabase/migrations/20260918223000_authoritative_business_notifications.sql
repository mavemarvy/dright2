-- DRIGHT authoritative business-event notifications.
-- These triggers start from verified server/database state so sales/payment/
-- affiliate/referral/payout/marketing emails cannot be forged by browser code.

begin;

create or replace function public.notify_completed_marketplace_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_name text;
  v_currency text;
  v_amount numeric;
begin
  if new.status <> 'COMPLETED' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'COMPLETED' then return new; end if;

  select coalesce(nullif(name,''),'your product')
  into v_product_name
  from public.products
  where id = new.product_id;

  select upper(nullif(currency,''))
  into v_currency
  from public.paystack_transactions
  where reference_id = new.id
    and status = 'success'
  order by coalesce(paid_at,processed_at,updated_at,created_at) desc
  limit 1;

  v_amount := coalesce(new.final_price,new.base_price,0);

  if new.seller_id is not null then
    insert into public.notifications(
      user_id,title,message,notification_type,related_id,category,priority,
      metadata,group_key,is_read,is_archived,is_deleted
    )
    select
      new.seller_id,
      'You just got a sale',
      'A buyer completed an order for ' || v_product_name
        || case when v_amount > 0
             then '. Order value: ' || trim(to_char(v_amount,'FM999999999990.00'))
               || case when v_currency is not null then ' ' || v_currency else '' end
             else ''
           end || '.',
      'new_order',
      new.id,
      'orders',
      'high',
      jsonb_build_object(
        'order_id',new.id,
        'product_id',new.product_id,
        'product_name',v_product_name,
        'buyer_id',new.buyer_id,
        'amount',v_amount,
        'currency',v_currency,
        'event_module','marketplace',
        'event_type','sale_completed',
        'action_url','/orders'
      ),
      'sale:order:' || new.id::text || ':seller',
      false,false,false
    where not exists (
      select 1 from public.notifications n
      where n.group_key='sale:order:' || new.id::text || ':seller'
        and n.user_id=new.seller_id
        and n.is_deleted=false
    );
  end if;

  if new.buyer_id is not null then
    insert into public.notifications(
      user_id,title,message,notification_type,related_id,category,priority,
      metadata,group_key,is_read,is_archived,is_deleted
    )
    select
      new.buyer_id,
      'Purchase completed',
      'Your order for ' || v_product_name || ' is complete.',
      'order_status',
      new.id,
      'orders',
      'high',
      jsonb_build_object(
        'order_id',new.id,
        'product_id',new.product_id,
        'product_name',v_product_name,
        'seller_id',new.seller_id,
        'amount',v_amount,
        'currency',v_currency,
        'event_module','marketplace',
        'event_type','purchase_completed',
        'action_url','/orders'
      ),
      'purchase:order:' || new.id::text || ':buyer',
      false,false,false
    where not exists (
      select 1 from public.notifications n
      where n.group_key='purchase:order:' || new.id::text || ':buyer'
        and n.user_id=new.buyer_id
        and n.is_deleted=false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_completed_marketplace_order on public.orders;
create trigger trg_notify_completed_marketplace_order
after insert or update of status on public.orders
for each row execute function public.notify_completed_marketplace_order();


create or replace function public.notify_distributed_commission_split()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_currency text;
  v_type text;
  v_category text;
  v_title text;
begin
  if new.status <> 'distributed' then return new; end if;
  if tg_op='UPDATE' and old.status='distributed' then return new; end if;
  if new.recipient_id is null or new.recipient_role='platform' then return new; end if;
  if not exists(select 1 from public.users where id=new.recipient_id) then return new; end if;

  select upper(nullif(pt.currency,''))
  into v_currency
  from public.paystack_transactions pt
  where pt.reference_id=new.order_id and pt.status='success'
  order by coalesce(pt.paid_at,pt.processed_at,pt.updated_at,pt.created_at) desc
  limit 1;

  if new.recipient_role='affiliate' then
    v_type:='affiliate_commission'; v_category:='affiliate'; v_title:='Affiliate commission earned';
  elsif new.recipient_role='referrer' then
    v_type:='referral_commission'; v_category:='referrals'; v_title:='Referral commission earned';
  else
    v_type:='payout'; v_category:='wallet'; v_title:='Earnings credited';
  end if;

  insert into public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  )
  select
    new.recipient_id,
    v_title,
    'You earned ' || trim(to_char(coalesce(new.amount,0),'FM999999999990.00'))
      || case when v_currency is not null then ' ' || v_currency else '' end
      || case when new.recipient_role='affiliate' then ' from an affiliate sale.'
              when new.recipient_role='referrer' then ' from a referral.'
              else ' on DRIGHT.' end,
    v_type,
    coalesce(new.order_id,new.id),
    v_category,
    'high',
    jsonb_build_object(
      'commission_split_id',new.id,'order_id',new.order_id,
      'recipient_role',new.recipient_role,'amount',new.amount,'currency',v_currency,
      'event_module','earnings','event_type','commission_distributed','action_url','/wallet'
    ),
    'commission-split:' || new.id::text,
    false,false,false
  where not exists(
    select 1 from public.notifications n
    where n.group_key='commission-split:' || new.id::text
      and n.user_id=new.recipient_id and n.is_deleted=false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_distributed_commission_split on public.commission_splits;
create trigger trg_notify_distributed_commission_split
after insert or update of status on public.commission_splits
for each row execute function public.notify_distributed_commission_split();


create or replace function public.notify_referral_reward_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_label text;
begin
  if new.status not in ('confirmed','paid') then return new; end if;
  if tg_op='UPDATE' and old.status=new.status then return new; end if;

  v_label := case when new.status='paid' then 'Referral reward paid' else 'Referral reward confirmed' end;

  insert into public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  )
  select
    new.referrer_id,
    v_label,
    'Your level ' || new.level::text || ' referral reward is '
      || new.status || ': ' || trim(to_char(coalesce(new.reward_amount,0),'FM999999999990.00'))
      || case when nullif(new.currency,'') is not null then ' ' || upper(new.currency) else '' end || '.',
    'referral_commission',
    new.id,
    'referrals',
    'high',
    jsonb_build_object(
      'referral_reward_id',new.id,'referred_user_id',new.referred_user_id,
      'level',new.level,'amount',new.reward_amount,'currency',new.currency,
      'reward_type',new.reward_type,'status',new.status,
      'event_module','referral','event_type','reward_' || new.status,'action_url','/refer'
    ),
    'referral-reward:' || new.id::text || ':' || new.status,
    false,false,false
  where new.referrer_id is not null
    and not exists(
      select 1 from public.notifications n
      where n.group_key='referral-reward:' || new.id::text || ':' || new.status
        and n.user_id=new.referrer_id and n.is_deleted=false
    );

  return new;
end;
$$;

drop trigger if exists trg_notify_referral_reward_status on public.referral_rewards;
create trigger trg_notify_referral_reward_status
after insert or update of status on public.referral_rewards
for each row execute function public.notify_referral_reward_status();


create or replace function public.notify_guest_affiliate_commission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.payment_status <> 'success'
     or new.processed_at is null
     or coalesce(new.affiliate_commission_amount,0) <= 0
     or new.referrer_id is null then
    return new;
  end if;
  if tg_op='UPDATE'
     and old.payment_status='success'
     and old.processed_at is not null then
    return new;
  end if;

  insert into public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  )
  select
    new.referrer_id,
    'Affiliate commission earned',
    'You earned ' || trim(to_char(new.affiliate_commission_amount,'FM999999999990.00'))
      || case when nullif(new.currency,'') is not null then ' ' || upper(new.currency) else '' end
      || ' from a guest purchase of ' || coalesce(nullif(new.product_name,''),'a product') || '.',
    'affiliate_commission',
    new.id,
    'affiliate',
    'high',
    jsonb_build_object(
      'guest_order_id',new.id,'product_id',new.product_id,
      'amount',new.affiliate_commission_amount,'currency',new.currency,
      'referral_link_id',new.referral_link_id,'tracking_code',new.tracking_code,
      'event_module','affiliate','event_type','guest_commission_earned','action_url','/affiliate'
    ),
    'guest-affiliate-commission:' || new.id::text,
    false,false,false
  where not exists(
    select 1 from public.notifications n
    where n.group_key='guest-affiliate-commission:' || new.id::text
      and n.user_id=new.referrer_id and n.is_deleted=false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_guest_affiliate_commission on public.guest_orders;
create trigger trg_notify_guest_affiliate_commission
after insert or update of payment_status,processed_at on public.guest_orders
for each row execute function public.notify_guest_affiliate_commission();


create or replace function public.notify_paystack_success()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_category text;
  v_title text;
  v_amount numeric;
begin
  if new.status <> 'success' or new.user_id is null then return new; end if;
  if tg_op='UPDATE' and old.status='success' then return new; end if;

  v_amount := coalesce(new.amount,0)/100.0;

  if new.purpose='wallet_funding' then
    v_type:='wallet_deposit'; v_category:='wallet'; v_title:='Wallet funding successful';
  elsif new.purpose in ('product_purchase','escrow') then
    v_type:='order_status'; v_category:='orders'; v_title:='Payment confirmed';
  elsif new.purpose ilike '%promotion%' then
    v_type:='promotion'; v_category:='promotions'; v_title:='Promotion payment confirmed';
  else
    v_type:='system_alert'; v_category:='wallet'; v_title:='Payment confirmed';
  end if;

  insert into public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  )
  select
    new.user_id,
    v_title,
    'DRIGHT confirmed your payment of ' || trim(to_char(v_amount,'FM999999999990.00'))
      || case when nullif(new.currency,'') is not null then ' ' || upper(new.currency) else '' end || '.',
    v_type,
    coalesce(new.reference_id,new.id),
    v_category,
    'high',
    jsonb_build_object(
      'paystack_transaction_id',new.id,'reference',new.reference,
      'purpose',new.purpose,'amount',v_amount,'currency',new.currency,
      'channel',new.channel,'event_module','payment','event_type','payment_confirmed',
      'action_url',case when new.purpose='wallet_funding' then '/wallet' else '/orders' end
    ),
    'paystack-success:' || new.id::text,
    false,false,false
  where not exists(
    select 1 from public.notifications n
    where n.group_key='paystack-success:' || new.id::text
      and n.user_id=new.user_id and n.is_deleted=false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_paystack_success on public.paystack_transactions;
create trigger trg_notify_paystack_success
after insert or update of status on public.paystack_transactions
for each row execute function public.notify_paystack_success();


create or replace function public.notify_withdrawal_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_message text;
  v_priority text := 'normal';
begin
  if new.user_id is null then return new; end if;
  if tg_op='UPDATE' and old.status=new.status then return new; end if;

  if new.status='pending' then
    v_title:='Withdrawal request received';
    v_message:='Your withdrawal request for ' || trim(to_char(new.amount,'FM999999999990.00')) || ' is awaiting review.';
  elsif new.status in ('approved','processing') then
    v_title:='Withdrawal approved';
    v_message:='Your withdrawal request for ' || trim(to_char(new.amount,'FM999999999990.00')) || ' is being processed.';
    v_priority:='high';
  elsif new.status='paid' then
    v_title:='Withdrawal paid';
    v_message:='Your withdrawal request for ' || trim(to_char(new.amount,'FM999999999990.00')) || ' has been paid.';
    v_priority:='high';
  elsif new.status in ('rejected','failed') then
    v_title:='Withdrawal update';
    v_message:='Your withdrawal request was not completed.'
      || case when nullif(new.failure_reason,'') is not null then ' Reason: ' || new.failure_reason else '' end;
    v_priority:='high';
  else
    return new;
  end if;

  insert into public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  )
  select new.user_id,v_title,v_message,'wallet_withdrawal',new.id,'wallet',v_priority,
    jsonb_build_object(
      'withdrawal_id',new.id,'amount',new.amount,'status',new.status,
      'reference',new.reference,'event_module','wallet',
      'event_type','withdrawal_' || new.status,'action_url','/wallet/withdraw'
    ),
    'withdrawal:' || new.id::text || ':' || new.status,false,false,false
  where not exists(
    select 1 from public.notifications n
    where n.group_key='withdrawal:' || new.id::text || ':' || new.status
      and n.user_id=new.user_id and n.is_deleted=false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_withdrawal_status on public.withdrawal_requests;
create trigger trg_notify_withdrawal_status
after insert or update of status on public.withdrawal_requests
for each row execute function public.notify_withdrawal_status();


create or replace function public.notify_payout_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is null then return new; end if;
  if tg_op='UPDATE' and old.status=new.status then return new; end if;

  insert into public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  )
  select
    new.user_id,
    case when new.status='paid' then 'Payout completed'
         when new.status='approved' then 'Payout approved'
         when new.status in ('rejected','failed') then 'Payout update'
         else 'Payout status updated' end,
    'Your payout of ' || trim(to_char(coalesce(new.amount,0),'FM999999999990.00'))
      || ' is now ' || new.status || '.',
    'payout',
    new.id,
    'wallet',
    case when new.status in ('paid','approved','rejected','failed') then 'high' else 'normal' end,
    jsonb_build_object(
      'payout_id',new.id,'amount',new.amount,'status',new.status,
      'payout_type',new.payout_type,'event_module','wallet',
      'event_type','payout_' || new.status,'action_url','/wallet'
    ),
    'payout:' || new.id::text || ':' || new.status,
    false,false,false
  where not exists(
    select 1 from public.notifications n
    where n.group_key='payout:' || new.id::text || ':' || new.status
      and n.user_id=new.user_id and n.is_deleted=false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_payout_status on public.payout_records;
create trigger trg_notify_payout_status
after insert or update of status on public.payout_records
for each row execute function public.notify_payout_status();


create or replace function public.notify_promotion_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
begin
  if new.seller_id is null then return new; end if;
  if tg_op='UPDATE' and old.status=new.status then return new; end if;

  v_title := case
    when new.status in ('active','approved') then 'Promotion is live'
    when new.status in ('rejected','failed') then 'Promotion needs attention'
    when new.status='completed' then 'Promotion completed'
    when new.status='paused' then 'Promotion paused'
    else 'Promotion status updated'
  end;

  insert into public.notifications(
    user_id,title,message,notification_type,related_id,category,priority,
    metadata,group_key,is_read,is_archived,is_deleted
  )
  select
    new.seller_id,
    v_title,
    'Your DRIGHT promotion is now ' || new.status || '.',
    'promotion',
    new.id,
    'promotions',
    case when new.status in ('active','approved','rejected','failed') then 'high' else 'normal' end,
    jsonb_build_object(
      'campaign_id',new.id,'listing_id',new.listing_id,'listing_type',new.listing_type,
      'status',new.status,'actual_impressions',new.actual_impressions,
      'actual_clicks',new.actual_clicks,'actual_conversions',new.actual_conversions,
      'event_module','promotion','event_type','campaign_' || new.status,
      'action_url','/promote'
    ),
    'promotion:' || new.id::text || ':' || new.status,
    false,false,false
  where not exists(
    select 1 from public.notifications n
    where n.group_key='promotion:' || new.id::text || ':' || new.status
      and n.user_id=new.seller_id and n.is_deleted=false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_promotion_status on public.promotion_campaigns;
create trigger trg_notify_promotion_status
after insert or update of status on public.promotion_campaigns
for each row execute function public.notify_promotion_status();

commit;
