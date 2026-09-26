begin;

create or replace function public.admin_update_system_config(
  p_admin_task_percent numeric,
  p_marketer_task_pcts jsonb,
  p_advertiser_task_pcts jsonb,
  p_marketer_sub_prices jsonb,
  p_advertiser_sub_prices jsonb,
  p_admin_cut_percent numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_row public.system_config%rowtype;
begin
  if auth.uid() is null or not public.has_dright_permission('system','configure') then
    raise exception 'System configuration permission required'
      using errcode='42501';
  end if;

  if p_admin_task_percent is null or p_admin_task_percent < 0 or p_admin_task_percent > 100 then
    raise exception 'Default admin task percentage must be between 0 and 100';
  end if;

  if p_admin_cut_percent is null or p_admin_cut_percent < 0 or p_admin_cut_percent > 100 then
    raise exception 'Admin cut percentage must be between 0 and 100';
  end if;

  if p_marketer_task_pcts is null
     or jsonb_typeof(p_marketer_task_pcts) <> 'object'
     or p_advertiser_task_pcts is null
     or jsonb_typeof(p_advertiser_task_pcts) <> 'object'
     or p_marketer_sub_prices is null
     or jsonb_typeof(p_marketer_sub_prices) <> 'object'
     or p_advertiser_sub_prices is null
     or jsonb_typeof(p_advertiser_sub_prices) <> 'object' then
    raise exception 'Tier percentages and subscription prices must be valid objects';
  end if;

  -- Reject negative prices/percentages and percentages above 100.
  if exists (
    select 1 from jsonb_each_text(p_marketer_task_pcts) e
    where e.value !~ '^-?[0-9]+([.][0-9]+)?$'
       or e.value::numeric < 0 or e.value::numeric > 100
  ) or exists (
    select 1 from jsonb_each_text(p_advertiser_task_pcts) e
    where e.value !~ '^-?[0-9]+([.][0-9]+)?$'
       or e.value::numeric < 0 or e.value::numeric > 100
  ) then
    raise exception 'Task percentages must be numeric values between 0 and 100';
  end if;

  if exists (
    select 1 from jsonb_each_text(p_marketer_sub_prices) e
    where e.value !~ '^-?[0-9]+([.][0-9]+)?$'
       or e.value::numeric < 0
  ) or exists (
    select 1 from jsonb_each_text(p_advertiser_sub_prices) e
    where e.value !~ '^-?[0-9]+([.][0-9]+)?$'
       or e.value::numeric < 0
  ) then
    raise exception 'Subscription prices must be numeric values greater than or equal to 0';
  end if;

  update public.system_config
  set admin_task_percent=p_admin_task_percent,
      marketer_task_pcts=p_marketer_task_pcts,
      advertiser_task_pcts=p_advertiser_task_pcts,
      marketer_sub_prices=p_marketer_sub_prices,
      advertiser_sub_prices=p_advertiser_sub_prices,
      admin_cut_percent=p_admin_cut_percent,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true
  returning * into v_row;

  if not found then
    raise exception 'System configuration row not found';
  end if;

  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values(
    auth.uid(),
    'system_config_update',
    v_row.id,
    'system_config',
    jsonb_build_object(
      'admin_task_percent',v_row.admin_task_percent,
      'admin_cut_percent',v_row.admin_cut_percent,
      'marketer_task_pcts',v_row.marketer_task_pcts,
      'advertiser_task_pcts',v_row.advertiser_task_pcts,
      'marketer_sub_prices',v_row.marketer_sub_prices,
      'advertiser_sub_prices',v_row.advertiser_sub_prices
    )
  );

  return jsonb_build_object(
    'id',v_row.id,
    'admin_task_percent',v_row.admin_task_percent,
    'marketer_task_pcts',v_row.marketer_task_pcts,
    'advertiser_task_pcts',v_row.advertiser_task_pcts,
    'marketer_sub_prices',v_row.marketer_sub_prices,
    'advertiser_sub_prices',v_row.advertiser_sub_prices,
    'admin_cut_percent',v_row.admin_cut_percent,
    'updated_at',v_row.updated_at,
    'updated_by',v_row.updated_by
  );
end;
$function$;

revoke all on function public.admin_update_system_config(numeric,jsonb,jsonb,jsonb,jsonb,numeric) from public;
grant execute on function public.admin_update_system_config(numeric,jsonb,jsonb,jsonb,jsonb,numeric) to authenticated;

comment on function public.admin_update_system_config(numeric,jsonb,jsonb,jsonb,jsonb,numeric) is
  'Permission-checked admin RPC for the System Settings page. Replaces fragile direct browser updates to system_config and records an audit log.';

commit;
