
-- Authorization helper used by RLS and transactional admin functions.
create or replace function private.sales_challenge_admin_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and coalesce(u.is_admin,false) = true
      and lower(coalesce(u.admin_status,'')) = 'active'
      and (u.admin_verification_status is null or lower(u.admin_verification_status) = 'approved')
  );
$$;

revoke all on function private.sales_challenge_admin_allowed() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.sales_challenge_admin_allowed() to authenticated;

create or replace function private.sales_challenge_log(
  p_challenge_id uuid,
  p_cycle_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id text,
  p_details jsonb,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sales_challenge_audit_logs(
    challenge_id, challenge_cycle_id, actor_id, event_type, target_type, target_id, details
  ) values (
    p_challenge_id, p_cycle_id, coalesce(p_actor_id,(select auth.uid())),
    p_event_type, p_target_type, p_target_id, coalesce(p_details,'{}'::jsonb)
  );
end;
$$;
revoke all on function private.sales_challenge_log(uuid,uuid,text,text,text,jsonb,uuid) from public, anon, authenticated;

-- Sync public-safe leaderboard rows from participant data.
create or replace function private.sync_sales_challenge_leaderboard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_avatar text;
begin
  if tg_op = 'DELETE' then
    delete from public.sales_challenge_leaderboard_rows
    where challenge_cycle_id=old.challenge_cycle_id and user_id=old.user_id;
    return old;
  end if;

  select coalesce(nullif(u.full_name,''), nullif(u.username,''), 'DRIGHT Affiliate'), u.avatar_url
  into v_name, v_avatar
  from public.users u
  where u.id=new.user_id;

  insert into public.sales_challenge_leaderboard_rows(
    challenge_cycle_id,user_id,display_name,avatar_url,lifetime_qualified_sales,joined_at,updated_at
  ) values (
    new.challenge_cycle_id,new.user_id,coalesce(v_name,'DRIGHT Affiliate'),v_avatar,
    new.lifetime_qualified_sales,new.joined_at,now()
  )
  on conflict(challenge_cycle_id,user_id) do update set
    display_name=excluded.display_name,
    avatar_url=excluded.avatar_url,
    lifetime_qualified_sales=excluded.lifetime_qualified_sales,
    joined_at=excluded.joined_at,
    updated_at=now();

  return new;
end;
$$;
revoke all on function private.sync_sales_challenge_leaderboard() from public, anon, authenticated;

drop trigger if exists trg_sync_sales_challenge_leaderboard on public.sales_challenge_participants;
create trigger trg_sync_sales_challenge_leaderboard
after insert or update or delete on public.sales_challenge_participants
for each row execute function private.sync_sales_challenge_leaderboard();

-- Config/audit trigger. It records challenge/tier/product changes at DB level.
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
begin
  if tg_table_name='sales_challenges' then
    v_challenge_id := case when tg_op='DELETE' then old.id else new.id end;
  elsif tg_table_name in ('sales_challenge_tiers','sales_challenge_products') then
    v_challenge_id := case when tg_op='DELETE' then old.challenge_id else new.challenge_id end;
  elsif tg_table_name='sales_challenge_cycles' then
    v_challenge_id := case when tg_op='DELETE' then old.challenge_id else new.challenge_id end;
    v_cycle_id := case when tg_op='DELETE' then old.id else new.id end;
  elsif tg_table_name='sales_challenge_claims' then
    v_cycle_id := case when tg_op='DELETE' then old.challenge_cycle_id else new.challenge_cycle_id end;
    select c.challenge_id into v_challenge_id from public.sales_challenge_cycles c where c.id=v_cycle_id;
  end if;

  v_target_id := (case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'id');
  v_payload := jsonb_build_object(
    'operation',tg_op,
    'old',case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    'new',case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  perform private.sales_challenge_log(
    v_challenge_id,v_cycle_id,
    upper(tg_table_name)||'_'||tg_op,
    tg_table_name,v_target_id,v_payload,(select auth.uid())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.audit_sales_challenge_config() from public, anon, authenticated;

drop trigger if exists trg_audit_sales_challenges on public.sales_challenges;
create trigger trg_audit_sales_challenges
after insert or update or delete on public.sales_challenges
for each row execute function private.audit_sales_challenge_config();

drop trigger if exists trg_audit_sales_challenge_tiers on public.sales_challenge_tiers;
create trigger trg_audit_sales_challenge_tiers
after insert or update or delete on public.sales_challenge_tiers
for each row execute function private.audit_sales_challenge_config();

drop trigger if exists trg_audit_sales_challenge_products on public.sales_challenge_products;
create trigger trg_audit_sales_challenge_products
after insert or update or delete on public.sales_challenge_products
for each row execute function private.audit_sales_challenge_config();

drop trigger if exists trg_audit_sales_challenge_cycles on public.sales_challenge_cycles;
create trigger trg_audit_sales_challenge_cycles
after insert or update or delete on public.sales_challenge_cycles
for each row execute function private.audit_sales_challenge_config();

drop trigger if exists trg_audit_sales_challenge_claims on public.sales_challenge_claims;
create trigger trg_audit_sales_challenge_claims
after insert or update or delete on public.sales_challenge_claims
for each row execute function private.audit_sales_challenge_config();
