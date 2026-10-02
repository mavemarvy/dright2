-- Admin-assisted DRIGHT Starter client onboarding.
-- Temporary passwords are never written to application tables or email logs.

create table if not exists public.dright_client_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starter_purchase_id uuid not null unique references public.dright_starter_purchases(id) on delete restrict,
  created_by uuid references public.users(id) on delete set null,
  must_change_password boolean not null default true,
  password_changed_at timestamptz,
  require_kyc_submission boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dright_client_onboarding enable row level security;

drop policy if exists dright_client_onboarding_own_read on public.dright_client_onboarding;
create policy dright_client_onboarding_own_read
on public.dright_client_onboarding for select to authenticated
using (user_id = auth.uid());

drop policy if exists dright_client_onboarding_admin_read on public.dright_client_onboarding;
create policy dright_client_onboarding_admin_read
on public.dright_client_onboarding for select to authenticated
using (public.has_dright_permission('subscriptions','manage'));

revoke all on table public.dright_client_onboarding from anon;
revoke insert, update, delete on table public.dright_client_onboarding from authenticated;
grant select on table public.dright_client_onboarding to authenticated;

drop trigger if exists trg_dright_client_onboarding_updated_at on public.dright_client_onboarding;
create trigger trg_dright_client_onboarding_updated_at
before update on public.dright_client_onboarding
for each row execute function public.set_updated_at();

create or replace function public.get_my_dright_client_onboarding()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_row public.dright_client_onboarding%rowtype;
  v_kyc_profile_id uuid;
  v_kyc_status text:='not_started';
  v_submission_id uuid;
  v_submission_status text;
  v_document_count integer:=0;
  v_kyc_submitted boolean:=false;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_row from public.dright_client_onboarding where user_id=v_uid;
  if v_row.user_id is null then return jsonb_build_object('required',false); end if;

  select kp.id,kp.status into v_kyc_profile_id,v_kyc_status
  from public.kyc_profiles kp
  where kp.user_id=v_uid and kp.is_deleted=false
  order by kp.updated_at desc limit 1;

  if v_kyc_profile_id is not null then
    select ks.id,ks.status into v_submission_id,v_submission_status
    from public.kyc_submissions ks
    where ks.profile_id=v_kyc_profile_id and ks.user_id=v_uid and ks.is_deleted=false
    order by ks.version desc,ks.created_at desc limit 1;

    if v_submission_id is not null then
      select count(*)::integer into v_document_count
      from public.kyc_documents kd
      where kd.submission_id=v_submission_id
        and kd.user_id=v_uid
        and kd.is_deleted=false
        and kd.status<>'replaced';
    end if;
  end if;

  v_kyc_submitted :=
    coalesce(v_kyc_status,'not_started')='approved'
    or (
      coalesce(v_kyc_status,'not_started') in ('submitted','under_review','provider_review')
      and coalesce(v_submission_status,'') in ('pending','under_review','approved')
      and v_document_count>0
    );

  return jsonb_build_object(
    'required',true,
    'must_change_password',v_row.must_change_password,
    'password_changed_at',v_row.password_changed_at,
    'must_complete_kyc',v_row.require_kyc_submission and not v_kyc_submitted,
    'kyc_submitted',v_kyc_submitted,
    'kyc_status',coalesce(v_kyc_status,'not_started'),
    'kyc_submission_status',v_submission_status,
    'kyc_document_count',v_document_count,
    'starter_purchase_id',v_row.starter_purchase_id,
    'created_at',v_row.created_at
  );
end;
$$;
revoke all on function public.get_my_dright_client_onboarding() from public,anon;
grant execute on function public.get_my_dright_client_onboarding() to authenticated;

create or replace function public.get_my_dright_client_onboarding_for_service(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select jsonb_build_object(
    'success',true,
    'idempotent',true,
    'purchase_id',dco.starter_purchase_id,
    'must_change_password',dco.must_change_password
  )
  from public.dright_client_onboarding dco
  where dco.user_id=p_user_id;
$$;
revoke all on function public.get_my_dright_client_onboarding_for_service(uuid) from public,anon,authenticated;
grant execute on function public.get_my_dright_client_onboarding_for_service(uuid) to service_role;

create or replace function public.service_claim_dright_starter_purchase_for_client(
  p_user_id uuid,p_email text,p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_auth_email text;
  v_purchase public.dright_starter_purchases%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_user_id is null or v_email='' then raise exception 'user and email are required'; end if;
  if p_created_by is null or not exists(
    select 1 from public.users u
    where u.id=p_created_by and u.is_admin=true and u.admin_status='active'
  ) then raise exception 'active admin is required'; end if;

  select lower(au.email) into v_auth_email from auth.users au where au.id=p_user_id;
  if v_auth_email is null or v_auth_email<>v_email then raise exception 'client auth email mismatch'; end if;

  if exists(select 1 from public.dright_client_onboarding where user_id=p_user_id) then
    return public.get_my_dright_client_onboarding_for_service(p_user_id);
  end if;

  select * into v_purchase
  from public.dright_starter_purchases dsp
  where lower(dsp.buyer_email)=v_email
    and dsp.payment_status='success'
    and dsp.processed_at is not null
    and dsp.paid_at is not null
    and dsp.buyer_user_id is null
    and dsp.claimed_at is null
    and dsp.status='completed'
  order by dsp.paid_at desc,dsp.created_at desc
  limit 1 for update;

  if v_purchase.id is null then
    raise exception 'No verified, unclaimed DRIGHT Starter purchase was found for this email';
  end if;

  v_start:=now();
  v_end:=case when v_purchase.included_trial_days>0
    then v_start+make_interval(days=>v_purchase.included_trial_days) else v_start end;

  update public.dright_starter_purchases
  set buyer_user_id=p_user_id,
      claimed_at=now(),
      status='claimed',
      trial_starts_at=v_start,
      trial_ends_at=v_end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'account_created_by_admin',true,
        'account_created_by',p_created_by,
        'account_creation_flow','admin_client_onboarding'
      ),
      updated_at=now()
  where id=v_purchase.id;

  if v_purchase.included_trial_days>0 then
    insert into public.platform_access_trial_grants(
      user_id,source_type,source_id,starts_at,ends_at,status,metadata
    ) values(
      p_user_id,'dright_starter_purchase',v_purchase.id,v_start,v_end,'active',
      jsonb_build_object(
        'payment_reference',v_purchase.payment_reference,
        'paid_amount',v_purchase.amount,
        'currency',v_purchase.currency,
        'account_creation_flow','admin_client_onboarding'
      )
    )
    on conflict(source_type,source_id) do update
      set user_id=excluded.user_id,
          starts_at=excluded.starts_at,
          ends_at=excluded.ends_at,
          status='active',
          metadata=excluded.metadata,
          updated_at=now();
  end if;

  insert into public.dright_client_onboarding(
    user_id,starter_purchase_id,created_by,must_change_password,require_kyc_submission
  ) values(p_user_id,v_purchase.id,p_created_by,true,true);

  insert into public.admin_logs(admin_id,action_type,target_id,target_type,details)
  values(
    p_created_by,'starter_client_account_created',p_user_id,'user',
    jsonb_build_object(
      'starter_purchase_id',v_purchase.id,
      'payment_reference',v_purchase.payment_reference,
      'buyer_email',v_email
    )
  );

  return jsonb_build_object(
    'success',true,
    'purchase_id',v_purchase.id,
    'payment_reference',v_purchase.payment_reference,
    'trial_days',v_purchase.included_trial_days,
    'trial_starts_at',v_start,
    'trial_ends_at',v_end
  );
end;
$$;
revoke all on function public.service_claim_dright_starter_purchase_for_client(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.service_claim_dright_starter_purchase_for_client(uuid,text,uuid) to service_role;

create or replace function public.service_mark_dright_client_password_changed(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_updated boolean:=false;
begin
  update public.dright_client_onboarding
  set must_change_password=false,
      password_changed_at=coalesce(password_changed_at,now()),
      updated_at=now()
  where user_id=p_user_id
  returning true into v_updated;

  if not coalesce(v_updated,false) then raise exception 'client onboarding record not found'; end if;
  return jsonb_build_object('success',true,'password_changed',true);
end;
$$;
revoke all on function public.service_mark_dright_client_password_changed(uuid) from public,anon,authenticated;
grant execute on function public.service_mark_dright_client_password_changed(uuid) to service_role;

-- Admin-created clients intentionally have no device binding until their own first sign-in.
create or replace function public.enforce_new_auth_user_device()
returns trigger
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_enabled boolean:=true;
  v_enforce_from timestamptz:=now();
  v_device_id text;
  v_fingerprint text;
  v_hash text;
  v_fp_hash text;
  v_bound uuid;
begin
  select enabled,enforce_from into v_enabled,v_enforce_from
  from public.account_device_policy where singleton=true;
  if coalesce(v_enabled,true) is not true then return new; end if;
  if coalesce(new.created_at,now())<coalesce(v_enforce_from,now()) then return new; end if;

  if new.invited_at is not null
     or coalesce(new.raw_app_meta_data->>'created_via','')='admin_client_onboarding' then
    return new;
  end if;

  v_device_id:=nullif(btrim(new.raw_user_meta_data->>'signup_device_id'),'');
  v_fingerprint:=nullif(btrim(new.raw_user_meta_data->>'signup_device_fingerprint'),'');
  if v_device_id is null or length(v_device_id)<20 then raise exception 'DEVICE_ID_REQUIRED'; end if;

  v_hash:=public.hash_dright_device_id(v_device_id);
  v_fp_hash:=case when v_fingerprint is null then null else public.hash_dright_device_id(v_fingerprint) end;
  perform pg_advisory_xact_lock(hashtextextended(v_hash,0));

  select user_id into v_bound from public.device_account_bindings where device_hash=v_hash for update;
  if v_bound is not null and v_bound<>new.id then raise exception 'DEVICE_ALREADY_REGISTERED'; end if;

  insert into public.device_account_bindings(device_hash,user_id,fingerprint_hash,signup_bound)
  values(v_hash,new.id,v_fp_hash,true)
  on conflict(device_hash) do update
    set last_seen_at=now(),
        fingerprint_hash=coalesce(excluded.fingerprint_hash,public.device_account_bindings.fingerprint_hash),
        signup_bound=public.device_account_bindings.signup_bound or excluded.signup_bound
  where public.device_account_bindings.user_id=excluded.user_id;

  if not found then raise exception 'DEVICE_ALREADY_REGISTERED'; end if;
  return new;
end;
$$;

create or replace function public.bind_profile_device_from_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_device_id text;
  v_fingerprint text;
  v_created_via text;
  v_hash text;
  v_bound uuid;
  v_auth_created_at timestamptz;
  v_enforce_from timestamptz;
  v_enabled boolean;
begin
  select au.created_at,
         nullif(btrim(au.raw_user_meta_data->>'signup_device_id'),''),
         nullif(btrim(au.raw_user_meta_data->>'signup_device_fingerprint'),''),
         nullif(btrim(au.raw_app_meta_data->>'created_via'),'')
  into v_auth_created_at,v_device_id,v_fingerprint,v_created_via
  from auth.users au where au.id=new.id;

  select enabled,enforce_from into v_enabled,v_enforce_from
  from public.account_device_policy where singleton=true;
  if coalesce(v_enabled,true) is not true then return new; end if;

  if v_device_id is null then
    if v_created_via='admin_client_onboarding' then return new; end if;
    if v_auth_created_at is not null and v_auth_created_at>=coalesce(v_enforce_from,now()) then
      raise exception 'DEVICE_ID_REQUIRED';
    end if;
    return new;
  end if;

  v_hash:=public.hash_dright_device_id(v_device_id);
  select user_id into v_bound from public.device_account_bindings where device_hash=v_hash;
  if v_bound is not null and v_bound<>new.id then raise exception 'DEVICE_ALREADY_REGISTERED'; end if;

  insert into public.device_account_bindings(device_hash,user_id,fingerprint_hash,signup_bound)
  values(
    v_hash,new.id,
    case when v_fingerprint is null then null else public.hash_dright_device_id(v_fingerprint) end,
    true
  )
  on conflict(device_hash) do update set last_seen_at=now()
  where public.device_account_bindings.user_id=excluded.user_id;

  if not found then raise exception 'DEVICE_ALREADY_REGISTERED'; end if;
  return new;
end;
$$;
