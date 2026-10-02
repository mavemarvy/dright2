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
  v_created_via text;
begin
  select enabled,enforce_from into v_enabled,v_enforce_from
  from public.account_device_policy where singleton=true;

  if coalesce(v_enabled,true) is not true then return new; end if;
  if coalesce(new.created_at,now())<coalesce(v_enforce_from,now()) then return new; end if;

  v_created_via:=coalesce(new.raw_app_meta_data->>'created_via','');
  if new.invited_at is not null
     or v_created_via in ('admin_client_onboarding','assisted_signup') then
    return new;
  end if;

  v_device_id:=nullif(btrim(new.raw_user_meta_data->>'signup_device_id'),'');
  v_fingerprint:=nullif(btrim(new.raw_user_meta_data->>'signup_device_fingerprint'),'');
  if v_device_id is null or length(v_device_id)<20 then raise exception 'DEVICE_ID_REQUIRED'; end if;

  v_hash:=public.hash_dright_device_id(v_device_id);
  v_fp_hash:=case when v_fingerprint is null then null else public.hash_dright_device_id(v_fingerprint) end;
  perform pg_advisory_xact_lock(hashtextextended(v_hash,0));

  select user_id into v_bound
  from public.device_account_bindings
  where device_hash=v_hash
  for update;

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
    if coalesce(v_created_via,'') in ('admin_client_onboarding','assisted_signup') then return new; end if;
    if v_auth_created_at is not null and v_auth_created_at>=coalesce(v_enforce_from,now()) then
      raise exception 'DEVICE_ID_REQUIRED';
    end if;
    return new;
  end if;

  v_hash:=public.hash_dright_device_id(v_device_id);
  select user_id into v_bound
  from public.device_account_bindings
  where device_hash=v_hash;

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
