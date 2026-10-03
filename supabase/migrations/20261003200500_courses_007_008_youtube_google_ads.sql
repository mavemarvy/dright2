-- Official DRIGHT Courses 007 and 008: YouTube Ads and Google Ads.
-- Both start Admin Only for QA, cost NGN 5,000, carry 60% affiliate commission,
-- 365-day buyer access, zero DRIGHT marketplace fee, and assisted direct-sale guest access.

BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);

DO $$
DECLARE
  v_owner uuid := '0de1a1ab-d015-489a-90d9-a9904340d0a3';
  v_pid uuid;
BEGIN
  -- COURSE 007 — YouTube Ads Mastery 2026
  SELECT marketplace_product_id INTO v_pid
  FROM public.dright_official_products
  WHERE slug='youtube-ads-mastery-2026';

  IF v_pid IS NULL THEN
    v_pid := gen_random_uuid();

    INSERT INTO public.products(
      id,uploaded_by,name,description,price,commission_rate,image_url,category,is_active,
      approval_status,admin_task_percent,sales_team_task_percent,affiliate_commission_percent,
      total_reviews,average_rating,is_hidden,is_free,product_type,has_dright_sales_team,
      total_sales,view_count,tags,brand,condition,specifications,is_featured,reviewed_by,reviewed_at
    ) VALUES(
      v_pid,v_owner,'YouTube Ads Mastery 2026',
      'A practical 2026 YouTube advertising course covering Google Ads setup, Video campaigns, YouTube Shorts ads, Demand Gen, creative strategy, conversion tracking, bidding, remarketing, reporting and responsible scaling.',
      5000,0,'/course-007-youtube-ads/banner.svg','Digital Marketing',true,
      'approved',0,0,60,0,0,true,false,'COURSE',false,0,0,
      ARRAY['DRIGHT','Course','YouTube Ads','Video Ads','Demand Gen','YouTube Shorts','Google Ads','Digital Marketing','Official DRIGHT Product'],
      'DRIGHT','new',
      jsonb_build_object(
        'edition','2026',
        'course_slug','youtube-ads-mastery-2026',
        'first_party',true,
        'official_store',true,
        'lesson_count',45,
        'module_count',15,
        'phone_friendly',true,
        'price_currency','NGN',
        'source_currency','NGN',
        'review_required',false,
        'course_access_path','/learn/youtube-ads-mastery-2026',
        'system_product_kind','dright_course',
        'platform_fee_percent',0
      ),
      true,v_owner,now()
    );

    INSERT INTO public.dright_official_products(
      marketplace_product_id,slug,subtitle,currency,public_visible,is_enabled,
      official_badge_enabled,official_rating_enabled,official_rating,benefits,image_urls,metadata,
      created_by,updated_by
    ) VALUES(
      v_pid,'youtube-ads-mastery-2026',
      'Google Ads video campaigns, YouTube Shorts, Demand Gen, creative, tracking and scaling',
      'NGN',false,true,true,false,5.00,
      jsonb_build_array(
        '15 structured modules and 45 lessons',
        'Current 2026 YouTube and Google Ads workflows',
        'Video campaign objectives and formats',
        'YouTube Shorts advertising',
        'Demand Gen after the 2026 Video Action Campaign migration',
        'Google tag and conversion tracking',
        'Creative testing and audience research',
        'Bidding, budgets, remarketing and scaling',
        '90-day capstone operating plan',
        '365 days of buyer access'
      ),
      jsonb_build_array('/course-007-youtube-ads/banner.svg','/course-007-youtube-ads/shorts.svg'),
      jsonb_build_object(
        'first_party',true,
        'course_number','007',
        'review_required',false,
        'source_currency','NGN',
        'price_placeholder',true,
        'course_access_path','/learn/youtube-ads-mastery-2026',
        'commission_placeholder',true,
        'no_marketplace_platform_fee',true
      ),
      v_owner,v_owner
    );

    INSERT INTO public.digital_product_details(
      product_id,delivery_type,download_limit,expiry_days,access_link,file_format,includes_bonus_materials
    ) VALUES(v_pid,'LINK_ACCESS',NULL,365,'/learn/youtube-ads-mastery-2026','Interactive course portal',true);

    INSERT INTO public.product_images(product_id,image_url,position) VALUES
      (v_pid,'/course-007-youtube-ads/banner.svg',0),
      (v_pid,'/course-007-youtube-ads/shorts.svg',1);

    INSERT INTO public.listing_direct_sale_settings(entity_type,entity_id,owner_id,enabled,guest_access_days)
    VALUES('product',v_pid,v_owner,true,10)
    ON CONFLICT(entity_type,entity_id) DO UPDATE SET enabled=true,guest_access_days=10,updated_at=now();
  END IF;

  -- COURSE 008 — Google Ads Mastery 2026
  v_pid := NULL;
  SELECT marketplace_product_id INTO v_pid
  FROM public.dright_official_products
  WHERE slug='google-ads-mastery-2026';

  IF v_pid IS NULL THEN
    v_pid := gen_random_uuid();

    INSERT INTO public.products(
      id,uploaded_by,name,description,price,commission_rate,image_url,category,is_active,
      approval_status,admin_task_percent,sales_team_task_percent,affiliate_commission_percent,
      total_reviews,average_rating,is_hidden,is_free,product_type,has_dright_sales_team,
      total_sales,view_count,tags,brand,condition,specifications,is_featured,reviewed_by,reviewed_at
    ) VALUES(
      v_pid,v_owner,'Google Ads Mastery 2026',
      'A practical 2026 Google Ads course covering Search intent, keywords and match types, Responsive Search Ads, conversion tracking, Smart Bidding, Performance Max, Demand Gen, landing pages, reporting and controlled scaling.',
      5000,0,'/course-008-google-ads/banner.svg','Digital Marketing',true,
      'approved',0,0,60,0,0,true,false,'COURSE',false,0,0,
      ARRAY['DRIGHT','Course','Google Ads','Search Ads','Performance Max','Demand Gen','Smart Bidding','Digital Marketing','Official DRIGHT Product'],
      'DRIGHT','new',
      jsonb_build_object(
        'edition','2026',
        'course_slug','google-ads-mastery-2026',
        'first_party',true,
        'official_store',true,
        'lesson_count',45,
        'module_count',15,
        'phone_friendly',true,
        'price_currency','NGN',
        'source_currency','NGN',
        'review_required',false,
        'course_access_path','/learn/google-ads-mastery-2026',
        'system_product_kind','dright_course',
        'platform_fee_percent',0
      ),
      true,v_owner,now()
    );

    INSERT INTO public.dright_official_products(
      marketplace_product_id,slug,subtitle,currency,public_visible,is_enabled,
      official_badge_enabled,official_rating_enabled,official_rating,benefits,image_urls,metadata,
      created_by,updated_by
    ) VALUES(
      v_pid,'google-ads-mastery-2026',
      'Search, keywords, Responsive Search Ads, Smart Bidding, Performance Max and Demand Gen',
      'NGN',false,true,true,false,5.00,
      jsonb_build_array(
        '15 structured modules and 45 lessons',
        'Current 2026 Google Ads workflows',
        'Search intent and keyword research',
        'Broad, phrase and exact match with negative keywords',
        'Responsive Search Ads and assets',
        'Google tag and enhanced conversions',
        'Smart Bidding and 2026 label changes',
        'Performance Max, Search Themes and audience signals',
        'Demand Gen and 2026 visual-campaign migration changes',
        '90-day capstone operating plan',
        '365 days of buyer access'
      ),
      jsonb_build_array('/course-008-google-ads/banner.svg','/course-008-google-ads/search-system.svg'),
      jsonb_build_object(
        'first_party',true,
        'course_number','008',
        'review_required',false,
        'source_currency','NGN',
        'price_placeholder',true,
        'course_access_path','/learn/google-ads-mastery-2026',
        'commission_placeholder',true,
        'no_marketplace_platform_fee',true
      ),
      v_owner,v_owner
    );

    INSERT INTO public.digital_product_details(
      product_id,delivery_type,download_limit,expiry_days,access_link,file_format,includes_bonus_materials
    ) VALUES(v_pid,'LINK_ACCESS',NULL,365,'/learn/google-ads-mastery-2026','Interactive course portal',true);

    INSERT INTO public.product_images(product_id,image_url,position) VALUES
      (v_pid,'/course-008-google-ads/banner.svg',0),
      (v_pid,'/course-008-google-ads/search-system.svg',1);

    INSERT INTO public.listing_direct_sale_settings(entity_type,entity_id,owner_id,enabled,guest_access_days)
    VALUES('product',v_pid,v_owner,true,10)
    ON CONFLICT(entity_type,entity_id) DO UPDATE SET enabled=true,guest_access_days=10,updated_at=now();
  END IF;
END $$;

COMMIT;