
create trigger trg_sales_challenge_guest_orders
after insert or update of payment_status, processed_at, affiliate_commission_amount, referrer_id, source_type
on public.guest_orders
for each row execute function private.sales_challenge_guest_orders_trigger();

create or replace function private.sales_challenge_refunds_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_id is not null
     and lower(coalesce(new.status,'')) in ('completed','processed','refunded','success')
     and (
       tg_op='INSERT'
       or old.status is distinct from new.status
       or old.financial_processed_at is distinct from new.financial_processed_at
     ) then
    perform private.reverse_sales_challenge_source(
      'ORDER',new.order_id,coalesce(new.reason,'Marketplace refund completed'),new.id,
      jsonb_build_object('refund_number',new.refund_number,'refund_status',new.status,'amount',new.amount,'currency',new.currency)
    );
  end if;
  return new;
end;
$$;
revoke all on function private.sales_challenge_refunds_trigger() from public, anon, authenticated;

drop trigger if exists trg_sales_challenge_refunds on public.refund_records;
create trigger trg_sales_challenge_refunds
after insert or update of status, financial_processed_at
on public.refund_records
for each row execute function private.sales_challenge_refunds_trigger();

-- User claim transaction.
create or replace function private.claim_sales_challenge_reward_internal(
  p_cycle_id uuid,
  p_reward_choice text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.sales_challenge_participants%rowtype;
  v_cycle public.sales_challenge_cycles%rowtype;
  v_challenge public.sales_challenges%rowtype;
  v_tier public.sales_challenge_cycle_tiers%rowtype;
  v_next_tier uuid;
  v_choice text;
  v_claim_id uuid;
begin
  if p_user_id is null or p_user_id is distinct from (select auth.uid()) then
    raise exception 'Unauthorized claim request';
  end if;

  select * into v_cycle from public.sales_challenge_cycles where id=p_cycle_id;
  if not found then raise exception 'Challenge cycle not found'; end if;

  select * into v_challenge from public.sales_challenges where id=v_cycle.challenge_id;
  if not found then raise exception 'Challenge not found'; end if;

  if not v_challenge.claims_enabled then raise exception 'Claims are currently disabled'; end if;
  if now() < v_cycle.starts_at or now() >= v_cycle.ends_at or v_cycle.status not in ('SCHEDULED','ACTIVE') then
    raise exception 'This challenge cycle is not accepting claims';
  end if;

  select * into v_participant
  from public.sales_challenge_participants
  where challenge_cycle_id=p_cycle_id and user_id=p_user_id
  for update;

  if not found or v_participant.status<>'ACTIVE' or v_participant.current_cycle_tier_id is null then
    raise exception 'No active mission is available to claim';
  end if;

  select * into v_tier
  from public.sales_challenge_cycle_tiers
  where id=v_participant.current_cycle_tier_id and enabled=true;

  if not found then raise exception 'Current mission tier is unavailable'; end if;
  if v_participant.current_tier_sales < v_tier.sales_required then
    raise exception 'Current mission is not complete';
  end if;

  if exists(
    select 1 from public.sales_challenge_claims
    where user_id=p_user_id and challenge_cycle_id=p_cycle_id and cycle_tier_id=v_tier.id
  ) then
    raise exception 'This mission reward has already been claimed';
  end if;

  v_choice := case
    when v_tier.reward_type='CASH' then 'CASH'
    when v_tier.reward_type='PRIZE' then 'PRIZE'
    else upper(coalesce(p_reward_choice,''))
  end;

  if v_tier.reward_type='CASH_OR_PRIZE' and v_choice not in ('CASH','PRIZE') then
    raise exception 'Choose CASH or PRIZE for this reward';
  end if;

  insert into public.sales_challenge_claims(
    challenge_cycle_id,user_id,cycle_tier_id,source_tier_id,
    sales_target_snapshot,reward_type_snapshot,reward_choice,
    cash_amount_snapshot,prize_name_snapshot,prize_description_snapshot,
    prize_estimated_cost_snapshot,status,payout_status,claimed_at,approved_at
  ) values (
    p_cycle_id,p_user_id,v_tier.id,v_tier.source_tier_id,
    v_tier.sales_required,v_tier.reward_type,v_choice,
    case when v_choice='CASH' then v_tier.cash_reward else 0 end,
    v_tier.prize_name,v_tier.prize_description,v_tier.prize_estimated_cost,
    'APPROVED',case when v_choice='CASH' then 'PENDING' else 'PENDING' end,
    now(),now()
  )
  returning id into v_claim_id;

  select ct.id into v_next_tier
  from public.sales_challenge_cycle_tiers ct
  where ct.challenge_cycle_id=p_cycle_id
    and ct.enabled=true
    and ct.sort_order>v_tier.sort_order
  order by ct.sort_order
  limit 1;

  if v_next_tier is null then
    update public.sales_challenge_participants
    set current_cycle_tier_id=null,current_tier_sales=0,status='COMPLETED',
        mission_completed_at=null,completed_at=now()
    where id=v_participant.id;
  else
    update public.sales_challenge_participants
    set current_cycle_tier_id=v_next_tier,current_tier_sales=0,status='ACTIVE',
        mission_completed_at=null
    where id=v_participant.id;
  end if;

  perform private.sales_challenge_log(
    v_challenge.id,p_cycle_id,'REWARD_CLAIM_VALIDATED','claim',v_claim_id::text,
    jsonb_build_object('tier_id',v_tier.id,'sales_target',v_tier.sales_required,'reward_choice',v_choice),
    p_user_id
  );

  return jsonb_build_object(
    'success',true,'claim_id',v_claim_id,'reward_choice',v_choice,
    'next_tier_id',v_next_tier,'completed_all_missions',(v_next_tier is null)
  );
exception
  when unique_violation then
    raise exception 'This mission reward has already been claimed';
end;
$$;
revoke all on function private.claim_sales_challenge_reward_internal(uuid,text,uuid) from public, anon;
grant execute on function private.claim_sales_challenge_reward_internal(uuid,text,uuid) to authenticated;

create or replace function public.claim_sales_challenge_reward(
  p_cycle_id uuid,
  p_reward_choice text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.claim_sales_challenge_reward_internal(
    p_cycle_id,p_reward_choice,(select auth.uid())
  );
$$;
revoke all on function public.claim_sales_challenge_reward(uuid,text) from public, anon;
grant execute on function public.claim_sales_challenge_reward(uuid,text) to authenticated;
