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
  v_user_type text;
  v_submission_id uuid;
  v_submission_status text;
  v_document_count integer:=0;
  v_required_document_types text[]:=array[]::text[];
  v_uploaded_document_types text[]:=array[]::text[];
  v_documents_complete boolean:=false;
  v_kyc_submitted boolean:=false;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_row from public.dright_client_onboarding where user_id=v_uid;
  if v_row.user_id is null then return jsonb_build_object('required',false); end if;

  select kp.id,kp.status,kp.user_type
  into v_kyc_profile_id,v_kyc_status,v_user_type
  from public.kyc_profiles kp
  where kp.user_id=v_uid and kp.is_deleted=false
  order by kp.updated_at desc limit 1;

  if v_kyc_profile_id is not null then
    select coalesce(kr.required_document_types,array[]::text[])
    into v_required_document_types
    from public.kyc_rules kr
    where kr.user_type=v_user_type and kr.is_deleted=false
    order by kr.updated_at desc limit 1;

    select ks.id,ks.status
    into v_submission_id,v_submission_status
    from public.kyc_submissions ks
    where ks.profile_id=v_kyc_profile_id and ks.user_id=v_uid and ks.is_deleted=false
    order by ks.version desc,ks.created_at desc limit 1;

    if v_submission_id is not null then
      select count(*)::integer,
             coalesce(array_agg(distinct kd.document_type) filter (where kd.document_type is not null),array[]::text[])
      into v_document_count,v_uploaded_document_types
      from public.kyc_documents kd
      where kd.submission_id=v_submission_id
        and kd.user_id=v_uid
        and kd.is_deleted=false
        and kd.status<>'replaced';
    end if;
  end if;

  v_documents_complete:=case
    when coalesce(cardinality(v_required_document_types),0)>0
      then v_required_document_types <@ v_uploaded_document_types
    else v_document_count>0
  end;

  v_kyc_submitted:=
    coalesce(v_kyc_status,'not_started')='approved'
    or (
      coalesce(v_kyc_status,'not_started') in ('submitted','under_review','provider_review')
      and coalesce(v_submission_status,'') in ('pending','under_review','approved')
      and v_documents_complete
    );

  return jsonb_build_object(
    'required',true,
    'onboarding_type',v_row.onboarding_type,
    'must_change_password',v_row.must_change_password,
    'password_changed_at',v_row.password_changed_at,
    'must_verify_email',v_row.must_verify_email and v_row.email_verified_at is null,
    'email_verified_at',v_row.email_verified_at,
    'defer_profile_setup',v_row.defer_profile_setup,
    'must_complete_kyc',v_row.require_kyc_submission and not v_kyc_submitted,
    'kyc_required_during_first_login',v_row.require_kyc_submission,
    'kyc_submitted',v_kyc_submitted,
    'kyc_status',coalesce(v_kyc_status,'not_started'),
    'kyc_submission_status',v_submission_status,
    'kyc_document_count',v_document_count,
    'required_document_types',to_jsonb(v_required_document_types),
    'uploaded_document_types',to_jsonb(v_uploaded_document_types),
    'documents_complete',v_documents_complete,
    'starter_purchase_id',v_row.starter_purchase_id,
    'created_at',v_row.created_at
  );
end;
$$;

revoke all on function public.get_my_dright_client_onboarding() from public,anon;
grant execute on function public.get_my_dright_client_onboarding() to authenticated;

create or replace function public.service_claim_dright_starter_purchase_for_assisted_user(
  p_user_id uuid,
  p_reference text,
  p_assisted_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_purchase public.dright_starter_purchases%rowtype;
  v_auth_email text;
  v_start timestamptz;
  v_end timestamptz;
  v_helper_code text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required'; end if;
  if p_user_id is null or nullif(trim(p_reference),'') is null or p_assisted_by is null then
    raise exception 'user, reference and assisting user are required';
  end if;

  if not exists(
    select 1 from public.users u
    where u.id=p_assisted_by and upper(coalesce(u.account_status,'ACTIVE'))='ACTIVE'
  ) then
    raise exception 'Assisting DRIGHT account is not active';
  end if;

  select * into v_purchase
  from public.dright_starter_purchases dsp
  where dsp.payment_reference=trim(p_reference)
  for update;

  if not found then raise exception 'Starter purchase not found'; end if;

  if v_purchase.payment_status<>'success'
     or v_purchase.processed_at is null
     or v_purchase.paid_at is null
     or v_purchase.status<>'completed'
     or v_purchase.buyer_user_id is not null
     or v_purchase.claimed_at is not null then
    raise exception 'Starter purchase is not available for assisted signup';
  end if;

  if coalesce(v_purchase.metadata->>'checkout_mode','')<>'assisted_signup'
     or coalesce(v_purchase.metadata->>'assisted_by_user_id','')<>p_assisted_by::text
     or v_purchase.referrer_id is distinct from p_assisted_by then
    raise exception 'Starter purchase does not belong to this assisted signup';
  end if;

  select lower(au.email) into v_auth_email
  from auth.users au where au.id=p_user_id;
  if v_auth_email is null or v_auth_email<>lower(v_purchase.buyer_email) then
    raise exception 'Assisted account email does not match the Starter purchase';
  end if;

  select u.referral_code into v_helper_code
  from public.users u where u.id=p_assisted_by;

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
        'assisted_signup_completed',true,
        'assisted_user_id',p_user_id,
        'assisted_signup_completed_at',now()
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
        'account_creation_flow','assisted_signup'
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
    user_id,starter_purchase_id,created_by,must_change_password,require_kyc_submission,
    onboarding_type,must_verify_email,defer_profile_setup,assisted_referral_code
  ) values(
    p_user_id,v_purchase.id,p_assisted_by,true,false,
    'assisted_signup',true,true,coalesce(v_purchase.tracking_code,v_helper_code)
  );

  return jsonb_build_object(
    'success',true,
    'purchase_id',v_purchase.id,
    'payment_reference',v_purchase.payment_reference,
    'trial_days',v_purchase.included_trial_days,
    'trial_starts_at',v_start,
    'trial_ends_at',v_end,
    'referral_code',coalesce(v_purchase.tracking_code,v_helper_code)
  );
end;
$$;

revoke all on function public.service_claim_dright_starter_purchase_for_assisted_user(uuid,text,uuid)
from public,anon,authenticated;
grant execute on function public.service_claim_dright_starter_purchase_for_assisted_user(uuid,text,uuid)
to service_role;

create or replace function public.service_mark_dright_client_email_verified(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_updated boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required'; end if;

  update public.dright_client_onboarding
  set must_verify_email=false,
      email_verified_at=coalesce(email_verified_at,now()),
      updated_at=now()
  where user_id=p_user_id
  returning true into v_updated;

  if not coalesce(v_updated,false) then raise exception 'client onboarding record not found'; end if;
  return jsonb_build_object('success',true,'email_verified',true);
end;
$$;

revoke all on function public.service_mark_dright_client_email_verified(uuid)
from public,anon,authenticated;
grant execute on function public.service_mark_dright_client_email_verified(uuid)
to service_role;
