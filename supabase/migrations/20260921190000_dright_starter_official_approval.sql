begin;

do $$
declare
  v_admin uuid;
  v_product uuid;
begin
  select owner_user_id into v_admin
  from public.dright_official_store_settings
  where singleton=true;

  select marketplace_product_id into v_product
  from public.dright_starter_product_settings
  where singleton=true;

  if v_admin is null then
    raise exception 'DRIGHT official store owner is not configured';
  end if;

  if v_product is null then
    raise exception 'DRIGHT Starter marketplace product is not configured';
  end if;

  if exists (
    select 1 from public.products
    where id=v_product and approval_status<>'approved'
  ) then
    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform public.review_dright_listing('digital_product',v_product,'approve',null);
  end if;
end;
$$;

commit;