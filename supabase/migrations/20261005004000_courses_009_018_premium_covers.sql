-- Upgrade DRIGHT Official Courses 009-018 to premium portrait marketplace covers.
begin;
select set_config('request.jwt.claim.role','service_role',true);

with covers(slug, cover_url) as (
  values
    ('ai-business-income-mastery-2026','/course-009-ai-business/cover.svg'),
    ('china-importation-reselling-mastery-2026','/course-010-china-importation/cover.svg'),
    ('fiverr-upwork-freelancing-mastery-2026','/course-011-freelancing/cover.svg'),
    ('affiliate-marketing-online-sales-mastery-2026','/course-012-affiliate/cover.svg'),
    ('digital-product-creation-selling-mastery-2026','/course-013-digital-products/cover.svg'),
    ('ai-website-app-bot-building-mastery-2026','/course-014-ai-builder/cover.svg'),
    ('pdf-product-creation-automation-mastery-2026','/course-015-pdf-products/cover.svg'),
    ('ghostwriting-freelance-writing-income-mastery-2026','/course-016-ghostwriting/cover.svg'),
    ('amazon-kdp-publishing-book-business-mastery-2026','/course-017-kdp/cover.svg'),
    ('youtube-ai-automation-faceless-channel-mastery-2026','/course-018-youtube-ai/cover.svg')
)
update public.products p
set image_url = covers.cover_url,
    specifications = coalesce(p.specifications,'{}'::jsonb)
      || jsonb_build_object('premium_cover_url',covers.cover_url),
    updated_at = now()
from public.dright_official_products dop
join covers on covers.slug=dop.slug
where p.id=dop.marketplace_product_id;

with covers(slug, cover_url) as (
  values
    ('ai-business-income-mastery-2026','/course-009-ai-business/cover.svg'),
    ('china-importation-reselling-mastery-2026','/course-010-china-importation/cover.svg'),
    ('fiverr-upwork-freelancing-mastery-2026','/course-011-freelancing/cover.svg'),
    ('affiliate-marketing-online-sales-mastery-2026','/course-012-affiliate/cover.svg'),
    ('digital-product-creation-selling-mastery-2026','/course-013-digital-products/cover.svg'),
    ('ai-website-app-bot-building-mastery-2026','/course-014-ai-builder/cover.svg'),
    ('pdf-product-creation-automation-mastery-2026','/course-015-pdf-products/cover.svg'),
    ('ghostwriting-freelance-writing-income-mastery-2026','/course-016-ghostwriting/cover.svg'),
    ('amazon-kdp-publishing-book-business-mastery-2026','/course-017-kdp/cover.svg'),
    ('youtube-ai-automation-faceless-channel-mastery-2026','/course-018-youtube-ai/cover.svg')
)
update public.product_images pi
set image_url=covers.cover_url
from public.dright_official_products dop
join covers on covers.slug=dop.slug
where pi.product_id=dop.marketplace_product_id
  and pi.position=0;

with covers(slug, cover_url) as (
  values
    ('ai-business-income-mastery-2026','/course-009-ai-business/cover.svg'),
    ('china-importation-reselling-mastery-2026','/course-010-china-importation/cover.svg'),
    ('fiverr-upwork-freelancing-mastery-2026','/course-011-freelancing/cover.svg'),
    ('affiliate-marketing-online-sales-mastery-2026','/course-012-affiliate/cover.svg'),
    ('digital-product-creation-selling-mastery-2026','/course-013-digital-products/cover.svg'),
    ('ai-website-app-bot-building-mastery-2026','/course-014-ai-builder/cover.svg'),
    ('pdf-product-creation-automation-mastery-2026','/course-015-pdf-products/cover.svg'),
    ('ghostwriting-freelance-writing-income-mastery-2026','/course-016-ghostwriting/cover.svg'),
    ('amazon-kdp-publishing-book-business-mastery-2026','/course-017-kdp/cover.svg'),
    ('youtube-ai-automation-faceless-channel-mastery-2026','/course-018-youtube-ai/cover.svg')
)
update public.dright_official_products dop
set image_urls = case
      when jsonb_typeof(dop.image_urls)='array' and jsonb_array_length(dop.image_urls)>1
        then jsonb_build_array(covers.cover_url, dop.image_urls->1)
      else jsonb_build_array(covers.cover_url)
    end,
    metadata = coalesce(dop.metadata,'{}'::jsonb)
      || jsonb_build_object('premium_cover_url',covers.cover_url),
    updated_at=now()
from covers
where dop.slug=covers.slug;

commit;
