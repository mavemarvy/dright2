
create or replace function private.reverse_sales_challenge_source(
  p_source_kind text,
  p_source_id uuid,
  p_reason text,
  p_refund_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ledger public.sales_challenge_sales_ledger%rowtype;
  v_participant public.sales_challenge_participants%rowtype;
  v_has_claim boolean;
  v_target integer;
begin
  if p_source_id is null then return; end if;

  for v_ledger in
    select *
    from public.sales_challenge_sales_ledger
    where source_kind=upper(p_source_kind)
      and source_reference=p_source_id::text
      and qualification_status='COUNTED'
    for update
  loop
    select exists(
      select 1 from public.sales_challenge_claims cl
      where cl.challenge_cycle_id=v_ledger.challenge_cycle_id
        and cl.user_id=v_ledger.user_id
        and cl.cycle_tier_id=v_ledger.applied_cycle_tier_id
        and cl.status <> 'REJECTED'
    ) into v_has_claim;

    select * into v_participant
    from public.sales_challenge_participants
    where challenge_cycle_id=v_ledger.challenge_cycle_id and user_id=v_ledger.user_id
    for update;

    if v_has_claim and v_ledger.applied_to_mission then
      update public.sales_challenge_sales_ledger
      set qualification_status='REVERSED_AFTER_CLAIM',
          reversed_at=now(),
          refund_id=coalesce(p_refund_id,refund_id),
          reversal_reason=coalesce(p_reason,'Sale reversed after claim'),
          reversal_metadata=coalesce(reversal_metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb)
      where id=v_ledger.id;

      update public.sales_challenge_participants
      set lifetime_qualified_sales=greatest(0,lifetime_qualified_sales-1)
      where id=v_participant.id;

      update public.sales_challenge_claims
      set needs_review=true,
          review_reason=coalesce(review_reason,'A qualifying sale used for this claimed mission was later reversed/refunded.')
      where challenge_cycle_id=v_ledger.challenge_cycle_id
        and user_id=v_ledger.user_id
        and cycle_tier_id=v_ledger.applied_cycle_tier_id;

      perform private.sales_challenge_log(
        (select c.challenge_id from public.sales_challenge_cycles c where c.id=v_ledger.challenge_cycle_id),
        v_ledger.challenge_cycle_id,
        'SALE_REVERSED_AFTER_CLAIM','ledger',v_ledger.id::text,
        jsonb_build_object('source_kind',v_ledger.source_kind,'source_reference',v_ledger.source_reference,'reason',p_reason),
        null
      );
    else
      update public.sales_challenge_sales_ledger
      set qualification_status='REVERSED',
          reversed_at=now(),
          refund_id=coalesce(p_refund_id,refund_id),
          reversal_reason=coalesce(p_reason,'Sale reversed'),
          reversal_metadata=coalesce(reversal_metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb)
      where id=v_ledger.id;

      if v_participant.id is not null then
        if v_ledger.applied_to_mission
           and v_participant.status='ACTIVE'
           and v_participant.current_cycle_tier_id is not distinct from v_ledger.applied_cycle_tier_id then
          select sales_required into v_target
          from public.sales_challenge_cycle_tiers
          where id=v_participant.current_cycle_tier_id;

          update public.sales_challenge_participants
          set current_tier_sales=greatest(0,current_tier_sales-1),
              lifetime_qualified_sales=greatest(0,lifetime_qualified_sales-1),
              mission_completed_at=case
                when greatest(0,current_tier_sales-1) < coalesce(v_target,2147483647) then null
                else mission_completed_at end
          where id=v_participant.id;
        else
          update public.sales_challenge_participants
          set lifetime_qualified_sales=greatest(0,lifetime_qualified_sales-1)
          where id=v_participant.id;
        end if;
      end if;
    end if;
  end loop;
end;
$$;
revoke all on function private.reverse_sales_challenge_source(text,uuid,text,uuid,jsonb) from public, anon, authenticated;

-- Existing production order integration.
create or replace function private.sales_challenge_orders_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status='COMPLETED'
     and new.referrer_id is not null
     and (lower(coalesce(new.source_type,''))='affiliate' or lower(coalesce(new.referrer_role,''))='affiliate')
     and coalesce(new.affiliate_commission_amount,0)>0 then
    perform private.apply_sales_challenge_sale(
      'ORDER',new.id,new.product_id,new.referrer_id,new.buyer_id,new.seller_id,
      coalesce(new.final_price,new.base_price,0),new.affiliate_commission_amount,
      coalesce(new.completed_at,new.created_at,now()),
      jsonb_build_object(
        'source_type',new.source_type,'source_level',new.source_level,
        'tracking_code',new.tracking_code,'referral_link_id',new.referral_link_id,
        'campaign_id',new.campaign_id
      )
    );
  end if;

  if tg_op='UPDATE'
     and old.status='COMPLETED'
     and new.status='CANCELLED' then
    perform private.reverse_sales_challenge_source(
      'ORDER',new.id,'Marketplace order cancelled',null,
      jsonb_build_object('old_status',old.status,'new_status',new.status)
    );
  end if;

  return new;
end;
$$;
revoke all on function private.sales_challenge_orders_trigger() from public, anon, authenticated;

drop trigger if exists trg_sales_challenge_orders on public.orders;
create trigger trg_sales_challenge_orders
after insert or update of status, affiliate_commission_amount, referrer_id, referrer_role, source_type, final_price, completed_at
on public.orders
for each row execute function private.sales_challenge_orders_trigger();

create or replace function private.sales_challenge_guest_orders_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status='success'
     and new.processed_at is not null
     and new.referrer_id is not null
     and lower(coalesce(new.source_type,''))='affiliate'
     and coalesce(new.affiliate_commission_amount,0)>0 then
    perform private.apply_sales_challenge_sale(
      'GUEST_ORDER',new.id,new.product_id,new.referrer_id,null,new.seller_id,
      coalesce(new.total_amount,new.base_price,0),new.affiliate_commission_amount,
      coalesce(new.paid_at,new.processed_at,new.created_at,now()),
      jsonb_build_object(
        'tracking_code',new.tracking_code,'referral_link_id',new.referral_link_id,
        'payment_reference',new.payment_reference,'guest_checkout',true
      )
    );
  end if;

  if tg_op='UPDATE'
     and old.payment_status='success'
     and lower(coalesce(new.payment_status,'')) in ('refunded','reversed','cancelled','failed') then
    perform private.reverse_sales_challenge_source(
      'GUEST_ORDER',new.id,'Guest order payment reversed',null,
      jsonb_build_object('old_payment_status',old.payment_status,'new_payment_status',new.payment_status)
    );
  end if;

  return new;
end;
$$;
revoke all on function private.sales_challenge_guest_orders_trigger() from public, anon, authenticated;

drop trigger if exists trg_sales_challenge_guest_orders on public.guest_orders;
