begin;

alter table public.platform_access_settings
  alter column currency set default 'NGN';

update public.platform_access_settings
set currency='NGN',updated_at=now()
where singleton=true
  and monthly_price=0
  and upper(currency)='USD';

update public.subscription_plans
set currency='NGN'
where slug='dright_platform_access_monthly'
  and amount=0
  and upper(currency)='USD';

create or replace function public.activate_verified_subscription_payment(
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tx public.paystack_transactions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_plan_id uuid;
  v_sub public.user_subscriptions%rowtype;
  v_base timestamptz;
  v_end timestamptz;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Verified subscription activation requires service_role';
  end if;

  select * into v_tx
  from public.paystack_transactions
  where reference=p_reference
  for update;

  if not found then raise exception 'Subscription payment transaction not found'; end if;
  if v_tx.status <> 'success' then raise exception 'Subscription payment is not verified'; end if;
  if v_tx.purpose not in ('subscription','affiliate_subscription','vendor_subscription') then
    raise exception 'Payment is not a subscription transaction';
  end if;

  begin
    v_plan_id := nullif(v_tx.metadata->>'plan_id','')::uuid;
  exception when others then
    raise exception 'Subscription payment has invalid plan metadata';
  end;

  if v_plan_id is null then raise exception 'Subscription plan metadata is missing'; end if;

  select * into v_plan
  from public.subscription_plans
  where id=v_plan_id
  for update;

  if not found or v_plan.is_active is not true then
    raise exception 'Subscription plan is unavailable';
  end if;

  if abs(coalesce(v_tx.amount,0)-coalesce(v_plan.amount,0)) > 0.01 then
    raise exception 'Subscription amount mismatch';
  end if;

  if upper(coalesce(v_tx.currency,'')) <> upper(coalesce(v_plan.currency,'')) then
    raise exception 'Subscription currency mismatch';
  end if;

  select * into v_sub
  from public.user_subscriptions
  where user_id=v_tx.user_id
    and plan_id=v_plan.id
    and status in ('trialing','active','past_due','paused')
  order by created_at desc
  limit 1
  for update;

  v_base := greatest(now(),coalesce(v_sub.current_period_end,now()));

  v_end := case v_plan.interval
    when 'daily' then v_base + interval '1 day'
    when 'weekly' then v_base + interval '1 week'
    when 'yearly' then v_base + interval '1 year'
    else v_base + interval '1 month'
  end;

  if v_sub.id is null then
    insert into public.user_subscriptions(
      user_id,plan_id,status,current_period_start,current_period_end,
      trial_end,grace_period_end,canceled_at,cancel_at_period_end,
      failed_renewal_count,last_payment_ref,metadata
    )
    values(
      v_tx.user_id,v_plan.id,'active',now(),v_end,
      null,null,null,false,
      0,p_reference,
      jsonb_build_object(
        'payment_provider','paystack',
        'payment_reference',p_reference,
        'activated_at',now()
      )
    )
    returning * into v_sub;
  else
    update public.user_subscriptions
    set status='active',
        current_period_start=now(),
        current_period_end=v_end,
        trial_end=null,
        grace_period_end=null,
        canceled_at=null,
        cancel_at_period_end=false,
        failed_renewal_count=0,
        last_payment_ref=p_reference,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'payment_provider','paystack',
          'payment_reference',p_reference,
          'renewed_at',now()
        ),
        updated_at=now()
    where id=v_sub.id
    returning * into v_sub;
  end if;

  delete from public.subscription_reminders
  where user_id=v_tx.user_id
    and subscription_id=v_sub.id
    and status='pending';

  insert into public.subscription_reminders(
    user_id,subscription_type,subscription_id,expiry_date,
    reminder_stage,reminder_offset_days,channel,status
  )
  select
    v_tx.user_id,
    case when v_plan.plan_type='platform_access' then 'platform_access' else v_plan.plan_type end,
    v_sub.id,
    v_end,
    'pending',
    offset_days,
    'email',
    'pending'
  from unnest(array[7,3,1,0,-3,-7,-14]) offset_days;

  return jsonb_build_object(
    'success',true,
    'subscription_id',v_sub.id,
    'plan_id',v_plan.id,
    'current_period_end',v_sub.current_period_end
  );
end;
$$;

revoke all on function public.activate_verified_subscription_payment(text) from public;

create or replace function public.process_paystack_payment(
  p_reference text,
  p_user_id uuid,
  p_amount numeric,
  p_purpose text,
  p_reference_id uuid,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tx public.paystack_transactions%rowtype;
  v_currency text;
  v_result jsonb;
  v_subscription jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Payment processing requires service_role';
  end if;

  select * into v_tx
  from public.paystack_transactions
  where reference=p_reference
  for update;

  if not found then raise exception 'Canonical Paystack transaction not found'; end if;
  if v_tx.user_id is distinct from p_user_id then raise exception 'Payment user mismatch'; end if;
  if v_tx.purpose is distinct from p_purpose then raise exception 'Payment purpose mismatch'; end if;
  if v_tx.reference_id is distinct from p_reference_id then raise exception 'Payment reference target mismatch'; end if;
  if abs(coalesce(v_tx.amount,0)-coalesce(p_amount,0))>0.01 then raise exception 'Payment amount mismatch'; end if;
  if v_tx.status<>'success' then raise exception 'Paystack transaction is not verified successful'; end if;

  v_currency := upper(v_tx.currency);

  if p_purpose='promotion_campaign' then
    return public.process_verified_promotion_payment(
      p_reference,p_user_id,v_tx.amount,v_currency,'paystack'
    );
  end if;

  if p_purpose='sales_team_contract' then
    return public.process_verified_sales_team_contract_payment(
      p_reference,p_user_id,v_tx.amount,v_currency,'paystack'
    );
  end if;

  v_result := public.process_paystack_payment_core_st6(
    p_reference,
    p_user_id,
    v_tx.amount,
    v_tx.purpose,
    v_tx.reference_id,
    coalesce(v_tx.metadata,'{}'::jsonb)
  );

  if p_purpose in ('subscription','affiliate_subscription','vendor_subscription') then
    v_subscription := public.activate_verified_subscription_payment(p_reference);
    v_result := coalesce(v_result,'{}'::jsonb)
      || jsonb_build_object('subscription_activation',v_subscription);
  end if;

  return v_result;
end;
$$;

commit;