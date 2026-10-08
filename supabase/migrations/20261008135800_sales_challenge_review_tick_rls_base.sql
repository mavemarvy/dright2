
-- Admin claim review/payout tracking. It intentionally does not move money automatically.
create or replace function private.admin_review_sales_challenge_claim_internal(
  p_claim_id uuid,
  p_action text,
  p_notes text,
  p_payment_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.sales_challenge_claims%rowtype;
  v_action text := upper(coalesce(p_action,''));
  v_challenge_id uuid;
begin
  if not private.sales_challenge_admin_allowed() then raise exception 'Admin permission required'; end if;

  select * into v_claim from public.sales_challenge_claims where id=p_claim_id for update;
  if not found then raise exception 'Claim not found'; end if;

  if v_action='APPROVE' then
    update public.sales_challenge_claims
    set status='APPROVED',payout_status='PENDING',approved_at=coalesce(approved_at,now()),
        reviewed_by=(select auth.uid()),review_notes=p_notes,needs_review=false,review_reason=null
    where id=p_claim_id;
  elsif v_action='PAY' then
    if v_claim.reward_choice<>'CASH' then raise exception 'Only cash rewards can be marked paid'; end if;
    update public.sales_challenge_claims
    set status='PAID',payout_status='PAID',paid_at=now(),reviewed_by=(select auth.uid()),
        review_notes=p_notes,payment_reference=coalesce(p_payment_reference,payment_reference),
        needs_review=false,review_reason=null
    where id=p_claim_id;
  elsif v_action='FULFILL' then
    if v_claim.reward_choice<>'PRIZE' then raise exception 'Only prize rewards can be marked fulfilled'; end if;
    update public.sales_challenge_claims
    set status='FULFILLED',payout_status='FULFILLED',paid_at=now(),reviewed_by=(select auth.uid()),
        review_notes=p_notes,payment_reference=coalesce(p_payment_reference,payment_reference),
        needs_review=false,review_reason=null
    where id=p_claim_id;
  elsif v_action='FLAG' then
    update public.sales_challenge_claims
    set needs_review=true,review_reason=coalesce(p_notes,'Flagged for admin review'),reviewed_by=(select auth.uid())
    where id=p_claim_id;
  elsif v_action='REJECT' then
    update public.sales_challenge_claims
    set status='REJECTED',payout_status='REJECTED',reviewed_by=(select auth.uid()),
        review_notes=p_notes,needs_review=false
    where id=p_claim_id;
  else
    raise exception 'Unsupported claim action';
  end if;

  select cyc.challenge_id into v_challenge_id
  from public.sales_challenge_cycles cyc where cyc.id=v_claim.challenge_cycle_id;

  perform private.sales_challenge_log(
    v_challenge_id,v_claim.challenge_cycle_id,'CLAIM_'||v_action,'claim',p_claim_id::text,
    jsonb_build_object('notes',p_notes,'payment_reference',p_payment_reference),(select auth.uid())
  );

  return jsonb_build_object('success',true,'claim_id',p_claim_id,'action',v_action);
end;
$$;
revoke all on function private.admin_review_sales_challenge_claim_internal(uuid,text,text,text) from public, anon;
grant execute on function private.admin_review_sales_challenge_claim_internal(uuid,text,text,text) to authenticated;

create or replace function public.admin_review_sales_challenge_claim(
  p_claim_id uuid,
  p_action text,
  p_notes text default null,
  p_payment_reference text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_review_sales_challenge_claim_internal(p_claim_id,p_action,p_notes,p_payment_reference);
$$;
revoke all on function public.admin_review_sales_challenge_claim(uuid,text,text,text) from public, anon;
grant execute on function public.admin_review_sales_challenge_claim(uuid,text,text,text) to authenticated;

-- Exact-time enforcement always comes from starts_at/ends_at checks in sale/claim logic.
-- This tick only keeps visible statuses aligned and freezes expired participant state.
create or replace function private.sales_challenge_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle record;
begin
  for v_cycle in
    select id,challenge_id
    from public.sales_challenge_cycles
    where status='SCHEDULED' and starts_at<=now() and ends_at>now()
    for update
  loop
    update public.sales_challenge_cycles set status='ACTIVE' where id=v_cycle.id;
    update public.sales_challenges set status='ACTIVE' where id=v_cycle.challenge_id and status<>'ARCHIVED';
  end loop;

  for v_cycle in
    select id,challenge_id
    from public.sales_challenge_cycles
    where status in ('SCHEDULED','ACTIVE') and ends_at<=now()
    for update
  loop
    update public.sales_challenge_cycles set status='ENDED',ended_at=coalesce(ended_at,ends_at) where id=v_cycle.id;
    update public.sales_challenge_participants
      set status=case when status='COMPLETED' then 'COMPLETED' else 'EXPIRED' end
      where challenge_cycle_id=v_cycle.id;
    update public.sales_challenges
      set status='ENDED'
      where id=v_cycle.challenge_id and status<>'ARCHIVED'
        and not exists(
          select 1 from public.sales_challenge_cycles c2
          where c2.challenge_id=v_cycle.challenge_id and c2.status in ('SCHEDULED','ACTIVE')
        );
  end loop;
end;
$$;
revoke all on function private.sales_challenge_tick() from public, anon, authenticated;

-- RLS: all exposed tables are explicitly protected.
alter table public.sales_challenges enable row level security;
alter table public.sales_challenge_tiers enable row level security;
alter table public.sales_challenge_products enable row level security;
alter table public.sales_challenge_cycles enable row level security;
alter table public.sales_challenge_cycle_tiers enable row level security;
alter table public.sales_challenge_cycle_products enable row level security;
alter table public.sales_challenge_participants enable row level security;
alter table public.sales_challenge_sales_ledger enable row level security;
alter table public.sales_challenge_claims enable row level security;
alter table public.sales_challenge_audit_logs enable row level security;
alter table public.sales_challenge_leaderboard_rows enable row level security;

-- Revoke implicit client write access first, then grant only what each surface needs.
revoke all on table public.sales_challenges from anon, authenticated;
revoke all on table public.sales_challenge_tiers from anon, authenticated;
revoke all on table public.sales_challenge_products from anon, authenticated;
revoke all on table public.sales_challenge_cycles from anon, authenticated;
revoke all on table public.sales_challenge_cycle_tiers from anon, authenticated;
revoke all on table public.sales_challenge_cycle_products from anon, authenticated;
revoke all on table public.sales_challenge_participants from anon, authenticated;
revoke all on table public.sales_challenge_sales_ledger from anon, authenticated;
revoke all on table public.sales_challenge_claims from anon, authenticated;
revoke all on table public.sales_challenge_audit_logs from anon, authenticated;
revoke all on table public.sales_challenge_leaderboard_rows from anon, authenticated;

grant select on table public.sales_challenges to anon, authenticated;
grant select on table public.sales_challenge_tiers to anon, authenticated;
grant select on table public.sales_challenge_cycles to anon, authenticated;
grant select on table public.sales_challenge_cycle_tiers to anon, authenticated;
grant select on table public.sales_challenge_cycle_products to anon, authenticated;
