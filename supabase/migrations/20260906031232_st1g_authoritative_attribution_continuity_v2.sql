alter table public.referral_links add column if not exists product_id uuid references public.products(id) on delete cascade, add column if not exists source_type text not null default 'affiliate', add column if not exists source_level text, add column if not exists campaign_id uuid, add column if not exists sales_team_id uuid, add column if not exists team_member_id uuid, add column if not exists team_lead_id uuid;

alter table public.affiliate_clicks add column if not exists referral_link_id uuid references public.referral_links(id) on delete set null, add column if not exists tracking_code text, add column if not exists source_type text, add column if not exists source_level text, add column if not exists campaign_id uuid, add column if not exists sales_team_id uuid, add column if not exists team_member_id uuid, add column if not exists team_lead_id uuid, add column if not exists visitor_id text, add column if not exists session_id text, add column if not exists attribution_at timestamptz;

alter table public.orders add column if not exists referral_link_id uuid references public.referral_links(id) on delete set null, add column if not exists tracking_code text, add column if not exists source_type text, add column if not exists source_level text, add column if not exists campaign_id uuid, add column if not exists sales_team_id uuid, add column if not exists team_member_id uuid, add column if not exists team_lead_id uuid, add column if not exists visitor_id text, add column if not exists session_id text, add column if not exists attribution_at timestamptz, add column if not exists checkout_id text;

with ranked as (select id, row_number() over (partition by user_id, product_id order by viewed_at desc, id desc) rn from public.recently_viewed) delete from public.recently_viewed r using ranked x where r.id=x.id and x.rn>1;

create unique index if not exists referral_links_user_product_source_uidx on public.referral_links(user_id, product_id, source_type) where product_id is not null;
create unique index if not exists recently_viewed_user_product_uidx on public.recently_viewed(user_id, product_id);
create index if not exists affiliate_clicks_tracking_code_idx on public.affiliate_clicks(tracking_code);
create index if not exists affiliate_clicks_referral_link_idx on public.affiliate_clicks(referral_link_id);
create index if not exists orders_referral_link_idx on public.orders(referral_link_id);
create index if not exists orders_tracking_code_idx on public.orders(tracking_code);
create index if not exists orders_source_type_idx on public.orders(source_type);