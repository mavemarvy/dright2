-- Product edit compatibility for additive listing taxonomy.
-- Sellers can read their own extension metadata, but taxonomy changes remain
-- pending until an existing marketplace reviewer approves the product edit.

begin;

create or replace function public.get_my_marketplace_listing_extension(
  p_entity_type text,
  p_entity_id uuid
)
returns table (
  entity_id uuid,
  listing_type_code text,
  category_id uuid,
  schema_version integer,
  attributes jsonb,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_entity_type,'')));
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_type='product' then
    select uploaded_by into v_owner
    from public.products
    where id=p_entity_id;
  elsif v_type='job' then
    select employer_id into v_owner
    from public.jobs
    where id=p_entity_id;
  else
    raise exception 'Unsupported entity type';
  end if;

  if v_owner is null then
    raise exception 'Listing not found';
  end if;
  if v_owner <> v_uid then
    raise exception 'Not permitted for this listing';
  end if;

  return query
  select
    e.entity_id,
    e.listing_type_code,
    e.category_id,
    e.schema_version,
    e.attributes,
    e.metadata
  from public.marketplace_listing_extensions e
  where e.entity_type=v_type
    and e.entity_id=p_entity_id;
end;
$$;

create or replace function public.admin_apply_product_listing_extension_edit(
  p_product_id uuid,
  p_category_id uuid,
  p_attributes jsonb,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_listing_type text;
  v_existing public.marketplace_listing_extensions%rowtype;
  v_reserved jsonb := '{}'::jsonb;
  v_result uuid;
begin
  if v_uid is null
     or not (
       public.has_dright_permission('marketplace','approve')
       or public.has_dright_permission('marketplace','edit')
     ) then
    raise exception 'Marketplace approval or edit permission required';
  end if;

  select upper(product_type)
    into v_listing_type
  from public.products
  where id=p_product_id;

  if v_listing_type is null then
    raise exception 'Product not found';
  end if;

  if p_category_id is not null and not exists (
    select 1
    from public.marketplace_taxonomy_categories c
    where c.id=p_category_id
      and c.listing_type_code=v_listing_type
      and c.is_active=true
  ) then
    raise exception 'Category does not belong to this product type';
  end if;

  select *
    into v_existing
  from public.marketplace_listing_extensions
  where entity_type='product'
    and entity_id=p_product_id;

  if found then
    v_reserved := jsonb_strip_nulls(jsonb_build_object(
      'seller_affiliate_commission_percent', v_existing.attributes->'seller_affiliate_commission_percent',
      'seller_commission_policy_id', v_existing.attributes->'seller_commission_policy_id',
      'seller_commission_policy_snapshot', v_existing.attributes->'seller_commission_policy_snapshot'
    ));

    update public.marketplace_listing_extensions
    set listing_type_code=v_listing_type,
        category_id=p_category_id,
        attributes=coalesce(p_attributes,'{}'::jsonb) || v_reserved,
        metadata=coalesce(v_existing.metadata,'{}'::jsonb)
          || coalesce(p_metadata,'{}'::jsonb)
          || jsonb_build_object(
            'last_approved_extension_editor',v_uid,
            'last_approved_extension_edit_at',now()
          ),
        updated_at=now()
    where id=v_existing.id
    returning id into v_result;
  else
    insert into public.marketplace_listing_extensions(
      entity_type,entity_id,listing_type_code,category_id,schema_version,
      attributes,metadata
    )
    values(
      'product',p_product_id,v_listing_type,p_category_id,1,
      coalesce(p_attributes,'{}'::jsonb),
      coalesce(p_metadata,'{}'::jsonb)
        || jsonb_build_object(
          'source','approved_product_edit',
          'last_approved_extension_editor',v_uid,
          'last_approved_extension_edit_at',now()
        )
    )
    returning id into v_result;
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_my_marketplace_listing_extension(text,uuid)
  from public,anon;
revoke all on function public.admin_apply_product_listing_extension_edit(uuid,uuid,jsonb,jsonb)
  from public,anon;

grant execute on function public.get_my_marketplace_listing_extension(text,uuid)
  to authenticated,service_role;
grant execute on function public.admin_apply_product_listing_extension_edit(uuid,uuid,jsonb,jsonb)
  to authenticated,service_role;

comment on function public.get_my_marketplace_listing_extension(text,uuid) is
  'Owner-only read of additive listing metadata; does not expose protected financial tables.';
comment on function public.admin_apply_product_listing_extension_edit(uuid,uuid,jsonb,jsonb) is
  'Applies taxonomy/dynamic attributes only after existing product-edit approval. Preserves reserved seller commission metadata and does not modify pricing, Sales Team, promotion, platform fee, orders, wallet, payouts, or refunds.';

commit;
