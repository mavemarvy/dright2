alter table public.dright_starter_product_settings
  add column if not exists assisted_signup_enabled boolean not null default true;

alter table public.dright_client_onboarding
  add column if not exists onboarding_type text not null default 'admin_client',
  add column if not exists must_verify_email boolean not null default false,
  add column if not exists email_verified_at timestamptz,
  add column if not exists defer_profile_setup boolean not null default false,
  add column if not exists assisted_referral_code text;

create or replace function public.get_public_dright_starter_product()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_store public.dright_official_store_settings%rowtype;
  v_product public.dright_starter_product_settings%rowtype;
begin
  select * into v_store from public.dright_official_store_settings where singleton=true;
  select * into v_product from public.dright_starter_product_settings where singleton=true;

  if not coalesce(v_store.is_active,false)
     or not coalesce(v_store.public_visible,false)
     or not coalesce(v_product.is_enabled,false)
     or not coalesce(v_product.public_visible,false) then
    return jsonb_build_object('available',false);
  end if;

  return jsonb_build_object(
    'available',true,
    'store',jsonb_build_object(
      'name',v_store.name,'slug',v_store.slug,'tagline',v_store.tagline,
      'description',v_store.description,'logo_url',v_store.logo_url,
      'banner_url',v_store.banner_url,'official',true
    ),
    'product',jsonb_build_object(
      'marketplace_product_id',v_product.marketplace_product_id,
      'title',v_product.title,'subtitle',v_product.subtitle,'description',v_product.description,
      'category',v_product.category,'price',v_product.price,'currency',v_product.currency,
      'affiliate_commission_percent',v_product.affiliate_commission_percent,
      'included_trial_days',v_product.included_trial_days,'guest_only',v_product.guest_only,
      'assisted_signup_enabled',v_product.assisted_signup_enabled,
      'official_badge_enabled',v_product.official_badge_enabled,
      'official_rating_enabled',v_product.official_rating_enabled,
      'official_rating',v_product.official_rating,'benefits',v_product.benefits,
      'image_url',coalesce(v_product.image_url,'/dright-logo.webp'),
      'image_urls',case
        when jsonb_array_length(coalesce(v_product.image_urls,'[]'::jsonb))>0 then v_product.image_urls
        else jsonb_build_array(coalesce(v_product.image_url,'/dright-logo.webp'))
      end
    )
  );
end;
$$;

create or replace function public.super_admin_set_starter_assisted_signup_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Super Admin permission required';
  end if;
  update public.dright_starter_product_settings
  set assisted_signup_enabled=coalesce(p_enabled,false),
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;
  return coalesce(p_enabled,false);
end;
$$;

revoke all on function public.super_admin_set_starter_assisted_signup_enabled(boolean) from public,anon;
grant execute on function public.super_admin_set_starter_assisted_signup_enabled(boolean) to authenticated;
