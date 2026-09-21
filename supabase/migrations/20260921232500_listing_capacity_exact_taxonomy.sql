begin;

alter table public.products
  add column if not exists listing_taxonomy_category_id uuid
    references public.marketplace_taxonomy_categories(id) on delete set null;

alter table public.jobs
  add column if not exists listing_taxonomy_category_id uuid
    references public.marketplace_taxonomy_categories(id) on delete set null;

create index if not exists products_listing_taxonomy_category_idx
  on public.products(listing_taxonomy_category_id)
  where listing_taxonomy_category_id is not null;

create index if not exists jobs_listing_taxonomy_category_idx
  on public.jobs(listing_taxonomy_category_id)
  where listing_taxonomy_category_id is not null;

-- Backfill safely from the existing additive sidecar where a category was already resolved.
update public.products p
set listing_taxonomy_category_id=e.category_id
from public.marketplace_listing_extensions e
where e.entity_type='product'
  and e.entity_id=p.id
  and e.category_id is not null
  and p.listing_taxonomy_category_id is null;

update public.jobs j
set listing_taxonomy_category_id=e.category_id
from public.marketplace_listing_extensions e
where e.entity_type='job'
  and e.entity_id=j.id
  and e.category_id is not null
  and j.listing_taxonomy_category_id is null;

create or replace function public.enforce_product_listing_capacity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_category_id uuid;
begin
  if coalesce(auth.role(),'')='service_role' or v_uid is null then return new; end if;
  if new.uploaded_by is distinct from v_uid then return new; end if;
  if exists(select 1 from public.users where id=v_uid and is_admin=true) then return new; end if;

  v_category_id:=new.listing_taxonomy_category_id;

  if v_category_id is null then
    select c.id into v_category_id
    from public.marketplace_taxonomy_categories c
    where c.listing_type_code=upper(coalesce(new.product_type,'PHYSICAL'))
      and c.parent_id is null
      and lower(c.name)=lower(coalesce(new.category,''))
    order by c.created_at
    limit 1;
  end if;

  perform public.consume_listing_capacity(
    v_uid,'product',new.id,upper(coalesce(new.product_type,'PHYSICAL')),v_category_id
  );

  return new;
end;
$$;

create or replace function public.enforce_job_listing_capacity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_category_id uuid;
begin
  if coalesce(auth.role(),'')='service_role' or v_uid is null then return new; end if;
  if new.employer_id is distinct from v_uid then return new; end if;
  if exists(select 1 from public.users where id=v_uid and is_admin=true) then return new; end if;

  v_category_id:=new.listing_taxonomy_category_id;

  if v_category_id is null then
    select c.id into v_category_id
    from public.marketplace_taxonomy_categories c
    where c.listing_type_code='JOB'
      and c.parent_id is null
      and lower(c.name)=lower(coalesce(new.category,''))
    order by c.created_at
    limit 1;
  end if;

  perform public.consume_listing_capacity(v_uid,'job',new.id,'JOB',v_category_id);
  return new;
end;
$$;

commit;