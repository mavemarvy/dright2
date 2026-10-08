
create or replace function private.audit_sales_challenge_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge_id uuid;
  v_cycle_id uuid;
  v_target_id text;
  v_payload jsonb;
  v_row jsonb;
  v_parent_challenge uuid;
  v_parent_cycle uuid;
begin
  v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name='sales_challenges' then
    v_challenge_id := case when tg_op='DELETE' then null else new.id end;

  elsif tg_table_name in ('sales_challenge_tiers','sales_challenge_products') then
    if tg_op='DELETE' then
      select c.id into v_parent_challenge
      from public.sales_challenges c
      where c.id=old.challenge_id;
      v_challenge_id := v_parent_challenge;
    else
      v_challenge_id := new.challenge_id;
    end if;

  elsif tg_table_name='sales_challenge_cycles' then
    if tg_op='DELETE' then
      select c.id into v_parent_challenge
      from public.sales_challenges c
      where c.id=old.challenge_id;
      v_challenge_id := v_parent_challenge;
      v_cycle_id := null;
    else
      v_challenge_id := new.challenge_id;
      v_cycle_id := new.id;
    end if;

  elsif tg_table_name='sales_challenge_claims' then
    if tg_op='DELETE' then
      select cyc.id,cyc.challenge_id
      into v_parent_cycle,v_parent_challenge
      from public.sales_challenge_cycles cyc
      where cyc.id=old.challenge_cycle_id;
      v_cycle_id := v_parent_cycle;
      v_challenge_id := v_parent_challenge;
    else
      v_cycle_id := new.challenge_cycle_id;
      select cyc.challenge_id into v_challenge_id
      from public.sales_challenge_cycles cyc
      where cyc.id=new.challenge_cycle_id;
    end if;
  end if;

  v_target_id := v_row ->> 'id';
  v_payload := jsonb_build_object(
    'operation',tg_op,
    'old',case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    'new',case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    'deleted_challenge_id',case
      when tg_op='DELETE' and tg_table_name='sales_challenges' then old.id::text
      when tg_op='DELETE' and tg_table_name in ('sales_challenge_tiers','sales_challenge_products','sales_challenge_cycles') then old.challenge_id::text
      else null end,
    'deleted_cycle_id',case
      when tg_op='DELETE' and tg_table_name='sales_challenge_cycles' then old.id::text
      when tg_op='DELETE' and tg_table_name='sales_challenge_claims' then old.challenge_cycle_id::text
      else null end
  );

  perform private.sales_challenge_log(
    v_challenge_id,v_cycle_id,
    upper(tg_table_name)||'_'||tg_op,
    tg_table_name,v_target_id,v_payload,(select auth.uid())
  );

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.audit_sales_challenge_config() from public, anon, authenticated;
