begin;

-- Admin-controlled component visibility for the Marketplace "Discover More" row.
insert into public.user_navigation_visibility
  (feature_key,label,route,nav_group,visible,visible_to_admins,feature_scope,sort_order)
values
  ('marketplace_discover_more','Marketplace Discover More','component:marketplace-discover-more','Marketplace Components',true,true,'component',340)
on conflict (feature_key) do update
set label=excluded.label,
    route=excluded.route,
    nav_group=excluded.nav_group,
    feature_scope=excluded.feature_scope,
    sort_order=excluded.sort_order;

-- Extend the existing listing-verification architecture to additional high-value
-- physical device categories where proof of purchase/ownership is appropriate.
insert into public.listing_verification_rules(
  listing_type_code,taxonomy_category_id,rule_key,name,require_kyc,
  required_kyc_status,required_document_types,document_must_be_verified,user_message,metadata
)
select
  'PHYSICAL',c.id,'physical_laptop_ownership','Laptop ownership verification',true,
  array['approved']::text[],array['proof_of_purchase']::text[],false,
  'Laptop listings require completed KYC and proof of purchase/ownership before submission.',
  jsonb_build_object('risk_class','high_value_ownership','anti_fraud',true)
from public.marketplace_taxonomy_categories c
where c.listing_type_code='PHYSICAL' and c.slug='laptops' and c.is_active=true
order by c.created_at asc
limit 1
on conflict(rule_key) do update
set taxonomy_category_id=excluded.taxonomy_category_id,
    name=excluded.name,
    is_active=true,
    require_kyc=excluded.require_kyc,
    required_kyc_status=excluded.required_kyc_status,
    required_document_types=excluded.required_document_types,
    document_must_be_verified=excluded.document_must_be_verified,
    user_message=excluded.user_message,
    metadata=excluded.metadata,
    updated_at=now();

insert into public.listing_verification_rules(
  listing_type_code,taxonomy_category_id,rule_key,name,require_kyc,
  required_kyc_status,required_document_types,document_must_be_verified,user_message,metadata
)
select
  'PHYSICAL',c.id,'physical_tablet_ownership','Tablet ownership verification',true,
  array['approved']::text[],array['proof_of_purchase']::text[],false,
  'Tablet listings require completed KYC and proof of purchase/ownership before submission.',
  jsonb_build_object('risk_class','high_value_ownership','anti_fraud',true)
from public.marketplace_taxonomy_categories c
where c.listing_type_code='PHYSICAL' and c.slug='tablets' and c.is_active=true
order by c.created_at asc
limit 1
on conflict(rule_key) do update
set taxonomy_category_id=excluded.taxonomy_category_id,
    name=excluded.name,
    is_active=true,
    require_kyc=excluded.require_kyc,
    required_kyc_status=excluded.required_kyc_status,
    required_document_types=excluded.required_document_types,
    document_must_be_verified=excluded.document_must_be_verified,
    user_message=excluded.user_message,
    metadata=excluded.metadata,
    updated_at=now();

insert into public.listing_verification_rules(
  listing_type_code,taxonomy_category_id,rule_key,name,require_kyc,
  required_kyc_status,required_document_types,document_must_be_verified,user_message,metadata
)
select
  'PHYSICAL',c.id,'physical_camera_ownership','Camera ownership verification',true,
  array['approved']::text[],array['proof_of_purchase']::text[],false,
  'Camera listings require completed KYC and proof of purchase/ownership before submission.',
  jsonb_build_object('risk_class','high_value_ownership','anti_fraud',true)
from public.marketplace_taxonomy_categories c
join public.marketplace_taxonomy_categories p on p.id=c.parent_id
where c.listing_type_code='PHYSICAL'
  and c.slug='cameras'
  and c.is_active=true
  and p.slug='electronics'
  and p.parent_id is null
order by c.created_at asc
limit 1
on conflict(rule_key) do update
set taxonomy_category_id=excluded.taxonomy_category_id,
    name=excluded.name,
    is_active=true,
    require_kyc=excluded.require_kyc,
    required_kyc_status=excluded.required_kyc_status,
    required_document_types=excluded.required_document_types,
    document_must_be_verified=excluded.document_must_be_verified,
    user_message=excluded.user_message,
    metadata=excluded.metadata,
    updated_at=now();

commit;