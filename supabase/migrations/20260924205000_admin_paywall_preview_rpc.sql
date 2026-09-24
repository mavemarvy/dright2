begin;

create or replace function public.admin_set_platform_paywall_preview(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required'
      using errcode='42501';
  end if;

  update public.platform_access_settings
  set admin_paywall_preview=coalesce(p_enabled,false),
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  return coalesce(p_enabled,false);
end;
$function$;

revoke all on function public.admin_set_platform_paywall_preview(boolean) from public;
grant execute on function public.admin_set_platform_paywall_preview(boolean) to authenticated;

comment on function public.admin_set_platform_paywall_preview(boolean) is
  'Immediately toggles the admin-only expired-trial/paywall QA preview without changing real user trials, Starter grants, or subscription records.';

commit;
