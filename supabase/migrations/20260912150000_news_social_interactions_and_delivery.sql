-- DRIGHT News social interactions, moderation and explicit delivery controls
-- Forward-only production migration.

ALTER TABLE public.global_announcements
  ADD COLUMN IF NOT EXISTS show_in_notifications boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comments_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allowed_reactions text[] NOT NULL DEFAULT ARRAY['like','love','care','haha','wow','sad','angry']::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'global_announcements_allowed_reactions_check'
      AND conrelid = 'public.global_announcements'::regclass
  ) THEN
    ALTER TABLE public.global_announcements
      ADD CONSTRAINT global_announcements_allowed_reactions_check
      CHECK (allowed_reactions <@ ARRAY['like','love','care','haha','wow','sad','angry']::text[]);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.global_content_reactions (
  content_id uuid NOT NULL REFERENCES public.global_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('like','love','care','haha','wow','sad','angry')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.global_content_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.global_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  moderated_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  moderated_at timestamptz NULL,
  moderation_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.global_content_saves (
  content_id uuid NOT NULL REFERENCES public.global_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.global_content_banner_dismissals (
  content_id uuid NOT NULL REFERENCES public.global_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_global_content_reactions_content
  ON public.global_content_reactions(content_id);
CREATE INDEX IF NOT EXISTS idx_global_content_comments_content_created
  ON public.global_content_comments(content_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_content_comments_status
  ON public.global_content_comments(content_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_content_saves_content
  ON public.global_content_saves(content_id);
CREATE INDEX IF NOT EXISTS idx_global_content_banner_dismissals_user
  ON public.global_content_banner_dismissals(user_id, dismissed_at DESC);

ALTER TABLE public.global_content_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_content_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_content_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_content_banner_dismissals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.global_content_reactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.global_content_comments FROM anon, authenticated;
REVOKE ALL ON TABLE public.global_content_saves FROM anon, authenticated;
REVOKE ALL ON TABLE public.global_content_banner_dismissals FROM anon, authenticated;
GRANT ALL ON TABLE public.global_content_reactions TO service_role;
GRANT ALL ON TABLE public.global_content_comments TO service_role;
GRANT ALL ON TABLE public.global_content_saves TO service_role;
GRANT ALL ON TABLE public.global_content_banner_dismissals TO service_role;

CREATE OR REPLACE FUNCTION public.set_global_content_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();

  IF TG_OP = 'INSERT' THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
    IF auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
  END IF;

  -- A global mention must always resolve to a readable News post so banners
  -- can deep-link to the exact content.
  IF NEW.content_kind = 'news' OR COALESCE(NEW.mention_all, false) THEN
    NEW.show_in_news := true;
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.global_announcements
SET show_in_news = true
WHERE mention_all = true
  AND show_in_news = false;

CREATE OR REPLACE FUNCTION public._sync_global_content_notifications(p_content_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_should_notify := COALESCE(v_content.show_in_notifications, false);
  v_priority := CASE
    WHEN v_content.is_pinned OR v_content.is_trending OR v_content.mention_all THEN 'high'
    ELSE 'normal'
  END;

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

  UPDATE public.notifications
  SET title = v_notification_title,
      message = v_content.message,
      notification_type = 'announcement',
      related_id = v_content.id,
      category = v_notification_category,
      priority = v_priority,
      is_archived = NOT (v_content.is_active AND v_should_notify),
      metadata = jsonb_build_object(
        'action_url', v_action_url,
        'content_id', v_content.id,
        'content_kind', v_content.content_kind,
        'category', v_content.type,
        'is_trending', v_content.is_trending,
        'is_pinned', v_content.is_pinned,
        'mention_all', v_content.mention_all,
        'show_in_notifications', v_content.show_in_notifications
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
        'mention_all', v_content.mention_all,
        'show_in_notifications', v_content.show_in_notifications
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

CREATE OR REPLACE FUNCTION public.sync_global_content_notifications_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._sync_global_content_notifications(NEW.id);
  ELSIF
    OLD.title IS DISTINCT FROM NEW.title OR
    OLD.message IS DISTINCT FROM NEW.message OR
    OLD.type IS DISTINCT FROM NEW.type OR
    OLD.content_kind IS DISTINCT FROM NEW.content_kind OR
    OLD.show_in_news IS DISTINCT FROM NEW.show_in_news OR
    OLD.show_in_notifications IS DISTINCT FROM NEW.show_in_notifications OR
    OLD.is_active IS DISTINCT FROM NEW.is_active OR
    OLD.is_pinned IS DISTINCT FROM NEW.is_pinned OR
    OLD.is_trending IS DISTINCT FROM NEW.is_trending OR
    OLD.mention_all IS DISTINCT FROM NEW.mention_all OR
    OLD.created_by IS DISTINCT FROM NEW.created_by
  THEN
    PERFORM public._sync_global_content_notifications(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Existing global-content notifications were created under the old automatic
-- mention/trending rule. Archive them until an admin explicitly enables the
-- new Notifications destination on that post.
UPDATE public.notifications
SET is_archived = true
WHERE group_key LIKE 'global-content:%';

CREATE OR REPLACE FUNCTION public.admin_create_global_content_v2(
  p_content_kind text,
  p_title text,
  p_message text,
  p_category text,
  p_show_in_news boolean,
  p_show_in_notifications boolean,
  p_is_active boolean,
  p_is_pinned boolean,
  p_is_trending boolean,
  p_mention_all boolean,
  p_comments_enabled boolean,
  p_allowed_reactions text[],
  p_media_url text,
  p_media_type text,
  p_external_url text,
  p_cta_label text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_kind text := lower(trim(COALESCE(p_content_kind, '')));
  v_category text := lower(trim(COALESCE(p_category, '')));
  v_mention_all boolean;
  v_allowed text[] := COALESCE(p_allowed_reactions, ARRAY[]::text[]);
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

  IF EXISTS (
    SELECT 1 FROM unnest(v_allowed) AS r
    WHERE r NOT IN ('like','love','care','haha','wow','sad','angry')
  ) THEN
    RAISE EXCEPTION 'Invalid reaction option';
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
    show_in_notifications,
    is_active,
    is_pinned,
    is_trending,
    mention_all,
    comments_enabled,
    allowed_reactions,
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
    CASE WHEN v_kind = 'news' OR v_mention_all THEN true ELSE COALESCE(p_show_in_news, false) END,
    COALESCE(p_show_in_notifications, false),
    COALESCE(p_is_active, true),
    COALESCE(p_is_pinned, false),
    COALESCE(p_is_trending, false),
    v_mention_all,
    COALESCE(p_comments_enabled, true),
    v_allowed,
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
    jsonb_build_object(
      'category', v_category,
      'show_in_news', CASE WHEN v_kind = 'news' OR v_mention_all THEN true ELSE p_show_in_news END,
      'show_in_notifications', p_show_in_notifications,
      'is_pinned', p_is_pinned,
      'is_trending', p_is_trending,
      'mention_all', v_mention_all,
      'comments_enabled', p_comments_enabled,
      'allowed_reactions', v_allowed
    )
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_global_content_v2(
  p_id uuid,
  p_content_kind text,
  p_title text,
  p_message text,
  p_category text,
  p_show_in_news boolean,
  p_show_in_notifications boolean,
  p_is_active boolean,
  p_is_pinned boolean,
  p_is_trending boolean,
  p_mention_all boolean,
  p_comments_enabled boolean,
  p_allowed_reactions text[],
  p_media_url text,
  p_media_type text,
  p_external_url text,
  p_cta_label text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kind text := lower(trim(COALESCE(p_content_kind, '')));
  v_category text := lower(trim(COALESCE(p_category, '')));
  v_mention_all boolean;
  v_allowed text[] := COALESCE(p_allowed_reactions, ARRAY[]::text[]);
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

  IF EXISTS (
    SELECT 1 FROM unnest(v_allowed) AS r
    WHERE r NOT IN ('like','love','care','haha','wow','sad','angry')
  ) THEN
    RAISE EXCEPTION 'Invalid reaction option';
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
      show_in_news = CASE WHEN v_kind = 'news' OR v_mention_all THEN true ELSE COALESCE(p_show_in_news, false) END,
      show_in_notifications = COALESCE(p_show_in_notifications, false),
      is_active = COALESCE(p_is_active, true),
      is_pinned = COALESCE(p_is_pinned, false),
      is_trending = COALESCE(p_is_trending, false),
      mention_all = v_mention_all,
      comments_enabled = COALESCE(p_comments_enabled, true),
      allowed_reactions = v_allowed,
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
    jsonb_build_object(
      'category', v_category,
      'show_in_news', CASE WHEN v_kind = 'news' OR v_mention_all THEN true ELSE p_show_in_news END,
      'show_in_notifications', p_show_in_notifications,
      'is_active', p_is_active,
      'is_pinned', p_is_pinned,
      'is_trending', p_is_trending,
      'mention_all', v_mention_all,
      'comments_enabled', p_comments_enabled,
      'allowed_reactions', v_allowed
    )
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_content_engagement(p_content_ids uuid[])
RETURNS TABLE (
  content_id uuid,
  reaction_count bigint,
  comment_count bigint,
  save_count bigint,
  reaction_breakdown jsonb,
  current_reaction text,
  is_saved boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    (SELECT count(*) FROM public.global_content_reactions r WHERE r.content_id = c.id) AS reaction_count,
    (SELECT count(*) FROM public.global_content_comments cm WHERE cm.content_id = c.id AND cm.status = 'visible') AS comment_count,
    (SELECT count(*) FROM public.global_content_saves s WHERE s.content_id = c.id) AS save_count,
    COALESCE((
      SELECT jsonb_object_agg(x.reaction, x.cnt)
      FROM (
        SELECT r.reaction, count(*)::bigint AS cnt
        FROM public.global_content_reactions r
        WHERE r.content_id = c.id
        GROUP BY r.reaction
      ) x
    ), '{}'::jsonb) AS reaction_breakdown,
    (SELECT r.reaction FROM public.global_content_reactions r WHERE r.content_id = c.id AND r.user_id = auth.uid()) AS current_reaction,
    EXISTS (SELECT 1 FROM public.global_content_saves s WHERE s.content_id = c.id AND s.user_id = auth.uid()) AS is_saved
  FROM public.global_announcements c
  WHERE c.id = ANY(COALESCE(p_content_ids, ARRAY[]::uuid[]))
    AND c.is_active = true
    AND (c.content_kind = 'news' OR c.show_in_news = true);
$$;

CREATE OR REPLACE FUNCTION public.set_global_content_reaction(p_content_id uuid, p_reaction text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_reaction text := lower(trim(COALESCE(p_reaction, '')));
  v_allowed text[];
  v_existing text;
  v_count bigint;
  v_breakdown jsonb;
  v_current text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT allowed_reactions INTO v_allowed
  FROM public.global_announcements
  WHERE id = p_content_id
    AND is_active = true
    AND (content_kind = 'news' OR show_in_news = true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF NOT (v_reaction = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'This reaction is not enabled for the post';
  END IF;

  SELECT reaction INTO v_existing
  FROM public.global_content_reactions
  WHERE content_id = p_content_id AND user_id = v_user_id;

  IF v_existing = v_reaction THEN
    DELETE FROM public.global_content_reactions
    WHERE content_id = p_content_id AND user_id = v_user_id;
    v_current := NULL;
  ELSE
    INSERT INTO public.global_content_reactions(content_id, user_id, reaction, created_at, updated_at)
    VALUES (p_content_id, v_user_id, v_reaction, now(), now())
    ON CONFLICT (content_id, user_id)
    DO UPDATE SET reaction = EXCLUDED.reaction, updated_at = now();
    v_current := v_reaction;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.global_content_reactions
  WHERE content_id = p_content_id;

  SELECT COALESCE(jsonb_object_agg(x.reaction, x.cnt), '{}'::jsonb)
  INTO v_breakdown
  FROM (
    SELECT reaction, count(*)::bigint AS cnt
    FROM public.global_content_reactions
    WHERE content_id = p_content_id
    GROUP BY reaction
  ) x;

  RETURN jsonb_build_object(
    'reaction', v_current,
    'reaction_count', v_count,
    'reaction_breakdown', COALESCE(v_breakdown, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_global_content_save(p_content_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_saved boolean;
  v_count bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.global_announcements
    WHERE id = p_content_id
      AND is_active = true
      AND (content_kind = 'news' OR show_in_news = true)
  ) THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.global_content_saves
    WHERE content_id = p_content_id AND user_id = v_user_id
  ) THEN
    DELETE FROM public.global_content_saves
    WHERE content_id = p_content_id AND user_id = v_user_id;
    v_saved := false;
  ELSE
    INSERT INTO public.global_content_saves(content_id, user_id)
    VALUES (p_content_id, v_user_id)
    ON CONFLICT DO NOTHING;
    v_saved := true;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.global_content_saves
  WHERE content_id = p_content_id;

  RETURN jsonb_build_object('saved', v_saved, 'save_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_global_content_comment(p_content_id uuid, p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_comment_id uuid;
  v_count bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(trim(COALESCE(p_body, ''))) = 0 OR length(trim(p_body)) > 2000 THEN
    RAISE EXCEPTION 'Comment must be between 1 and 2000 characters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.global_announcements
    WHERE id = p_content_id
      AND is_active = true
      AND comments_enabled = true
      AND (content_kind = 'news' OR show_in_news = true)
  ) THEN
    RAISE EXCEPTION 'Comments are disabled for this post';
  END IF;

  INSERT INTO public.global_content_comments(content_id, user_id, body)
  VALUES (p_content_id, v_user_id, trim(p_body))
  RETURNING id INTO v_comment_id;

  SELECT count(*) INTO v_count
  FROM public.global_content_comments
  WHERE content_id = p_content_id AND status = 'visible';

  RETURN jsonb_build_object('comment_id', v_comment_id, 'comment_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_own_global_content_comment(p_comment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_content_id uuid;
  v_count bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.global_content_comments
  WHERE id = p_comment_id AND user_id = v_user_id
  RETURNING content_id INTO v_content_id;

  IF v_content_id IS NULL THEN
    RETURN jsonb_build_object('deleted', false);
  END IF;

  SELECT count(*) INTO v_count
  FROM public.global_content_comments
  WHERE content_id = v_content_id AND status = 'visible';

  RETURN jsonb_build_object('deleted', true, 'comment_count', v_count, 'content_id', v_content_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_content_comments(p_content_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  body text,
  created_at timestamptz,
  author_name text,
  author_avatar text,
  can_delete boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    cm.id,
    cm.user_id,
    cm.body,
    cm.created_at,
    COALESCE(NULLIF(u.full_name, ''), split_part(u.email, '@', 1), 'DRIGHT user') AS author_name,
    u.avatar_url AS author_avatar,
    (cm.user_id = auth.uid()) AS can_delete
  FROM public.global_content_comments cm
  JOIN public.global_announcements c ON c.id = cm.content_id
  LEFT JOIN public.users u ON u.id = cm.user_id
  WHERE cm.content_id = p_content_id
    AND cm.status = 'visible'
    AND c.is_active = true
    AND (c.content_kind = 'news' OR c.show_in_news = true)
  ORDER BY cm.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_global_content_banner(p_content_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.global_announcements
    WHERE id = p_content_id AND is_active = true AND mention_all = true
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.global_content_banner_dismissals(content_id, user_id)
  VALUES (p_content_id, v_user_id)
  ON CONFLICT (content_id, user_id)
  DO UPDATE SET dismissed_at = now();

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_content_banners()
RETURNS TABLE (
  id uuid,
  title text,
  message text,
  type text,
  content_kind text,
  show_in_news boolean,
  published_at timestamptz,
  action_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    c.title,
    c.message,
    c.type,
    c.content_kind,
    c.show_in_news,
    c.published_at,
    CASE
      WHEN c.content_kind = 'news' OR c.show_in_news
        THEN '/news?item=' || c.id::text
      ELSE '/announcements?item=' || c.id::text
    END AS action_url
  FROM public.global_announcements c
  WHERE auth.uid() IS NOT NULL
    AND c.is_active = true
    AND c.mention_all = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.global_content_banner_dismissals d
      WHERE d.content_id = c.id
        AND d.user_id = auth.uid()
    )
  ORDER BY c.is_pinned DESC, c.published_at DESC
  LIMIT 3;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_global_content_comments(p_content_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  body text,
  status text,
  created_at timestamptz,
  moderated_at timestamptz,
  moderation_reason text,
  author_name text,
  author_email text,
  author_avatar text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.can_manage_global_content(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to moderate DRIGHT comments';
  END IF;

  RETURN QUERY
  SELECT
    cm.id,
    cm.user_id,
    cm.body,
    cm.status,
    cm.created_at,
    cm.moderated_at,
    cm.moderation_reason,
    COALESCE(NULLIF(u.full_name, ''), split_part(u.email, '@', 1), 'DRIGHT user') AS author_name,
    u.email AS author_email,
    u.avatar_url AS author_avatar
  FROM public.global_content_comments cm
  LEFT JOIN public.users u ON u.id = cm.user_id
  WHERE cm.content_id = p_content_id
  ORDER BY cm.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_moderate_global_content_comment(
  p_comment_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text := lower(trim(COALESCE(p_action, '')));
  v_content_id uuid;
BEGIN
  IF NOT public.can_manage_global_content(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to moderate DRIGHT comments';
  END IF;

  SELECT content_id INTO v_content_id
  FROM public.global_content_comments
  WHERE id = p_comment_id;

  IF v_content_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_action = 'delete' THEN
    DELETE FROM public.global_content_comments WHERE id = p_comment_id;
  ELSIF v_action = 'hide' THEN
    UPDATE public.global_content_comments
    SET status = 'hidden',
        moderated_by = auth.uid(),
        moderated_at = now(),
        moderation_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
        updated_at = now()
    WHERE id = p_comment_id;
  ELSIF v_action IN ('restore', 'show') THEN
    UPDATE public.global_content_comments
    SET status = 'visible',
        moderated_by = auth.uid(),
        moderated_at = now(),
        moderation_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
        updated_at = now()
    WHERE id = p_comment_id;
  ELSE
    RAISE EXCEPTION 'Invalid moderation action';
  END IF;

  INSERT INTO public.admin_logs(admin_id, action_type, target_id, target_type, details)
  VALUES (
    auth.uid(),
    'news_comment_' || v_action,
    p_comment_id,
    'global_content_comment',
    jsonb_build_object('content_id', v_content_id, 'reason', NULLIF(trim(COALESCE(p_reason, '')), ''))
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_global_content_v2(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_global_content_v2(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_global_content_engagement(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_global_content_reaction(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.toggle_global_content_save(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_global_content_comment(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_global_content_comment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_global_content_comments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_global_content_banner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_global_content_banners() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_global_content_comments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_moderate_global_content_comment(uuid,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_global_content_v2(text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_global_content_v2(uuid,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text[],text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_content_engagement(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_global_content_reaction(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_global_content_save(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_global_content_comment(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_global_content_comment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_content_comments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_global_content_banner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_content_banners() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_global_content_comments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_global_content_comment(uuid,text,text) TO authenticated;

-- The existing view RPC remains unique-user based. Explicitly keep it callable
-- by signed-in News users; the frontend now invokes it whenever a post opens.
REVOKE ALL ON FUNCTION public.record_global_content_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_global_content_view(uuid) TO authenticated;
