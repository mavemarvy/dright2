create table if not exists public.guided_tour_settings (
  singleton boolean primary key default true check (singleton),
  audience_mode text not null default 'new_users_only'
    check (audience_mode in ('new_users_only', 'all_users_test')),
  test_generation integer not null default 0 check (test_generation >= 0),
  new_user_rollout_at timestamptz not null default '2026-09-24 14:30:00+00',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.guided_tour_settings (
  singleton,
  audience_mode,
  test_generation,
  new_user_rollout_at
)
values (
  true,
  'new_users_only',
  0,
  '2026-09-24 14:30:00+00'
)
on conflict (singleton) do nothing;

alter table public.guided_tour_settings enable row level security;

drop policy if exists "Authenticated users can read guided tour rollout" on public.guided_tour_settings;
create policy "Authenticated users can read guided tour rollout"
  on public.guided_tour_settings
  for select
  to authenticated
  using (true);

grant select on public.guided_tour_settings to authenticated;
revoke insert, update, delete on public.guided_tour_settings from authenticated;

create or replace function public.set_guided_tour_test_mode(p_enabled boolean)
returns public.guided_tour_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_current public.guided_tour_settings%rowtype;
  v_result public.guided_tour_settings%rowtype;
begin
  if not public.has_dright_permission('site_settings', 'manage') then
    raise exception 'Insufficient permission to manage guided tour rollout'
      using errcode = '42501';
  end if;

  select *
  into v_current
  from public.guided_tour_settings
  where singleton = true
  for update;

  if v_current.singleton is null then
    insert into public.guided_tour_settings (
      singleton,
      audience_mode,
      test_generation,
      new_user_rollout_at,
      updated_at,
      updated_by
    )
    values (
      true,
      case when p_enabled then 'all_users_test' else 'new_users_only' end,
      case when p_enabled then 1 else 0 end,
      '2026-09-24 14:30:00+00',
      now(),
      auth.uid()
    )
    returning * into v_result;
  else
    update public.guided_tour_settings
    set
      audience_mode = case when p_enabled then 'all_users_test' else 'new_users_only' end,
      test_generation = case
        when p_enabled and v_current.audience_mode <> 'all_users_test'
          then v_current.test_generation + 1
        else v_current.test_generation
      end,
      updated_at = now(),
      updated_by = auth.uid()
    where singleton = true
    returning * into v_result;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.set_guided_tour_test_mode(boolean) from public;
grant execute on function public.set_guided_tour_test_mode(boolean) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'guided_tour_settings'
  ) then
    alter publication supabase_realtime add table public.guided_tour_settings;
  end if;
end
$$;

comment on table public.guided_tour_settings is
  'Singleton rollout control for user-side guided tours. Default is new users only; admin test mode can temporarily include all signed-in users.';
comment on function public.set_guided_tour_test_mode(boolean) is
  'Admin-only site settings control. Enabling starts a new all-user guided-tour test generation.';
