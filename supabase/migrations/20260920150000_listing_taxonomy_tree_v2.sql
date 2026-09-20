-- DRIGHT2 taxonomy tree v2
-- Additive only. Does not alter protected pricing, Sales Team, promotion,
-- order, platform fee, wallet, refund, payout, or checkout authority.

begin;

create or replace function public.get_marketplace_category_tree(
  p_listing_type_code text
)
returns table (
  id uuid,
  listing_type_code text,
  parent_id uuid,
  name text,
  slug text,
  description text,
  icon text,
  image_url text,
  sort_order integer,
  is_leaf boolean,
  depth integer,
  path_ids uuid[],
  path_names text[],
  has_children boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive tree as (
    select
      c.id,
      c.listing_type_code,
      c.parent_id,
      c.name,
      c.slug,
      c.description,
      c.icon,
      c.image_url,
      c.sort_order,
      c.is_leaf,
      0::integer as depth,
      array[c.id]::uuid[] as path_ids,
      array[c.name]::text[] as path_names
    from public.marketplace_taxonomy_categories c
    where c.listing_type_code = upper(trim(p_listing_type_code))
      and c.parent_id is null
      and c.is_active = true

    union all

    select
      child.id,
      child.listing_type_code,
      child.parent_id,
      child.name,
      child.slug,
      child.description,
      child.icon,
      child.image_url,
      child.sort_order,
      child.is_leaf,
      parent.depth + 1,
      parent.path_ids || child.id,
      parent.path_names || child.name
    from public.marketplace_taxonomy_categories child
    join tree parent on parent.id = child.parent_id
    where child.is_active = true
      and child.listing_type_code = upper(trim(p_listing_type_code))
  )
  select
    t.id,
    t.listing_type_code,
    t.parent_id,
    t.name,
    t.slug,
    t.description,
    t.icon,
    t.image_url,
    t.sort_order,
    t.is_leaf,
    t.depth,
    t.path_ids,
    t.path_names,
    exists (
      select 1
      from public.marketplace_taxonomy_categories child
      where child.parent_id = t.id
        and child.is_active = true
    ) as has_children
  from tree t
  order by t.path_names, t.sort_order, t.name;
$$;

create or replace function public.resolve_marketplace_attribute_definitions(
  p_listing_type_code text,
  p_category_id uuid default null
)
returns table (
  id uuid,
  listing_type_code text,
  category_id uuid,
  attribute_key text,
  label text,
  input_type text,
  is_required boolean,
  is_searchable boolean,
  is_filterable boolean,
  is_sortable boolean,
  is_comparable boolean,
  show_on_card boolean,
  show_on_details boolean,
  options jsonb,
  validation jsonb,
  sort_order integer,
  schema_version integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with recursive category_chain as (
    select c.id, c.parent_id, 0::integer as distance
    from public.marketplace_taxonomy_categories c
    where p_category_id is not null
      and c.id = p_category_id
      and c.listing_type_code = upper(trim(p_listing_type_code))
      and c.is_active = true

    union all

    select parent.id, parent.parent_id, chain.distance + 1
    from public.marketplace_taxonomy_categories parent
    join category_chain chain on chain.parent_id = parent.id
    where parent.is_active = true
  ),
  candidates as (
    select
      d.*,
      case
        when d.category_id is null then 1000000
        else chain.distance
      end as scope_distance
    from public.marketplace_attribute_definitions d
    left join category_chain chain on chain.id = d.category_id
    where d.listing_type_code = upper(trim(p_listing_type_code))
      and d.is_active = true
      and (
        d.category_id is null
        or chain.id is not null
      )
  ),
  ranked as (
    select
      c.*,
      row_number() over (
        partition by c.attribute_key
        order by c.scope_distance asc, c.schema_version desc, c.sort_order asc, c.created_at desc
      ) as rn
    from candidates c
  )
  select
    r.id,
    r.listing_type_code,
    r.category_id,
    r.attribute_key,
    r.label,
    r.input_type,
    r.is_required,
    r.is_searchable,
    r.is_filterable,
    r.is_sortable,
    r.is_comparable,
    r.show_on_card,
    r.show_on_details,
    r.options,
    r.validation,
    r.sort_order,
    r.schema_version
  from ranked r
  where r.rn = 1
  order by r.sort_order, r.label;
$$;

create or replace function public.get_public_marketplace_listing_extensions(
  p_entity_type text,
  p_entity_ids uuid[]
)
returns table (
  entity_id uuid,
  listing_type_code text,
  category_id uuid,
  schema_version integer,
  attributes jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_type text := lower(trim(coalesce(p_entity_type, '')));
begin
  if p_entity_ids is null or cardinality(p_entity_ids) = 0 then
    return;
  end if;

  if cardinality(p_entity_ids) > 500 then
    raise exception 'Maximum 500 listing ids per request';
  end if;

  if v_type = 'product' then
    return query
      select
        e.entity_id,
        e.listing_type_code,
        e.category_id,
        e.schema_version,
        e.attributes
      from public.marketplace_listing_extensions e
      join public.products p on p.id = e.entity_id
      where e.entity_type = 'product'
        and e.entity_id = any(p_entity_ids)
        and p.is_active = true
        and coalesce(p.is_hidden, false) = false
        and p.approval_status = 'approved';
  elsif v_type = 'job' then
    return query
      select
        e.entity_id,
        e.listing_type_code,
        e.category_id,
        e.schema_version,
        e.attributes
      from public.marketplace_listing_extensions e
      join public.jobs j on j.id = e.entity_id
      where e.entity_type = 'job'
        and e.entity_id = any(p_entity_ids)
        and j.status = 'active'
        and j.approval_status = 'approved';
  else
    raise exception 'Unsupported entity type';
  end if;
end;
$$;

create or replace function public.admin_upsert_marketplace_taxonomy_category(
  p_id uuid,
  p_listing_type_code text,
  p_parent_id uuid,
  p_name text,
  p_slug text default null,
  p_description text default null,
  p_icon text default null,
  p_image_url text default null,
  p_sort_order integer default 100,
  p_is_leaf boolean default false,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_listing_type_code, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_slug text;
  v_id uuid;
begin
  if v_uid is null
     or not public.has_dright_permission('marketplace','manage_categories') then
    raise exception 'Marketplace management permission required';
  end if;

  if not exists (
    select 1 from public.marketplace_listing_types
    where code = v_code and is_enabled = true
  ) then
    raise exception 'Unsupported listing type';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Category name must contain 2 to 120 characters';
  end if;

  v_slug := trim(both '-' from regexp_replace(
    lower(trim(coalesce(nullif(p_slug, ''), v_name))),
    '[^a-z0-9]+',
    '-',
    'g'
  ));

  if v_slug = '' then
    raise exception 'Category slug is invalid';
  end if;

  if p_parent_id is not null then
    if not exists (
      select 1
      from public.marketplace_taxonomy_categories parent
      where parent.id = p_parent_id
        and parent.listing_type_code = v_code
    ) then
      raise exception 'Parent category must belong to the same listing type';
    end if;
  end if;

  if p_id is not null then
    if p_parent_id = p_id then
      raise exception 'Category cannot be its own parent';
    end if;

    if p_parent_id is not null and exists (
      with recursive descendants as (
        select c.id
        from public.marketplace_taxonomy_categories c
        where c.parent_id = p_id
        union all
        select child.id
        from public.marketplace_taxonomy_categories child
        join descendants d on child.parent_id = d.id
      )
      select 1 from descendants where id = p_parent_id
    ) then
      raise exception 'Category cannot be moved beneath one of its descendants';
    end if;

    update public.marketplace_taxonomy_categories
    set listing_type_code = v_code,
        parent_id = p_parent_id,
        name = v_name,
        slug = v_slug,
        description = nullif(trim(coalesce(p_description, '')), ''),
        icon = nullif(trim(coalesce(p_icon, '')), ''),
        image_url = nullif(trim(coalesce(p_image_url, '')), ''),
        sort_order = greatest(0, coalesce(p_sort_order, 100)),
        is_leaf = coalesce(p_is_leaf, false),
        is_active = coalesce(p_is_active, true),
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object('last_admin_editor', v_uid),
        updated_at = now()
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Taxonomy category not found';
    end if;
  else
    insert into public.marketplace_taxonomy_categories(
      listing_type_code,
      parent_id,
      name,
      slug,
      description,
      icon,
      image_url,
      sort_order,
      is_leaf,
      is_active,
      metadata
    )
    values(
      v_code,
      p_parent_id,
      v_name,
      v_slug,
      nullif(trim(coalesce(p_description, '')), ''),
      nullif(trim(coalesce(p_icon, '')), ''),
      nullif(trim(coalesce(p_image_url, '')), ''),
      greatest(0, coalesce(p_sort_order, 100)),
      coalesce(p_is_leaf, false),
      coalesce(p_is_active, true),
      jsonb_build_object('created_by_admin', v_uid)
    )
    returning id into v_id;
  end if;

  if p_parent_id is not null then
    update public.marketplace_taxonomy_categories
    set is_leaf = false,
        updated_at = now()
    where id = p_parent_id
      and is_leaf = true;
  end if;

  return v_id;
end;
$$;

create or replace function public.admin_set_marketplace_taxonomy_category_active(
  p_category_id uuid,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null
     or not public.has_dright_permission('marketplace','manage_categories') then
    raise exception 'Marketplace management permission required';
  end if;

  update public.marketplace_taxonomy_categories
  set is_active = coalesce(p_is_active, false),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('last_admin_editor', v_uid),
      updated_at = now()
  where id = p_category_id;

  if not found then
    raise exception 'Taxonomy category not found';
  end if;

  return true;
end;
$$;

revoke all on function public.get_marketplace_category_tree(text) from public;
revoke all on function public.resolve_marketplace_attribute_definitions(text, uuid) from public;
revoke all on function public.get_public_marketplace_listing_extensions(text, uuid[]) from public;
revoke all on function public.admin_upsert_marketplace_taxonomy_category(uuid,text,uuid,text,text,text,text,text,integer,boolean,boolean) from public, anon;
revoke all on function public.admin_set_marketplace_taxonomy_category_active(uuid,boolean) from public, anon;

grant execute on function public.get_marketplace_category_tree(text) to anon, authenticated, service_role;
grant execute on function public.resolve_marketplace_attribute_definitions(text, uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_marketplace_listing_extensions(text, uuid[]) to anon, authenticated, service_role;
grant execute on function public.admin_upsert_marketplace_taxonomy_category(uuid,text,uuid,text,text,text,text,text,integer,boolean,boolean) to authenticated, service_role;
grant execute on function public.admin_set_marketplace_taxonomy_category_active(uuid,boolean) to authenticated, service_role;

comment on function public.get_marketplace_category_tree(text) is
  'Returns the active recursive taxonomy tree for one listing type.';
comment on function public.resolve_marketplace_attribute_definitions(text,uuid) is
  'Resolves global + ancestor + selected-category fields, with nearest category overriding inherited definitions.';
comment on function public.get_public_marketplace_listing_extensions(text,uuid[]) is
  'Returns non-financial listing-engine metadata only for publicly approved listings.';
comment on function public.admin_upsert_marketplace_taxonomy_category(uuid,text,uuid,text,text,text,text,text,integer,boolean,boolean) is
  'RBAC-protected taxonomy editor. Does not modify legacy listing, promotion, Sales Team, or financial tables.';

-- Seed representative nested branches. These prove the recursive architecture;
-- admins can expand the taxonomy without application rewrites.
with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='PHYSICAL' and parent_id is null and slug='electronics'
),
seed(name,slug,sort_order) as (
  values
    ('Phones & Tablets','phones-tablets',10),
    ('Computers','computers',20),
    ('TV & Audio','tv-audio',30),
    ('Cameras','cameras',40)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'PHYSICAL', parent.id, seed.name, seed.slug, seed.sort_order, false, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='PHYSICAL'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='PHYSICAL' and slug='phones-tablets'
),
seed(name,slug,sort_order) as (
  values
    ('Smartphones','smartphones',10),
    ('Feature Phones','feature-phones',20),
    ('Tablets','tablets',30),
    ('Phone Accessories','phone-accessories',40)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'PHYSICAL', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='PHYSICAL'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='PHYSICAL' and slug='computers'
),
seed(name,slug,sort_order) as (
  values
    ('Laptops','laptops',10),
    ('Desktop Computers','desktop-computers',20),
    ('Computer Components','computer-components',30)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'PHYSICAL', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='PHYSICAL'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='PHYSICAL' and parent_id is null and slug='fashion'
),
seed(name,slug,sort_order) as (
  values
    ('Men','men',10),
    ('Women','women',20),
    ('Shoes','shoes',30),
    ('Bags & Accessories','bags-accessories',40)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'PHYSICAL', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='PHYSICAL'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='DIGITAL' and parent_id is null and slug='software-digital'
),
seed(name,slug,sort_order) as (
  values
    ('Software','software',10),
    ('Templates','templates',20),
    ('E-books','ebooks',30),
    ('Audio & Music','audio-music',40)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'DIGITAL', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='DIGITAL'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='SERVICE' and parent_id is null and slug='development'
),
seed(name,slug,sort_order) as (
  values
    ('Web Development','web-development',10),
    ('Mobile App Development','mobile-app-development',20),
    ('Automation & Integrations','automation-integrations',30)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'SERVICE', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='SERVICE'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='SERVICE' and parent_id is null and slug='design'
),
seed(name,slug,sort_order) as (
  values
    ('UI & UX Design','ui-ux-design',10),
    ('Graphic Design','graphic-design',20),
    ('Video & Motion','video-motion',30)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'SERVICE', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='SERVICE'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='COURSE' and parent_id is null and slug='technology-engineering'
),
seed(name,slug,sort_order) as (
  values
    ('Programming','programming',10),
    ('Data & AI','data-ai',20),
    ('Cybersecurity','cybersecurity',30)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'COURSE', parent.id, seed.name, seed.slug, seed.sort_order, false, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='COURSE'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='COURSE' and slug='programming'
),
seed(name,slug,sort_order) as (
  values
    ('Web Development','web-development',10),
    ('Mobile Development','mobile-development',20),
    ('Game Development','game-development',30)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'COURSE', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='COURSE'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='JOB' and parent_id is null and slug='technology-engineering'
),
seed(name,slug,sort_order) as (
  values
    ('Software Engineering','software-engineering',10),
    ('Data & AI','data-ai',20),
    ('IT & Cybersecurity','it-cybersecurity',30)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'JOB', parent.id, seed.name, seed.slug, seed.sort_order, false, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='JOB'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='JOB' and slug='software-engineering'
),
seed(name,slug,sort_order) as (
  values
    ('Frontend Engineering','frontend-engineering',10),
    ('Backend Engineering','backend-engineering',20),
    ('Full Stack Engineering','full-stack-engineering',30)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'JOB', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='JOB'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='TASK' and parent_id is null and slug='digital-task'
),
seed(name,slug,sort_order) as (
  values
    ('Data Entry','data-entry',10),
    ('Social Media Tasks','social-media-tasks',20),
    ('Research & Testing','research-testing',30)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'TASK', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='TASK'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

with parent as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='TASK' and parent_id is null and slug='local-task'
),
seed(name,slug,sort_order) as (
  values
    ('Delivery & Errands','delivery-errands',10),
    ('Cleaning & Home Help','cleaning-home-help',20),
    ('Local Assistance','local-assistance',30)
)
insert into public.marketplace_taxonomy_categories(
  listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,metadata
)
select 'TASK', parent.id, seed.name, seed.slug, seed.sort_order, true, true,
       '{"seed_kind":"taxonomy_v2"}'::jsonb
from parent cross join seed
where not exists (
  select 1 from public.marketplace_taxonomy_categories c
  where c.listing_type_code='TASK'
    and c.parent_id=parent.id
    and c.slug=seed.slug
);

-- Selected leaf/category fields demonstrate inheritance.
with cat as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='PHYSICAL' and slug='smartphones'
)
insert into public.marketplace_attribute_definitions(
  listing_type_code,category_id,attribute_key,label,input_type,
  is_required,is_searchable,is_filterable,is_sortable,is_comparable,
  show_on_card,show_on_details,options,validation,sort_order,schema_version,is_active
)
select 'PHYSICAL',cat.id,v.attribute_key,v.label,v.input_type,
       false,v.is_searchable,true,v.is_sortable,true,
       v.show_on_card,true,v.options,v.validation,v.sort_order,1,true
from cat
cross join (
  values
    ('storage_gb','Storage','select',true,true,true,'["32 GB","64 GB","128 GB","256 GB","512 GB","1 TB"]'::jsonb,'{}'::jsonb,110),
    ('ram_gb','RAM','select',true,true,true,'["2 GB","4 GB","6 GB","8 GB","12 GB","16 GB","24 GB"]'::jsonb,'{}'::jsonb,120),
    ('network_generation','Network','select',false,false,true,'["3G","4G LTE","5G"]'::jsonb,'{}'::jsonb,130),
    ('sim_type','SIM Type','select',false,false,false,'["Single SIM","Dual SIM","eSIM","Physical SIM + eSIM"]'::jsonb,'{}'::jsonb,140),
    ('color','Color','text',true,false,false,'[]'::jsonb,'{"maxLength":80}'::jsonb,150),
    ('battery_health_percent','Battery Health (%)','number',false,true,false,'[]'::jsonb,'{"min":0,"max":100}'::jsonb,160)
) as v(attribute_key,label,input_type,is_searchable,is_sortable,show_on_card,options,validation,sort_order)
where not exists (
  select 1 from public.marketplace_attribute_definitions d
  where d.listing_type_code='PHYSICAL'
    and d.category_id=cat.id
    and d.attribute_key=v.attribute_key
    and d.schema_version=1
);

with cat as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='PHYSICAL' and slug='laptops'
)
insert into public.marketplace_attribute_definitions(
  listing_type_code,category_id,attribute_key,label,input_type,
  is_required,is_searchable,is_filterable,is_sortable,is_comparable,
  show_on_card,show_on_details,options,validation,sort_order,schema_version,is_active
)
select 'PHYSICAL',cat.id,v.attribute_key,v.label,v.input_type,
       false,true,true,v.is_sortable,true,
       v.show_on_card,true,v.options,v.validation,v.sort_order,1,true
from cat
cross join (
  values
    ('processor','Processor','text',false,true,'[]'::jsonb,'{"maxLength":120}'::jsonb,110),
    ('ram_gb','RAM','select',true,true,'["4 GB","8 GB","16 GB","32 GB","64 GB","128 GB"]'::jsonb,'{}'::jsonb,120),
    ('storage_size_gb','Storage','select',true,true,'["128 GB","256 GB","512 GB","1 TB","2 TB","4 TB"]'::jsonb,'{}'::jsonb,130),
    ('gpu','Graphics','text',false,false,'[]'::jsonb,'{"maxLength":120}'::jsonb,140),
    ('screen_size_inches','Screen Size','select',true,false,'["11 inch","13 inch","14 inch","15 inch","16 inch","17 inch"]'::jsonb,'{}'::jsonb,150)
) as v(attribute_key,label,input_type,is_sortable,show_on_card,options,validation,sort_order)
where not exists (
  select 1 from public.marketplace_attribute_definitions d
  where d.listing_type_code='PHYSICAL'
    and d.category_id=cat.id
    and d.attribute_key=v.attribute_key
    and d.schema_version=1
);

with cat as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='DIGITAL' and slug='templates'
)
insert into public.marketplace_attribute_definitions(
  listing_type_code,category_id,attribute_key,label,input_type,
  is_required,is_searchable,is_filterable,is_sortable,is_comparable,
  show_on_card,show_on_details,options,validation,sort_order,schema_version,is_active
)
select 'DIGITAL',cat.id,v.attribute_key,v.label,v.input_type,
       false,true,true,false,true,
       false,true,v.options,v.validation,v.sort_order,1,true
from cat
cross join (
  values
    ('template_format','Template Format','select','["Canva","Figma","PSD","AI","PowerPoint","Notion","Excel","Other"]'::jsonb,'{}'::jsonb,110),
    ('editable','Fully Editable','toggle','[]'::jsonb,'{}'::jsonb,120)
) as v(attribute_key,label,input_type,options,validation,sort_order)
where not exists (
  select 1 from public.marketplace_attribute_definitions d
  where d.listing_type_code='DIGITAL'
    and d.category_id=cat.id
    and d.attribute_key=v.attribute_key
    and d.schema_version=1
);

with cat as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='SERVICE' and slug='web-development'
)
insert into public.marketplace_attribute_definitions(
  listing_type_code,category_id,attribute_key,label,input_type,
  is_required,is_searchable,is_filterable,is_sortable,is_comparable,
  show_on_card,show_on_details,options,validation,sort_order,schema_version,is_active
)
select 'SERVICE',cat.id,v.attribute_key,v.label,v.input_type,
       false,true,v.is_filterable,false,false,
       false,true,v.options,v.validation,v.sort_order,1,true
from cat
cross join (
  values
    ('tech_stack','Technology Stack','tags',true,'[]'::jsonb,'{}'::jsonb,110),
    ('pages_count','Typical Page Count','number',true,'[]'::jsonb,'{"min":1,"max":1000}'::jsonb,120)
) as v(attribute_key,label,input_type,is_filterable,options,validation,sort_order)
where not exists (
  select 1 from public.marketplace_attribute_definitions d
  where d.listing_type_code='SERVICE'
    and d.category_id=cat.id
    and d.attribute_key=v.attribute_key
    and d.schema_version=1
);

with cat as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='COURSE' and slug='programming'
)
insert into public.marketplace_attribute_definitions(
  listing_type_code,category_id,attribute_key,label,input_type,
  is_required,is_searchable,is_filterable,is_sortable,is_comparable,
  show_on_card,show_on_details,options,validation,sort_order,schema_version,is_active
)
select 'COURSE',cat.id,v.attribute_key,v.label,v.input_type,
       false,v.is_searchable,true,v.is_sortable,true,
       v.show_on_card,true,v.options,v.validation,v.sort_order,1,true
from cat
cross join (
  values
    ('skill_level','Skill Level','select',false,false,true,'["Beginner","Intermediate","Advanced","All Levels"]'::jsonb,'{}'::jsonb,110),
    ('duration_hours','Course Duration (hours)','number',false,true,false,'[]'::jsonb,'{"min":0,"max":10000}'::jsonb,120),
    ('instruction_language','Instruction Language','text',true,false,false,'[]'::jsonb,'{"maxLength":80}'::jsonb,130)
) as v(attribute_key,label,input_type,is_searchable,is_sortable,show_on_card,options,validation,sort_order)
where not exists (
  select 1 from public.marketplace_attribute_definitions d
  where d.listing_type_code='COURSE'
    and d.category_id=cat.id
    and d.attribute_key=v.attribute_key
    and d.schema_version=1
);

with cat as (
  select id from public.marketplace_taxonomy_categories
  where listing_type_code='JOB' and slug='software-engineering'
)
insert into public.marketplace_attribute_definitions(
  listing_type_code,category_id,attribute_key,label,input_type,
  is_required,is_searchable,is_filterable,is_sortable,is_comparable,
  show_on_card,show_on_details,options,validation,sort_order,schema_version,is_active
)
select 'JOB',cat.id,v.attribute_key,v.label,v.input_type,
       false,true,true,v.is_sortable,true,
       false,true,v.options,v.validation,v.sort_order,1,true
from cat
cross join (
  values
    ('primary_stack','Primary Technology Stack','tags',false,'[]'::jsonb,'{}'::jsonb,110),
    ('years_experience','Preferred Years of Experience','number',true,'[]'::jsonb,'{"min":0,"max":80}'::jsonb,120)
) as v(attribute_key,label,input_type,is_sortable,options,validation,sort_order)
where not exists (
  select 1 from public.marketplace_attribute_definitions d
  where d.listing_type_code='JOB'
    and d.category_id=cat.id
    and d.attribute_key=v.attribute_key
    and d.schema_version=1
);

commit;
