begin;

create or replace function public.admin_update_subscription_plan(
  p_plan_id uuid,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_amount numeric;
  v_currency text;
  v_interval text;
  v_trial integer;
  v_grace integer;
  v_features jsonb;
  v_active boolean;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select * into v_plan from public.subscription_plans where id=p_plan_id for update;
  if not found then raise exception 'Subscription plan not found'; end if;

  v_amount:=coalesce((p_patch->>'amount')::numeric,v_plan.amount);
  v_currency:=upper(coalesce(nullif(trim(p_patch->>'currency'),''),v_plan.currency));
  v_interval:=lower(coalesce(nullif(trim(p_patch->>'interval'),''),v_plan.interval));
  v_trial:=coalesce((p_patch->>'trial_days')::integer,v_plan.trial_days);
  v_grace:=coalesce((p_patch->>'grace_period_days')::integer,v_plan.grace_period_days);
  v_features:=coalesce(p_patch->'features',v_plan.features,'[]'::jsonb);
  v_active:=coalesce((p_patch->>'is_active')::boolean,v_plan.is_active);

  if v_amount<0 then raise exception 'Plan amount cannot be negative'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter ISO code'; end if;
  if v_interval not in ('daily','weekly','monthly','yearly') then raise exception 'Invalid plan interval'; end if;
  if v_plan.plan_type='platform_access' then
    v_interval:='monthly';
    v_trial:=0; -- Starter/global access trial is controlled by platform_access_settings only.
  end if;
  if v_trial<0 or v_trial>730 then raise exception 'Trial days must be between 0 and 730'; end if;
  if v_grace<0 or v_grace>60 then raise exception 'Grace period must be between 0 and 60 days'; end if;
  if jsonb_typeof(v_features)<>'array' then raise exception 'Features must be a JSON array'; end if;

  update public.subscription_plans
  set name=coalesce(nullif(trim(p_patch->>'name'),''),name),
      description=case when p_patch ? 'description' then nullif(trim(p_patch->>'description'),'') else description end,
      amount=v_amount,
      currency=v_currency,
      interval=v_interval,
      trial_days=v_trial,
      grace_period_days=v_grace,
      features=v_features,
      is_active=v_active
  where id=p_plan_id;

  if v_plan.plan_type='platform_access' then
    update public.platform_access_settings
    set monthly_price=v_amount,
        currency=v_currency,
        grace_period_days=v_grace,
        enabled=v_active,
        updated_at=now(),
        updated_by=auth.uid()
    where singleton=true;
  end if;

  return (select to_jsonb(p) from public.subscription_plans p where p.id=p_plan_id);
end;
$$;

revoke all on function public.admin_update_subscription_plan(uuid,jsonb) from public,anon;
grant execute on function public.admin_update_subscription_plan(uuid,jsonb) to authenticated,service_role;

update public.subscription_plans
set trial_days=0, interval='monthly'
where plan_type='platform_access';

commit;