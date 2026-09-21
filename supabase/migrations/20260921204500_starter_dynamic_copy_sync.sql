begin;

do $do$
declare
  v_sql text;
  v_next text;
begin
  select pg_get_functiondef(p.oid)
  into v_sql
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='sync_dright_starter_marketplace_product_now'
  limit 1;

  if v_sql is null then
    raise exception 'Starter marketplace sync function is missing';
  end if;

  v_next := replace(
    v_sql,
    '      v_settings.description,',
    '      replace(v_settings.description,''{{trial_days}}'',v_settings.included_trial_days::text),'
  );
  v_next := replace(
    v_next,
    '        description=v_settings.description,',
    '        description=replace(v_settings.description,''{{trial_days}}'',v_settings.included_trial_days::text),'
  );

  if v_next = v_sql then
    raise exception 'Starter marketplace sync copy patterns were not found';
  end if;

  execute v_next;
end
$do$;

-- Synchronize the current first-party listing through the existing moderation guard as trusted system work.
select set_config('request.jwt.claim.role','service_role',true);
select public.sync_dright_starter_marketplace_product_now();

commit;