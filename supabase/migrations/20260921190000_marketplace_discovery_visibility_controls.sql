begin;

alter table public.marketplace_ui_settings
  add column if not exists recommended_section_visible boolean not null default true,
  add column if not exists recently_viewed_section_visible boolean not null default true,
  add column if not exists continue_browsing_section_visible boolean not null default true,
  add column if not exists new_arrivals_section_visible boolean not null default true;

insert into public.marketplace_ui_settings(
  key,
  categories_section_visible,
  categories_default_collapsed,
  recommended_section_visible,
  recently_viewed_section_visible,
  continue_browsing_section_visible,
  new_arrivals_section_visible
)
values ('default', true, true, true, true, true, true)
on conflict (key) do nothing;

create or replace function public.set_marketplace_discovery_section_visibility(
  p_section text,
  p_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_section text := lower(trim(coalesce(p_section,'')));
begin
  if auth.uid() is null
     or not public.has_dright_permission('marketplace','manage_categories') then
    raise exception 'Missing marketplace management permission';
  end if;

  if v_section not in (
    'recommended',
    'recently_viewed',
    'continue_browsing',
    'new_arrivals'
  ) then
    raise exception 'Unsupported marketplace section';
  end if;

  insert into public.marketplace_ui_settings(key)
  values ('default')
  on conflict (key) do nothing;

  update public.marketplace_ui_settings
  set
    recommended_section_visible = case when v_section='recommended' then p_visible else recommended_section_visible end,
    recently_viewed_section_visible = case when v_section='recently_viewed' then p_visible else recently_viewed_section_visible end,
    continue_browsing_section_visible = case when v_section='continue_browsing' then p_visible else continue_browsing_section_visible end,
    new_arrivals_section_visible = case when v_section='new_arrivals' then p_visible else new_arrivals_section_visible end,
    updated_at = now(),
    updated_by = auth.uid()
  where key='default';

  insert into public.admin_activity_logs(
    admin_id,action,target_type,target_id,resource_type,resource_id,details
  ) values (
    auth.uid(),
    case when p_visible
      then 'marketplace_discovery_section_shown'
      else 'marketplace_discovery_section_hidden'
    end,
    'marketplace_ui_settings',
    v_section,
    'marketplace_ui_settings',
    null,
    jsonb_build_object('section',v_section,'is_visible',p_visible)
  );

  return jsonb_build_object(
    'success',true,
    'section',v_section,
    'is_visible',p_visible
  );
end;
$function$;

revoke all on function public.set_marketplace_discovery_section_visibility(text,boolean)
  from public,anon;
grant execute on function public.set_marketplace_discovery_section_visibility(text,boolean)
  to authenticated,service_role;

commit;