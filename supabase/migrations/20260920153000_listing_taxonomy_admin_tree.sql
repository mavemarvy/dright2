-- Admin taxonomy tree reader for DRIGHT2.
-- Includes inactive nodes so admins can restore categories later.

begin;

create or replace function public.admin_get_marketplace_taxonomy_tree(
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
  is_active boolean,
  depth integer,
  path_ids uuid[],
  path_names text[],
  has_children boolean
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null
     or not public.has_dright_permission('marketplace','manage_categories') then
    raise exception 'Marketplace management permission required';
  end if;

  return query
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
      c.is_active,
      0::integer as depth,
      array[c.id]::uuid[] as path_ids,
      array[c.name]::text[] as path_names
    from public.marketplace_taxonomy_categories c
    where c.listing_type_code=upper(trim(p_listing_type_code))
      and c.parent_id is null

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
      child.is_active,
      parent.depth + 1,
      parent.path_ids || child.id,
      parent.path_names || child.name
    from public.marketplace_taxonomy_categories child
    join tree parent on parent.id=child.parent_id
    where child.listing_type_code=upper(trim(p_listing_type_code))
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
    t.is_active,
    t.depth,
    t.path_ids,
    t.path_names,
    exists(
      select 1 from public.marketplace_taxonomy_categories child
      where child.parent_id=t.id
    ) as has_children
  from tree t
  order by t.path_names,t.sort_order,t.name;
end;
$$;

revoke all on function public.admin_get_marketplace_taxonomy_tree(text) from public,anon;
grant execute on function public.admin_get_marketplace_taxonomy_tree(text) to authenticated,service_role;

comment on function public.admin_get_marketplace_taxonomy_tree(text) is
  'RBAC-protected full taxonomy tree including inactive nodes for marketplace administration.';

commit;
