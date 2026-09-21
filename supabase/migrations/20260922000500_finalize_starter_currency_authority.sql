begin;

-- Keep the first-party Starter commercial source price authoritative while
-- allowing marketplace/dashboard UIs to convert it for each viewer.
create or replace function public.sync_dright_starter_currency_metadata()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_product uuid;
begin
  v_product:=new.marketplace_product_id;

  if v_product is not null then
    update public.products
    set price=new.price,
        specifications=coalesce(specifications,'{}'::jsonb)
          || jsonb_build_object(
            'price_currency',upper(new.currency),
            'source_currency',upper(new.currency),
            'system_product_kind','dright_starter_access',
            'first_party',true,
            'platform_fee_percent',0,
            'official_store',true
          ),
        updated_at=now()
    where id=v_product
      and (
        sku='DRIGHT-STARTER-ACCESS'
        or specifications->>'system_product_kind'='dright_starter_access'
      );
  end if;

  return new;
end;
$$;

revoke all on function public.sync_dright_starter_currency_metadata() from public,anon,authenticated;

drop trigger if exists zz_sync_dright_starter_currency_metadata
on public.dright_starter_product_settings;

create trigger zz_sync_dright_starter_currency_metadata
after insert or update of price,currency,marketplace_product_id
on public.dright_starter_product_settings
for each row execute function public.sync_dright_starter_currency_metadata();

-- User-selected launch price. Admin remains able to change this later.
update public.dright_starter_product_settings
set price=5000,
    currency='NGN',
    updated_at=now()
where singleton=true;

-- Run the canonical first-party mirror sync, then make the currency metadata
-- explicit even if an older database trigger/function omits it.
do $$
declare
  v_product uuid;
  v_currency text;
  v_price numeric;
begin
  perform public.sync_dright_starter_marketplace_product_now();

  select marketplace_product_id,upper(currency),price
  into v_product,v_currency,v_price
  from public.dright_starter_product_settings
  where singleton=true;

  if v_product is not null then
    update public.products
    set price=v_price,
        specifications=coalesce(specifications,'{}'::jsonb)
          || jsonb_build_object(
            'price_currency',v_currency,
            'source_currency',v_currency,
            'system_product_kind','dright_starter_access',
            'first_party',true,
            'platform_fee_percent',0,
            'official_store',true
          ),
        updated_at=now()
    where id=v_product;
  end if;
end $$;

commit;
