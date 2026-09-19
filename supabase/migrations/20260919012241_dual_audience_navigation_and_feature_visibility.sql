
alter table public.user_navigation_visibility
  add column if not exists visible_to_admins boolean not null default true,
  add column if not exists feature_scope text not null default 'navigation';

alter table public.user_navigation_visibility
  drop constraint if exists user_navigation_visibility_feature_scope_check;

alter table public.user_navigation_visibility
  add constraint user_navigation_visibility_feature_scope_check
  check (feature_scope in ('navigation','component','feature'));

update public.user_navigation_visibility
set visible_to_admins = true
where visible_to_admins is null;

insert into public.user_navigation_visibility
  (feature_key,label,route,nav_group,visible,visible_to_admins,feature_scope,sort_order)
values
  ('interface_options','Interface Options','component:interface-options','Interface & Feature Controls',true,true,'component',290),
  ('sales_team_features','Sales Team Features','feature:sales-team','Interface & Feature Controls',true,true,'feature',300)
on conflict (feature_key) do update
set label=excluded.label,
    route=excluded.route,
    nav_group=excluded.nav_group,
    feature_scope=excluded.feature_scope,
    sort_order=excluded.sort_order;

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
  if auth.uid() is null or not public.has_dright_permission('site_settings','manage') then
    raise exception 'insufficient_privilege' using errcode='42501';
  end if;

  select visible into v_previous
  from public.user_navigation_visibility
  where feature_key=p_feature_key;

  if not found then
    raise exception 'Unknown navigation feature: %',p_feature_key using errcode='22023';
  end if;

  update public.user_navigation_visibility
  set visible=p_visible,
      updated_at=now(),
      updated_by=auth.uid()
  where feature_key=p_feature_key
  returning * into v_row;

  if v_previous is distinct from p_visible then
    perform public.log_admin_activity(
      'user_navigation_visibility_changed',
      'user_navigation_visibility',
      p_feature_key,
      jsonb_build_object(
        'audience','users',
        'label',v_row.label,
        'route',v_row.route,
        'feature_scope',v_row.feature_scope,
        'previous_visible',v_previous,
        'visible',p_visible
      )
    );
  end if;

  return jsonb_build_object(
    'feature_key',v_row.feature_key,
    'visible',v_row.visible,
    'visible_to_admins',v_row.visible_to_admins,
    'updated_at',v_row.updated_at
  );
end;
$$;

create or replace function public.set_user_navigation_admin_visibility(
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
  if auth.uid() is null or not public.has_dright_permission('site_settings','manage') then
    raise exception 'insufficient_privilege' using errcode='42501';
  end if;

  select visible_to_admins into v_previous
  from public.user_navigation_visibility
  where feature_key=p_feature_key;

  if not found then
    raise exception 'Unknown navigation feature: %',p_feature_key using errcode='22023';
  end if;

  update public.user_navigation_visibility
  set visible_to_admins=p_visible,
      updated_at=now(),
      updated_by=auth.uid()
  where feature_key=p_feature_key
  returning * into v_row;

  if v_previous is distinct from p_visible then
    perform public.log_admin_activity(
      'user_navigation_admin_visibility_changed',
      'user_navigation_visibility',
      p_feature_key,
      jsonb_build_object(
        'audience','admins',
        'label',v_row.label,
        'route',v_row.route,
        'feature_scope',v_row.feature_scope,
        'previous_visible',v_previous,
        'visible',p_visible
      )
    );
  end if;

  return jsonb_build_object(
    'feature_key',v_row.feature_key,
    'visible',v_row.visible,
    'visible_to_admins',v_row.visible_to_admins,
    'updated_at',v_row.updated_at
  );
end;
$$;

revoke all on function public.set_user_navigation_admin_visibility(text,boolean) from public;
grant execute on function public.set_user_navigation_admin_visibility(text,boolean) to authenticated;

create or replace function public.block_hidden_sales_team_self_status_changes()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_visible boolean;
  v_is_admin boolean;
begin
  if auth.uid() is null or auth.uid() <> new.id then
    return new;
  end if;

  if new.marketer_status is not distinct from old.marketer_status
     and new.advertiser_status is not distinct from old.advertiser_status then
    return new;
  end if;

  select coalesce(u.is_admin,false) and u.admin_status='active'
  into v_is_admin
  from public.users u
  where u.id=auth.uid();

  select case
           when coalesce(v_is_admin,false) then visible_to_admins
           else visible
         end
  into v_visible
  from public.user_navigation_visibility
  where feature_key='sales_team_features';

  if coalesce(v_visible,true) is false then
    raise exception 'Sales Team features are temporarily unavailable'
      using errcode='55000';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_hidden_sales_team_self_status_changes on public.users;
create trigger trg_block_hidden_sales_team_self_status_changes
before update of marketer_status, advertiser_status on public.users
for each row
execute function public.block_hidden_sales_team_self_status_changes();
