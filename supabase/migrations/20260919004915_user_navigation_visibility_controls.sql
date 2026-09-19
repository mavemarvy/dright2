
create table if not exists public.user_navigation_visibility (
  feature_key text primary key,
  label text not null,
  route text not null,
  nav_group text not null,
  visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.users(id) on delete set null
);

comment on table public.user_navigation_visibility is
  'Global DRIGHT2 user-navigation visibility registry. Hidden items remain available to authorized admins but are removed/blocked for ordinary users.';

create index if not exists idx_user_navigation_visibility_group_order
  on public.user_navigation_visibility(nav_group, sort_order);

insert into public.user_navigation_visibility (feature_key, label, route, nav_group, visible, sort_order)
values
  ('dashboard', 'Dashboard', '/', 'Dashboard', true, 10),
  ('market', 'Market', '/market', 'Dashboard', true, 20),
  ('social', 'Social', '/social', 'Dashboard', true, 30),
  ('news', 'News', '/news', 'Dashboard', true, 40),
  ('promote', 'Promote', '/promote', 'Dashboard', true, 50),

  ('profile', 'Profile', '/profile', 'Profile', true, 60),
  ('wallet', 'Wallet', '/wallet', 'Profile', true, 70),
  ('my_orders', 'My Orders', '/my-orders', 'Profile', true, 80),
  ('saved_items', 'Saved Items', '/wishlist', 'Profile', true, 90),
  ('messages', 'Messages', '/chat', 'Profile', true, 100),

  ('my_store', 'My Store', '/store', 'My Store', true, 110),
  ('post_ad', 'Post Ad', '/upload-product', 'My Store', true, 120),
  ('my_drafts', 'My Drafts', '/drafts', 'My Store', true, 130),
  ('sales', 'Sales', '/sales', 'My Store', true, 140),
  ('job_board', 'Job Board', '/jobs', 'My Store', true, 150),

  ('refer', 'Refer', '/refer', 'Refer', true, 160),
  ('campaigns', 'Campaigns', '/campaigns', 'Refer', true, 170),
  ('creator_campaigns', 'Creator Campaigns', '/creator-campaigns', 'Refer', true, 180),
  ('rewards', 'Rewards', '/rewards', 'Refer', true, 190),

  ('communities', 'Communities', '/communities', 'Activity Feed', true, 200),
  ('notifications', 'Notifications', '/notifications', 'Activity Feed', true, 210),
  ('activity_feed', 'Activity Feed', '/activity', 'Activity Feed', true, 220),
  ('challenges', 'Challenges', '/challenges', 'Activity Feed', true, 230),
  ('announcements', 'Announcements', '/announcements', 'Activity Feed', true, 240),

  ('help_support', 'Help & Support', '/help', 'Help & Support', true, 250),
  ('tutorials', 'Tutorials', '/tutorials', 'Help & Support', true, 260),
  ('terms_policies', 'Terms & Policies', '/legal', 'Help & Support', true, 270),
  ('settings', 'Settings', '/settings', 'Help & Support', true, 280)
on conflict (feature_key) do update
set label = excluded.label,
    route = excluded.route,
    nav_group = excluded.nav_group,
    sort_order = excluded.sort_order;

alter table public.user_navigation_visibility enable row level security;

drop policy if exists user_navigation_visibility_read on public.user_navigation_visibility;
create policy user_navigation_visibility_read
on public.user_navigation_visibility
for select
to anon, authenticated
using (true);

create or replace function public.set_user_navigation_visibility(
  p_feature_key text,
  p_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.user_navigation_visibility%rowtype;
  v_previous boolean;
begin
  if auth.uid() is null or not public.has_dright_permission('site_settings', 'manage') then
    raise exception 'insufficient_privilege'
      using errcode = '42501';
  end if;

  select visible
    into v_previous
  from public.user_navigation_visibility
  where feature_key = p_feature_key;

  if not found then
    raise exception 'Unknown navigation feature: %', p_feature_key
      using errcode = '22023';
  end if;

  update public.user_navigation_visibility
  set visible = p_visible,
      updated_at = now(),
      updated_by = auth.uid()
  where feature_key = p_feature_key
  returning * into v_row;

  if v_previous is distinct from p_visible then
    perform public.log_admin_activity(
      'user_navigation_visibility_changed',
      'user_navigation_visibility',
      p_feature_key,
      jsonb_build_object(
        'label', v_row.label,
        'route', v_row.route,
        'nav_group', v_row.nav_group,
        'previous_visible', v_previous,
        'visible', p_visible
      )
    );
  end if;

  return jsonb_build_object(
    'feature_key', v_row.feature_key,
    'label', v_row.label,
    'route', v_row.route,
    'nav_group', v_row.nav_group,
    'visible', v_row.visible,
    'updated_at', v_row.updated_at,
    'updated_by', v_row.updated_by
  );
end;
$$;

revoke all on function public.set_user_navigation_visibility(text, boolean) from public;
grant execute on function public.set_user_navigation_visibility(text, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_navigation_visibility'
  ) then
    alter publication supabase_realtime add table public.user_navigation_visibility;
  end if;
end $$;
