-- Align taxonomy product-edit approval with DRIGHT2's existing Product Edit reviewer roles.
-- This does not grant any direct table access; it only lets the same active admin
-- roles already routed to /admin/product-edits apply the additive extension after approval.

begin;

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
  v_is_admin boolean := false;
  v_admin_status text;
  v_admin_role text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(is_admin,false), admin_status, admin_role
    into v_is_admin, v_admin_status, v_admin_role
  from public.users
  where id=v_uid;

  if not (
    (
      v_is_admin = true
      and v_admin_status = 'active'
      and v_admin_role in (
        'super_admin',
        'marketplace_admin',
        'marketplace_moderator',
        'marketplace_manager',
        'product_moderator'
      )
    )
    or public.has_dright_permission('marketplace','approve')
    or public.has_dright_permission('marketplace','edit')
  ) then
    raise exception 'Product edit review permission required';
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

revoke all on function public.admin_apply_product_listing_extension_edit(uuid,uuid,jsonb,jsonb)
  from public,anon;
grant execute on function public.admin_apply_product_listing_extension_edit(uuid,uuid,jsonb,jsonb)
  to authenticated,service_role;

comment on function public.admin_apply_product_listing_extension_edit(uuid,uuid,jsonb,jsonb) is
  'Applies approved taxonomy metadata for the same active DRIGHT2 admin roles already authorized for Product Edit Approvals, or admins with marketplace approve/edit permission.';

commit;
