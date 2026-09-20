begin;

alter table public.marketplace_taxonomy_categories
  add column if not exists source_taxonomy text,
  add column if not exists source_id text,
  add column if not exists source_version text,
  add column if not exists restricted boolean not null default false,
  add column if not exists age_gate boolean not null default false,
  add column if not exists selectable_endpoint boolean;

update public.marketplace_taxonomy_categories
set selectable_endpoint = coalesce(selectable_endpoint, is_leaf)
where selectable_endpoint is null;

alter table public.marketplace_taxonomy_categories
  alter column selectable_endpoint set default false,
  alter column selectable_endpoint set not null;

create index if not exists marketplace_taxonomy_source_idx
  on public.marketplace_taxonomy_categories(source_taxonomy, source_version, source_id)
  where source_taxonomy is not null;

create or replace function public.system_import_marketplace_taxonomy_paths(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r jsonb;
  v_code text;
  v_path jsonb;
  v_parent uuid;
  v_id uuid;
  v_name text;
  v_slug text;
  v_depth integer;
  v_count integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_aliases text[];
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_code := upper(trim(coalesce(r->>'listing_type_code','')));
    v_path := r->'path_names';

    if not exists (
      select 1 from public.marketplace_listing_types
      where code=v_code and is_enabled=true
    ) then
      raise exception 'Unsupported listing type: %', v_code;
    end if;

    if jsonb_typeof(v_path) <> 'array' or jsonb_array_length(v_path)=0 then
      raise exception 'path_names must be a non-empty array';
    end if;

    if jsonb_array_length(v_path) > 7 then
      raise exception 'Taxonomy paths may not exceed 7 levels';
    end if;

    v_parent := null;
    v_count := jsonb_array_length(v_path);

    for v_depth in 0..v_count-1
    loop
      v_name := trim(v_path->>v_depth);
      if length(v_name) < 1 or length(v_name) > 160 then
        raise exception 'Invalid category name in path';
      end if;

      v_slug := trim(both '-' from regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'));
      if v_slug='' then
        v_slug := 'category-' || substr(md5(v_name),1,12);
      end if;

      select c.id into v_id
      from public.marketplace_taxonomy_categories c
      where c.listing_type_code=v_code
        and ((v_parent is null and c.parent_id is null) or c.parent_id=v_parent)
        and lower(c.slug)=lower(v_slug)
      order by c.created_at
      limit 1;

      if v_id is null then
        insert into public.marketplace_taxonomy_categories(
          listing_type_code,parent_id,name,slug,sort_order,is_leaf,is_active,
          metadata,selectable_endpoint
        )
        values(
          v_code,v_parent,v_name,v_slug,100,
          case when v_depth=v_count-1 then coalesce((r->>'selectable_endpoint')::boolean,true) else false end,
          true,
          jsonb_build_object('seed_kind','taxonomy_6000_reconstruction'),
          case when v_depth=v_count-1 then coalesce((r->>'selectable_endpoint')::boolean,true) else false end
        )
        returning id into v_id;
        v_created := v_created + 1;
      elsif v_depth=v_count-1 then
        v_updated := v_updated + 1;
      end if;

      if v_parent is not null and v_depth < 6 then
        update public.marketplace_taxonomy_categories
        set is_leaf = case when v_depth=6 then is_leaf else false end,
            updated_at=now()
        where id=v_parent
          and not (
            -- depth 5 is the display-level Leaf Category and may remain selectable
            v_depth=6
          );
      end if;

      v_parent := v_id;
    end loop;

    v_aliases := array(
      select distinct trim(value)
      from jsonb_array_elements_text(coalesce(r->'aliases','[]'::jsonb))
      where nullif(trim(value),'') is not null
    );

    update public.marketplace_taxonomy_categories
    set name = coalesce(nullif(trim(r->>'name'),''), name),
        synonyms = (
          select coalesce(array_agg(distinct v order by v),'{}'::text[])
          from unnest(coalesce(synonyms,'{}'::text[]) || coalesce(v_aliases,'{}'::text[])) v
          where nullif(trim(v),'') is not null
        ),
        form_template_key = coalesce(nullif(r->>'form_template_key',''),form_template_key),
        moderation_tier = coalesce(nullif(r->>'moderation_tier',''),moderation_tier,'standard'),
        source_taxonomy = coalesce(nullif(r->>'source_taxonomy',''),source_taxonomy),
        source_id = coalesce(nullif(r->>'source_id',''),source_id),
        source_version = coalesce(nullif(r->>'source_version',''),source_version),
        restricted = coalesce((r->>'restricted')::boolean,restricted,false),
        age_gate = coalesce((r->>'age_gate')::boolean,age_gate,false),
        selectable_endpoint = coalesce((r->>'selectable_endpoint')::boolean,selectable_endpoint,is_leaf),
        is_leaf = case
          when coalesce((r->>'selectable_endpoint')::boolean,false) then true
          else is_leaf
        end,
        external_mappings = coalesce(external_mappings,'{}'::jsonb)
          || coalesce(r->'external_mappings','{}'::jsonb),
        metadata = coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object('taxonomy_reconstruction_version','2026-09'),
        updated_at=now()
    where id=v_parent;
  end loop;

  return jsonb_build_object(
    'rows', jsonb_array_length(p_rows),
    'created_nodes', v_created,
    'updated_nodes', v_updated
  );
end;
$$;

revoke all on function public.system_import_marketplace_taxonomy_paths(jsonb) from public,anon,authenticated;
grant execute on function public.system_import_marketplace_taxonomy_paths(jsonb) to service_role;

comment on function public.system_import_marketplace_taxonomy_paths(jsonb) is
  'Service-role taxonomy importer for versioned DRIGHT2 reconstruction. Max seven display levels; additive and idempotent.';

commit;