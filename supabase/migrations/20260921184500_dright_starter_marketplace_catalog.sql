begin;

alter table public.dright_official_store_settings
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table public.dright_starter_product_settings
  add column if not exists marketplace_product_id uuid references public.products(id) on delete set null;

create or replace function public.sync_dright_starter_marketplace_product()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid;
  v_product uuid;
  v_store public.dright_official_store_settings%rowtype;
  v_settings public.dright_starter_product_settings%rowtype;
begin
  select * into v_store
  from public.dright_official_store_settings
  where singleton=true
  limit 1;

  select * into v_settings
  from public.dright_starter_product_settings
  where singleton=true
  limit 1;

  if v_settings.singleton is null then
    return coalesce(new, old);
  end if;

  v_owner := v_store.owner_user_id;

  if v_owner is null then
    select u.id into v_owner
    from public.users u
    where u.is_admin=true
      and lower(coalesce(u.admin_role,''))='super_admin'
      and lower(coalesce(u.admin_status,''))='active'
      and upper(coalesce(u.account_status,'ACTIVE'))='ACTIVE'
    order by u.created_at asc
    limit 1;

    if v_owner is not null then
      update public.dright_official_store_settings
      set owner_user_id=v_owner, updated_at=now()
      where singleton=true;
    end if;
  end if;

  if v_owner is null then
    return coalesce(new, old);
  end if;

  v_product := v_settings.marketplace_product_id;

  if v_product is not null
     and not exists(select 1 from public.products where id=v_product) then
    v_product := null;
  end if;

  if v_product is null then
    insert into public.products(
      uploaded_by,name,description,price,commission_rate,image_url,category,
      is_active,approval_status,admin_task_percent,sales_team_task_percent,
      affiliate_commission_percent,total_reviews,average_rating,one_star_count,
      is_hidden,is_free,stock_quantity,initial_stock,product_type,
      has_dright_sales_team,total_sales,view_count,tags,sku,brand,condition,
      specifications,is_featured,is_sponsored,reviewed_at
    ) values (
      v_owner,
      v_settings.title,
      v_settings.description,
      v_settings.price,
      0,
      null,
      v_settings.category,
      v_settings.is_enabled and v_settings.public_visible,
      'approved',
      0,
      0,
      v_settings.affiliate_commission_percent,
      0,
      0,
      0,
      not (v_settings.is_enabled and v_settings.public_visible),
      false,
      null,
      null,
      'DIGITAL',
      false,
      0,
      0,
      array['DRIGHT','Sign Up','Starter Access','Official DRIGHT Product','Affiliate Test Product']::text[],
      'DRIGHT-STARTER-ACCESS',
      'DRIGHT',
      'new',
      jsonb_build_object(
        'system_product_kind','dright_starter_access',
        'first_party',true,
        'special_route','/dright/starter',
        'platform_fee_percent',0,
        'official_store',true,
        'official_badge_enabled',v_settings.official_badge_enabled,
        'official_rating_enabled',v_settings.official_rating_enabled,
        'official_rating',v_settings.official_rating,
        'included_trial_days',v_settings.included_trial_days,
        'guest_only',v_settings.guest_only
      ),
      true,
      false,
      now()
    )
    returning id into v_product;

    update public.dright_starter_product_settings
    set marketplace_product_id=v_product, updated_at=now()
    where singleton=true;
  else
    update public.products
    set uploaded_by=v_owner,
        name=v_settings.title,
        description=v_settings.description,
        price=v_settings.price,
        commission_rate=0,
        category=v_settings.category,
        is_active=v_settings.is_enabled and v_settings.public_visible,
        approval_status='approved',
        rejection_reason=null,
        admin_task_percent=0,
        sales_team_task_percent=0,
        affiliate_commission_percent=v_settings.affiliate_commission_percent,
        is_hidden=not (v_settings.is_enabled and v_settings.public_visible),
        is_free=false,
        product_type='DIGITAL',
        has_dright_sales_team=false,
        tags=array['DRIGHT','Sign Up','Starter Access','Official DRIGHT Product','Affiliate Test Product']::text[],
        sku='DRIGHT-STARTER-ACCESS',
        brand='DRIGHT',
        condition='new',
        specifications=coalesce(specifications,'{}'::jsonb) || jsonb_build_object(
          'system_product_kind','dright_starter_access',
          'first_party',true,
          'special_route','/dright/starter',
          'platform_fee_percent',0,
          'official_store',true,
          'official_badge_enabled',v_settings.official_badge_enabled,
          'official_rating_enabled',v_settings.official_rating_enabled,
          'official_rating',v_settings.official_rating,
          'included_trial_days',v_settings.included_trial_days,
          'guest_only',v_settings.guest_only
        ),
        is_featured=true,
        is_sponsored=false,
        reviewed_at=coalesce(reviewed_at,now()),
        updated_at=now()
    where id=v_product;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_dright_starter_marketplace_product() from public,anon,authenticated;
grant execute on function public.sync_dright_starter_marketplace_product() to service_role;

drop trigger if exists sync_dright_starter_marketplace_product_trigger
on public.dright_starter_product_settings;

create trigger sync_dright_starter_marketplace_product_trigger
after insert or update of
  title,description,category,price,affiliate_commission_percent,
  included_trial_days,is_enabled,public_visible,guest_only,
  official_badge_enabled,official_rating_enabled,official_rating
on public.dright_starter_product_settings
for each row execute function public.sync_dright_starter_marketplace_product();

-- Seed/synchronize the canonical catalog mirror now.
do $$
begin
  perform public.sync_dright_starter_marketplace_product();
end $$;

commit;