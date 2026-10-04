begin;

grant execute on function public.is_admin(uuid) to anon, authenticated;

create or replace function public.admin_update_site_settings(
  p_site_name text,
  p_maintenance_mode boolean,
  p_default_currency text,
  p_force_default_currency boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_row public.site_settings%rowtype;
  v_name text := btrim(coalesce(p_site_name,''));
  v_currency text := upper(btrim(coalesce(p_default_currency,'USD')));
begin
  if auth.uid() is null or not public.has_dright_permission('site_settings','manage') then
    raise exception 'Site settings management permission required'
      using errcode='42501';
  end if;

  if v_name = '' or length(v_name) > 120 then
    raise exception 'Site name must be between 1 and 120 characters';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Default currency must be a valid 3-letter currency code';
  end if;

  update public.site_settings
  set site_name = v_name,
      maintenance_mode = coalesce(p_maintenance_mode,false),
      default_currency = v_currency,
      force_default_currency = coalesce(p_force_default_currency,false),
      updated_at = now(),
      updated_by = auth.uid()
  where singleton = true
  returning * into v_row;

  if not found then
    raise exception 'Site settings row not found';
  end if;

  return jsonb_build_object(
    'success',true,
    'id',v_row.id,
    'site_name',v_row.site_name,
    'maintenance_mode',v_row.maintenance_mode,
    'default_currency',v_row.default_currency,
    'force_default_currency',v_row.force_default_currency,
    'updated_at',v_row.updated_at
  );
end;
$function$;

revoke all on function public.admin_update_site_settings(text,boolean,text,boolean) from public;
grant execute on function public.admin_update_site_settings(text,boolean,text,boolean) to authenticated;

comment on function public.admin_update_site_settings(text,boolean,text,boolean) is
  'Permission-checked Site Settings update RPC. Avoids fragile direct browser writes through RLS and records the authenticated admin as updated_by.';

commit;
