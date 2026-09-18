-- DRIGHT: close cross-user fraud helpers and tighten payment/security admin surfaces.

begin;

-- ---------------------------------------------------------------------------
-- Fraud/risk helpers: authenticated users may inspect/record only themselves.
-- Authorized security admins may inspect other users; service_role may record.
-- ---------------------------------------------------------------------------
create or replace function public.check_velocity(
  p_user_id uuid,
  p_action text default 'withdrawal',
  p_window_minutes integer default 60
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_count bigint;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if auth.uid() is distinct from p_user_id
     and public.is_super_admin() is not true
     and public.has_dright_permission('security','view') is not true
     and public.has_dright_permission('security','view_fraud') is not true then
    raise exception 'Unauthorized';
  end if;
  if p_window_minutes < 1 or p_window_minutes > 10080 then
    raise exception 'Invalid velocity window';
  end if;

  select count(*) into v_count
  from public.wallet_fraud_alerts
  where user_id = p_user_id
    and action_type = p_action
    and created_at > now() - make_interval(mins => p_window_minutes);

  return jsonb_build_object('count',v_count,'window_minutes',p_window_minutes,'action',p_action);
end;
$$;

create or replace function public.get_user_risk_score(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if auth.uid() is distinct from p_user_id
     and public.is_super_admin() is not true
     and public.has_dright_permission('security','view') is not true
     and public.has_dright_permission('security','view_fraud') is not true then
    raise exception 'Unauthorized';
  end if;

  select jsonb_build_object(
    'risk_score',risk_score,
    'flags',flags,
    'last_calculated',updated_at
  ) into v_result
  from public.user_risk_scores
  where user_id = p_user_id;

  return coalesce(v_result,jsonb_build_object('risk_score',0,'flags','[]'::jsonb,'last_calculated',null));
end;
$$;

create or replace function public.get_fraud_events(
  p_user_id uuid default auth.uid(),
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if auth.uid() is distinct from p_user_id
     and public.is_super_admin() is not true
     and public.has_dright_permission('security','view') is not true
     and public.has_dright_permission('security','view_fraud') is not true then
    raise exception 'Unauthorized';
  end if;
  if p_limit < 1 or p_limit > 200 then
    raise exception 'Invalid limit';
  end if;

  select coalesce(jsonb_agg(row_to_json(f.*) order by f.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select id,user_id,alert_type,severity,description,metadata,
           ip_address,country,device_fingerprint,browser,action_type,
           risk_score,is_resolved,created_at
    from public.wallet_fraud_alerts
    where user_id = p_user_id
    order by created_at desc
    limit p_limit
  ) f;

  return v_result;
end;
$$;

create or replace function public.record_fraud_event(
  p_user_id uuid,
  p_alert_type text,
  p_severity text default 'medium',
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_ip_address text default null,
  p_country text default null,
  p_device_fingerprint text default null,
  p_browser text default null,
  p_action_type text default null,
  p_risk_delta integer default 10
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role'
     and (auth.uid() is null or auth.uid() is distinct from p_user_id) then
    raise exception 'Unauthorized';
  end if;
  if nullif(trim(p_alert_type),'') is null then raise exception 'Alert type is required'; end if;
  if p_severity not in ('low','medium','high','critical') then raise exception 'Invalid severity'; end if;
  if p_risk_delta < 0 or p_risk_delta > 100 then raise exception 'Invalid risk delta'; end if;

  insert into public.wallet_fraud_alerts(
    user_id,alert_type,severity,description,metadata,
    ip_address,country,device_fingerprint,browser,action_type,risk_score
  ) values (
    p_user_id,trim(p_alert_type),p_severity,p_description,coalesce(p_metadata,'{}'::jsonb),
    p_ip_address,p_country,p_device_fingerprint,p_browser,p_action_type,p_risk_delta
  );

  insert into public.user_risk_scores(user_id,risk_score,flags,updated_at)
  values (p_user_id,least(p_risk_delta,100),jsonb_build_array(trim(p_alert_type)),now())
  on conflict (user_id) do update
  set risk_score = least(public.user_risk_scores.risk_score + p_risk_delta,100),
      flags = case
        when public.user_risk_scores.flags @> jsonb_build_array(trim(p_alert_type))
          then public.user_risk_scores.flags
        else public.user_risk_scores.flags || jsonb_build_array(trim(p_alert_type))
      end,
      updated_at = now();
end;
$$;

revoke all on function public.check_velocity(uuid,text,integer) from public, anon;
revoke all on function public.get_user_risk_score(uuid) from public, anon;
revoke all on function public.get_fraud_events(uuid,integer) from public, anon;
revoke all on function public.record_fraud_event(uuid,text,text,text,jsonb,text,text,text,text,text,integer) from public, anon;
grant execute on function public.check_velocity(uuid,text,integer) to authenticated, service_role;
grant execute on function public.get_user_risk_score(uuid) to authenticated, service_role;
grant execute on function public.get_fraud_events(uuid,integer) to authenticated, service_role;
grant execute on function public.record_fraud_event(uuid,text,text,text,jsonb,text,text,text,text,text,integer) to authenticated, service_role;

create or replace function public.admin_resolve_wallet_fraud_alert(p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_admin uuid := auth.uid();
begin
  if v_admin is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('security','manage') is not true then
    raise exception 'Unauthorized: security management permission required';
  end if;

  update public.wallet_fraud_alerts
  set is_resolved=true,resolved_by=v_admin,resolved_at=now()
  where id=p_alert_id and is_resolved is distinct from true;

  if not found and not exists(select 1 from public.wallet_fraud_alerts where id=p_alert_id) then
    raise exception 'Fraud alert not found';
  end if;
end;
$$;

revoke all on function public.admin_resolve_wallet_fraud_alert(uuid) from public, anon;
grant execute on function public.admin_resolve_wallet_fraud_alert(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Payment provider changes require explicit payments.manage permission.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_payment_provider(
  p_provider_id uuid,
  p_status text default null,
  p_priority integer default null,
  p_is_recommended boolean default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if public.is_super_admin() is not true
     and public.has_dright_permission('payments','manage') is not true then
    raise exception 'Unauthorized: payment management permission required';
  end if;
  if p_status is not null and p_status not in ('enabled','coming_soon','maintenance') then
    raise exception 'Invalid provider status';
  end if;
  if p_priority is not null and p_priority < 0 then raise exception 'Invalid provider priority'; end if;

  if p_is_recommended is true then
    update public.payment_providers set is_recommended=false,updated_at=now()
    where id <> p_provider_id and is_recommended=true;
  end if;

  update public.payment_providers
  set status=coalesce(p_status,status),
      priority=coalesce(p_priority,priority),
      is_recommended=coalesce(p_is_recommended,is_recommended),
      updated_at=now()
  where id=p_provider_id;
  if not found then raise exception 'Payment provider not found'; end if;
end;
$$;

revoke all on function public.admin_update_payment_provider(uuid,text,integer,boolean) from public, anon;
grant execute on function public.admin_update_payment_provider(uuid,text,integer,boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS: remove broad "any admin" mutation surfaces and use DRIGHT permissions.
-- ---------------------------------------------------------------------------
drop policy if exists admin_update_payment_security on public.payment_security;
drop policy if exists insert_own_payment_security on public.payment_security;
drop policy if exists admin_select_payment_security on public.payment_security;
create policy admin_select_payment_security on public.payment_security
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('security','view')
  or public.has_dright_permission('security','manage')
  or public.has_dright_permission('payments','manage')
);

drop policy if exists insert_own_security_logs on public.payment_security_logs;
drop policy if exists admin_select_security_logs on public.payment_security_logs;
create policy admin_select_security_logs on public.payment_security_logs
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('security','view')
  or public.has_dright_permission('security','view_logs')
  or public.has_dright_permission('security','manage')
);

drop policy if exists insert_own_pin_attempts on public.payment_pin_attempts;
drop policy if exists admin_select_pin_attempts on public.payment_pin_attempts;
create policy admin_select_pin_attempts on public.payment_pin_attempts
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('security','view')
  or public.has_dright_permission('security','view_logs')
  or public.has_dright_permission('security','manage')
);

drop policy if exists admin_all_risk_scores on public.user_risk_scores;
create policy admin_select_risk_scores on public.user_risk_scores
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('security','view')
  or public.has_dright_permission('security','view_fraud')
  or public.has_dright_permission('security','manage')
);

drop policy if exists admin_insert_fraud_alerts on public.wallet_fraud_alerts;
drop policy if exists admin_update_fraud_alerts on public.wallet_fraud_alerts;
drop policy if exists admin_select_fraud_alerts on public.wallet_fraud_alerts;
create policy admin_select_fraud_alerts on public.wallet_fraud_alerts
for select to authenticated
using (
  public.is_super_admin()
  or public.has_dright_permission('security','view')
  or public.has_dright_permission('security','view_fraud')
  or public.has_dright_permission('security','manage')
);

drop policy if exists admin_insert_payment_providers on public.payment_providers;
drop policy if exists admin_update_payment_providers on public.payment_providers;
drop policy if exists admin_delete_payment_providers on public.payment_providers;
create policy admin_insert_payment_providers on public.payment_providers
for insert to authenticated
with check (public.is_super_admin() or public.has_dright_permission('payments','manage'));
create policy admin_update_payment_providers on public.payment_providers
for update to authenticated
using (public.is_super_admin() or public.has_dright_permission('payments','manage'))
with check (public.is_super_admin() or public.has_dright_permission('payments','manage'));
create policy admin_delete_payment_providers on public.payment_providers
for delete to authenticated
using (public.is_super_admin() or public.has_dright_permission('payments','manage'));

commit;
