-- Allow active DRIGHT admins to QA-test hidden first-party listings while
-- keeping hidden listings blocked for normal marketplace users.

create or replace function public.guard_order_approved_product()
returns trigger
language plpgsql
as $$
declare
  v_product record;
  v_is_official boolean := false;
  v_admin_hidden_qa boolean := false;
begin
  if new.product_id is null then
    return new;
  end if;

  select
    p.approval_status,
    p.is_active,
    p.is_hidden,
    p.specifications
  into v_product
  from public.products p
  where p.id = new.product_id;

  if not found then
    raise exception 'This listing is not available for purchase';
  end if;

  if v_product.approval_status = 'approved'
     and v_product.is_active = true
     and v_product.is_hidden = false then
    return new;
  end if;

  v_is_official :=
    lower(coalesce(v_product.specifications->>'official_store', 'false')) = 'true'
    or lower(coalesce(v_product.specifications->>'first_party', 'false')) = 'true';

  if v_product.approval_status = 'approved'
     and v_product.is_active = true
     and v_product.is_hidden = true
     and v_is_official
     and new.buyer_id is not null then
    select exists (
      select 1
      from public.users u
      where u.id = new.buyer_id
        and u.is_admin = true
        and lower(coalesce(u.admin_status, 'active')) = 'active'
    )
    into v_admin_hidden_qa;

    if v_admin_hidden_qa then
      return new;
    end if;
  end if;

  raise exception 'This listing is not available for purchase';
end;
$$;

comment on function public.guard_order_approved_product() is
'Allows checkout only for approved active public listings, except approved active hidden first-party DRIGHT listings may be purchased by active admins for QA testing.';
