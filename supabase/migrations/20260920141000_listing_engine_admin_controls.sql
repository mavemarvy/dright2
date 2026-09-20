-- Admin controls for the additive DRIGHT2 listing engine.
-- Reuses existing marketplace.manage_categories RBAC.
-- Legacy fallback is intentionally forced ON in this phase.

begin;

create or replace function public.admin_update_marketplace_engine_settings(
  p_taxonomy_enabled boolean,
  p_dynamic_forms_enabled boolean,
  p_seller_commission_policy_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.marketplace_engine_settings%rowtype;
begin
  if v_uid is null
     or not public.has_dright_permission('marketplace','manage_categories') then
    raise exception 'Marketplace management permission required';
  end if;

  update public.marketplace_engine_settings
  set taxonomy_enabled=coalesce(p_taxonomy_enabled,false),
      dynamic_forms_enabled=coalesce(p_dynamic_forms_enabled,false),
      seller_commission_policy_enabled=coalesce(p_seller_commission_policy_enabled,false),
      legacy_fallback_enabled=true,
      updated_by=v_uid,
      updated_at=now()
  where id=true
  returning * into v_row;

  if not found then
    raise exception 'Marketplace engine settings row not found';
  end if;

  return jsonb_build_object(
    'taxonomy_enabled',v_row.taxonomy_enabled,
    'dynamic_forms_enabled',v_row.dynamic_forms_enabled,
    'seller_commission_policy_enabled',v_row.seller_commission_policy_enabled,
    'legacy_fallback_enabled',v_row.legacy_fallback_enabled,
    'engine_version',v_row.engine_version,
    'updated_at',v_row.updated_at
  );
end;
$$;

create or replace function public.admin_upsert_marketplace_seller_commission_policy(
  p_listing_type_code text,
  p_default_percentage numeric,
  p_min_percentage numeric,
  p_max_percentage numeric,
  p_allow_seller_override boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_listing_type_code,'')));
  v_id uuid;
begin
  if v_uid is null
     or not public.has_dright_permission('marketplace','manage_categories') then
    raise exception 'Marketplace management permission required';
  end if;

  if not exists (
    select 1 from public.marketplace_listing_types
    where code=v_code and is_enabled=true
  ) then
    raise exception 'Unsupported listing type';
  end if;

  if p_min_percentage < 0
     or p_max_percentage > 100
     or p_min_percentage > p_default_percentage
     or p_default_percentage > p_max_percentage then
    raise exception 'Commission values must satisfy 0 <= min <= default <= max <= 100';
  end if;

  select id into v_id
  from public.marketplace_seller_commission_policies
  where listing_type_code=v_code
    and category_id is null
    and commission_kind='affiliate'
    and priority=100
  order by created_at desc
  limit 1;

  if v_id is null then
    insert into public.marketplace_seller_commission_policies(
      listing_type_code,category_id,commission_kind,
      default_percentage,min_percentage,max_percentage,
      allow_seller_override,priority,is_active,metadata
    )
    values(
      v_code,null,'affiliate',
      p_default_percentage,p_min_percentage,p_max_percentage,
      coalesce(p_allow_seller_override,true),100,true,
      jsonb_build_object('updated_by_admin',v_uid)
    )
    returning id into v_id;
  else
    update public.marketplace_seller_commission_policies
    set default_percentage=p_default_percentage,
        min_percentage=p_min_percentage,
        max_percentage=p_max_percentage,
        allow_seller_override=coalesce(p_allow_seller_override,true),
        is_active=true,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('updated_by_admin',v_uid),
        updated_at=now()
    where id=v_id;
  end if;

  return jsonb_build_object('success',true,'policy_id',v_id,'listing_type_code',v_code);
end;
$$;

revoke all on function public.admin_update_marketplace_engine_settings(boolean,boolean,boolean)
  from public,anon;
revoke all on function public.admin_upsert_marketplace_seller_commission_policy(text,numeric,numeric,numeric,boolean)
  from public,anon;

grant execute on function public.admin_update_marketplace_engine_settings(boolean,boolean,boolean)
  to authenticated,service_role;
grant execute on function public.admin_upsert_marketplace_seller_commission_policy(text,numeric,numeric,numeric,boolean)
  to authenticated,service_role;

commit;
