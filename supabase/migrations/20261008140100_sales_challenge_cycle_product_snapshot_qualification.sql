
-- Count against the cycle's immutable product eligibility snapshot.
-- Changing the reusable challenge minimum price after a cycle starts must not rewrite that cycle.
create or replace function private.apply_sales_challenge_sale(
  p_source_kind text,
  p_source_id uuid,
  p_product_id uuid,
  p_affiliate_id uuid,
  p_buyer_id uuid,
  p_seller_id uuid,
  p_qualifying_amount numeric,
  p_affiliate_commission numeric,
  p_sale_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle record;
  v_participant public.sales_challenge_participants%rowtype;
  v_first_tier uuid;
  v_target integer;
  v_applied boolean;
  v_ledger_id uuid;
  v_source_ref text := p_source_id::text;
  v_sale_at timestamptz := coalesce(p_sale_at,now());
begin
  if p_source_id is null or p_product_id is null or p_affiliate_id is null then return; end if;
  if p_affiliate_id is not distinct from p_buyer_id or p_affiliate_id is not distinct from p_seller_id then return; end if;
  if coalesce(p_qualifying_amount,0) <= 0 or coalesce(p_affiliate_commission,0) <= 0 then return; end if;
  if upper(coalesce(p_source_kind,'')) not in ('ORDER','GUEST_ORDER') then return; end if;

  for v_cycle in
    select cyc.id as cycle_id, cyc.challenge_id
    from public.sales_challenge_cycles cyc
    join public.sales_challenges ch on ch.id=cyc.challenge_id
    join public.sales_challenge_cycle_products cp
      on cp.challenge_cycle_id=cyc.id and cp.product_id=p_product_id
    where cyc.status in ('SCHEDULED','ACTIVE')
      and ch.status <> 'ARCHIVED'
      and v_sale_at >= cyc.starts_at
      and v_sale_at < cyc.ends_at
      and cp.active=true
      and cp.meets_minimum_product_price=true
  loop
    v_ledger_id := null;

    insert into public.sales_challenge_sales_ledger(
      challenge_cycle_id,user_id,affiliate_id,order_id,guest_order_id,
      source_kind,source_reference,product_id,qualifying_amount,
      affiliate_commission_amount,counted_at,qualification_status,source_metadata
    ) values (
      v_cycle.cycle_id,p_affiliate_id,p_affiliate_id,
      case when upper(p_source_kind)='ORDER' then p_source_id else null end,
      case when upper(p_source_kind)='GUEST_ORDER' then p_source_id else null end,
      upper(p_source_kind),v_source_ref,p_product_id,
      greatest(0,coalesce(p_qualifying_amount,0)),
      greatest(0,coalesce(p_affiliate_commission,0)),
      v_sale_at,'COUNTED',coalesce(p_metadata,'{}'::jsonb)
    )
    on conflict(challenge_cycle_id,source_kind,source_reference) do nothing
    returning id into v_ledger_id;

    if v_ledger_id is null then
      continue;
    end if;

    select ct.id into v_first_tier
    from public.sales_challenge_cycle_tiers ct
    where ct.challenge_cycle_id=v_cycle.cycle_id and ct.enabled=true
    order by ct.sort_order
    limit 1;

    if v_first_tier is null then
      update public.sales_challenge_sales_ledger
      set qualification_status='FLAGGED',
          reversal_reason='No enabled tier existed when sale was processed'
      where id=v_ledger_id;
      continue;
    end if;

    insert into public.sales_challenge_participants(
      challenge_cycle_id,user_id,current_cycle_tier_id,current_tier_sales,lifetime_qualified_sales,status
    ) values (
      v_cycle.cycle_id,p_affiliate_id,v_first_tier,0,0,'ACTIVE'
    )
    on conflict(challenge_cycle_id,user_id) do nothing;

    select * into v_participant
    from public.sales_challenge_participants
    where challenge_cycle_id=v_cycle.cycle_id and user_id=p_affiliate_id
    for update;

    v_applied := false;
    v_target := null;

    if v_participant.status='ACTIVE' and v_participant.current_cycle_tier_id is not null then
      select sales_required into v_target
      from public.sales_challenge_cycle_tiers
      where id=v_participant.current_cycle_tier_id and enabled=true;

      if v_target is not null and v_participant.current_tier_sales < v_target then
        v_applied := true;
        update public.sales_challenge_participants
        set current_tier_sales = least(v_target, current_tier_sales + 1),
            lifetime_qualified_sales = lifetime_qualified_sales + 1,
            mission_completed_at = case
              when current_tier_sales + 1 >= v_target then coalesce(mission_completed_at,now())
              else mission_completed_at end
        where id=v_participant.id;
      else
        update public.sales_challenge_participants
        set lifetime_qualified_sales=lifetime_qualified_sales+1
        where id=v_participant.id;
      end if;
    else
      update public.sales_challenge_participants
      set lifetime_qualified_sales=lifetime_qualified_sales+1
      where id=v_participant.id;
    end if;

    update public.sales_challenge_sales_ledger
    set applied_cycle_tier_id=case when v_applied then v_participant.current_cycle_tier_id else null end,
        applied_to_mission=v_applied
    where id=v_ledger_id;
  end loop;
end;
$$;

revoke all on function private.apply_sales_challenge_sale(text,uuid,uuid,uuid,uuid,uuid,numeric,numeric,timestamptz,jsonb)
from public, anon, authenticated;
