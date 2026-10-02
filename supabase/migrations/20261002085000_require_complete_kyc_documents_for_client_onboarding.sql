
create or replace function public.get_my_dright_client_onboarding()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.dright_client_onboarding%rowtype;
  v_kyc_profile_id uuid;
  v_kyc_status text := 'not_started';
  v_user_type text;
  v_submission_id uuid;
  v_submission_status text;
  v_document_count integer := 0;
  v_required_document_types text[] := array[]::text[];
  v_uploaded_document_types text[] := array[]::text[];
  v_documents_complete boolean := false;
  v_kyc_submitted boolean := false;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_row
  from public.dright_client_onboarding
  where user_id = v_uid;

  if v_row.user_id is null then
    return jsonb_build_object('required', false);
  end if;

  select kp.id, kp.status, kp.user_type
    into v_kyc_profile_id, v_kyc_status, v_user_type
  from public.kyc_profiles kp
  where kp.user_id = v_uid
    and kp.is_deleted = false
  order by kp.updated_at desc
  limit 1;

  if v_kyc_profile_id is not null then
    select coalesce(kr.required_document_types, array[]::text[])
      into v_required_document_types
    from public.kyc_rules kr
    where kr.user_type = v_user_type
      and kr.is_deleted = false
    order by kr.updated_at desc
    limit 1;

    select ks.id, ks.status
      into v_submission_id, v_submission_status
    from public.kyc_submissions ks
    where ks.profile_id = v_kyc_profile_id
      and ks.user_id = v_uid
      and ks.is_deleted = false
    order by ks.version desc, ks.created_at desc
    limit 1;

    if v_submission_id is not null then
      select count(*)::integer,
             coalesce(array_agg(distinct kd.document_type) filter (where kd.document_type is not null), array[]::text[])
        into v_document_count, v_uploaded_document_types
      from public.kyc_documents kd
      where kd.submission_id = v_submission_id
        and kd.user_id = v_uid
        and kd.is_deleted = false
        and kd.status <> 'replaced';
    end if;
  end if;

  v_documents_complete :=
    case
      when coalesce(cardinality(v_required_document_types), 0) > 0
        then v_required_document_types <@ v_uploaded_document_types
      else v_document_count > 0
    end;

  v_kyc_submitted :=
    coalesce(v_kyc_status, 'not_started') = 'approved'
    or (
      coalesce(v_kyc_status, 'not_started') in ('submitted','under_review','provider_review')
      and coalesce(v_submission_status, '') in ('pending','under_review','approved')
      and v_documents_complete
    );

  return jsonb_build_object(
    'required', true,
    'must_change_password', v_row.must_change_password,
    'password_changed_at', v_row.password_changed_at,
    'must_complete_kyc', v_row.require_kyc_submission and not v_kyc_submitted,
    'kyc_submitted', v_kyc_submitted,
    'kyc_status', coalesce(v_kyc_status, 'not_started'),
    'kyc_submission_status', v_submission_status,
    'kyc_document_count', v_document_count,
    'required_document_types', to_jsonb(v_required_document_types),
    'uploaded_document_types', to_jsonb(v_uploaded_document_types),
    'documents_complete', v_documents_complete,
    'starter_purchase_id', v_row.starter_purchase_id,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function public.get_my_dright_client_onboarding() from public, anon;
grant execute on function public.get_my_dright_client_onboarding() to authenticated;
