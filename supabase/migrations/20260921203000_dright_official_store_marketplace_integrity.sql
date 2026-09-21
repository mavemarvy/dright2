begin;

create or replace function public.get_public_dright_official_store()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_store public.dright_official_store_settings%rowtype;
  v_product public.dright_starter_product_settings%rowtype;
  v_starter_available boolean:=false;
begin
  select * into v_store
  from public.dright_official_store_settings
  where singleton=true;

  if not coalesce(v_store.is_active,false)
     or not coalesce(v_store.public_visible,false) then
    return jsonb_build_object('available',false);
  end if;

  select * into v_product
  from public.dright_starter_product_settings
  where singleton=true;

  v_starter_available :=
    coalesce(v_product.is_enabled,false)
    and coalesce(v_product.public_visible,false);

  return jsonb_build_object(
    'available',true,
    'store',jsonb_build_object(
      'name',v_store.name,
      'slug',v_store.slug,
      'tagline',v_store.tagline,
      'description',v_store.description,
      'logo_url',v_store.logo_url,
      'banner_url',v_store.banner_url,
      'official',true
    ),
    'starter_available',v_starter_available,
    'starter_product',case when v_starter_available then jsonb_build_object(
      'marketplace_product_id',v_product.marketplace_product_id,
      'title',v_product.title,
      'subtitle',v_product.subtitle,
      'category',v_product.category,
      'price',v_product.price,
      'currency',v_product.currency,
      'affiliate_commission_percent',v_product.affiliate_commission_percent,
      'included_trial_days',v_product.included_trial_days,
      'official_rating_enabled',v_product.official_rating_enabled,
      'official_rating',v_product.official_rating
    ) else null end
  );
end;
$$;

revoke all on function public.get_public_dright_official_store() from public;
grant execute on function public.get_public_dright_official_store() to anon,authenticated,service_role;

create or replace function public.get_public_dright_starter_product()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_store public.dright_official_store_settings%rowtype;
  v_product public.dright_starter_product_settings%rowtype;
begin
  select * into v_store
  from public.dright_official_store_settings
  where singleton=true;

  select * into v_product
  from public.dright_starter_product_settings
  where singleton=true;

  if not coalesce(v_store.is_active,false)
     or not coalesce(v_store.public_visible,false)
     or not coalesce(v_product.is_enabled,false)
     or not coalesce(v_product.public_visible,false) then
    return jsonb_build_object('available',false);
  end if;

  return jsonb_build_object(
    'available',true,
    'store',jsonb_build_object(
      'name',v_store.name,
      'slug',v_store.slug,
      'tagline',v_store.tagline,
      'description',v_store.description,
      'logo_url',v_store.logo_url,
      'banner_url',v_store.banner_url,
      'official',true
    ),
    'product',jsonb_build_object(
      'marketplace_product_id',v_product.marketplace_product_id,
      'title',v_product.title,
      'subtitle',v_product.subtitle,
      'description',v_product.description,
      'category',v_product.category,
      'price',v_product.price,
      'currency',v_product.currency,
      'affiliate_commission_percent',v_product.affiliate_commission_percent,
      'included_trial_days',v_product.included_trial_days,
      'guest_only',v_product.guest_only,
      'official_badge_enabled',v_product.official_badge_enabled,
      'official_rating_enabled',v_product.official_rating_enabled,
      'official_rating',v_product.official_rating,
      'benefits',v_product.benefits
    )
  );
end;
$$;

revoke all on function public.get_public_dright_starter_product() from public;
grant execute on function public.get_public_dright_starter_product() to anon,authenticated,service_role;

commit;