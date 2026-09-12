-- DRIGHT global news + announcements publishing system
-- Forward-only production migration. Extends the existing global_announcements
-- and notifications architecture rather than introducing a parallel feed.

ALTER TABLE public.global_announcements
  ADD COLUMN IF NOT EXISTS content_kind text NOT NULL DEFAULT 'announcement',
  ADD COLUMN IF NOT EXISTS show_in_news boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_trending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mention_all boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS cta_label text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.global_announcements
SET content_kind = CASE WHEN type = 'news' THEN 'news' ELSE 'announcement' END
WHERE content_kind = 'announcement' AND type = 'news';

UPDATE public.global_announcements
SET show_in_news = true
WHERE content_kind = 'news';

UPDATE public.global_announcements
SET published_at = COALESCE(published_at, created_at, now())
WHERE published_at IS NULL;

ALTER TABLE public.global_announcements
  ALTER COLUMN published_at SET DEFAULT now(),
  ALTER COLUMN published_at SET NOT NULL;

ALTER TABLE public.global_announcements
  DROP CONSTRAINT IF EXISTS global_announcements_type_check;

ALTER TABLE public.global_announcements
  ADD CONSTRAINT global_announcements_type_check
  CHECK (type = ANY (ARRAY[
    'news'::text,
    'update'::text,
    'market'::text,
    'affiliate'::text,
    'announcement'::text,
    'promo'::text,
    'referral'::text
  ]));

ALTER TABLE public.global_announcements
  DROP CONSTRAINT IF EXISTS global_announcements_content_kind_check;

ALTER TABLE public.global_announcements
  ADD CONSTRAINT global_announcements_content_kind_check
  CHECK (content_kind = ANY (ARRAY['news'::text, 'announcement'::text]));

ALTER TABLE public.global_announcements
  DROP CONSTRAINT IF EXISTS global_announcements_media_type_check;

ALTER TABLE public.global_announcements
  ADD CONSTRAINT global_announcements_media_type_check
  CHECK (media_type IS NULL OR media_type = ANY (ARRAY['image'::text, 'video'::text]));

CREATE INDEX IF NOT EXISTS idx_global_content_feed
  ON public.global_announcements (content_kind, is_active, show_in_news, is_pinned DESC, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_global_content_trending
  ON public.global_announcements (is_active, is_trending DESC, view_count DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS public.global_content_views (
  content_id uuid NOT NULL REFERENCES public.global_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, user_id)
);

ALTER TABLE public.global_content_views ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_global_content(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.is_admin = true
      AND u.admin_status = 'active'
      AND u.admin_role = ANY (ARRAY[
        'super_admin'::text,
        'platform_admin'::text,
        'sales_marketing_admin'::text,
        'marketing_manager'::text,
        'content_cms_admin'::text,
        'content_manager'::text,
        'notification_admin'::text,
        'system_config_admin'::text
      ])
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_global_content(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_global_content(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS admin_write_announcements ON public.global_announcements;
DROP POLICY IF EXISTS authorized_admin_write_global_content ON public.global_announcements;
CREATE POLICY authorized_admin_write_global_content
ON public.global_announcements
FOR ALL
TO authenticated
USING (public.can_manage_global_content(auth.uid()))
WITH CHECK (public.can_manage_global_content(auth.uid()));

DROP POLICY IF EXISTS public_read_active_global_content ON public.global_announcements;
CREATE POLICY public_read_active_global_content
ON public.global_announcements
FOR SELECT
TO anon
USING (is_active = true);

CREATE OR REPLACE FUNCTION public.set_global_content_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.content_kind = 'news' THEN
    NEW.show_in_news := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_global_content_updated_at ON public.global_announcements;
CREATE TRIGGER trg_global_content_updated_at
BEFORE UPDATE ON public.global_announcements
FOR EACH ROW
EXECUTE FUNCTION public.set_global_content_updated_at();

CREATE OR REPLACE FUNCTION public._sync_global_content_notifications(p_content_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content public.global_announcements%ROWTYPE;
  v_action_url text;
  v_notification_title text;
  v_notification_category text;
  v_priority text;
  v_group_key text;
  v_should_notify boolean;
  v_inserted integer := 0;
BEGIN
  SELECT * INTO v_content
  FROM public.global_announcements
  WHERE id = p_content_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_action_url := CASE
    WHEN v_content.content_kind = 'news' OR v_content.show_in_news
      THEN '/news?item=' || v_content.id::text
    ELSE '/announcements?item=' || v_content.id::text
  END;

  v_group_key := 'global-content:' || v_content.id::text;
  v_should_notify := COALESCE(v_content.mention_all, false) OR COALESCE(v_content.is_trending, false);
  v_priority := CASE WHEN v_content.is_pinned OR v_content.is_trending THEN 'high' ELSE 'normal' END;

  v_notification_category := CASE v_content.type
    WHEN 'promo' THEN 'promotions'
    WHEN 'affiliate' THEN 'affiliate'
    WHEN 'referral' THEN 'referrals'
    WHEN 'market' THEN 'marketplace'
    ELSE 'system'
  END;

  v_notification_title := CASE
    WHEN v_content.is_trending THEN 'Trending on DRIGHT: ' || v_content.title
    WHEN v_content.content_kind = 'news' THEN 'New DRIGHT news: ' || v_content.title
    ELSE 'DRIGHT announcement: ' || v_content.title
  END;

  -- Keep any already-delivered notification in sync with edits and links.
  UPDATE public.notifications
  SET title = v_notification_title,
      message = v_content.message,
      notification_type = 'announcement',
      related_id = v_content.id,
      category = v_notification_category,
      priority = v_priority,
      is_archived = NOT v_content.is_active,
      metadata = jsonb_build_object(
        'action_url', v_action_url,
        'content_id', v_content.id,
        'content_kind', v_content.content_kind,
        'category', v_content.type,
        'is_trending', v_content.is_trending,
        'is_pinned', v_content.is_pinned,
        'mention_all', v_content.mention_all
      )
  WHERE group_key = v_group_key;

  IF v_should_notify AND v_content.is_active THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      notification_type,
      related_id,
      is_read,
      category,
      priority,
      is_archived,
      is_deleted,
      metadata,
      group_key,
      actor_id
    )
    SELECT
      u.id,
      v_notification_title,
      v_content.message,
      'announcement',
      v_content.id,
      false,
      v_notification_category,
      v_priority,
      false,
      false,
      jsonb_build_object(
        'action_url', v_action_url,
        'content_id', v_content.id,
        'content_kind', v_content.content_kind,
        'category', v_content.type,
        'is_trending', v_content.is_trending,
        'is_pinned', v_content.is_pinned,
        'mention_all', v_content.mention_all
      ),
      v_group_key,
      v_content.created_by
    FROM public.users u
    WHERE COALESCE(upper(u.account_status), 'ACTIVE') <> 'BANNED'
      AND NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = u.id
          AND n.group_key = v_group_key
      );

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public._sync_global_content_notifications(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sync_global_content_notifications(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_global_content_notifications_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._sync_global_content_notifications(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_global_content_notifications ON public.global_announcements;
CREATE TRIGGER trg_sync_global_content_notifications
AFTER INSERT OR UPDATE OF
  title,
  message,
  type,
  content_kind,
  show_in_news,
  is_active,
  is_pinned,
  is_trending,
  mention_all
ON public.global_announcements
FOR EACH ROW
EXECUTE FUNCTION public.sync_global_content_notifications_trigger();

CREATE OR REPLACE FUNCTION public.cleanup_global_content_notifications_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE group_key = 'global-content:' || OLD.id::text;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_global_content_notifications ON public.global_announcements;
CREATE TRIGGER trg_cleanup_global_content_notifications
AFTER DELETE ON public.global_announcements
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_global_content_notifications_trigger();

CREATE OR REPLACE FUNCTION public.admin_create_global_content(
  p_content_kind text,
  p_title text,
  p_message text,
  p_category text DEFAULT 'news',
  p_show_in_news boolean DEFAULT false,
  p_is_active boolean DEFAULT true,
  p_is_pinned boolean DEFAULT false,
  p_is_trending boolean DEFAULT false,
  p_mention_all boolean DEFAULT false,
  p_media_url text DEFAULT NULL,
  p_media_type text DEFAULT NULL,
  p_external_url text DEFAULT NULL,
  p_cta_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_kind text := lower(trim(COALESCE(p_content_kind, '')));
  v_category text := lower(trim(COALESCE(p_category, '')));
  v_mention_all boolean;
BEGIN
  IF NOT public.can_manage_global_content(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to publish DRIGHT news or announcements';
  END IF;

  IF v_kind NOT IN ('news', 'announcement') THEN
    RAISE EXCEPTION 'Invalid content kind';
  END IF;

  IF v_category NOT IN ('news', 'update', 'market', 'affiliate', 'announcement', 'promo', 'referral') THEN
    RAISE EXCEPTION 'Invalid content category';
  END IF;

  IF length(trim(COALESCE(p_title, ''))) = 0 OR length(trim(COALESCE(p_message, ''))) = 0 THEN
    RAISE EXCEPTION 'Title and message are required';
  END IF;

  IF p_media_type IS NOT NULL AND p_media_type NOT IN ('image', 'video') THEN
    RAISE EXCEPTION 'Invalid media type';
  END IF;

  v_mention_all := COALESCE(p_mention_all, false)
    OR lower(p_message) LIKE '%@all%'
    OR lower(p_message) LIKE '%@everyone%'
    OR lower(p_message) LIKE '%@dright%';

  INSERT INTO public.global_announcements (
    title,
    message,
    type,
    content_kind,
    show_in_news,
    is_active,
    is_pinned,
    is_trending,
    mention_all,
    media_url,
    media_type,
    external_url,
    cta_label,
    created_by,
    published_at,
    updated_at
  ) VALUES (
    trim(p_title),
    trim(p_message),
    v_category,
    v_kind,
    CASE WHEN v_kind = 'news' THEN true ELSE COALESCE(p_show_in_news, false) END,
    COALESCE(p_is_active, true),
    COALESCE(p_is_pinned, false),
    COALESCE(p_is_trending, false),
    v_mention_all,
    NULLIF(trim(COALESCE(p_media_url, '')), ''),
    CASE WHEN NULLIF(trim(COALESCE(p_media_url, '')), '') IS NULL THEN NULL ELSE p_media_type END,
    NULLIF(trim(COALESCE(p_external_url, '')), ''),
    NULLIF(trim(COALESCE(p_cta_label, '')), ''),
    auth.uid(),
    now(),
    now()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    auth.uid(),
    CASE WHEN v_kind = 'news' THEN 'news_created' ELSE 'announcement_created' END,
    v_id,
    'global_content',
    jsonb_build_object('category', v_category, 'show_in_news', CASE WHEN v_kind = 'news' THEN true ELSE p_show_in_news END, 'is_pinned', p_is_pinned, 'is_trending', p_is_trending, 'mention_all', v_mention_all)
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_global_content(
  p_id uuid,
  p_content_kind text,
  p_title text,
  p_message text,
  p_category text,
  p_show_in_news boolean,
  p_is_active boolean,
  p_is_pinned boolean,
  p_is_trending boolean,
  p_mention_all boolean,
  p_media_url text DEFAULT NULL,
  p_media_type text DEFAULT NULL,
  p_external_url text DEFAULT NULL,
  p_cta_label text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := lower(trim(COALESCE(p_content_kind, '')));
  v_category text := lower(trim(COALESCE(p_category, '')));
  v_mention_all boolean;
BEGIN
  IF NOT public.can_manage_global_content(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to edit DRIGHT news or announcements';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.global_announcements WHERE id = p_id FOR UPDATE) THEN
    RAISE EXCEPTION 'Content not found';
  END IF;

  IF v_kind NOT IN ('news', 'announcement') THEN
    RAISE EXCEPTION 'Invalid content kind';
  END IF;

  IF v_category NOT IN ('news', 'update', 'market', 'affiliate', 'announcement', 'promo', 'referral') THEN
    RAISE EXCEPTION 'Invalid content category';
  END IF;

  IF length(trim(COALESCE(p_title, ''))) = 0 OR length(trim(COALESCE(p_message, ''))) = 0 THEN
    RAISE EXCEPTION 'Title and message are required';
  END IF;

  IF p_media_type IS NOT NULL AND p_media_type NOT IN ('image', 'video') THEN
    RAISE EXCEPTION 'Invalid media type';
  END IF;

  v_mention_all := COALESCE(p_mention_all, false)
    OR lower(p_message) LIKE '%@all%'
    OR lower(p_message) LIKE '%@everyone%'
    OR lower(p_message) LIKE '%@dright%';

  UPDATE public.global_announcements
  SET title = trim(p_title),
      message = trim(p_message),
      type = v_category,
      content_kind = v_kind,
      show_in_news = CASE WHEN v_kind = 'news' THEN true ELSE COALESCE(p_show_in_news, false) END,
      is_active = COALESCE(p_is_active, true),
      is_pinned = COALESCE(p_is_pinned, false),
      is_trending = COALESCE(p_is_trending, false),
      mention_all = v_mention_all,
      media_url = NULLIF(trim(COALESCE(p_media_url, '')), ''),
      media_type = CASE WHEN NULLIF(trim(COALESCE(p_media_url, '')), '') IS NULL THEN NULL ELSE p_media_type END,
      external_url = NULLIF(trim(COALESCE(p_external_url, '')), ''),
      cta_label = NULLIF(trim(COALESCE(p_cta_label, '')), ''),
      updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    auth.uid(),
    CASE WHEN v_kind = 'news' THEN 'news_updated' ELSE 'announcement_updated' END,
    p_id,
    'global_content',
    jsonb_build_object('category', v_category, 'show_in_news', CASE WHEN v_kind = 'news' THEN true ELSE p_show_in_news END, 'is_active', p_is_active, 'is_pinned', p_is_pinned, 'is_trending', p_is_trending, 'mention_all', v_mention_all)
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_global_content(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
BEGIN
  IF NOT public.can_manage_global_content(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to delete DRIGHT news or announcements';
  END IF;

  SELECT content_kind INTO v_kind
  FROM public.global_announcements
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.global_announcements WHERE id = p_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    auth.uid(),
    CASE WHEN v_kind = 'news' THEN 'news_deleted' ELSE 'announcement_deleted' END,
    p_id,
    'global_content',
    jsonb_build_object('content_kind', v_kind)
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_global_content_view(p_content_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inserted integer := 0;
  v_count bigint := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.global_announcements
    WHERE id = p_content_id
      AND is_active = true
      AND (content_kind = 'news' OR show_in_news = true)
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.global_content_views (content_id, user_id)
  VALUES (p_content_id, v_user_id)
  ON CONFLICT (content_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    UPDATE public.global_announcements
    SET view_count = view_count + 1
    WHERE id = p_content_id
    RETURNING view_count INTO v_count;
  ELSE
    SELECT view_count INTO v_count
    FROM public.global_announcements
    WHERE id = p_content_id;
  END IF;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_global_content(text,text,text,text,boolean,boolean,boolean,boolean,boolean,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_global_content(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_global_content(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_global_content_view(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_global_content(text,text,text,text,boolean,boolean,boolean,boolean,boolean,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_global_content(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_global_content(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_global_content_view(uuid) TO authenticated, service_role;
