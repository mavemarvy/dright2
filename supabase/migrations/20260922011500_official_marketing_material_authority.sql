begin;

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
    when 'product' then
      exists(
        select 1 from public.products p
        where p.id=p_listing_id and p.uploaded_by=p_uid
      )
      or (
        public.has_dright_permission('subscriptions','manage')
        and (
          exists(
            select 1 from public.dright_official_products o
            where o.marketplace_product_id=p_listing_id
          )
          or exists(
            select 1 from public.dright_starter_product_settings s
            where s.singleton=true and s.marketplace_product_id=p_listing_id
          )
        )
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

commit;