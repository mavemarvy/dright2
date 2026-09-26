
begin;

-- Keep deferred onboarding resumable for legacy/partially-created accounts.
create or replace function public.ensure_my_onboarding_profile()
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  insert into public.user_private_profiles(user_id,intended_profiles,interests,onboarding_status)
  values(v_uid,array['buyer']::text[],'{}'::text[],'in_progress')
  on conflict(user_id) do nothing;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.ensure_my_onboarding_profile() from public,anon;
grant execute on function public.ensure_my_onboarding_profile() to authenticated;

create or replace function public.update_my_onboarding_profile(
  p_country_iso2 text default null,
  p_country_calling_code text default null,
  p_date_of_birth date default null,
  p_intended_profiles text[] default null,
  p_interests text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_profiles text[];
  v_profile text;
  v_rule public.age_eligibility_rules%rowtype;
  v_min_age integer;
  v_country text:=nullif(upper(btrim(coalesce(p_country_iso2,''))),'');
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  perform public.ensure_my_onboarding_profile();

  select coalesce(p_intended_profiles,intended_profiles,array['buyer']::text[])
  into v_profiles from public.user_private_profiles where user_id=v_uid;
  if cardinality(v_profiles)=0 then v_profiles:=array['buyer']::text[]; end if;

  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'valid ISO country is required';
  end if;
  if p_date_of_birth is not null and p_date_of_birth>current_date then
    raise exception 'valid date of birth is required';
  end if;

  if p_date_of_birth is not null then
    foreach v_profile in array v_profiles loop
      select * into v_rule
      from public.age_eligibility_rules
      where profile_type=v_profile and is_active=true;
      if v_rule.profile_type is not null then
        v_min_age:=v_rule.minimum_age;
        if v_country is not null and jsonb_typeof(v_rule.country_overrides->v_country)='number' then
          v_min_age:=(v_rule.country_overrides->>v_country)::integer;
        end if;
        if public.dright_age_on(p_date_of_birth)<v_min_age then
          raise exception 'minimum age requirement not satisfied for %',v_profile;
        end if;
      end if;
    end loop;
  end if;

  update public.user_private_profiles
  set country_iso2=coalesce(v_country,country_iso2),
      country_calling_code=coalesce(nullif(btrim(coalesce(p_country_calling_code,'')),''),country_calling_code),
      date_of_birth=coalesce(p_date_of_birth,date_of_birth),
      intended_profiles=v_profiles,
      interests=coalesce(p_interests,interests,'{}'::text[]),
      onboarding_status='in_progress',
      onboarding_completed_at=null,
      updated_at=now()
  where user_id=v_uid;

  perform public.refresh_user_onboarding_status(v_uid);
  return public.get_my_onboarding_center();
end;
$$;
revoke all on function public.update_my_onboarding_profile(text,text,date,text[],text[]) from public,anon;
grant execute on function public.update_my_onboarding_profile(text,text,date,text[],text[]) to authenticated;

create or replace function public.get_my_onboarding_center()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_private public.user_private_profiles%rowtype;
  v_user public.users%rowtype;
  v_auth auth.users%rowtype;
  v_kyc public.kyc_profiles%rowtype;
  v_kyc_required boolean:=false;
  v_questionnaires jsonb:='[]'::jsonb;
  v_prof_count integer:=0;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_private from public.user_private_profiles where user_id=v_uid;
  select * into v_user from public.users where id=v_uid;
  select * into v_auth from auth.users where id=v_uid;
  select * into v_kyc from public.kyc_profiles
    where user_id=v_uid and is_deleted=false order by updated_at desc limit 1;

  if v_private.user_id is not null then
    select exists(
      select 1 from public.kyc_rules kr
      where kr.is_deleted=false and coalesce(kr.is_required,false)=true
        and kr.user_type=any(v_private.intended_profiles)
    ) into v_kyc_required;

    with active_defs as (
      select distinct on(qd.applicable_profile_type)
        qd.id,qd.questionnaire_key,qd.name,qd.description,qd.applicable_profile_type,qd.version
      from public.questionnaire_definitions qd
      where qd.is_active=true and qd.applicable_profile_type=any(v_private.intended_profiles)
      order by qd.applicable_profile_type,qd.version desc
    ), current_rows as (
      select ad.*,qs.id submission_id,qs.status,qs.submitted_at,qs.user_visible_reason,
        coalesce((select jsonb_object_agg(qa.question_key,qa.answer_value)
                  from public.questionnaire_answers qa where qa.submission_id=qs.id),'{}'::jsonb) answers
      from active_defs ad
      left join lateral(
        select s.id,s.status,s.submitted_at,s.user_visible_reason
        from public.questionnaire_submissions s
        where s.user_id=v_uid and s.questionnaire_id=ad.id and s.questionnaire_version=ad.version
        order by s.created_at desc limit 1
      ) qs on true
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'questionnaire_id',id,'questionnaire_key',questionnaire_key,'name',name,'description',description,
      'profile_type',applicable_profile_type,'version',version,'submission_id',submission_id,
      'status',coalesce(status,'not_started'),'submitted_at',submitted_at,
      'user_visible_reason',user_visible_reason,'answers',answers
    ) order by applicable_profile_type),'[]'::jsonb)
    into v_questionnaires from current_rows;
  end if;

  select count(*) into v_prof_count
  from public.professional_documents pd
  where pd.user_id=v_uid and pd.is_deleted=false and pd.status<>'replaced';

  return jsonb_build_object(
    'account',jsonb_build_object(
      'full_name',v_user.full_name,
      'username',v_user.username,
      'email',coalesce(v_user.email,v_auth.email),
      'email_verified',v_auth.email_confirmed_at is not null,
      'phone',v_user.phone,
      'avatar_url',v_user.avatar_url
    ),
    'private_profile',case when v_private.user_id is null then null else jsonb_build_object(
      'country_iso2',v_private.country_iso2,
      'country_calling_code',v_private.country_calling_code,
      'date_of_birth',v_private.date_of_birth,
      'intended_profiles',v_private.intended_profiles,
      'interests',v_private.interests,
      'onboarding_status',v_private.onboarding_status,
      'onboarding_completed_at',v_private.onboarding_completed_at
    ) end,
    'location',v_user.location,
    'location_verified',coalesce(v_user.location_verified,false),
    'verification_level',coalesce(v_user.verification_level,'unverified'),
    'kyc_required',v_kyc_required,
    'kyc_status',coalesce(v_kyc.status,'not_started'),
    'kyc_level',coalesce(v_kyc.verification_level,v_user.verification_level,'unverified'),
    'kyc_expires_at',v_kyc.expires_at,
    'questionnaires',v_questionnaires,
    'professional_documents_count',v_prof_count
  );
end;
$$;
revoke all on function public.get_my_onboarding_center() from public,anon;
grant execute on function public.get_my_onboarding_center() to authenticated;

-- Listing-specific compliance requirements. This is intentionally separate from identity KYC
-- and professional documents because receipts/ownership evidence have different retention/review semantics.
create table if not exists public.listing_verification_rules (
  id uuid primary key default gen_random_uuid(),
  listing_type_code text not null references public.marketplace_listing_types(code) on update cascade on delete cascade,
  taxonomy_category_id uuid not null references public.marketplace_taxonomy_categories(id) on delete cascade,
  rule_key text not null unique,
  name text not null,
  is_active boolean not null default true,
  require_kyc boolean not null default false,
  required_kyc_status text[] not null default array['approved']::text[],
  required_document_types text[] not null default '{}'::text[],
  document_must_be_verified boolean not null default false,
  user_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listing_verification_rules enable row level security;
drop policy if exists listing_verification_rules_read on public.listing_verification_rules;
create policy listing_verification_rules_read on public.listing_verification_rules
for select to authenticated using(is_active=true or public.is_admin(auth.uid()));
drop policy if exists listing_verification_rules_manage on public.listing_verification_rules;
create policy listing_verification_rules_manage on public.listing_verification_rules
for all to authenticated
using(public.has_dright_permission('products','review') or public.has_dright_permission('products','approve'))
with check(public.has_dright_permission('products','review') or public.has_dright_permission('products','approve'));

alter table public.products add column if not exists compliance_scope_id uuid;

create table if not exists public.listing_requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requirement_id uuid not null references public.listing_verification_rules(id) on delete cascade,
  scope_id uuid not null,
  listing_id uuid references public.products(id) on delete set null,
  document_type text not null,
  storage_bucket text not null default 'listing-evidence',
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes>0 and size_bytes<=20971520),
  status text not null default 'submitted'
    check(status in ('submitted','under_review','verified','rejected','needs_resubmission','unreadable','expired')),
  user_visible_reason text,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_requirement_evidence_user_scope_idx
  on public.listing_requirement_evidence(user_id,scope_id,requirement_id,document_type,created_at desc);
create index if not exists listing_requirement_evidence_listing_idx
  on public.listing_requirement_evidence(listing_id,created_at desc);

alter table public.listing_requirement_evidence enable row level security;
drop policy if exists listing_requirement_evidence_owner_read on public.listing_requirement_evidence;
create policy listing_requirement_evidence_owner_read on public.listing_requirement_evidence
for select to authenticated using(user_id=auth.uid());
drop policy if exists listing_requirement_evidence_admin_read on public.listing_requirement_evidence;
create policy listing_requirement_evidence_admin_read on public.listing_requirement_evidence
for select to authenticated using(
  public.has_dright_permission('products','review')
  or public.has_dright_permission('products','approve')
  or public.has_dright_permission('marketplace','view')
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'listing-evidence','listing-evidence',false,20971520,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists listing_evidence_owner_insert on storage.objects;
create policy listing_evidence_owner_insert on storage.objects
for insert to authenticated
with check(bucket_id='listing-evidence' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists listing_evidence_owner_read on storage.objects;
create policy listing_evidence_owner_read on storage.objects
for select to authenticated
using(bucket_id='listing-evidence' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists listing_evidence_admin_read on storage.objects;
create policy listing_evidence_admin_read on storage.objects
for select to authenticated
using(
  bucket_id='listing-evidence'
  and (
    public.has_dright_permission('products','review')
    or public.has_dright_permission('products','approve')
    or public.has_dright_permission('marketplace','view')
  )
);

create or replace function public.get_my_listing_verification_status(
  p_listing_type_code text,
  p_category_id uuid,
  p_scope_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_rule public.listing_verification_rules%rowtype;
  v_kyc_status text:='not_started';
  v_missing text[]:='{}'::text[];
  v_doc text;
  v_ok boolean:=true;
  v_reasons jsonb:='[]'::jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_category_id is null then
    return jsonb_build_object('required',false,'eligible',true,'missing_documents','[]'::jsonb,'reasons','[]'::jsonb);
  end if;

  with recursive ancestors as (
    select c.id,c.parent_id,0 as depth
    from public.marketplace_taxonomy_categories c where c.id=p_category_id
    union all
    select p.id,p.parent_id,a.depth+1
    from public.marketplace_taxonomy_categories p
    join ancestors a on a.parent_id=p.id
  )
  select r.* into v_rule
  from public.listing_verification_rules r
  join ancestors a on a.id=r.taxonomy_category_id
  where r.is_active=true and upper(r.listing_type_code)=upper(coalesce(p_listing_type_code,''))
  order by a.depth asc limit 1;

  if v_rule.id is null then
    return jsonb_build_object('required',false,'eligible',true,'missing_documents','[]'::jsonb,'reasons','[]'::jsonb);
  end if;

  select coalesce(k.status,'not_started') into v_kyc_status
  from public.kyc_profiles k
  where k.user_id=v_uid and k.is_deleted=false
  order by k.updated_at desc limit 1;
  if not found then v_kyc_status:='not_started'; end if;

  if v_rule.require_kyc and not (v_kyc_status=any(v_rule.required_kyc_status)) then
    v_ok:=false;
    v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object(
      'code','kyc_required','message','Complete the required identity verification before submitting this listing.'
    ));
  end if;

  foreach v_doc in array v_rule.required_document_types loop
    if p_scope_id is null or not exists(
      select 1 from public.listing_requirement_evidence e
      where e.user_id=v_uid and e.requirement_id=v_rule.id and e.scope_id=p_scope_id
        and e.document_type=v_doc and e.is_deleted=false
        and (
          (v_rule.document_must_be_verified and e.status='verified')
          or
          (not v_rule.document_must_be_verified and e.status in ('submitted','under_review','verified'))
        )
    ) then
      v_missing:=array_append(v_missing,v_doc);
    end if;
  end loop;

  if cardinality(v_missing)>0 then
    v_ok:=false;
    v_reasons:=v_reasons||jsonb_build_array(jsonb_build_object(
      'code','documents_required','message','Upload the required listing evidence before submitting this listing.'
    ));
  end if;

  return jsonb_build_object(
    'required',true,
    'eligible',v_ok,
    'requirement_id',v_rule.id,
    'rule_key',v_rule.rule_key,
    'name',v_rule.name,
    'require_kyc',v_rule.require_kyc,
    'kyc_status',v_kyc_status,
    'required_kyc_status',to_jsonb(v_rule.required_kyc_status),
    'required_document_types',to_jsonb(v_rule.required_document_types),
    'missing_documents',to_jsonb(v_missing),
    'document_must_be_verified',v_rule.document_must_be_verified,
    'message',v_rule.user_message,
    'reasons',v_reasons
  );
end;
$$;
revoke all on function public.get_my_listing_verification_status(text,uuid,uuid) from public,anon;
grant execute on function public.get_my_listing_verification_status(text,uuid,uuid) to authenticated;

create or replace function public.register_listing_requirement_evidence(
  p_requirement_id uuid,
  p_scope_id uuid,
  p_document_type text,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_size_bytes bigint
)
returns public.listing_requirement_evidence
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_rule public.listing_verification_rules%rowtype;
  v_row public.listing_requirement_evidence%rowtype;
  v_prefix text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_scope_id is null then raise exception 'listing verification scope is required'; end if;
  select * into v_rule from public.listing_verification_rules
    where id=p_requirement_id and is_active=true;
  if v_rule.id is null then raise exception 'listing verification requirement not found'; end if;
  if not (p_document_type=any(v_rule.required_document_types)) then
    raise exception 'document type is not required for this listing';
  end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp') then
    raise exception 'unsupported document type';
  end if;
  if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>20971520 then
    raise exception 'document must be 20MB or smaller';
  end if;
  v_prefix:=v_uid::text||'/'||p_scope_id::text||'/';
  if left(p_storage_path,length(v_prefix))<>v_prefix then
    raise exception 'invalid listing evidence path';
  end if;

  insert into public.listing_requirement_evidence(
    user_id,requirement_id,scope_id,document_type,storage_bucket,storage_path,
    original_file_name,mime_type,size_bytes,status
  ) values(
    v_uid,p_requirement_id,p_scope_id,p_document_type,'listing-evidence',p_storage_path,
    p_original_file_name,p_mime_type,p_size_bytes,'submitted'
  ) returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.register_listing_requirement_evidence(uuid,uuid,text,text,text,text,bigint) from public,anon;
grant execute on function public.register_listing_requirement_evidence(uuid,uuid,text,text,text,text,bigint) to authenticated;

create or replace function public.enforce_product_listing_verification()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_check jsonb;
  v_role text:=coalesce(auth.role(),'');
begin
  if v_role='service_role' or v_uid is null or public.is_admin(v_uid) then return new; end if;
  if new.uploaded_by is distinct from v_uid then raise exception 'listing owner mismatch'; end if;

  v_check:=public.get_my_listing_verification_status(new.product_type,new.listing_taxonomy_category_id,new.compliance_scope_id);
  if coalesce((v_check->>'required')::boolean,false)
     and not coalesce((v_check->>'eligible')::boolean,false) then
    raise exception 'Listing verification required: %',coalesce(v_check->>'message','Complete the required KYC and listing documents in Settings before posting this item.');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_product_listing_verification on public.products;
create trigger trg_enforce_product_listing_verification
before insert or update of product_type,listing_taxonomy_category_id,compliance_scope_id
on public.products
for each row execute function public.enforce_product_listing_verification();

create or replace function public.link_product_listing_evidence()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.compliance_scope_id is not null then
    update public.listing_requirement_evidence
    set listing_id=new.id,updated_at=now()
    where user_id=new.uploaded_by and scope_id=new.compliance_scope_id and listing_id is null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_link_product_listing_evidence on public.products;
create trigger trg_link_product_listing_evidence
after insert on public.products
for each row execute function public.link_product_listing_evidence();

-- Seed initial ownership-sensitive physical categories requested by DRIGHT.
insert into public.listing_verification_rules(
  listing_type_code,taxonomy_category_id,rule_key,name,require_kyc,
  required_kyc_status,required_document_types,document_must_be_verified,user_message,metadata
)
select 'PHYSICAL',c.id,'physical_mobile_phone_ownership','Mobile phone ownership verification',true,
       array['approved']::text[],array['proof_of_purchase']::text[],false,
       'Mobile phone listings require completed KYC and proof of purchase/ownership before submission.',
       jsonb_build_object('seed','dright_profile_completion_20260926')
from public.marketplace_taxonomy_categories c
where c.listing_type_code='PHYSICAL' and c.slug='mobile-smart-phones'
on conflict(rule_key) do update set
  taxonomy_category_id=excluded.taxonomy_category_id,is_active=true,require_kyc=excluded.require_kyc,
  required_kyc_status=excluded.required_kyc_status,required_document_types=excluded.required_document_types,
  document_must_be_verified=excluded.document_must_be_verified,user_message=excluded.user_message,
  metadata=excluded.metadata,updated_at=now();

insert into public.listing_verification_rules(
  listing_type_code,taxonomy_category_id,rule_key,name,require_kyc,
  required_kyc_status,required_document_types,document_must_be_verified,user_message,metadata
)
select 'PHYSICAL',c.id,'physical_motor_vehicle_ownership','Motor vehicle ownership verification',true,
       array['approved']::text[],array['vehicle_registration','proof_of_ownership']::text[],false,
       'Motor vehicle listings require completed KYC plus vehicle registration and proof of ownership before submission.',
       jsonb_build_object('seed','dright_profile_completion_20260926')
from public.marketplace_taxonomy_categories c
where c.listing_type_code='PHYSICAL' and c.slug='motor-vehicles'
on conflict(rule_key) do update set
  taxonomy_category_id=excluded.taxonomy_category_id,is_active=true,require_kyc=excluded.require_kyc,
  required_kyc_status=excluded.required_kyc_status,required_document_types=excluded.required_document_types,
  document_must_be_verified=excluded.document_must_be_verified,user_message=excluded.user_message,
  metadata=excluded.metadata,updated_at=now();

commit;
