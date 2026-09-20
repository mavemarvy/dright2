begin;

create or replace function public.process_verified_dright_starter_purchase(
  p_reference text,
  p_amount numeric,
  p_currency text,
  p_gateway_response text default null,
  p_paid_at timestamptz default now(),
  p_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_purchase public.dright_starter_purchases%rowtype;
  v_affiliate_ok boolean:=false;
  v_commission numeric:=0;
  v_platform_revenue numeric:=0;
  v_affiliate_wallet uuid;
  v_wallet_result jsonb;
  v_account public.platform_accounts%rowtype;
  v_before numeric;
  v_after numeric;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Starter purchase finalization requires service_role';
  end if;

  select * into v_purchase
  from public.dright_starter_purchases
  where payment_reference=p_reference
  for update;

  if not found then raise exception 'Starter purchase not found'; end if;

  if v_purchase.processed_at is not null and v_purchase.payment_status='success' then
    return jsonb_build_object(
      'success',true,'idempotent',true,
      'purchase_id',v_purchase.id,
      'affiliate_commission',v_purchase.affiliate_commission_amount,
      'platform_revenue',v_purchase.platform_revenue_amount
    );
  end if;

  if upper(coalesce(p_currency,''))<>upper(v_purchase.currency) then
    raise exception 'Starter purchase currency mismatch';
  end if;

  if abs(coalesce(p_amount,0)-coalesce(v_purchase.amount,0))>0.01 then
    raise exception 'Starter purchase amount mismatch';
  end if;

  if v_purchase.referrer_id is not null then
    v_affiliate_ok:=exists(
      select 1 from public.users u
      where u.id=v_purchase.referrer_id
        and upper(coalesce(u.account_status,''))='ACTIVE'
    );

    if v_affiliate_ok and v_purchase.referral_link_id is not null then
      v_affiliate_ok:=exists(
        select 1 from public.referral_links rl
        where rl.id=v_purchase.referral_link_id
          and rl.user_id=v_purchase.referrer_id
          and lower(coalesce(rl.source_type,'affiliate'))='affiliate'
      );
    end if;
  end if;

  v_commission:=case
    when v_affiliate_ok then greatest(0,v_purchase.amount * v_purchase.affiliate_commission_percent / 100)
    else 0
  end;
  v_platform_revenue:=greatest(0,v_purchase.amount-v_commission);

  if v_commission>0 then
    select id into v_affiliate_wallet
    from public.cc_wallets
    where user_id=v_purchase.referrer_id
    for update;

    if v_affiliate_wallet is null then
      insert into public.cc_wallets(user_id)
      values(v_purchase.referrer_id)
      on conflict(user_id) do nothing
      returning id into v_affiliate_wallet;

      if v_affiliate_wallet is null then
        select id into v_affiliate_wallet
        from public.cc_wallets
        where user_id=v_purchase.referrer_id
        for update;
      end if;
    end if;

    select public.process_wallet_transaction(
      v_purchase.referrer_id,
      v_affiliate_wallet,
      'credit',
      v_commission,
      'Affiliate commission from DRIGHT Starter Access',
      'dright_starter_purchase',
      v_purchase.id,
      jsonb_build_object(
        'payment_reference',p_reference,
        'tracking_code',v_purchase.tracking_code,
        'referral_link_id',v_purchase.referral_link_id,
        'first_party_product',true
      ),
      'affiliate_balance'
    ) into v_wallet_result;

    if not coalesce((v_wallet_result->>'success')::boolean,false) then
      raise exception 'Unable to credit Starter affiliate commission';
    end if;

    update public.users
    set balance=coalesce(balance,0)+v_commission,
        available_balance=coalesce(available_balance,0)+v_commission,
        affiliate_earnings=coalesce(affiliate_earnings,0)+v_commission
    where id=v_purchase.referrer_id;

    insert into public.sales_records(
      promoter_id,buyer_name,product_name,commission_amount,status,sale_date,
      referrer_id,referrer_role,product_id,sale_amount,starter_purchase_id
    ) values(
      v_purchase.referrer_id,
      coalesce(nullif(v_purchase.buyer_name,''),'New DRIGHT user'),
      'DRIGHT Starter Access',
      v_commission,
      'paid',
      current_date,
      v_purchase.referrer_id,
      'affiliate',
      null,
      v_purchase.amount,
      v_purchase.id
    )
    on conflict(starter_purchase_id) where starter_purchase_id is not null do nothing;

    if v_purchase.referral_link_id is not null then
      update public.referral_links
      set total_conversions=coalesce(total_conversions,0)+1
      where id=v_purchase.referral_link_id;
    end if;
  end if;

  if v_platform_revenue>0 then
    select * into v_account
    from public.platform_accounts
    where account_type='operating'
    for update;

    if not found then
      raise exception 'DRIGHT operating platform account is not configured';
    end if;

    if upper(v_account.currency)<>upper(v_purchase.currency) then
      raise exception 'DRIGHT operating account currency mismatch';
    end if;

    v_before:=coalesce(v_account.balance,0);
    v_after:=v_before+v_platform_revenue;

    update public.platform_accounts
    set balance=v_after,updated_at=now()
    where id=v_account.id;

    insert into public.platform_ledger_entries(
      entry_id,transaction_id,debit_account,credit_account,amount,currency,exchange_rate,
      debit_balance_before,debit_balance_after,credit_balance_before,credit_balance_after,
      reference_type,reference_id,description,created_by,metadata
    ) values(
      'DRIGHT-STARTER-'||v_purchase.id::text,
      null,
      'paystack_clearing',
      'operating',
      v_platform_revenue,
      v_purchase.currency,
      1,
      null,
      null,
      v_before,
      v_after,
      'dright_starter_purchase',
      v_purchase.id,
      'Net platform revenue from DRIGHT Starter Access',
      null,
      jsonb_build_object(
        'payment_reference',p_reference,
        'gross_amount',v_purchase.amount,
        'affiliate_commission',v_commission,
        'no_marketplace_platform_fee',true
      )
    ) on conflict(entry_id) do nothing;
  end if;

  update public.dright_starter_purchases
  set payment_status='success',
      status=case when claimed_at is not null then 'claimed' else 'completed' end,
      gateway_response=p_gateway_response,
      payment_channel=p_channel,
      paid_at=coalesce(p_paid_at,now()),
      processed_at=now(),
      affiliate_commission_amount=v_commission,
      platform_revenue_amount=v_platform_revenue,
      updated_at=now()
  where id=v_purchase.id;

  return jsonb_build_object(
    'success',true,
    'idempotent',false,
    'purchase_id',v_purchase.id,
    'affiliate_commission',v_commission,
    'platform_revenue',v_platform_revenue,
    'trial_days',v_purchase.included_trial_days
  );
end;
$$;

revoke all on function public.process_verified_dright_starter_purchase(text,numeric,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.process_verified_dright_starter_purchase(text,numeric,text,text,timestamptz,text) to service_role;

commit;