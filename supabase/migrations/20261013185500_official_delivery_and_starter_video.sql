-- Add protected post-purchase delivery controls for Official DRIGHT products
-- and expose a product-page YouTube video for the special DRIGHT Starter item.

create or replace function public.admin_set_dright_official_product_delivery(
  p_product_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_type text;
  v_delivery text;
  v_expiry integer;
  v_download_limit integer;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Official DRIGHT Store management permission required';
  end if;

  select p.product_type
    into v_type
  from public.products p
  join public.dright_official_products o on o.marketplace_product_id=p.id
  where p.id=p_product_id;

  if v_type is null then raise exception 'Official product not found'; end if;

  if v_type='PHYSICAL' then
    delete from public.digital_product_details where product_id=p_product_id;
    return jsonb_build_object('success',true,'delivery_type','NONE');
  end if;

  v_delivery:=upper(coalesce(
    nullif(trim(p_input->>'delivery_type'),''),
    case when v_type='COURSE' then 'LINK_ACCESS'
         when v_type='DIGITAL' then 'INSTANT_DOWNLOAD'
         else 'NONE' end
  ));

  if v_delivery='NONE' then
    if v_type <> 'SERVICE' then
      raise exception 'Digital products and courses require a delivery action';
    end if;
    delete from public.digital_product_details where product_id=p_product_id;
    return jsonb_build_object('success',true,'delivery_type','NONE');
  end if;

  if v_delivery not in ('INSTANT_DOWNLOAD','LINK_ACCESS','EMAIL_DELIVERY') then
    raise exception 'Unsupported delivery action';
  end if;

  v_expiry:=coalesce(nullif(p_input->>'expiry_days','')::integer,365);
  if v_expiry<1 or v_expiry>3650 then
    raise exception 'Access expiry must be between 1 and 3650 days';
  end if;

  v_download_limit:=nullif(p_input->>'download_limit','')::integer;

  insert into public.digital_product_details(
    product_id,delivery_type,download_file_url,download_limit,expiry_days,
    access_link,file_format,includes_bonus_materials
  ) values(
    p_product_id,
    v_delivery,
    nullif(trim(p_input->>'download_file_url'),''),
    v_download_limit,
    v_expiry,
    nullif(trim(p_input->>'access_link'),''),
    nullif(trim(p_input->>'file_format'),''),
    coalesce((p_input->>'includes_bonus_materials')::boolean,false)
  )
  on conflict(product_id) do update set
    delivery_type=excluded.delivery_type,
    download_file_url=excluded.download_file_url,
    download_limit=case
      when p_input ? 'download_limit' then excluded.download_limit
      else public.digital_product_details.download_limit
    end,
    expiry_days=excluded.expiry_days,
    access_link=excluded.access_link,
    file_format=excluded.file_format,
    includes_bonus_materials=excluded.includes_bonus_materials;

  return jsonb_build_object(
    'success',true,
    'product_id',p_product_id,
    'delivery_type',v_delivery
  );
end;
$$;

revoke all on function public.admin_set_dright_official_product_delivery(uuid,jsonb) from public;
grant execute on function public.admin_set_dright_official_product_delivery(uuid,jsonb) to authenticated;

create or replace function public.admin_list_dright_official_products()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Official DRIGHT Store management permission required';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',o.id,
        'marketplace_product_id',p.id,
        'slug',o.slug,
        'name',p.name,
        'subtitle',o.subtitle,
        'description',p.description,
        'product_type',p.product_type,
        'category',p.category,
        'price',p.price,
        'currency',o.currency,
        'affiliate_commission_percent',p.affiliate_commission_percent,
        'image_url',p.image_url,
        'image_urls',o.image_urls,
        'public_visible',o.public_visible,
        'is_enabled',o.is_enabled,
        'is_featured',p.is_featured,
        'official_badge_enabled',o.official_badge_enabled,
        'official_rating_enabled',o.official_rating_enabled,
        'official_rating',o.official_rating,
        'benefits',o.benefits,
        'expiry_days',d.expiry_days,
        'delivery_type',d.delivery_type,
        'download_file_url',d.download_file_url,
        'access_link',d.access_link,
        'file_format',d.file_format,
        'download_limit',d.download_limit,
        'includes_bonus_materials',d.includes_bonus_materials,
        'uploaded_by',p.uploaded_by,
        'created_at',o.created_at,
        'product_created_at',p.created_at,
        'commission_rate',p.commission_rate,
        'sales_team_tier',p.sales_team_tier,
        'admin_task_percent',p.admin_task_percent,
        'sales_team_task_percent',p.sales_team_task_percent,
        'is_free',p.is_free,
        'stock_quantity',p.stock_quantity,
        'initial_stock',p.initial_stock,
        'demo_video_url',p.demo_video_url,
        'total_reviews',p.total_reviews,
        'average_rating',p.average_rating,
        'total_sales',p.total_sales,
        'view_count',p.view_count,
        'is_sponsored',p.is_sponsored,
        'sku',p.sku,
        'specifications',p.specifications,
        'updated_at',o.updated_at
      )
      order by o.created_at desc
    )
    from public.dright_official_products o
    join public.products p on p.id=o.marketplace_product_id
    left join public.digital_product_details d on d.product_id=p.id
  ),'[]'::jsonb);
end;
$$;

create or replace function public.admin_get_dright_starter_settings()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  return jsonb_build_object(
    'store',(select to_jsonb(s) from public.dright_official_store_settings s where singleton=true),
    'product',(
      select to_jsonb(p) || jsonb_build_object('demo_video_url',mp.demo_video_url)
      from public.dright_starter_product_settings p
      left join public.products mp on mp.id=p.marketplace_product_id
      where p.singleton=true
    )
  );
end;
$$;

create or replace function public.admin_set_dright_starter_demo_video(p_url text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_product_id uuid;
  v_url text:=nullif(trim(coalesce(p_url,'')),'');
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select marketplace_product_id into v_product_id
  from public.dright_starter_product_settings
  where singleton=true;

  if v_product_id is null then raise exception 'Starter marketplace product is not configured'; end if;

  update public.products
  set demo_video_url=v_url, updated_at=now()
  where id=v_product_id;

  return v_url;
end;
$$;

revoke all on function public.admin_set_dright_starter_demo_video(text) from public;
grant execute on function public.admin_set_dright_starter_demo_video(text) to authenticated;

create or replace function public.get_public_dright_starter_product()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_store public.dright_official_store_settings%rowtype;
  v_product public.dright_starter_product_settings%rowtype;
  v_demo_video text;
begin
  select * into v_store from public.dright_official_store_settings where singleton=true;
  select * into v_product from public.dright_starter_product_settings where singleton=true;
  select demo_video_url into v_demo_video from public.products where id=v_product.marketplace_product_id;

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
      'demo_video_url',v_demo_video,
      'image_url',coalesce(v_product.image_url,'/dright-logo.webp'),
      'image_urls',case
        when jsonb_array_length(coalesce(v_product.image_urls,'[]'::jsonb))>0 then v_product.image_urls
        else jsonb_build_array(coalesce(v_product.image_url,'/dright-logo.webp'))
      end
    )
  );
end;
$$;

grant execute on function public.get_public_dright_starter_product() to anon, authenticated;
