-- Fix hidden Official DRIGHT checkout guard for guest_orders.
-- The shared trigger previously referenced NEW.buyer_id, which does not exist
-- on guest_orders and caused assisted/admin QA checkout to fail before order creation.

create or replace function public.guard_order_approved_product()
returns trigger
language plpgsql
as $function$
declare
  v_product record;
  v_is_official boolean := false;
  v_admin_hidden_qa boolean := false;
  v_actor_id uuid := null;
  v_row jsonb;
  v_metadata jsonb := '{}'::jsonb;
  v_assisted_mode boolean := false;
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
     and v_is_official then
    v_row := to_jsonb(new);

    if tg_table_name = 'guest_orders' then
      v_metadata := coalesce(v_row->'metadata', '{}'::jsonb);
      v_assisted_mode := lower(coalesce(v_metadata->>'assisted_mode','false')) = 'true';

      if v_assisted_mode
         and nullif(v_metadata->>'assisted_by_user_id','') is not null then
        begin
          v_actor_id := (v_metadata->>'assisted_by_user_id')::uuid;
        exception when invalid_text_representation then
          v_actor_id := null;
        end;
      end if;
    else
      if nullif(v_row->>'buyer_id','') is not null then
        begin
          v_actor_id := (v_row->>'buyer_id')::uuid;
        exception when invalid_text_representation then
          v_actor_id := null;
        end;
      end if;
    end if;

    if v_actor_id is not null then
      select exists (
        select 1
        from public.users u
        where u.id = v_actor_id
          and u.is_admin = true
          and lower(coalesce(u.admin_status, 'active')) = 'active'
      )
      into v_admin_hidden_qa;

      if v_admin_hidden_qa then
        return new;
      end if;
    end if;
  end if;

  raise exception 'This listing is not available for purchase';
end;
$function$;
