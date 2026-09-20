-- DRIGHT2 listing engine compatibility bridge.
-- Additive-only: does not alter existing product/job/order/payment/promotion/Sales Team fee columns.

begin;

with seed(listing_type_code, name, slug, sort_order) as (
  values
    ('PHYSICAL','General','general',10),
    ('PHYSICAL','Electronics','electronics',20),
    ('PHYSICAL','Fashion','fashion',30),
    ('PHYSICAL','Health & Beauty','health-beauty',40),
    ('PHYSICAL','Home & Garden','home-garden',50),
    ('PHYSICAL','Food & Beverage','food-beverage',60),
    ('PHYSICAL','Sports & Fitness','sports-fitness',70),
    ('PHYSICAL','Books & Media','books-media',80),
    ('PHYSICAL','Toys & Games','toys-games',90),
    ('DIGITAL','General','general',10),
    ('DIGITAL','Software & Digital','software-digital',20),
    ('DIGITAL','Design','design',30),
    ('DIGITAL','Writing','writing',40),
    ('DIGITAL','Development','development',50),
    ('DIGITAL','Marketing','marketing',60),
    ('DIGITAL','Education','education',70),
    ('DIGITAL','Business','business',80),
    ('SERVICE','Writing','writing',10),
    ('SERVICE','Design','design',20),
    ('SERVICE','Consulting','consulting',30),
    ('SERVICE','Development','development',40),
    ('SERVICE','Marketing','marketing',50),
    ('SERVICE','Education','education',60),
    ('SERVICE','Business','business',70),
    ('SERVICE','Proofreading','proofreading',80),
    ('SERVICE','Therapy','therapy',90),
    ('SERVICE','Other','other',100),
    ('COURSE','General','general',10),
    ('COURSE','Education','education',20),
    ('COURSE','Business','business',30),
    ('COURSE','Technology & Engineering','technology-engineering',40),
    ('COURSE','Design & Creative','design-creative',50),
    ('COURSE','Marketing','marketing',60),
    ('JOB','Advertising & Marketing','advertising-marketing',10),
    ('JOB','YouTube Automation','youtube-automation',20),
    ('JOB','Technology & Engineering','technology-engineering',30),
    ('JOB','Design & Creative','design-creative',40),
    ('JOB','Sales & Business Development','sales-business-development',50),
    ('JOB','Customer Support','customer-support',60),
    ('JOB','Finance & Accounting','finance-accounting',70),
    ('JOB','Content & Writing','content-writing',80),
    ('JOB','Education & Training','education-training',90),
    ('JOB','Healthcare','healthcare',100),
    ('JOB','Legal','legal',110),
    ('JOB','Other','other',120),
    ('TASK','Digital Task','digital-task',10),
    ('TASK','Local Task','local-task',20)
)
insert into public.marketplace_taxonomy_categories
  (listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata)
select
  s.listing_type_code,null,s.name,s.slug,s.sort_order,false,true,
  jsonb_build_object('seed_kind','legacy_compatibility_root')
from seed s
where not exists (
  select 1
  from public.marketplace_taxonomy_categories c
  where c.listing_type_code=s.listing_type_code
    and c.parent_id is null
    and lower(c.slug)=lower(s.slug)
);

create or replace function public.upsert_marketplace_listing_extension(
  p_entity_type text,
  p_entity_id uuid,
  p_listing_type_code text,
  p_category_id uuid default null,
  p_schema_version integer default 1,
  p_attributes jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_seller_affiliate_commission numeric default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_entity_type text := lower(trim(coalesce(p_entity_type,'')));
  v_listing_type text := upper(trim(coalesce(p_listing_type_code,'')));
  v_owner_id uuid;
  v_actual_type text;
  v_settings public.marketplace_engine_settings%rowtype;
  v_policy record;
  v_attributes jsonb := coalesce(p_attributes,'{}'::jsonb);
  v_result_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_settings
  from public.marketplace_engine_settings
  where id=true;

  if not found or not (
    v_settings.taxonomy_enabled
    or v_settings.dynamic_forms_enabled
    or v_settings.seller_commission_policy_enabled
  ) then
    raise exception 'Listing engine features are not enabled';
  end if;

  if v_listing_type = '' or not exists (
    select 1 from public.marketplace_listing_types
    where code=v_listing_type and is_enabled=true
  ) then
    raise exception 'Unsupported listing type';
  end if;

  if v_entity_type='product' then
    select uploaded_by, upper(product_type)
      into v_owner_id, v_actual_type
    from public.products
    where id=p_entity_id;

    if v_owner_id is null then raise exception 'Product not found'; end if;
    if v_owner_id <> v_uid then raise exception 'Not permitted for this product'; end if;
    if v_listing_type <> v_actual_type then
      raise exception 'Listing type does not match product type';
    end if;
  elsif v_entity_type='job' then
    select employer_id into v_owner_id
    from public.jobs
    where id=p_entity_id;

    if v_owner_id is null then raise exception 'Job not found'; end if;
    if v_owner_id <> v_uid then raise exception 'Not permitted for this job'; end if;
    if v_listing_type <> 'JOB' then raise exception 'Job listing type must be JOB'; end if;
  else
    raise exception 'Unsupported entity type';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.marketplace_taxonomy_categories
    where id=p_category_id
      and listing_type_code=v_listing_type
      and is_active=true
  ) then
    raise exception 'Category does not belong to this listing type';
  end if;

  if p_schema_version < 1 then
    raise exception 'Invalid schema version';
  end if;

  if p_seller_affiliate_commission is not null then
    if not v_settings.seller_commission_policy_enabled then
      raise exception 'Seller commission policy is not enabled';
    end if;

    select * into v_policy
    from public.resolve_marketplace_seller_commission_policy(v_listing_type,p_category_id);

    if v_policy.policy_id is null then
      raise exception 'No seller commission policy is configured';
    end if;

    if not v_policy.allow_seller_override
       and p_seller_affiliate_commission <> v_policy.default_percentage then
      raise exception 'Seller commission is fixed at % percent', v_policy.default_percentage;
    end if;

    if p_seller_affiliate_commission < v_policy.min_percentage
       or p_seller_affiliate_commission > v_policy.max_percentage then
      raise exception 'Seller commission must be between % and % percent',
        v_policy.min_percentage, v_policy.max_percentage;
    end if;

    v_attributes := v_attributes || jsonb_build_object(
      'seller_affiliate_commission_percent', round(p_seller_affiliate_commission,3),
      'seller_commission_policy_id', v_policy.policy_id,
      'seller_commission_policy_snapshot', jsonb_build_object(
        'default_percentage',v_policy.default_percentage,
        'min_percentage',v_policy.min_percentage,
        'max_percentage',v_policy.max_percentage,
        'allow_seller_override',v_policy.allow_seller_override,
        'priority',v_policy.priority
      )
    );
  end if;

  insert into public.marketplace_listing_extensions(
    entity_type,entity_id,listing_type_code,category_id,schema_version,attributes,metadata
  )
  values(
    v_entity_type,p_entity_id,v_listing_type,p_category_id,p_schema_version,
    v_attributes,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(entity_type,entity_id)
  do update set
    listing_type_code=excluded.listing_type_code,
    category_id=excluded.category_id,
    schema_version=excluded.schema_version,
    attributes=excluded.attributes,
    metadata=excluded.metadata,
    updated_at=now()
  returning id into v_result_id;

  return v_result_id;
end;
$$;

revoke all on function public.upsert_marketplace_listing_extension(
  text,uuid,text,uuid,integer,jsonb,jsonb,numeric
) from public,anon;

grant execute on function public.upsert_marketplace_listing_extension(
  text,uuid,text,uuid,integer,jsonb,jsonb,numeric
) to authenticated,service_role;

comment on function public.upsert_marketplace_listing_extension(
  text,uuid,text,uuid,integer,jsonb,jsonb,numeric
) is 'Ownership-checked bridge from existing products/jobs into additive listing-engine metadata. Does not modify payout, Admin Task, Sales Team, promotion, platform fee, or order authority.';

commit;
