
create or replace function private.admin_stop_sales_challenge_internal(
  p_challenge_id uuid,
  p_reason text,
  p_archive boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle_id uuid;
begin
  if not private.sales_challenge_admin_allowed() then raise exception 'Admin permission required'; end if;

  select id into v_cycle_id
  from public.sales_challenge_cycles
  where challenge_id=p_challenge_id and status in ('SCHEDULED','ACTIVE')
  order by cycle_number desc
  limit 1
  for update;

  if v_cycle_id is not null then
    update public.sales_challenge_cycles
    set status=case when p_archive then 'ARCHIVED' else 'ENDED' end,
        ended_at=now(),reset_reason=coalesce(p_reason,'Stopped by admin')
    where id=v_cycle_id;

    update public.sales_challenge_participants
    set status=case when status='COMPLETED' then 'COMPLETED' else 'EXPIRED' end
    where challenge_cycle_id=v_cycle_id;
  end if;

  update public.sales_challenges
  set status=case when p_archive then 'ARCHIVED' else 'ENDED' end,
      archived_at=case when p_archive then now() else archived_at end
  where id=p_challenge_id;

  perform private.sales_challenge_log(
    p_challenge_id,v_cycle_id,
    case when p_archive then 'CHALLENGE_ARCHIVED' else 'CHALLENGE_STOPPED' end,
    'challenge',p_challenge_id::text,
    jsonb_build_object('reason',p_reason),(select auth.uid())
  );

  return jsonb_build_object('success',true,'cycle_id',v_cycle_id,'archived',p_archive);
end;
$$;
revoke all on function private.admin_stop_sales_challenge_internal(uuid,text,boolean) from public, anon;
grant execute on function private.admin_stop_sales_challenge_internal(uuid,text,boolean) to authenticated;

create or replace function public.admin_stop_sales_challenge(
  p_challenge_id uuid,
  p_reason text default null,
  p_archive boolean default false
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_stop_sales_challenge_internal(p_challenge_id,p_reason,p_archive);
$$;
revoke all on function public.admin_stop_sales_challenge(uuid,text,boolean) from public, anon;
grant execute on function public.admin_stop_sales_challenge(uuid,text,boolean) to authenticated;

-- Replace tier configuration atomically; active cycles keep their immutable snapshot.
create or replace function private.admin_replace_sales_challenge_tiers_internal(
  p_challenge_id uuid,
  p_tiers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_order integer := 0;
begin
  if not private.sales_challenge_admin_allowed() then raise exception 'Admin permission required'; end if;
  if jsonb_typeof(coalesce(p_tiers,'[]'::jsonb))<>'array' then raise exception 'Tiers must be an array'; end if;

  delete from public.sales_challenge_tiers where challenge_id=p_challenge_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_tiers,'[]'::jsonb))
  loop
    v_order := v_order + 1;
    insert into public.sales_challenge_tiers(
      challenge_id,sort_order,sales_required,reward_type,cash_reward,
      prize_name,prize_description,prize_estimated_cost,enabled
    ) values (
      p_challenge_id,
      coalesce((v_item->>'sort_order')::integer,v_order),
      greatest(1,coalesce((v_item->>'sales_required')::integer,1)),
      case when upper(coalesce(v_item->>'reward_type','CASH')) in ('CASH','PRIZE','CASH_OR_PRIZE')
        then upper(coalesce(v_item->>'reward_type','CASH')) else 'CASH' end,
      greatest(0,coalesce((v_item->>'cash_reward')::numeric,0)),
      nullif(v_item->>'prize_name',''),
      nullif(v_item->>'prize_description',''),
      greatest(0,coalesce((v_item->>'prize_estimated_cost')::numeric,0)),
      coalesce((v_item->>'enabled')::boolean,true)
    );
  end loop;

  perform private.sales_challenge_log(
    p_challenge_id,null,'TIERS_REPLACED','challenge',p_challenge_id::text,
    jsonb_build_object('tier_count',v_order),(select auth.uid())
  );

  return jsonb_build_object('success',true,'tier_count',v_order);
end;
$$;
revoke all on function private.admin_replace_sales_challenge_tiers_internal(uuid,jsonb) from public, anon;
grant execute on function private.admin_replace_sales_challenge_tiers_internal(uuid,jsonb) to authenticated;

create or replace function public.admin_replace_sales_challenge_tiers(
  p_challenge_id uuid,
  p_tiers jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_replace_sales_challenge_tiers_internal(p_challenge_id,p_tiers);
$$;
revoke all on function public.admin_replace_sales_challenge_tiers(uuid,jsonb) from public, anon;
grant execute on function public.admin_replace_sales_challenge_tiers(uuid,jsonb) to authenticated;
