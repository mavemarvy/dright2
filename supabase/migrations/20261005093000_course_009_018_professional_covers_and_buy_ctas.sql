-- Final commercial presentation for DRIGHT Official Courses 009-018.
-- Replaces rejected placeholder/SVG marketplace imagery with the approved
-- professional Nigerian/African advertising covers. Visibility remains unchanged.

begin;
select set_config('request.jwt.claim.role','service_role',true);

create temporary table _dright_course_cover_map (
  course_number text primary key,
  slug text not null unique,
  cover_path text not null
) on commit drop;

insert into _dright_course_cover_map(course_number,slug,cover_path) values
('009','ai-business-income-mastery-2026','/course-009-ai-business/cover.webp'),
('010','china-importation-reselling-mastery-2026','/course-010-china-importation/cover.webp'),
('011','fiverr-upwork-freelancing-mastery-2026','/course-011-freelancing/cover.webp'),
('012','affiliate-marketing-online-sales-mastery-2026','/course-012-affiliate/cover.webp'),
('013','digital-product-creation-selling-mastery-2026','/course-013-digital-products/cover.webp'),
('014','ai-website-app-bot-building-mastery-2026','/course-014-ai-builder/cover.webp'),
('015','pdf-product-creation-automation-mastery-2026','/course-015-pdf-products/cover.webp'),
('016','ghostwriting-freelance-writing-income-mastery-2026','/course-016-ghostwriting/cover.webp'),
('017','amazon-kdp-publishing-book-business-mastery-2026','/course-017-kdp/cover.webp'),
('018','youtube-ai-automation-faceless-channel-mastery-2026','/course-018-youtube-ai/cover.webp');

update public.products p
set image_url = m.cover_path,
    specifications = coalesce(p.specifications,'{}'::jsonb) || jsonb_build_object(
      'professional_marketplace_cover', true,
      'cover_format', 'WEBP',
      'marketplace_cta', 'BUY_NOW',
      'course_number', m.course_number,
      'cover_direction', 'original multi-person Nigerian/African commercial course advertising'
    ),
    updated_at = now()
from public.dright_official_products dop
join _dright_course_cover_map m on m.slug = dop.slug
where p.id = dop.marketplace_product_id;

update public.dright_official_products dop
set image_urls = jsonb_build_array(m.cover_path),
    metadata = coalesce(dop.metadata,'{}'::jsonb) || jsonb_build_object(
      'professional_marketplace_cover', true,
      'marketplace_cta', 'BUY_NOW',
      'rejected_placeholder_covers_removed', true,
      'cover_format', 'WEBP'
    ),
    updated_at = now()
from _dright_course_cover_map m
where dop.slug = m.slug;

-- Remove the old placeholder/banner/toolkit SVG gallery entries for these courses.
delete from public.product_images pi
using public.dright_official_products dop, _dright_course_cover_map m
where pi.product_id = dop.marketplace_product_id
  and dop.slug = m.slug;

-- The new professional advert is the authoritative marketplace/product cover.
insert into public.product_images(product_id,image_url,position)
select dop.marketplace_product_id, m.cover_path, 0
from public.dright_official_products dop
join _dright_course_cover_map m on m.slug = dop.slug;

commit;
