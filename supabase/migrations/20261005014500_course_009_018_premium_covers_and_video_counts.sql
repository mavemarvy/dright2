-- Premium marketplace covers and tutorial-count metadata for DRIGHT Courses 009-018.
-- Visibility remains unchanged; this migration only upgrades media/metadata.

begin;
select set_config('request.jwt.claim.role','service_role',true);

with course_media(course_number, slug, cover_path) as (
  values
    ('009','ai-business-income-mastery-2026','/course-009-ai-business/cover.svg'),
    ('010','china-importation-reselling-mastery-2026','/course-010-china-importation/cover.svg'),
    ('011','fiverr-upwork-freelancing-mastery-2026','/course-011-freelancing/cover.svg'),
    ('012','affiliate-marketing-online-sales-mastery-2026','/course-012-affiliate/cover.svg'),
    ('013','digital-product-creation-selling-mastery-2026','/course-013-digital-products/cover.svg'),
    ('014','ai-website-app-bot-building-mastery-2026','/course-014-ai-builder/cover.svg'),
    ('015','pdf-product-creation-automation-mastery-2026','/course-015-pdf-products/cover.svg'),
    ('016','ghostwriting-freelance-writing-income-mastery-2026','/course-016-ghostwriting/cover.svg'),
    ('017','amazon-kdp-publishing-book-business-mastery-2026','/course-017-kdp/cover.svg'),
    ('018','youtube-ai-automation-faceless-channel-mastery-2026','/course-018-youtube-ai/cover.svg')
)
update public.products p
set image_url = course_media.cover_path,
    specifications = coalesce(p.specifications,'{}'::jsonb)
      || jsonb_build_object(
        'premium_cover', true,
        'embedded_video_count', 10,
        'embedded_video_mix', '5 Nigerian English + 5 international English',
        'course_number', course_media.course_number
      ),
    updated_at = now()
from public.dright_official_products dop
join course_media on course_media.slug=dop.slug
where p.id=dop.marketplace_product_id;

with course_media(course_number, slug, cover_path) as (
  values
    ('009','ai-business-income-mastery-2026','/course-009-ai-business/cover.svg'),
    ('010','china-importation-reselling-mastery-2026','/course-010-china-importation/cover.svg'),
    ('011','fiverr-upwork-freelancing-mastery-2026','/course-011-freelancing/cover.svg'),
    ('012','affiliate-marketing-online-sales-mastery-2026','/course-012-affiliate/cover.svg'),
    ('013','digital-product-creation-selling-mastery-2026','/course-013-digital-products/cover.svg'),
    ('014','ai-website-app-bot-building-mastery-2026','/course-014-ai-builder/cover.svg'),
    ('015','pdf-product-creation-automation-mastery-2026','/course-015-pdf-products/cover.svg'),
    ('016','ghostwriting-freelance-writing-income-mastery-2026','/course-016-ghostwriting/cover.svg'),
    ('017','amazon-kdp-publishing-book-business-mastery-2026','/course-017-kdp/cover.svg'),
    ('018','youtube-ai-automation-faceless-channel-mastery-2026','/course-018-youtube-ai/cover.svg')
)
update public.dright_official_products dop
set image_urls = jsonb_build_array(course_media.cover_path),
    metadata = coalesce(dop.metadata,'{}'::jsonb)
      || jsonb_build_object(
        'premium_cover', true,
        'embedded_video_count', 10,
        'embedded_video_mix', '5 Nigerian English + 5 international English'
      ),
    updated_at = now()
from course_media
where dop.slug=course_media.slug;

commit;
