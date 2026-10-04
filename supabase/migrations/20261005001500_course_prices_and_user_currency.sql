-- DRIGHT course price recommendations + user-selectable marketplace currency.
-- Site default remains USD, but users/visitors may choose a preferred display currency.
-- Stored product source currencies are not rewritten.

begin;

update public.site_settings
set default_currency = 'USD',
    force_default_currency = false,
    updated_at = now()
where singleton = true;

with recommended(slug, price_ngn) as (
  values
    ('facebook-instagram-ads-mastery-2026', 20000::numeric),
    ('instagram-ads-mastery-2026', 15000::numeric),
    ('whatsapp-marketing-sales-mastery-2026', 15000::numeric),
    ('tiktok-ads-organic-sales-mastery-2026', 18000::numeric),
    ('weight-loss-fitness-business-affiliate-mastery-2026', 15000::numeric),
    ('youtube-ads-mastery-2026', 20000::numeric),
    ('google-ads-mastery-2026', 25000::numeric)
)
update public.products p
set price = recommended.price_ngn,
    specifications = coalesce(p.specifications, '{}'::jsonb)
      || jsonb_build_object(
        'price_currency','NGN',
        'source_currency','NGN',
        'recommended_price_applied',true
      ),
    updated_at = now()
from public.dright_official_products dop
join recommended on recommended.slug = dop.slug
where p.id = dop.marketplace_product_id;

with recommended(slug, price_ngn) as (
  values
    ('facebook-instagram-ads-mastery-2026', 20000::numeric),
    ('instagram-ads-mastery-2026', 15000::numeric),
    ('whatsapp-marketing-sales-mastery-2026', 15000::numeric),
    ('tiktok-ads-organic-sales-mastery-2026', 18000::numeric),
    ('weight-loss-fitness-business-affiliate-mastery-2026', 15000::numeric),
    ('youtube-ads-mastery-2026', 20000::numeric),
    ('google-ads-mastery-2026', 25000::numeric)
)
update public.dright_official_products dop
set currency = 'NGN',
    metadata = coalesce(dop.metadata,'{}'::jsonb)
      || jsonb_build_object(
        'source_currency','NGN',
        'price_placeholder',false,
        'recommended_price_applied',true
      ),
    updated_at = now()
from recommended
where dop.slug = recommended.slug;

commit;
