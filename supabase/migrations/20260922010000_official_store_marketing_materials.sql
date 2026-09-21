begin;

-- First-party DRIGHT catalog products beyond the special Starter product.
create table if not exists public.dright_official_products (
  id uuid primary key default gen_random_uuid(),
  marketplace_product_id uuid not null unique references public.products(id) on delete cascade,
  slug text not null unique,
  subtitle text,
  currency text not null default 'NGN',
  public_visible boolean not null default true,
  is_enabled boolean not null default true,
  official_badge_enabled boolean not null default true,
  official_rating_enabled boolean not null default false,
  official_rating numeric(3,2) not null default 5.00 check (official_rating between 0 and 5),
  benefits jsonb not null default '[]'::jsonb,
  image_urls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dright_starter_product_settings
  add column if not exists image_url text,
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

-- Optional affiliate/sales marketing kits for every listing family.
create table if not exists public.listing_marketing_materials (
  id uuid primary key default gen_random_uuid(),
  listing_kind text not null check (listing_kind in ('product','job','task','official_product')),
  listing_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_type text not null check (
    material_type in ('PDF','LINK','DRIVE_LINK','FLYER','BANNER','IMAGE','VIDEO','OTHER')
  ),
  title text not null,
  description text,
  url text not null,
  storage_path text,
  file_name text,
  mime_type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_marketing_materials_listing_idx
  on public.listing_marketing_materials(listing_kind,listing_id,sort_order,created_at);
create index if not exists listing_marketing_materials_owner_idx
  on public.listing_marketing_materials(owner_id,created_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'listing-marketing-materials',
  'listing-marketing-materials',
  true,
  52428800,
  array[
    'application/pdf',
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
)
on conflict(id) do update
set public=true,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists listing_marketing_materials_public_read on storage.objects;
create policy listing_marketing_materials_public_read
on storage.objects for select
to public
using (bucket_id='listing-marketing-materials');

drop policy if exists listing_marketing_materials_owner_insert on storage.objects;
create policy listing_marketing_materials_owner_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id='listing-marketing-materials'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.has_dright_permission('subscriptions','manage')
  )
);

drop policy if exists listing_marketing_materials_owner_update on storage.objects;
create policy listing_marketing_materials_owner_update
on storage.objects for update
to authenticated
using (
  bucket_id='listing-marketing-materials'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.has_dright_permission('subscriptions','manage')
  )
)
with check (
  bucket_id='listing-marketing-materials'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.has_dright_permission('subscriptions','manage')
  )
);

drop policy if exists listing_marketing_materials_owner_delete on storage.objects;
create policy listing_marketing_materials_owner_delete
on storage.objects for delete
to authenticated
using (
  bucket_id='listing-marketing-materials'
  and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.has_dright_permission('subscriptions','manage')
  )
);

alter table public.dright_official_products enable row level security;
alter table public.listing_marketing_materials enable row level security;

revoke all on public.dright_official_products from anon,authenticated;
revoke all on public.listing_marketing_materials from anon,authenticated;

create or replace function public.can_manage_listing_marketing_materials(
  p_kind text,
  p_listing_id uuid,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select case lower(coalesce(p_kind,''))
    when 'product' then exists(
      select 1 from public.products p
      where p.id=p_listing_id and p.uploaded_by=p_uid
    )
    when 'job' then exists(
      select 1 from public.jobs j
      where j.id=p_listing_id and j.employer_id=p_uid
    )
    when 'task' then exists(
      select 1 from public.cc_campaigns c
      where c.id=p_listing_id and c.creator_id=p_uid
    )
    when 'official_product' then
      public.has_dright_permission('subscriptions','manage')
      and exists(select 1 from public.dright_official_products o where o.id=p_listing_id)
    else false
  end;
$$;

revoke all on function public.can_manage_listing_marketing_materials(text,uuid,uuid) from public;
grant execute on function public.can_manage_listing_marketing_materials(text,uuid,uuid) to authenticated,service_role;

create or replace function public.replace_listing_marketing_materials(
  p_listing_kind text,
  p_listing_id uuid,
  p_materials jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_kind text:=lower(trim(coalesce(p_listing_kind,'')));
  v_row jsonb;
  v_count integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_materials,'[]'::jsonb))<>'array' then
    raise exception 'Marketing materials must be an array';
  end if;
  if not public.can_manage_listing_marketing_materials(v_kind,p_listing_id,v_uid) then
    raise exception 'You cannot manage marketing materials for this listing';
  end if;

  delete from public.listing_marketing_materials
  where listing_kind=v_kind and listing_id=p_listing_id;

  for v_row in select value from jsonb_array_elements(coalesce(p_materials,'[]'::jsonb))
  loop
    if nullif(trim(v_row->>'title'),'') is null
       or nullif(trim(v_row->>'url'),'') is null then
      continue;
    end if;

    insert into public.listing_marketing_materials(
      listing_kind,listing_id,owner_id,material_type,title,description,url,
      storage_path,file_name,mime_type,sort_order,is_active
    ) values(
      v_kind,
      p_listing_id,
      v_uid,
      case
        when upper(coalesce(v_row->>'material_type','OTHER')) in
          ('PDF','LINK','DRIVE_LINK','FLYER','BANNER','IMAGE','VIDEO','OTHER')
        then upper(coalesce(v_row->>'material_type','OTHER'))
        else 'OTHER'
      end,
      trim(v_row->>'title'),
      nullif(trim(v_row->>'description'),''),
      trim(v_row->>'url'),
      nullif(trim(v_row->>'storage_path'),''),
      nullif(trim(v_row->>'file_name'),''),
      nullif(trim(v_row->>'mime_type'),''),
      coalesce((v_row->>'sort_order')::integer,v_count),
      coalesce((v_row->>'is_active')::boolean,true)
    );
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('success',true,'count',v_count);
end;
$$;

revoke all on function public.replace_listing_marketing_materials(text,uuid,jsonb) from public,anon;
grant execute on function public.replace_listing_marketing_materials(text,uuid,jsonb) to authenticated,service_role;

create or replace function public.get_listing_marketing_materials(
  p_listing_kind text,
  p_listing_id uuid
)
returns table(
  id uuid,
  material_type text,
  title text,
  description text,
  url text,
  storage_path text,
  file_name text,
  mime_type text,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select m.id,m.material_type,m.title,m.description,m.url,m.storage_path,
         m.file_name,m.mime_type,m.sort_order
  from public.listing_marketing_materials m
  where m.listing_kind=lower(trim(p_listing_kind))
    and m.listing_id=p_listing_id
    and m.is_active=true
  order by m.sort_order,m.created_at;
end;
$$;

revoke all on function public.get_listing_marketing_materials(text,uuid) from public,anon;
grant execute on function public.get_listing_marketing_materials(text,uuid) to authenticated,service_role;

create or replace function public.admin_create_dright_official_product(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_product_id uuid;
  v_official_id uuid;
  v_name text:=trim(coalesce(p_input->>'name',''));
  v_slug text:=lower(trim(coalesce(p_input->>'slug','')));
  v_type text:=upper(trim(coalesce(p_input->>'product_type','DIGITAL')));
  v_price numeric:=coalesce((p_input->>'price')::numeric,0);
  v_commission numeric:=coalesce((p_input->>'affiliate_commission_percent')::numeric,0);
  v_rating numeric:=coalesce((p_input->>'official_rating')::numeric,5);
  v_currency text:=upper(trim(coalesce(p_input->>'currency','NGN')));
  v_image text:=nullif(trim(p_input->>'image_url'),'');
  v_images jsonb:=case when jsonb_typeof(p_input->'image_urls')='array' then p_input->'image_urls' else '[]'::jsonb end;
begin
  if v_uid is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Official DRIGHT Store management permission required';
  end if;
  if v_name='' then raise exception 'Product name is required'; end if;
  if v_slug='' then
    v_slug:=trim(both '-' from regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'));
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid product slug'; end if;
  if v_type not in ('PHYSICAL','DIGITAL','SERVICE','COURSE') then raise exception 'Unsupported product type'; end if;
  if v_price<0 then raise exception 'Price cannot be negative'; end if;
  if v_commission<0 or v_commission>100 then raise exception 'Affiliate commission must be 0 to 100'; end if;
  if v_rating<0 or v_rating>5 then raise exception 'Official rating must be 0 to 5'; end if;

  insert into public.products(
    uploaded_by,name,description,price,commission_rate,image_url,category,is_active,
    approval_status,admin_task_percent,sales_team_task_percent,affiliate_commission_percent,
    is_hidden,is_free,stock_quantity,initial_stock,product_type,has_dright_sales_team,
    tags,brand,condition,specifications,is_featured,reviewed_by,reviewed_at,
    listing_taxonomy_category_id
  ) values(
    v_uid,
    v_name,
    nullif(trim(p_input->>'description'),''),
    v_price,
    0,
    v_image,
    coalesce(nullif(trim(p_input->>'category'),''),'General'),
    true,
    'approved',
    0,0,v_commission,
    not coalesce((p_input->>'public_visible')::boolean,true),
    v_price=0,
    case when v_type='PHYSICAL' then coalesce((p_input->>'stock_quantity')::integer,0) else null end,
    case when v_type='PHYSICAL' then coalesce((p_input->>'stock_quantity')::integer,0) else null end,
    v_type,
    false,
    case when jsonb_typeof(p_input->'tags')='array'
      then array(select jsonb_array_elements_text(p_input->'tags')) else '{}'::text[] end,
    nullif(trim(p_input->>'brand'),''),
    coalesce(nullif(trim(p_input->>'condition'),''),'new'),
    coalesce(p_input->'specifications','{}'::jsonb),
    coalesce((p_input->>'is_featured')::boolean,true),
    v_uid,
    now(),
    nullif(p_input->>'listing_taxonomy_category_id','')::uuid
  )
  returning id into v_product_id;

  if jsonb_array_length(v_images)>0 then
    insert into public.product_images(product_id,image_url,position)
    select v_product_id,value::text,row_number() over ()-1
    from jsonb_array_elements_text(v_images);
  elsif v_image is not null then
    insert into public.product_images(product_id,image_url,position)
    values(v_product_id,v_image,0);
  end if;

  insert into public.dright_official_products(
    marketplace_product_id,slug,subtitle,currency,public_visible,is_enabled,
    official_badge_enabled,official_rating_enabled,official_rating,benefits,image_urls,
    metadata,created_by,updated_by
  ) values(
    v_product_id,
    v_slug,
    nullif(trim(p_input->>'subtitle'),''),
    v_currency,
    coalesce((p_input->>'public_visible')::boolean,true),
    coalesce((p_input->>'is_enabled')::boolean,true),
    coalesce((p_input->>'official_badge_enabled')::boolean,true),
    coalesce((p_input->>'official_rating_enabled')::boolean,false),
    v_rating,
    case when jsonb_typeof(p_input->'benefits')='array' then p_input->'benefits' else '[]'::jsonb end,
    v_images,
    coalesce(p_input->'metadata','{}'::jsonb) || jsonb_build_object(
      'first_party',true,
      'no_marketplace_platform_fee',true,
      'review_required',false
    ),
    v_uid,v_uid
  )
  returning id into v_official_id;

  return jsonb_build_object(
    'success',true,
    'official_product_id',v_official_id,
    'marketplace_product_id',v_product_id
  );
end;
$$;

revoke all on function public.admin_create_dright_official_product(jsonb) from public,anon;
grant execute on function public.admin_create_dright_official_product(jsonb) to authenticated,service_role;

create or replace function public.admin_list_dright_official_products()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
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
        'created_at',o.created_at,
        'updated_at',o.updated_at
      )
      order by o.created_at desc
    )
    from public.dright_official_products o
    join public.products p on p.id=o.marketplace_product_id
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_dright_official_products() from public,anon;
grant execute on function public.admin_list_dright_official_products() to authenticated,service_role;

create or replace function public.admin_update_dright_official_product(
  p_official_product_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_product_id uuid;
  v_price numeric;
  v_commission numeric;
  v_rating numeric;
  v_images jsonb;
  v_public boolean;
  v_enabled boolean;
begin
  if v_uid is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Official DRIGHT Store management permission required';
  end if;

  select marketplace_product_id into v_product_id
  from public.dright_official_products
  where id=p_official_product_id
  for update;
  if v_product_id is null then raise exception 'Official product not found'; end if;

  select coalesce((p_input->>'price')::numeric,price),
         coalesce((p_input->>'affiliate_commission_percent')::numeric,affiliate_commission_percent)
    into v_price,v_commission
  from public.products where id=v_product_id;

  select coalesce((p_input->>'official_rating')::numeric,official_rating),
         case when jsonb_typeof(p_input->'image_urls')='array' then p_input->'image_urls' else image_urls end,
         coalesce((p_input->>'public_visible')::boolean,public_visible),
         coalesce((p_input->>'is_enabled')::boolean,is_enabled)
    into v_rating,v_images,v_public,v_enabled
  from public.dright_official_products where id=p_official_product_id;

  if v_price<0 then raise exception 'Price cannot be negative'; end if;
  if v_commission<0 or v_commission>100 then raise exception 'Affiliate commission must be 0 to 100'; end if;
  if v_rating<0 or v_rating>5 then raise exception 'Official rating must be 0 to 5'; end if;

  update public.products
  set name=coalesce(nullif(trim(p_input->>'name'),''),name),
      description=case when p_input ? 'description' then nullif(trim(p_input->>'description'),'') else description end,
      price=v_price,
      category=coalesce(nullif(trim(p_input->>'category'),''),category),
      affiliate_commission_percent=v_commission,
      image_url=case when p_input ? 'image_url' then nullif(trim(p_input->>'image_url'),'') else image_url end,
      is_hidden=not v_public or not v_enabled,
      is_active=v_enabled,
      is_featured=coalesce((p_input->>'is_featured')::boolean,is_featured),
      stock_quantity=case when product_type='PHYSICAL' and p_input ? 'stock_quantity' then (p_input->>'stock_quantity')::integer else stock_quantity end,
      tags=case when jsonb_typeof(p_input->'tags')='array'
        then array(select jsonb_array_elements_text(p_input->'tags')) else tags end,
      brand=case when p_input ? 'brand' then nullif(trim(p_input->>'brand'),'') else brand end,
      condition=coalesce(nullif(trim(p_input->>'condition'),''),condition),
      specifications=case when p_input ? 'specifications' then coalesce(p_input->'specifications','{}'::jsonb) else specifications end,
      updated_at=now(),
      reviewed_by=v_uid,
      reviewed_at=now(),
      approval_status='approved'
  where id=v_product_id;

  update public.dright_official_products
  set slug=coalesce(nullif(lower(trim(p_input->>'slug')),''),slug),
      subtitle=case when p_input ? 'subtitle' then nullif(trim(p_input->>'subtitle'),'') else subtitle end,
      currency=upper(coalesce(nullif(trim(p_input->>'currency'),''),currency)),
      public_visible=v_public,
      is_enabled=v_enabled,
      official_badge_enabled=coalesce((p_input->>'official_badge_enabled')::boolean,official_badge_enabled),
      official_rating_enabled=coalesce((p_input->>'official_rating_enabled')::boolean,official_rating_enabled),
      official_rating=v_rating,
      benefits=case when jsonb_typeof(p_input->'benefits')='array' then p_input->'benefits' else benefits end,
      image_urls=v_images,
      updated_at=now(),
      updated_by=v_uid
  where id=p_official_product_id;

  if jsonb_typeof(p_input->'image_urls')='array' then
    delete from public.product_images where product_id=v_product_id;
    insert into public.product_images(product_id,image_url,position)
    select v_product_id,value::text,row_number() over ()-1
    from jsonb_array_elements_text(v_images);
  end if;

  return jsonb_build_object('success',true,'official_product_id',p_official_product_id,'marketplace_product_id',v_product_id);
end;
$$;

revoke all on function public.admin_update_dright_official_product(uuid,jsonb) from public,anon;
grant execute on function public.admin_update_dright_official_product(uuid,jsonb) to authenticated,service_role;

create or replace function public.get_public_dright_official_products()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not exists(
    select 1 from public.dright_official_store_settings
    where singleton=true and is_active=true and public_visible=true
  ) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'official_product_id',o.id,
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
        'is_featured',p.is_featured,
        'official_badge_enabled',o.official_badge_enabled,
        'official_rating_enabled',o.official_rating_enabled,
        'official_rating',o.official_rating,
        'benefits',o.benefits
      )
      order by p.is_featured desc,o.created_at desc
    )
    from public.dright_official_products o
    join public.products p on p.id=o.marketplace_product_id
    where o.is_enabled=true and o.public_visible=true and p.is_active=true and p.is_hidden=false
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.get_public_dright_official_products() from public;
grant execute on function public.get_public_dright_official_products() to anon,authenticated,service_role;

-- Starter images are now admin-configurable and synchronized to its marketplace card.
create or replace function public.admin_update_dright_starter_settings(
  p_store jsonb default '{}'::jsonb,
  p_product jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_price numeric;
  v_commission numeric;
  v_trial integer;
  v_rating numeric;
  v_currency text;
  v_marketplace_id uuid;
  v_image text;
  v_images jsonb;
begin
  if auth.uid() is null or not public.has_dright_permission('subscriptions','manage') then
    raise exception 'Subscription management permission required';
  end if;

  select price,affiliate_commission_percent,included_trial_days,official_rating,currency,
         marketplace_product_id,image_url,image_urls
    into v_price,v_commission,v_trial,v_rating,v_currency,v_marketplace_id,v_image,v_images
  from public.dright_starter_product_settings where singleton=true;

  v_price:=coalesce((p_product->>'price')::numeric,v_price);
  v_commission:=coalesce((p_product->>'affiliate_commission_percent')::numeric,v_commission);
  v_trial:=coalesce((p_product->>'included_trial_days')::integer,v_trial);
  v_rating:=coalesce((p_product->>'official_rating')::numeric,v_rating);
  v_currency:=upper(coalesce(nullif(trim(p_product->>'currency'),''),v_currency));
  if p_product ? 'image_url' then v_image:=nullif(trim(p_product->>'image_url'),''); end if;
  if jsonb_typeof(p_product->'image_urls')='array' then v_images:=p_product->'image_urls'; end if;

  if v_price<0 then raise exception 'Starter product price cannot be negative'; end if;
  if v_commission<0 or v_commission>100 then raise exception 'Affiliate commission must be 0 to 100'; end if;
  if v_trial<0 or v_trial>730 then raise exception 'Included trial days must be 0 to 730'; end if;
  if v_rating<0 or v_rating>5 then raise exception 'Official DRIGHT rating must be 0 to 5'; end if;

  update public.dright_official_store_settings
  set name=coalesce(nullif(trim(p_store->>'name'),''),name),
      tagline=coalesce(nullif(trim(p_store->>'tagline'),''),tagline),
      description=coalesce(nullif(trim(p_store->>'description'),''),description),
      public_visible=coalesce((p_store->>'public_visible')::boolean,public_visible),
      is_active=coalesce((p_store->>'is_active')::boolean,is_active),
      logo_url=case when p_store ? 'logo_url' then nullif(trim(p_store->>'logo_url'),'') else logo_url end,
      banner_url=case when p_store ? 'banner_url' then nullif(trim(p_store->>'banner_url'),'') else banner_url end,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  update public.dright_starter_product_settings
  set title=coalesce(nullif(trim(p_product->>'title'),''),title),
      subtitle=coalesce(nullif(trim(p_product->>'subtitle'),''),subtitle),
      description=coalesce(nullif(trim(p_product->>'description'),''),description),
      category=coalesce(nullif(trim(p_product->>'category'),''),category),
      price=v_price,
      currency=v_currency,
      affiliate_commission_percent=v_commission,
      included_trial_days=v_trial,
      is_enabled=coalesce((p_product->>'is_enabled')::boolean,is_enabled),
      public_visible=coalesce((p_product->>'public_visible')::boolean,public_visible),
      guest_only=true,
      official_badge_enabled=coalesce((p_product->>'official_badge_enabled')::boolean,official_badge_enabled),
      official_rating_enabled=coalesce((p_product->>'official_rating_enabled')::boolean,official_rating_enabled),
      official_rating=v_rating,
      benefits=case when p_product ? 'benefits' and jsonb_typeof(p_product->'benefits')='array'
        then p_product->'benefits' else benefits end,
      image_url=v_image,
      image_urls=v_images,
      updated_at=now(),
      updated_by=auth.uid()
  where singleton=true;

  if v_marketplace_id is not null then
    update public.products
    set name=coalesce(nullif(trim(p_product->>'title'),''),name),
        description=case when p_product ? 'description' then nullif(trim(p_product->>'description'),'') else description end,
        price=v_price,
        category=coalesce(nullif(trim(p_product->>'category'),''),category),
        affiliate_commission_percent=v_commission,
        image_url=coalesce(v_image,image_url),
        is_hidden=not coalesce((p_product->>'public_visible')::boolean,(select public_visible from public.dright_starter_product_settings where singleton=true)),
        is_active=coalesce((p_product->>'is_enabled')::boolean,is_active),
        approval_status='approved',
        commission_rate=0,
        admin_task_percent=0,
        sales_team_task_percent=0,
        reviewed_by=auth.uid(),
        reviewed_at=now(),
        updated_at=now()
    where id=v_marketplace_id;

    if jsonb_typeof(p_product->'image_urls')='array' then
      delete from public.product_images where product_id=v_marketplace_id;
      insert into public.product_images(product_id,image_url,position)
      select v_marketplace_id,value::text,row_number() over ()-1
      from jsonb_array_elements_text(v_images);
    end if;
  end if;

  return public.admin_get_dright_starter_settings();
end;
$$;

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

revoke all on function public.get_public_dright_starter_product() from public;
grant execute on function public.get_public_dright_starter_product() to anon,authenticated,service_role;

commit;