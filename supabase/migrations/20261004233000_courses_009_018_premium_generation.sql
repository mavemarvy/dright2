-- DRIGHT Official Courses 009-018 premium generation.
-- New courses start ADMIN ONLY, use NGN as source currency, 60% affiliate commission,
-- and 365 days as the editable default access period. Existing courses are not modified.

BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);

DO $$
DECLARE
  v_owner uuid;
  v_pid uuid;
  r record;
BEGIN
  SELECT COALESCE(dop.created_by, p.uploaded_by)
    INTO v_owner
  FROM public.dright_official_products dop
  JOIN public.products p ON p.id = dop.marketplace_product_id
  WHERE COALESCE(dop.created_by, p.uploaded_by) IS NOT NULL
  ORDER BY dop.created_at
  LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Cannot create DRIGHT Official courses: no existing Official Store owner could be resolved.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('009','ai-business-income-mastery-2026','AI Business & Income Mastery 2026',
       'Turn AI into practical services, digital products, content systems and business workflows',
       'A practical AI business course for Nigerians and Africans covering responsible prompting, research, writing services, content systems, customer support, visual workflows, spreadsheets, pricing, client acquisition, privacy, digital products, measurement and a 90-day capstone.',
       25000::numeric,'AI & Business','/course-009-ai-business/banner.svg','/course-009-ai-business/toolkit.svg','ai-service-profit',
       ARRAY['DRIGHT','Course','AI Business','AI Services','Automation','Digital Products','Nigeria','Africa','Official DRIGHT Product']::text[]),
      ('010','china-importation-reselling-mastery-2026','China Importation & Reselling Mastery 2026',
       'Source responsibly, verify suppliers, calculate landed cost and build a Nigeria-ready resale system',
       'A practical China importation and reselling course covering product research, Alibaba, 1688, AliExpress, supplier verification, RFQs, negotiation, samples, quality control, freight, customs awareness, landed cost, pricing, inventory, fulfilment and a 90-day importation capstone.',
       25000::numeric,'Importation & E-commerce','/course-010-china-importation/banner.svg','/course-010-china-importation/toolkit.svg','landed-cost',
       ARRAY['DRIGHT','Course','China Importation','Alibaba','1688','Reselling','Ecommerce','Nigeria','Official DRIGHT Product']::text[]),
      ('011','fiverr-upwork-freelancing-mastery-2026','Fiverr & Upwork Freelancing Mastery 2026',
       'Choose a sellable skill, build proof, price professionally and win international clients without fake credentials',
       'A practical freelancing course covering service selection, honest portfolios, Upwork profiles and proposals, Fiverr gigs, pricing, discovery, client communication, delivery, reviews, retainers, scam avoidance, AI-assisted workflows and a 90-day capstone.',
       20000::numeric,'Freelancing & Remote Work','/course-011-freelancing/banner.svg','/course-011-freelancing/toolkit.svg','freelance-rate',
       ARRAY['DRIGHT','Course','Fiverr','Upwork','Freelancing','Remote Work','International Clients','Nigeria','Official DRIGHT Product']::text[]),
      ('012','affiliate-marketing-online-sales-mastery-2026','Affiliate Marketing & Online Sales Mastery 2026',
       'Build trust, choose offers, create useful content and turn qualified attention into trackable sales',
       'A practical affiliate marketing and online-sales course covering audience research, offer selection, trust, short-form content, WhatsApp selling, long-form content, landing pages, analytics, DRIGHT affiliate workflows, paid-traffic economics, compliance, scaling and a 90-day capstone.',
       20000::numeric,'Affiliate Marketing','/course-012-affiliate/banner.svg','/course-012-affiliate/toolkit.svg','affiliate-earnings',
       ARRAY['DRIGHT','Course','Affiliate Marketing','Online Sales','WhatsApp','Content Marketing','DRIGHT Affiliate','Nigeria','Official DRIGHT Product']::text[]),
      ('013','digital-product-creation-selling-mastery-2026','Digital Product Creation & Selling Mastery 2026',
       'Research, build, package and sell useful ebooks, templates, trackers, prompt packs and business tools',
       'A practical digital-product course covering validation, product architecture, ebooks, planners, spreadsheets, prompt systems, product design, pricing, storefronts, delivery, sales pages, launches, support, licensing and a 90-day product capstone.',
       20000::numeric,'Digital Products','/course-013-digital-products/banner.svg','/course-013-digital-products/toolkit.svg','digital-product-profit',
       ARRAY['DRIGHT','Course','Digital Products','Ebooks','Templates','Spreadsheets','Prompt Packs','Online Business','Official DRIGHT Product']::text[]),
      ('014','ai-website-app-bot-building-mastery-2026','AI Website, App & Bot Building Mastery 2026',
       'Plan, build and deploy useful web apps, databases, APIs and Telegram bots with AI-assisted development',
       'A practical product-building course covering web foundations, GitHub, modern frontends, databases, Supabase, Firebase, authentication, APIs, AI features, Telegram bots, payments, deployment, security, SaaS economics and a 90-day deployed-MVP capstone.',
       30000::numeric,'Software Development & AI','/course-014-ai-builder/banner.svg','/course-014-ai-builder/toolkit.svg','saas-break-even',
       ARRAY['DRIGHT','Course','Web Development','App Development','Telegram Bot','Supabase','GitHub','AI Development','Official DRIGHT Product']::text[]),
      ('015','pdf-product-creation-automation-mastery-2026','PDF Product Creation & Automation Mastery 2026',
       'Create professional ebooks, planners, worksheets, forms and sellable PDF systems with efficient tools',
       'A practical PDF product course covering research, writing, layout systems, Canva, office tools, fillable PDFs, spreadsheet-to-PDF workflows, compression, accessibility, licensing, packaging, pricing, QA, versioning and a 90-day PDF-product capstone.',
       20000::numeric,'Digital Products','/course-015-pdf-products/banner.svg','/course-015-pdf-products/toolkit.svg','pdf-pricing',
       ARRAY['DRIGHT','Course','PDF','Ebook','Planner','Fillable PDF','Digital Products','Automation','Official DRIGHT Product']::text[]),
      ('016','ghostwriting-freelance-writing-income-mastery-2026','Ghostwriting & Freelance Writing Income Mastery 2026',
       'Research, write, edit and sell books, articles, newsletters, scripts and thought-leadership services professionally',
       'A practical ghostwriting course covering writing niches, source research, interviews, voice matching, outlining, drafting, editing, newsletters, video scripts, pricing, proposals, contracts, confidentiality, client acquisition, retainers, responsible AI assistance and a 90-day capstone.',
       20000::numeric,'Writing & Freelancing','/course-016-ghostwriting/banner.svg','/course-016-ghostwriting/toolkit.svg','ghostwriting-quote',
       ARRAY['DRIGHT','Course','Ghostwriting','Freelance Writing','Copy Editing','Newsletters','YouTube Scripts','Client Services','Official DRIGHT Product']::text[]),
      ('017','amazon-kdp-publishing-book-business-mastery-2026','Amazon KDP Publishing & Book Business Mastery 2026',
       'Research, write, format, publish and market original ebooks and print books with a policy-safe publishing system',
       'A practical Amazon KDP publishing course covering reader research, topic and rights screening, outlining, original manuscripts, editing, ebook and print formatting, Kindle Create, covers, metadata, ISBN and rights, royalty planning, preview QA, launch ethics, catalogue strategy and a 90-day capstone.',
       25000::numeric,'Publishing','/course-017-kdp/banner.svg','/course-017-kdp/toolkit.svg','kdp-planner',
       ARRAY['DRIGHT','Course','Amazon KDP','Self Publishing','Ebook','Paperback','Book Business','Publishing','Official DRIGHT Product']::text[]),
      ('018','youtube-ai-automation-faceless-channel-mastery-2026','YouTube AI Automation & Faceless Channel Mastery 2026',
       'Research, script, produce, edit and grow original faceless videos with AI-assisted workflows and policy-safe monetization',
       'A practical faceless YouTube course covering niche research, channel setup, topic systems, fact checking, AI-assisted scripts, narration, rights-cleared visuals, editing, thumbnails, Shorts, long-form retention, publishing, analytics, YouTube monetization policy, reused-content risk and a 90-day capstone.',
       30000::numeric,'YouTube & Content Creation','/course-018-youtube-ai/banner.svg','/course-018-youtube-ai/toolkit.svg','youtube-production',
       ARRAY['DRIGHT','Course','YouTube','AI Automation','Faceless Channel','YouTube Shorts','Video Editing','Content Creation','Official DRIGHT Product']::text[])
    ) AS x(course_number,slug,name,subtitle,description,price,category,banner,toolkit,calculator_kind,tags)
  LOOP
    SELECT marketplace_product_id INTO v_pid
    FROM public.dright_official_products
    WHERE slug = r.slug;

    IF v_pid IS NULL THEN
      v_pid := gen_random_uuid();

      INSERT INTO public.products(
        id, uploaded_by, name, description, price, commission_rate, image_url, category,
        is_active, approval_status, admin_task_percent, sales_team_task_percent,
        affiliate_commission_percent, total_reviews, average_rating, is_hidden, is_free,
        product_type, has_dright_sales_team, total_sales, view_count, tags, brand, condition,
        specifications, is_featured, reviewed_by, reviewed_at
      ) VALUES (
        v_pid, v_owner, r.name, r.description, r.price, 0, r.banner, r.category,
        true, 'approved', 0, 0, 60, 0, 0, true, false,
        'COURSE', false, 0, 0, r.tags, 'DRIGHT', 'new',
        jsonb_build_object(
          'edition','2026',
          'course_slug',r.slug,
          'course_number',r.course_number,
          'first_party',true,
          'official_store',true,
          'lesson_count',45,
          'module_count',15,
          'project_count',5,
          'phone_friendly',true,
          'has_interactive_calculator',true,
          'calculator_kind',r.calculator_kind,
          'has_free_tool_library',true,
          'has_downloadable_templates',true,
          'price_currency','NGN',
          'source_currency','NGN',
          'review_required',false,
          'course_access_path','/learn/' || r.slug,
          'system_product_kind','dright_course',
          'platform_fee_percent',0
        ),
        true, v_owner, now()
      );

      INSERT INTO public.dright_official_products(
        marketplace_product_id, slug, subtitle, currency, public_visible, is_enabled,
        official_badge_enabled, official_rating_enabled, official_rating,
        benefits, image_urls, metadata, created_by, updated_by
      ) VALUES (
        v_pid, r.slug, r.subtitle, 'NGN', false, true,
        true, false, 5.00,
        jsonb_build_array(
          '15 structured modules and 45 step-by-step lessons',
          '15 practical module deliverables and knowledge checks',
          '5 guided portfolio or business projects plus a capstone',
          'Interactive course-specific calculator',
          'Downloadable toolkit and working tracker',
          'Free and easy practice-tool links with usage notes',
          'Nigeria and Africa-ready examples with global application',
          'Phone-friendly protected learning workspace',
          'Progress and notes synchronized with DRIGHT access',
          'Buyer access duration remains editable by Admin'
        ),
        jsonb_build_array(r.banner, r.toolkit),
        jsonb_build_object(
          'first_party',true,
          'course_number',r.course_number,
          'review_required',false,
          'source_currency','NGN',
          'price_placeholder',false,
          'commission_placeholder',false,
          'course_access_path','/learn/' || r.slug,
          'calculator_kind',r.calculator_kind,
          'project_count',5,
          'free_tools_enabled',true,
          'no_marketplace_platform_fee',true
        ),
        v_owner, v_owner
      );

      INSERT INTO public.digital_product_details(
        product_id, delivery_type, download_limit, expiry_days, access_link, file_format, includes_bonus_materials
      ) VALUES (
        v_pid, 'LINK_ACCESS', NULL, 365, '/learn/' || r.slug, 'Interactive DRIGHT course portal', true
      );

      INSERT INTO public.product_images(product_id,image_url,position)
      VALUES (v_pid,r.banner,0),(v_pid,r.toolkit,1);

      INSERT INTO public.listing_direct_sale_settings(entity_type,entity_id,owner_id,enabled,guest_access_days)
      VALUES('product',v_pid,v_owner,true,10)
      ON CONFLICT(entity_type,entity_id)
      DO UPDATE SET enabled=true, guest_access_days=10, updated_at=now();
    END IF;
  END LOOP;
END $$;

COMMIT;
