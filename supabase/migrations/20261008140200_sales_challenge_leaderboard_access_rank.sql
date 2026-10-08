
-- Leaderboard completeness: admins can inspect rankings even when public leaderboard is disabled,
-- and participants can get their exact position without downloading the full ranking.
drop policy if exists "sales_challenge_leaderboard_admin_read" on public.sales_challenge_leaderboard_rows;
create policy "sales_challenge_leaderboard_admin_read"
on public.sales_challenge_leaderboard_rows for select
to authenticated
using ((select private.sales_challenge_admin_allowed()));

create or replace function public.get_sales_challenge_my_rank(p_cycle_id uuid)
returns integer
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_sales integer;
  v_joined_at timestamptz;
  v_rank integer;
begin
  if v_user_id is null then return null; end if;

  select r.lifetime_qualified_sales, r.joined_at
  into v_sales, v_joined_at
  from public.sales_challenge_leaderboard_rows r
  where r.challenge_cycle_id=p_cycle_id and r.user_id=v_user_id;

  if not found then return null; end if;

  select 1 + count(*)::integer
  into v_rank
  from public.sales_challenge_leaderboard_rows r
  where r.challenge_cycle_id=p_cycle_id
    and (
      r.lifetime_qualified_sales > v_sales
      or (
        r.lifetime_qualified_sales = v_sales
        and (
          r.joined_at < v_joined_at
          or (r.joined_at = v_joined_at and r.user_id < v_user_id)
        )
      )
    );

  return v_rank;
end;
$$;

revoke all on function public.get_sales_challenge_my_rank(uuid) from public, anon;
grant execute on function public.get_sales_challenge_my_rank(uuid) to authenticated;
