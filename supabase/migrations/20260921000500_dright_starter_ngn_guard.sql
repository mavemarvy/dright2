begin;

update public.dright_starter_product_settings
set currency='NGN',updated_at=now()
where singleton=true and upper(currency)<>'NGN';

alter table public.dright_starter_product_settings
  drop constraint if exists dright_starter_product_currency_ngn;
alter table public.dright_starter_product_settings
  add constraint dright_starter_product_currency_ngn
  check (upper(currency)='NGN');

alter table public.dright_starter_purchases
  drop constraint if exists dright_starter_purchase_currency_ngn;
alter table public.dright_starter_purchases
  add constraint dright_starter_purchase_currency_ngn
  check (upper(currency)='NGN');

commit;