begin;

create or replace function public.anchor_platform_access_policy_activation()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.enabled=false and new.enabled=true then
    new.policy_started_at:=now();
  end if;
  return new;
end;
$$;

drop trigger if exists anchor_platform_access_policy_activation
on public.platform_access_settings;

create trigger anchor_platform_access_policy_activation
before update of enabled
on public.platform_access_settings
for each row execute function public.anchor_platform_access_policy_activation();

commit;
