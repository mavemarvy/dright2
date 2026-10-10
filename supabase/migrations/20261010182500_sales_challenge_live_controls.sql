-- Live challenge controls: extend an active cycle without resetting progress and
-- synchronize admin product eligibility changes into the current cycle snapshot.

create or replace function private.admin_extend_sales_challenge_cycle_internal(
  p_cycle_id uuid,
  p_new_ends_at timestamptz,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_cycle public.sales_challenge_cycles%rowtype;
  v_old_ends_at timestamptz;
begin
  if not private.sales_challenge_admin_allowed() then
    raise exception 'Admin permission required';
  end if;

  select *
  into v_cycle
  from public.sales_challenge_cycles
  where id = p_cycle_id
  for update;

  if not found then
    raise exception 'Challenge cycle not found';
  end if;

  if v_cycle.status not in ('ACTIVE','SCHEDULED') then
    raise exception 'Only an active or scheduled challenge cycle can be extended';
  end if;

  if p_new_ends_at is null then
    raise exception 'A new end time is required';
  end if;

  if p_new_ends_at <= v_cycle.ends_at then
    raise exception 'The new end time must be later than the current end time';
  end if;

  if p_new_ends_at <= greatest(now(), v_cycle.starts_at) then
    raise exception 'The new end time must be in the future and after the cycle start';
  end if;

  v_old_ends_at := v_cycle.ends_at;

  update public.sales_challenge_cycles
  set ends_at = p_new_ends_at
  where id = v_cycle.id;

  update public.sales_challenges
  set updated_at = now()
  where id = v_cycle.challenge_id;

  perform private.sales_challenge_log(
    v_cycle.challenge_id,
    v_cycle.id,
    'CYCLE_DURATION_EXTENDED',
    'challenge_cycle',
    v_cycle.id::text,
    jsonb_build_object(
      'old_ends_at', v_old_ends_at,
      'new_ends_at', p_new_ends_at,
      'reason', p_reason,
      'progress_preserved', true
    ),
    v_actor
  );

  return jsonb_build_object(
    'success', true,
    'cycle_id', v_cycle.id,
    'old_ends_at', v_old_ends_at,
    'new_ends_at', p_new_ends_at,
    'progress_preserved', true
  );
end;
$$;

create or replace function public.admin_extend_sales_challenge_cycle(
  p_cycle_id uuid,
  p_new_ends_at timestamptz,
  p_reason text default null
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.admin_extend_sales_challenge_cycle_internal(
    p_cycle_id,
    p_new_ends_at,
    p_reason
  );
$$;

revoke execute on function public.admin_extend_sales_challenge_cycle(uuid,timestamptz,text) from public, anon;
grant execute on function public.admin_extend_sales_challenge_cycle(uuid,timestamptz,text) to authenticated;
revoke execute on function private.admin_extend_sales_challenge_cycle_internal(uuid,timestamptz,text) from public, anon;
grant execute on function private.admin_extend_sales_challenge_cycle_internal(uuid,timestamptz,text) to authenticated;

create or replace function private.admin_set_sales_challenge_product_internal(
  p_challenge_id uuid,
  p_product_id uuid,
  p_active boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_challenge public.sales_challenges%rowtype;
  v_product public.products%rowtype;
  v_cycle public.sales_challenge_cycles%rowtype;
  v_meets_minimum boolean;
begin
  if not private.sales_challenge_admin_allowed() then
    raise exception 'Admin permission required';
  end if;

  select *
  into v_challenge
  from public.sales_challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found';
  end if;

  if v_challenge.status = 'ARCHIVED' then
    raise exception 'Archived challenges cannot be edited';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id;

  if not found then
    raise exception 'Product not found';
  end if;

  v_meets_minimum := coalesce(v_product.price, 0) >= v_challenge.minimum_product_price;

  if p_active then
    if lower(coalesce(v_product.approval_status, '')) <> 'approved' or coalesce(v_product.is_active, false) <> true then
      raise exception 'Only approved active products can be added to a challenge';
    end if;

    if not v_meets_minimum then
      raise exception 'Product price is below the challenge minimum of %', v_challenge.minimum_product_price;
    end if;
  end if;

  insert into public.sales_challenge_products(
    challenge_id,
    product_id,
    active,
    added_by,
    added_at
  )
  values (
    p_challenge_id,
    p_product_id,
    p_active,
    v_actor,
    now()
  )
  on conflict (challenge_id, product_id)
  do update set
    active = excluded.active,
    added_by = case when excluded.active then excluded.added_by else public.sales_challenge_products.added_by end,
    added_at = case when excluded.active then now() else public.sales_challenge_products.added_at end;

  select *
  into v_cycle
  from public.sales_challenge_cycles
  where challenge_id = p_challenge_id
    and status in ('ACTIVE','SCHEDULED')
  order by cycle_number desc
  limit 1
  for update;

  if found then
    if p_active then
      insert into public.sales_challenge_cycle_products(
        challenge_cycle_id,
        product_id,
        product_name_snapshot,
        price_snapshot,
        affiliate_pct_snapshot,
        meets_minimum_product_price,
        active
      )
      values (
        v_cycle.id,
        v_product.id,
        v_product.name,
        v_product.price,
        greatest(0, least(100, coalesce(v_product.affiliate_commission_percent, 0))),
        v_meets_minimum,
        true
      )
      on conflict (challenge_cycle_id, product_id)
      do update set
        product_name_snapshot = excluded.product_name_snapshot,
        price_snapshot = excluded.price_snapshot,
        affiliate_pct_snapshot = excluded.affiliate_pct_snapshot,
        meets_minimum_product_price = excluded.meets_minimum_product_price,
        active = true;
    else
      update public.sales_challenge_cycle_products
      set active = false
      where challenge_cycle_id = v_cycle.id
        and product_id = p_product_id;
    end if;
  end if;

  perform private.sales_challenge_log(
    p_challenge_id,
    case when v_cycle.id is null then null else v_cycle.id end,
    case when p_active then 'CHALLENGE_PRODUCT_ADDED' else 'CHALLENGE_PRODUCT_REMOVED' end,
    'product',
    p_product_id::text,
    jsonb_build_object(
      'product_name', v_product.name,
      'price', v_product.price,
      'minimum_product_price', v_challenge.minimum_product_price,
      'meets_minimum', v_meets_minimum,
      'active', p_active,
      'reason', p_reason,
      'live_cycle_updated', v_cycle.id is not null,
      'historical_sales_preserved', true
    ),
    v_actor
  );

  return jsonb_build_object(
    'success', true,
    'challenge_id', p_challenge_id,
    'cycle_id', case when v_cycle.id is null then null else v_cycle.id end,
    'product_id', p_product_id,
    'active', p_active,
    'meets_minimum', v_meets_minimum,
    'live_cycle_updated', v_cycle.id is not null
  );
end;
$$;

create or replace function public.admin_set_sales_challenge_product(
  p_challenge_id uuid,
  p_product_id uuid,
  p_active boolean,
  p_reason text default null
)
returns jsonb
language sql
set search_path = ''
as $$
  select private.admin_set_sales_challenge_product_internal(
    p_challenge_id,
    p_product_id,
    p_active,
    p_reason
  );
$$;

revoke execute on function public.admin_set_sales_challenge_product(uuid,uuid,boolean,text) from public, anon;
grant execute on function public.admin_set_sales_challenge_product(uuid,uuid,boolean,text) to authenticated;
revoke execute on function private.admin_set_sales_challenge_product_internal(uuid,uuid,boolean,text) from public, anon;
grant execute on function private.admin_set_sales_challenge_product_internal(uuid,uuid,boolean,text) to authenticated;
