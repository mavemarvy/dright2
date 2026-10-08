
-- Admin schedule/reset/restart/reschedule transaction.
create or replace function private.admin_launch_sales_challenge_cycle_internal(
  p_challenge_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text,
  p_force_new_cycle boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_challenge public.sales_challenges%rowtype;
  v_existing public.sales_challenge_cycles%rowtype;
  v_cycle_id uuid;
  v_cycle_number integer;
  v_status text;
  v_product_count integer;
  v_tier_count integer;
begin
  if not private.sales_challenge_admin_allowed() then
    raise exception 'Admin permission required';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then
    raise exception 'A valid start and end time are required';
  end if;

  select * into v_challenge
  from public.sales_challenges
  where id=p_challenge_id
  for update;
  if not found then raise exception 'Challenge not found'; end if;
  if v_challenge.status='ARCHIVED' then raise exception 'Archived challenges cannot be launched'; end if;

  select count(*) into v_product_count
  from public.sales_challenge_products cp
  join public.products p on p.id=cp.product_id
  where cp.challenge_id=p_challenge_id
    and cp.active=true
    and p.approval_status='approved'
    and p.is_active=true
    and p.price>=v_challenge.minimum_product_price;

  select count(*) into v_tier_count
  from public.sales_challenge_tiers
  where challenge_id=p_challenge_id and enabled=true;

  if v_product_count=0 then
    raise exception 'Select at least one approved product that meets the minimum product price before activation';
  end if;
  if v_tier_count=0 then
    raise exception 'Configure at least one enabled reward tier before activation';
  end if;

  select * into v_existing
  from public.sales_challenge_cycles
  where challenge_id=p_challenge_id
    and status in ('SCHEDULED','ACTIVE')
  order by cycle_number desc
  limit 1
  for update;

  if found and v_existing.status='SCHEDULED' and now()<v_existing.starts_at and not p_force_new_cycle then
    delete from public.sales_challenge_cycle_products where challenge_cycle_id=v_existing.id;
    delete from public.sales_challenge_cycle_tiers where challenge_cycle_id=v_existing.id;

    update public.sales_challenge_cycles
    set starts_at=p_starts_at,ends_at=p_ends_at,
        status=case when p_starts_at<=now() and p_ends_at>now() then 'ACTIVE' else 'SCHEDULED' end,
        reset_reason=p_reason
    where id=v_existing.id
    returning id,cycle_number,status into v_cycle_id,v_cycle_number,v_status;
  elsif found then
    if not p_force_new_cycle then
      raise exception 'The current cycle has already started. Reset/restart/reschedule requires a new cycle.';
    end if;

    update public.sales_challenge_cycles
    set status='ENDED',ended_at=now(),reset_reason=coalesce(p_reason,'Reset/restart/reschedule')
    where id=v_existing.id;

    update public.sales_challenge_participants
    set status=case when status='COMPLETED' then 'COMPLETED' else 'EXPIRED' end
    where challenge_cycle_id=v_existing.id;

    select coalesce(max(cycle_number),0)+1 into v_cycle_number
    from public.sales_challenge_cycles where challenge_id=p_challenge_id;

    v_status := case when p_starts_at<=now() and p_ends_at>now() then 'ACTIVE' else 'SCHEDULED' end;
    insert into public.sales_challenge_cycles(
      challenge_id,cycle_number,starts_at,ends_at,status,started_by,reset_reason
    ) values (
      p_challenge_id,v_cycle_number,p_starts_at,p_ends_at,v_status,v_actor,p_reason
    ) returning id into v_cycle_id;
  else
    select coalesce(max(cycle_number),0)+1 into v_cycle_number
    from public.sales_challenge_cycles where challenge_id=p_challenge_id;

    v_status := case when p_starts_at<=now() and p_ends_at>now() then 'ACTIVE' else 'SCHEDULED' end;
    insert into public.sales_challenge_cycles(
      challenge_id,cycle_number,starts_at,ends_at,status,started_by,reset_reason
    ) values (
      p_challenge_id,v_cycle_number,p_starts_at,p_ends_at,v_status,v_actor,p_reason
    ) returning id into v_cycle_id;
  end if;

  insert into public.sales_challenge_cycle_tiers(
    challenge_cycle_id,source_tier_id,sort_order,sales_required,reward_type,
    cash_reward,prize_name,prize_description,prize_estimated_cost,enabled
  )
  select
    v_cycle_id,t.id,t.sort_order,t.sales_required,t.reward_type,
    t.cash_reward,t.prize_name,t.prize_description,t.prize_estimated_cost,t.enabled
  from public.sales_challenge_tiers t
  where t.challenge_id=p_challenge_id
  order by t.sort_order;

  insert into public.sales_challenge_cycle_products(
    challenge_cycle_id,product_id,product_name_snapshot,price_snapshot,
    affiliate_pct_snapshot,meets_minimum_product_price,active
  )
  select
    v_cycle_id,p.id,p.name,p.price,
    greatest(0,least(100,coalesce(p.affiliate_commission_percent,0))),
    (p.price>=v_challenge.minimum_product_price),
    cp.active
  from public.sales_challenge_products cp
  join public.products p on p.id=cp.product_id
  where cp.challenge_id=p_challenge_id and cp.active=true;

  update public.sales_challenges
  set status=v_status
  where id=p_challenge_id;

  perform private.sales_challenge_log(
    p_challenge_id,v_cycle_id,
    case when p_force_new_cycle then 'CYCLE_RESET_RESTART_RESCHEDULE' else 'CYCLE_SCHEDULED' end,
    'challenge_cycle',v_cycle_id::text,
    jsonb_build_object('cycle_number',v_cycle_number,'starts_at',p_starts_at,'ends_at',p_ends_at,'reason',p_reason,'force_new_cycle',p_force_new_cycle),
    v_actor
  );

  return jsonb_build_object('success',true,'cycle_id',v_cycle_id,'cycle_number',v_cycle_number,'status',v_status);
end;
$$;
revoke all on function private.admin_launch_sales_challenge_cycle_internal(uuid,timestamptz,timestamptz,text,boolean) from public, anon;
grant execute on function private.admin_launch_sales_challenge_cycle_internal(uuid,timestamptz,timestamptz,text,boolean) to authenticated;

create or replace function public.admin_launch_sales_challenge_cycle(
  p_challenge_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null,
  p_force_new_cycle boolean default false
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_launch_sales_challenge_cycle_internal(
    p_challenge_id,p_starts_at,p_ends_at,p_reason,p_force_new_cycle
  );
$$;
revoke all on function public.admin_launch_sales_challenge_cycle(uuid,timestamptz,timestamptz,text,boolean) from public, anon;
grant execute on function public.admin_launch_sales_challenge_cycle(uuid,timestamptz,timestamptz,text,boolean) to authenticated;
