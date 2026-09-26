
begin;

create table if not exists public.listing_requirement_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.listing_requirement_evidence(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  previous_status text,
  new_status text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists listing_requirement_evidence_reviews_evidence_idx
  on public.listing_requirement_evidence_reviews(evidence_id,created_at desc);

alter table public.listing_requirement_evidence_reviews enable row level security;
drop policy if exists listing_requirement_evidence_reviews_admin_read on public.listing_requirement_evidence_reviews;
create policy listing_requirement_evidence_reviews_admin_read
on public.listing_requirement_evidence_reviews
for select to authenticated
using(
  public.has_dright_permission('products','review')
  or public.has_dright_permission('products','approve')
  or public.has_dright_permission('marketplace','view')
);

create or replace function public.get_admin_listing_evidence(p_listing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_kind text;
  v_result jsonb;
begin
  select public.product_listing_kind(p.product_type)
  into v_kind
  from public.products p
  where p.id=p_listing_id;

  if v_kind is null then raise exception 'Listing not found'; end if;
  if not public.can_review_listing_kind(v_kind,'review') then
    raise exception 'Missing listing review permission';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,
    'requirement_id',e.requirement_id,
    'requirement_name',r.name,
    'document_type',e.document_type,
    'storage_bucket',e.storage_bucket,
    'storage_path',e.storage_path,
    'original_file_name',e.original_file_name,
    'mime_type',e.mime_type,
    'size_bytes',e.size_bytes,
    'status',e.status,
    'user_visible_reason',e.user_visible_reason,
    'reviewer_id',e.reviewer_id,
    'reviewed_at',e.reviewed_at,
    'created_at',e.created_at
  ) order by e.created_at),'[]'::jsonb)
  into v_result
  from public.listing_requirement_evidence e
  join public.listing_verification_rules r on r.id=e.requirement_id
  where e.listing_id=p_listing_id and e.is_deleted=false;

  return v_result;
end;
$$;
revoke all on function public.get_admin_listing_evidence(uuid) from public,anon;
grant execute on function public.get_admin_listing_evidence(uuid) to authenticated;

create or replace function public.review_listing_requirement_evidence(
  p_evidence_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.listing_requirement_evidence%rowtype;
  v_previous text;
  v_kind text;
begin
  if p_status not in ('under_review','verified','rejected','needs_resubmission','unreadable','expired') then
    raise exception 'Invalid evidence review status';
  end if;

  select e.* into v_row
  from public.listing_requirement_evidence e
  where e.id=p_evidence_id
  for update;

  if v_row.id is null then raise exception 'Listing evidence not found'; end if;

  select public.product_listing_kind(p.product_type)
  into v_kind
  from public.products p
  where p.id=v_row.listing_id;

  if v_kind is null then raise exception 'Linked listing not found'; end if;
  if not public.can_review_listing_kind(v_kind,
       case when p_status='verified' then 'approve' else 'review' end) then
    raise exception 'Missing listing evidence review permission';
  end if;
  if p_status in ('rejected','needs_resubmission','unreadable','expired')
     and nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'A reason is required';
  end if;

  v_previous:=v_row.status;

  update public.listing_requirement_evidence
  set status=p_status,
      user_visible_reason=case
        when p_status='verified' then null
        else nullif(btrim(coalesce(p_reason,'')),'')
      end,
      reviewer_id=auth.uid(),
      reviewed_at=now(),
      updated_at=now()
  where id=p_evidence_id;

  insert into public.listing_requirement_evidence_reviews(
    evidence_id,reviewer_id,previous_status,new_status,reason
  ) values(
    p_evidence_id,auth.uid(),v_previous,p_status,
    case when p_status='verified' then null else nullif(btrim(coalesce(p_reason,'')),'') end
  );

  insert into public.admin_activity_logs(
    admin_id,action,target_type,target_id,resource_type,resource_id,details
  ) values(
    auth.uid(),'listing_evidence_'||p_status,'listing_evidence',p_evidence_id::text,
    'listing_evidence',p_evidence_id,
    jsonb_build_object('previous_status',v_previous,'new_status',p_status,'reason',p_reason,'listing_id',v_row.listing_id)
  );

  return jsonb_build_object('success',true,'evidence_id',p_evidence_id,'previous_status',v_previous,'status',p_status);
end;
$$;
revoke all on function public.review_listing_requirement_evidence(uuid,text,text) from public,anon;
grant execute on function public.review_listing_requirement_evidence(uuid,text,text) to authenticated;

create or replace function public.enforce_product_approval_compliance()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_rule public.listing_verification_rules%rowtype;
  v_kyc_status text:='not_started';
  v_doc text;
begin
  if new.approval_status is not distinct from old.approval_status
     or new.approval_status<>'approved' then
    return new;
  end if;

  with recursive ancestors as (
    select c.id,c.parent_id,0 as depth
    from public.marketplace_taxonomy_categories c
    where c.id=new.listing_taxonomy_category_id
    union all
    select p.id,p.parent_id,a.depth+1
    from public.marketplace_taxonomy_categories p
    join ancestors a on a.parent_id=p.id
  )
  select r.* into v_rule
  from public.listing_verification_rules r
  join ancestors a on a.id=r.taxonomy_category_id
  where r.is_active=true and upper(r.listing_type_code)=upper(coalesce(new.product_type,''))
  order by a.depth asc
  limit 1;

  if v_rule.id is null then return new; end if;

  if v_rule.require_kyc then
    select coalesce(k.status,'not_started') into v_kyc_status
    from public.kyc_profiles k
    where k.user_id=new.uploaded_by and k.is_deleted=false
    order by k.updated_at desc limit 1;
    if not found then v_kyc_status:='not_started'; end if;
    if not (v_kyc_status=any(v_rule.required_kyc_status)) then
      raise exception 'Seller KYC does not satisfy this listing requirement';
    end if;
  end if;

  if cardinality(v_rule.required_document_types)>0 and new.compliance_scope_id is null then
    raise exception 'Required listing ownership evidence is missing';
  end if;

  foreach v_doc in array v_rule.required_document_types loop
    if not exists(
      select 1
      from public.listing_requirement_evidence e
      where e.user_id=new.uploaded_by
        and e.requirement_id=v_rule.id
        and e.scope_id=new.compliance_scope_id
        and e.document_type=v_doc
        and e.is_deleted=false
        and e.status='verified'
    ) then
      raise exception 'Verify all required listing ownership documents before approving this listing';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_enforce_product_approval_compliance on public.products;
create trigger trg_enforce_product_approval_compliance
before update of approval_status
on public.products
for each row execute function public.enforce_product_approval_compliance();

commit;
