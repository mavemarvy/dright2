-- Assisted affiliate/seller checkout, 10-day guest access, entitlement claiming,
-- and cross-device course progress for DRIGHT listings.

CREATE TABLE IF NOT EXISTS public.listing_direct_sale_settings (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  guest_access_days integer NOT NULL DEFAULT 10 CHECK (guest_access_days BETWEEN 1 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id)
);

ALTER TABLE public.listing_direct_sale_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS listing_direct_sale_settings_admin_read ON public.listing_direct_sale_settings;
CREATE POLICY listing_direct_sale_settings_admin_read ON public.listing_direct_sale_settings
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND coalesce(u.is_admin,false) = true
  )
);

CREATE OR REPLACE FUNCTION public.get_listing_direct_sale_setting(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS TABLE(enabled boolean, guest_access_days integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT
    coalesce(s.enabled,false) AS enabled,
    coalesce(s.guest_access_days,10) AS guest_access_days
  FROM (SELECT 1) seed
  LEFT JOIN public.listing_direct_sale_settings s
    ON s.entity_type = lower(btrim(p_entity_type))
   AND s.entity_id = p_entity_id
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_listing_direct_sale_setting(text,uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_listing_direct_sale_setting(
  p_entity_type text,
  p_entity_id uuid,
  p_enabled boolean,
  p_guest_access_days integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_type text := lower(btrim(coalesce(p_entity_type,'')));
  v_owner uuid;
  v_is_admin boolean := false;
  v_days integer := greatest(1, least(30, coalesce(p_guest_access_days,10)));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT coalesce(is_admin,false) INTO v_is_admin
  FROM public.users WHERE id = auth.uid();

  IF v_type = 'product' THEN
    SELECT uploaded_by INTO v_owner FROM public.products WHERE id = p_entity_id;
  ELSIF v_type = 'job' THEN
    SELECT employer_id INTO v_owner FROM public.jobs WHERE id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'Unsupported listing type';
  END IF;

  IF v_owner IS NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF v_owner <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only the listing owner or an admin may change direct-sale settings';
  END IF;

  INSERT INTO public.listing_direct_sale_settings(entity_type,entity_id,owner_id,enabled,guest_access_days,updated_at)
  VALUES(v_type,p_entity_id,v_owner,coalesce(p_enabled,false),v_days,now())
  ON CONFLICT(entity_type,entity_id) DO UPDATE
  SET owner_id=excluded.owner_id,
      enabled=excluded.enabled,
      guest_access_days=excluded.guest_access_days,
      updated_at=now();

  RETURN jsonb_build_object(
    'success',true,'entity_type',v_type,'entity_id',p_entity_id,
    'enabled',coalesce(p_enabled,false),'guest_access_days',v_days
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_listing_direct_sale_setting(text,uuid,boolean,integer) TO authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_order_id uuid REFERENCES public.guest_orders(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_guest_order_unique
  ON public.orders(guest_order_id) WHERE guest_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.guest_access_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_order_id uuid NOT NULL UNIQUE REFERENCES public.guest_orders(id) ON DELETE CASCADE,
  listing_type text NOT NULL DEFAULT 'product',
  listing_id uuid NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text NOT NULL,
  access_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  claimed_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guest_access_entitlements_email_idx
  ON public.guest_access_entitlements(lower(recipient_email), expires_at DESC);
CREATE INDEX IF NOT EXISTS guest_access_entitlements_token_idx
  ON public.guest_access_entitlements(access_token);

ALTER TABLE public.guest_access_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS guest_access_owner_read ON public.guest_access_entitlements;
CREATE POLICY guest_access_owner_read ON public.guest_access_entitlements
FOR SELECT TO authenticated
USING (
  claimed_user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.guest_orders g
    WHERE g.id = guest_order_id AND g.seller_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND coalesce(u.is_admin,false)=true
  )
);

CREATE TABLE IF NOT EXISTS public.course_learning_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_slug text NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  guest_entitlement_id uuid REFERENCES public.guest_access_entitlements(id) ON DELETE CASCADE,
  completed jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  active_module integer NOT NULL DEFAULT 0,
  active_lesson integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) <> (guest_entitlement_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS course_learning_progress_user_unique
  ON public.course_learning_progress(user_id,course_slug) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS course_learning_progress_guest_unique
  ON public.course_learning_progress(guest_entitlement_id,course_slug) WHERE guest_entitlement_id IS NOT NULL;

ALTER TABLE public.course_learning_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS course_progress_user_read ON public.course_learning_progress;
CREATE POLICY course_progress_user_read ON public.course_learning_progress
FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS course_progress_user_write ON public.course_learning_progress;
CREATE POLICY course_progress_user_write ON public.course_learning_progress
FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());

-- Guest transactional email rows do not belong to an authenticated DRIGHT user yet.
ALTER TABLE public.notification_email_outbox ALTER COLUMN user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_guest_access_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_days integer := 10;
  v_token uuid;
  v_product public.products%ROWTYPE;
  v_action text;
BEGIN
  IF NEW.payment_status <> 'success'
     OR NEW.processed_at IS NULL
     OR (OLD.payment_status = 'success' AND OLD.processed_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id=NEW.product_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT coalesce(s.guest_access_days,10) INTO v_days
  FROM public.listing_direct_sale_settings s
  WHERE s.entity_type='product' AND s.entity_id=NEW.product_id;
  v_days := greatest(1,least(30,coalesce(v_days,10)));

  INSERT INTO public.guest_access_entitlements(
    guest_order_id,listing_type,listing_id,recipient_email,recipient_name,
    starts_at,expires_at,metadata
  ) VALUES(
    NEW.id,'product',NEW.product_id,lower(NEW.buyer_email),NEW.buyer_name,
    coalesce(NEW.paid_at,now()),
    coalesce(NEW.paid_at,now()) + make_interval(days=>v_days),
    jsonb_build_object(
      'product_name',coalesce(NEW.product_name,v_product.name),
      'product_type',v_product.product_type,
      'assisted_mode',coalesce((NEW.metadata->>'assisted_mode')::boolean,false),
      'source_type',NEW.source_type,
      'guest_access_days',v_days
    )
  )
  ON CONFLICT(guest_order_id) DO UPDATE
  SET recipient_email=excluded.recipient_email,
      recipient_name=excluded.recipient_name,
      expires_at=excluded.expires_at,
      metadata=public.guest_access_entitlements.metadata || excluded.metadata,
      updated_at=now()
  RETURNING access_token INTO v_token;

  IF v_token IS NULL THEN
    SELECT access_token INTO v_token
    FROM public.guest_access_entitlements WHERE guest_order_id=NEW.id;
  END IF;

  v_action := '/guest-access/' || v_token::text;

  IF NOT EXISTS (
    SELECT 1 FROM public.notification_email_outbox e
    WHERE e.notification_type='guest_purchase_access'
      AND e.metadata->>'guest_order_id'=NEW.id::text
      AND e.status IN ('pending','retry','sending','sent')
  ) THEN
    INSERT INTO public.notification_email_outbox(
      notification_id,user_id,recipient_email,notification_type,category,priority,
      subject,message,metadata,status,next_attempt_at
    ) VALUES(
      NULL,NULL,lower(NEW.buyer_email),'guest_purchase_access','orders','high',
      'Your DRIGHT purchase is ready',
      format(
        'Your purchase of %s was successful. Open your secure guest-access link to use the product now. Guest mode lasts %s days. Create or sign in to a DRIGHT buyer account with this same email before it expires to move the purchase into Orders and keep your progress.',
        coalesce(NEW.product_name,v_product.name),v_days
      ),
      jsonb_build_object(
        'action_url',v_action,
        'guest_order_id',NEW.id,
        'product_id',NEW.product_id,
        'product_name',coalesce(NEW.product_name,v_product.name),
        'guest_access_days',v_days,
        'transactional_guest_purchase',true
      ),
      'pending',now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_guest_access_after_payment ON public.guest_orders;
CREATE TRIGGER trg_create_guest_access_after_payment
AFTER UPDATE OF payment_status,processed_at ON public.guest_orders
FOR EACH ROW EXECUTE FUNCTION public.create_guest_access_after_payment();

CREATE OR REPLACE FUNCTION public.get_guest_access(p_token uuid)
RETURNS TABLE(
  entitlement_id uuid,
  guest_order_id uuid,
  product_id uuid,
  product_name text,
  product_type text,
  image_url text,
  course_slug text,
  course_access_path text,
  recipient_email text,
  recipient_name text,
  starts_at timestamptz,
  expires_at timestamptz,
  days_remaining integer,
  active boolean,
  claimed boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
  SELECT
    e.id,e.guest_order_id,p.id,p.name,p.product_type,p.image_url,
    nullif(p.specifications->>'course_slug',''),
    nullif(p.specifications->>'course_access_path',''),
    e.recipient_email,e.recipient_name,e.starts_at,e.expires_at,
    greatest(0,ceil(extract(epoch from (e.expires_at-now()))/86400.0)::integer),
    (
      g.payment_status='success'
      AND g.processed_at IS NOT NULL
      AND e.revoked_at IS NULL
      AND e.claimed_user_id IS NULL
      AND now() < e.expires_at
    ) AS active,
    e.claimed_user_id IS NOT NULL AS claimed
  FROM public.guest_access_entitlements e
  JOIN public.guest_orders g ON g.id=e.guest_order_id
  JOIN public.products p ON p.id=e.listing_id
  WHERE e.access_token=p_token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_guest_access(uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_course_learning_progress(
  p_course_slug text,
  p_guest_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_entitlement uuid;
  v_row public.course_learning_progress%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT * INTO v_row FROM public.course_learning_progress
    WHERE user_id=auth.uid() AND course_slug=p_course_slug;
  ELSE
    IF p_guest_token IS NULL THEN
      RETURN jsonb_build_object('success',false,'error','Guest access token required');
    END IF;
    SELECT e.id INTO v_entitlement
    FROM public.guest_access_entitlements e
    JOIN public.guest_orders g ON g.id=e.guest_order_id
    JOIN public.products p ON p.id=e.listing_id
    WHERE e.access_token=p_guest_token
      AND e.revoked_at IS NULL
      AND e.claimed_user_id IS NULL
      AND now()<e.expires_at
      AND g.payment_status='success'
      AND g.processed_at IS NOT NULL
      AND p.specifications->>'course_slug'=p_course_slug;
    IF v_entitlement IS NULL THEN
      RETURN jsonb_build_object('success',false,'error','Guest access is invalid or expired');
    END IF;
    SELECT * INTO v_row FROM public.course_learning_progress
    WHERE guest_entitlement_id=v_entitlement AND course_slug=p_course_slug;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object(
      'success',true,'completed','{}'::jsonb,'notes','{}'::jsonb,
      'active_module',0,'active_lesson',0
    );
  END IF;

  RETURN jsonb_build_object(
    'success',true,'completed',v_row.completed,'notes',v_row.notes,
    'active_module',v_row.active_module,'active_lesson',v_row.active_lesson,
    'updated_at',v_row.updated_at
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_course_learning_progress(text,uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_course_learning_progress(
  p_course_slug text,
  p_completed jsonb,
  p_notes jsonb,
  p_active_module integer,
  p_active_lesson integer,
  p_guest_token uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_entitlement uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.course_learning_progress(
      course_slug,user_id,completed,notes,active_module,active_lesson,updated_at
    ) VALUES(
      p_course_slug,auth.uid(),coalesce(p_completed,'{}'::jsonb),coalesce(p_notes,'{}'::jsonb),
      greatest(0,coalesce(p_active_module,0)),greatest(0,coalesce(p_active_lesson,0)),now()
    )
    ON CONFLICT(user_id,course_slug) WHERE user_id IS NOT NULL DO UPDATE
    SET completed=excluded.completed,notes=excluded.notes,
        active_module=excluded.active_module,active_lesson=excluded.active_lesson,updated_at=now();
  ELSE
    IF p_guest_token IS NULL THEN RAISE EXCEPTION 'Guest access token required'; END IF;
    SELECT e.id INTO v_entitlement
    FROM public.guest_access_entitlements e
    JOIN public.guest_orders g ON g.id=e.guest_order_id
    JOIN public.products p ON p.id=e.listing_id
    WHERE e.access_token=p_guest_token
      AND e.revoked_at IS NULL
      AND e.claimed_user_id IS NULL
      AND now()<e.expires_at
      AND g.payment_status='success'
      AND p.specifications->>'course_slug'=p_course_slug;
    IF v_entitlement IS NULL THEN RAISE EXCEPTION 'Guest access is invalid or expired'; END IF;

    INSERT INTO public.course_learning_progress(
      course_slug,guest_entitlement_id,completed,notes,active_module,active_lesson,updated_at
    ) VALUES(
      p_course_slug,v_entitlement,coalesce(p_completed,'{}'::jsonb),coalesce(p_notes,'{}'::jsonb),
      greatest(0,coalesce(p_active_module,0)),greatest(0,coalesce(p_active_lesson,0)),now()
    )
    ON CONFLICT(guest_entitlement_id,course_slug) WHERE guest_entitlement_id IS NOT NULL DO UPDATE
    SET completed=excluded.completed,notes=excluded.notes,
        active_module=excluded.active_module,active_lesson=excluded.active_lesson,updated_at=now();
  END IF;

  RETURN jsonb_build_object('success',true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_course_learning_progress(text,jsonb,jsonb,integer,integer,uuid) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.claim_guest_entitlements_for_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_email text;
  v_count integer := 0;
  r record;
  p public.products%ROWTYPE;
  v_source_currency text;
  v_source_base numeric;
  v_source_final numeric;
  v_rate numeric;
  v_existing_progress public.course_learning_progress%ROWTYPE;
  v_guest_progress public.course_learning_progress%ROWTYPE;
BEGIN
  SELECT lower(email) INTO v_email FROM public.users WHERE id=p_user_id;
  IF v_email IS NULL THEN RETURN jsonb_build_object('success',false,'error','User email not found'); END IF;

  FOR r IN
    SELECT
      e.id AS entitlement_id,
      e.guest_order_id,
      e.listing_id,
      e.recipient_email,
      e.recipient_name,
      e.access_token,
      e.expires_at,
      e.metadata AS entitlement_metadata,
      g.product_id,
      g.seller_id,
      g.currency,
      g.base_price,
      g.platform_fee_amount,
      g.affiliate_commission_amount,
      g.total_amount,
      g.referrer_id,
      g.referral_link_id,
      g.tracking_code,
      g.source_type,
      g.source_level,
      g.paid_at,
      g.created_at AS guest_created_at,
      g.processed_at,
      g.metadata AS guest_metadata
    FROM public.guest_access_entitlements e
    JOIN public.guest_orders g ON g.id=e.guest_order_id
    WHERE lower(e.recipient_email)=v_email
      AND g.payment_status='success'
      AND g.processed_at IS NOT NULL
      AND e.claimed_user_id IS NULL
    ORDER BY e.created_at
    FOR UPDATE OF e
  LOOP
    SELECT * INTO p FROM public.products WHERE id=r.listing_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_source_currency := upper(coalesce(r.guest_metadata->>'source_currency',p.specifications->>'price_currency',p.specifications->>'source_currency',r.currency,'USD'));
    v_source_base := coalesce(nullif(r.guest_metadata->>'source_base_price','')::numeric,r.base_price);
    v_source_final := coalesce(nullif(r.guest_metadata->>'source_total_amount','')::numeric,r.total_amount);
    v_rate := coalesce(nullif(r.guest_metadata->>'source_to_usd_rate','')::numeric,1);

    INSERT INTO public.orders(
      buyer_id,product_id,seller_id,order_type,status,
      base_price,tier_price,customization_price,admin_task_amount,sales_team_task_amount,
      affiliate_commission_amount,final_price,download_token,referrer_id,
      referral_link_id,tracking_code,source_type,source_level,is_free_order,
      created_at,completed_at,source_currency,source_base_price,source_final_price,
      source_to_usd_rate,guest_order_id,buyer_requirements
    ) VALUES(
      p_user_id,r.product_id,coalesce(r.seller_id,p.uploaded_by),coalesce(p.product_type,'DIGITAL'),'COMPLETED',
      r.base_price,0,0,r.platform_fee_amount,0,
      r.affiliate_commission_amount,r.total_amount,
      CASE WHEN upper(coalesce(p.product_type,'')) IN ('DIGITAL','COURSE') THEN gen_random_uuid()::text ELSE NULL END,
      r.referrer_id,r.referral_link_id,r.tracking_code,r.source_type,r.source_level,
      coalesce(r.total_amount,0)=0,
      coalesce(r.paid_at,r.guest_created_at,now()),coalesce(r.paid_at,r.processed_at,now()),
      v_source_currency,v_source_base,v_source_final,v_rate,r.guest_order_id,
      nullif(r.guest_metadata->>'buyer_requirements','')
    )
    ON CONFLICT(guest_order_id) WHERE guest_order_id IS NOT NULL DO NOTHING;

    UPDATE public.guest_orders SET user_id=p_user_id WHERE id=r.guest_order_id;

    -- Move any course progress from guest mode into the buyer account.
    IF p.specifications->>'course_slug' IS NOT NULL THEN
      SELECT * INTO v_guest_progress FROM public.course_learning_progress
      WHERE guest_entitlement_id=r.entitlement_id AND course_slug=p.specifications->>'course_slug';

      IF v_guest_progress.id IS NOT NULL THEN
        SELECT * INTO v_existing_progress FROM public.course_learning_progress
        WHERE user_id=p_user_id AND course_slug=p.specifications->>'course_slug';

        IF v_existing_progress.id IS NULL THEN
          INSERT INTO public.course_learning_progress(
            course_slug,user_id,completed,notes,active_module,active_lesson,updated_at
          ) VALUES(
            v_guest_progress.course_slug,p_user_id,v_guest_progress.completed,v_guest_progress.notes,
            v_guest_progress.active_module,v_guest_progress.active_lesson,now()
          );
        ELSE
          UPDATE public.course_learning_progress
          SET completed=coalesce(v_existing_progress.completed,'{}'::jsonb) || coalesce(v_guest_progress.completed,'{}'::jsonb),
              notes=coalesce(v_existing_progress.notes,'{}'::jsonb) || coalesce(v_guest_progress.notes,'{}'::jsonb),
              active_module=v_guest_progress.active_module,
              active_lesson=v_guest_progress.active_lesson,
              updated_at=now()
          WHERE id=v_existing_progress.id;
        END IF;

        DELETE FROM public.course_learning_progress WHERE id=v_guest_progress.id;
      END IF;
    END IF;

    UPDATE public.guest_access_entitlements
    SET claimed_user_id=p_user_id,claimed_at=now(),revoked_at=now(),updated_at=now()
    WHERE id=r.entitlement_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success',true,'claimed',v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_guest_entitlements_for_user(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.claim_my_guest_purchases()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN public.claim_guest_entitlements_for_user(auth.uid());
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_my_guest_purchases() TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_claim_guest_purchases_on_user_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  BEGIN
    PERFORM public.claim_guest_entitlements_for_user(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Guest purchase claim skipped for %: %',NEW.id,SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_guest_purchases_on_user_insert ON public.users;
CREATE TRIGGER trg_claim_guest_purchases_on_user_insert
AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.trg_claim_guest_purchases_on_user_insert();

-- Existing DRIGHT official courses opt in immediately to assisted affiliate/seller checkout.
INSERT INTO public.listing_direct_sale_settings(entity_type,entity_id,owner_id,enabled,guest_access_days)
SELECT 'product',p.id,p.uploaded_by,true,10
FROM public.products p
JOIN public.dright_official_products o ON o.marketplace_product_id=p.id
WHERE o.slug IN (
  'facebook-instagram-ads-mastery-2026',
  'instagram-ads-mastery-2026',
  'whatsapp-marketing-sales-mastery-2026',
  'tiktok-ads-organic-sales-mastery-2026',
  'weight-loss-fitness-business-affiliate-mastery-2026'
)
ON CONFLICT(entity_type,entity_id) DO UPDATE
SET enabled=true,guest_access_days=10,updated_at=now();

-- Correct the five course listings that were accidentally published to the database as FREE.
-- The marketplace moderation guard recognizes service_role as the authoritative writer.
SELECT set_config('request.jwt.claim.role','service_role',true);
UPDATE public.products p
SET price=5000,
    is_free=false,
    admin_task_percent=0,
    sales_team_task_percent=0,
    specifications=coalesce(p.specifications,'{}'::jsonb)
      || jsonb_build_object('price_currency','NGN','source_currency','NGN','platform_fee_percent',0),
    updated_at=now()
FROM public.dright_official_products o
WHERE o.marketplace_product_id=p.id
  AND o.slug IN (
    'facebook-instagram-ads-mastery-2026',
    'instagram-ads-mastery-2026',
    'whatsapp-marketing-sales-mastery-2026',
    'tiktok-ads-organic-sales-mastery-2026',
    'weight-loss-fitness-business-affiliate-mastery-2026'
  );
