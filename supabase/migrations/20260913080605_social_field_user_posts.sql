-- DRIGHT Social Field: first-class user posts, engagement, feed modes and media.
-- Forward-only. News/global_announcements remains admin-owned information content.

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  media_path text NULL,
  media_type text NULL CHECK (media_type IS NULL OR media_type IN ('image','video')),
  media_width integer NULL CHECK (media_width IS NULL OR media_width > 0),
  media_height integer NULL CHECK (media_height IS NULL OR media_height > 0),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','friends','private')),
  comments_enabled boolean NOT NULL DEFAULT true,
  allowed_reactions text[] NOT NULL DEFAULT ARRAY['like','love','care','haha','wow','sad','angry']::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz NULL,
  CONSTRAINT social_posts_content_check CHECK (length(trim(body)) > 0 OR media_path IS NOT NULL),
  CONSTRAINT social_posts_body_length_check CHECK (char_length(body) <= 5000),
  CONSTRAINT social_posts_allowed_reactions_check CHECK (allowed_reactions <@ ARRAY['like','love','care','haha','wow','sad','angry']::text[])
);

CREATE TABLE IF NOT EXISTS public.social_post_reactions (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('like','love','care','haha','wow','sad','angry')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.social_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_post_saves (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.social_post_views (
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.social_post_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('share','watch_complete','dwell','not_interested','hide_creator','profile_visit')),
  dwell_ms integer NULL CHECK (dwell_ms IS NULL OR (dwell_ms >= 0 AND dwell_ms <= 3600000)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_author_created ON public.social_posts(author_id,created_at DESC) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_social_posts_created ON public.social_posts(created_at DESC) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_social_post_reactions_post ON public.social_post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_comments_post_created ON public.social_post_comments(post_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_post_saves_post ON public.social_post_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_events_user_type ON public.social_post_events(user_id,event_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_post_events_post ON public.social_post_events(post_id,event_type);

ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.social_posts FROM anon, authenticated;
REVOKE ALL ON TABLE public.social_post_reactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.social_post_comments FROM anon, authenticated;
REVOKE ALL ON TABLE public.social_post_saves FROM anon, authenticated;
REVOKE ALL ON TABLE public.social_post_views FROM anon, authenticated;
REVOKE ALL ON TABLE public.social_post_events FROM anon, authenticated;
GRANT ALL ON TABLE public.social_posts TO service_role;
GRANT ALL ON TABLE public.social_post_reactions TO service_role;
GRANT ALL ON TABLE public.social_post_comments TO service_role;
GRANT ALL ON TABLE public.social_post_saves TO service_role;
GRANT ALL ON TABLE public.social_post_views TO service_role;
GRANT ALL ON TABLE public.social_post_events TO service_role;

CREATE OR REPLACE FUNCTION public.social_can_view_post(p_post_id uuid, p_viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.social_posts p
    JOIN public.users u ON u.id = p.author_id
    WHERE p.id = p_post_id
      AND p.is_active = true
      AND p_viewer IS NOT NULL
      AND COALESCE(upper(u.account_status),'ACTIVE') <> 'BANNED'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_id = p_viewer AND b.blocked_id = p.author_id)
           OR (b.blocker_id = p.author_id AND b.blocked_id = p_viewer)
      )
      AND (
        p.author_id = p_viewer
        OR p.visibility = 'public'
        OR (p.visibility = 'followers' AND EXISTS (
          SELECT 1 FROM public.user_follows f
          WHERE f.follower_id = p_viewer AND f.following_id = p.author_id
        ))
        OR (p.visibility = 'friends' AND EXISTS (
          SELECT 1 FROM public.user_follows f1
          JOIN public.user_follows f2
            ON f2.follower_id = f1.following_id
           AND f2.following_id = f1.follower_id
          WHERE f1.follower_id = p_viewer AND f1.following_id = p.author_id
        ))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.social_can_view_post(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.social_can_view_post(uuid,uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS social_posts_select_visible ON public.social_posts;
CREATE POLICY social_posts_select_visible ON public.social_posts FOR SELECT TO authenticated USING (public.social_can_view_post(id,auth.uid()));
DROP POLICY IF EXISTS social_posts_insert_own ON public.social_posts;
CREATE POLICY social_posts_insert_own ON public.social_posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS social_posts_update_own ON public.social_posts;
CREATE POLICY social_posts_update_own ON public.social_posts FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
DROP POLICY IF EXISTS social_posts_delete_own ON public.social_posts;
CREATE POLICY social_posts_delete_own ON public.social_posts FOR DELETE TO authenticated USING (author_id = auth.uid());

DROP POLICY IF EXISTS social_reactions_select_visible ON public.social_post_reactions;
CREATE POLICY social_reactions_select_visible ON public.social_post_reactions FOR SELECT TO authenticated USING (public.social_can_view_post(post_id,auth.uid()));
DROP POLICY IF EXISTS social_reactions_write_own ON public.social_post_reactions;
CREATE POLICY social_reactions_write_own ON public.social_post_reactions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.social_can_view_post(post_id,auth.uid()));
DROP POLICY IF EXISTS social_comments_select_visible ON public.social_post_comments;
CREATE POLICY social_comments_select_visible ON public.social_post_comments FOR SELECT TO authenticated USING (public.social_can_view_post(post_id,auth.uid()) AND (status='visible' OR user_id=auth.uid()));
DROP POLICY IF EXISTS social_comments_insert_own ON public.social_post_comments;
CREATE POLICY social_comments_insert_own ON public.social_post_comments FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND public.social_can_view_post(post_id,auth.uid()));
DROP POLICY IF EXISTS social_comments_delete_allowed ON public.social_post_comments;
CREATE POLICY social_comments_delete_allowed ON public.social_post_comments FOR DELETE TO authenticated USING (user_id=auth.uid() OR EXISTS (SELECT 1 FROM public.social_posts p WHERE p.id=post_id AND p.author_id=auth.uid()));
DROP POLICY IF EXISTS social_saves_own ON public.social_post_saves;
CREATE POLICY social_saves_own ON public.social_post_saves FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid() AND public.social_can_view_post(post_id,auth.uid()));
DROP POLICY IF EXISTS social_views_own ON public.social_post_views;
CREATE POLICY social_views_own ON public.social_post_views FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid() AND public.social_can_view_post(post_id,auth.uid()));
DROP POLICY IF EXISTS social_events_own ON public.social_post_events;
CREATE POLICY social_events_own ON public.social_post_events FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid() AND public.social_can_view_post(post_id,auth.uid()));

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES (
  'social-media','social-media',true,104857600,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS social_media_public_read ON storage.objects;
CREATE POLICY social_media_public_read ON storage.objects FOR SELECT USING (bucket_id='social-media');
DROP POLICY IF EXISTS social_media_owner_insert ON storage.objects;
CREATE POLICY social_media_owner_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='social-media' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS social_media_owner_update ON storage.objects;
CREATE POLICY social_media_owner_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='social-media' AND (storage.foldername(name))[1]=auth.uid()::text) WITH CHECK (bucket_id='social-media' AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS social_media_owner_delete ON storage.objects;
CREATE POLICY social_media_owner_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='social-media' AND (storage.foldername(name))[1]=auth.uid()::text);

CREATE OR REPLACE FUNCTION public.create_social_post(
  p_body text,
  p_media_path text,
  p_media_type text,
  p_visibility text,
  p_comments_enabled boolean,
  p_allowed_reactions text[],
  p_media_width integer,
  p_media_height integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_body text := COALESCE(p_body,'');
  v_path text := NULLIF(trim(COALESCE(p_media_path,'')),'');
  v_visibility text := lower(trim(COALESCE(p_visibility,'public')));
  v_allowed text[] := COALESCE(p_allowed_reactions, ARRAY['like','love','care','haha','wow','sad','angry']::text[]);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF char_length(v_body) > 5000 THEN RAISE EXCEPTION 'Post text is too long'; END IF;
  IF length(trim(v_body)) = 0 AND v_path IS NULL THEN RAISE EXCEPTION 'Add text, a photo, or a video'; END IF;
  IF v_visibility NOT IN ('public','followers','friends','private') THEN RAISE EXCEPTION 'Invalid visibility'; END IF;
  IF v_path IS NOT NULL THEN
    IF p_media_type NOT IN ('image','video') THEN RAISE EXCEPTION 'Invalid media type'; END IF;
    IF v_path NOT LIKE v_uid::text || '/%' OR position('..' in v_path) > 0 THEN RAISE EXCEPTION 'Invalid social media path'; END IF;
  ELSIF p_media_type IS NOT NULL THEN
    RAISE EXCEPTION 'Media type requires media';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_allowed) r WHERE r NOT IN ('like','love','care','haha','wow','sad','angry')) THEN RAISE EXCEPTION 'Invalid reaction option'; END IF;

  INSERT INTO public.social_posts(author_id,body,media_path,media_type,media_width,media_height,visibility,comments_enabled,allowed_reactions)
  VALUES(v_uid,v_body,v_path,CASE WHEN v_path IS NULL THEN NULL ELSE p_media_type END,p_media_width,p_media_height,v_visibility,COALESCE(p_comments_enabled,true),v_allowed)
  RETURNING id INTO v_id;

  INSERT INTO public.activity_feed(user_id,event_type,category,title,description,related_id,related_type,metadata)
  VALUES(v_uid,'social_post_created','social','Posted on Social Field',left(v_body,280),v_id,'social_post',jsonb_build_object('media_type',p_media_type,'visibility',v_visibility));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_social_post(
  p_post_id uuid,
  p_body text,
  p_media_path text,
  p_media_type text,
  p_visibility text,
  p_comments_enabled boolean,
  p_allowed_reactions text[],
  p_media_width integer,
  p_media_height integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := COALESCE(p_body,'');
  v_path text := NULLIF(trim(COALESCE(p_media_path,'')),'');
  v_visibility text := lower(trim(COALESCE(p_visibility,'public')));
  v_allowed text[] := COALESCE(p_allowed_reactions, ARRAY['like','love','care','haha','wow','sad','angry']::text[]);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.social_posts WHERE id=p_post_id AND author_id=v_uid FOR UPDATE) THEN RAISE EXCEPTION 'Post not found or not owned by you'; END IF;
  IF char_length(v_body) > 5000 THEN RAISE EXCEPTION 'Post text is too long'; END IF;
  IF length(trim(v_body)) = 0 AND v_path IS NULL THEN RAISE EXCEPTION 'Add text, a photo, or a video'; END IF;
  IF v_visibility NOT IN ('public','followers','friends','private') THEN RAISE EXCEPTION 'Invalid visibility'; END IF;
  IF v_path IS NOT NULL THEN
    IF p_media_type NOT IN ('image','video') THEN RAISE EXCEPTION 'Invalid media type'; END IF;
    IF v_path NOT LIKE v_uid::text || '/%' OR position('..' in v_path) > 0 THEN RAISE EXCEPTION 'Invalid social media path'; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_allowed) r WHERE r NOT IN ('like','love','care','haha','wow','sad','angry')) THEN RAISE EXCEPTION 'Invalid reaction option'; END IF;

  UPDATE public.social_posts
  SET body=v_body,
      media_path=v_path,
      media_type=CASE WHEN v_path IS NULL THEN NULL ELSE p_media_type END,
      media_width=p_media_width,
      media_height=p_media_height,
      visibility=v_visibility,
      comments_enabled=COALESCE(p_comments_enabled,true),
      allowed_reactions=v_allowed,
      updated_at=now(),
      edited_at=now()
  WHERE id=p_post_id AND author_id=v_uid;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_social_post(p_post_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_path text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT media_path INTO v_path FROM public.social_posts WHERE id=p_post_id AND author_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found or not owned by you'; END IF;
  DELETE FROM public.social_posts WHERE id=p_post_id AND author_id=v_uid;
  DELETE FROM public.activity_feed WHERE user_id=v_uid AND related_id=p_post_id AND related_type='social_post';
  RETURN v_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_social_feed(
  p_feed text DEFAULT 'for_you',
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_target_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_feed text := lower(trim(COALESCE(p_feed,'for_you')));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit,24),1),50);
  v_offset integer := GREATEST(COALESCE(p_offset,0),0);
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_feed NOT IN ('for_you','following','friends','mine') THEN RAISE EXCEPTION 'Invalid social feed'; END IF;

  WITH candidates AS (
    SELECT
      p.id,p.author_id,p.body,p.media_path,p.media_type,p.media_width,p.media_height,p.visibility,p.comments_enabled,p.allowed_reactions,p.created_at,p.updated_at,p.edited_at,
      u.full_name AS author_name,u.username AS author_username,u.avatar_url AS author_avatar,COALESCE(u.is_verified,false) AS author_verified,
      EXISTS(SELECT 1 FROM public.user_follows f WHERE f.follower_id=v_uid AND f.following_id=p.author_id) AS is_following,
      EXISTS(SELECT 1 FROM public.user_follows f1 JOIN public.user_follows f2 ON f2.follower_id=f1.following_id AND f2.following_id=f1.follower_id WHERE f1.follower_id=v_uid AND f1.following_id=p.author_id) AS is_friend,
      (SELECT count(*)::integer FROM public.social_post_views x WHERE x.post_id=p.id) AS view_count,
      (SELECT count(*)::integer FROM public.social_post_reactions x WHERE x.post_id=p.id) AS reaction_count,
      (SELECT count(*)::integer FROM public.social_post_comments x WHERE x.post_id=p.id AND x.status='visible') AS comment_count,
      (SELECT count(*)::integer FROM public.social_post_saves x WHERE x.post_id=p.id) AS save_count,
      (SELECT x.reaction FROM public.social_post_reactions x WHERE x.post_id=p.id AND x.user_id=v_uid) AS current_reaction,
      EXISTS(SELECT 1 FROM public.social_post_saves x WHERE x.post_id=p.id AND x.user_id=v_uid) AS is_saved,
      (
        (SELECT count(*) FROM public.social_post_reactions x JOIN public.social_posts ap ON ap.id=x.post_id WHERE x.user_id=v_uid AND ap.author_id=p.author_id) * 2
        + (SELECT count(*) FROM public.social_post_saves x JOIN public.social_posts ap ON ap.id=x.post_id WHERE x.user_id=v_uid AND ap.author_id=p.author_id) * 4
        + (SELECT count(*) FROM public.social_post_comments x JOIN public.social_posts ap ON ap.id=x.post_id WHERE x.user_id=v_uid AND ap.author_id=p.author_id) * 3
      )::numeric AS affinity_score
    FROM public.social_posts p
    JOIN public.users u ON u.id=p.author_id
    WHERE public.social_can_view_post(p.id,v_uid)
      AND (
        v_feed='for_you'
        OR (v_feed='mine' AND p.author_id=v_uid)
        OR (v_feed='following' AND EXISTS(SELECT 1 FROM public.user_follows f WHERE f.follower_id=v_uid AND f.following_id=p.author_id))
        OR (v_feed='friends' AND EXISTS(SELECT 1 FROM public.user_follows f1 JOIN public.user_follows f2 ON f2.follower_id=f1.following_id AND f2.following_id=f1.follower_id WHERE f1.follower_id=v_uid AND f1.following_id=p.author_id))
      )
      AND NOT EXISTS(SELECT 1 FROM public.social_post_events e WHERE e.user_id=v_uid AND e.post_id=p.id AND e.event_type='not_interested')
      AND NOT EXISTS(
        SELECT 1 FROM public.social_post_events e
        JOIN public.social_posts hidden_post ON hidden_post.id=e.post_id
        WHERE e.user_id=v_uid AND e.event_type='hide_creator' AND hidden_post.author_id=p.author_id
      )
  ), ranked AS (
    SELECT c.*,
      CASE WHEN v_feed='for_you' THEN
        (c.view_count * 0.08) + (c.reaction_count * 2.0) + (c.comment_count * 3.0) + (c.save_count * 4.0)
        + CASE WHEN c.is_friend THEN 14 WHEN c.is_following THEN 8 ELSE 0 END
        + LEAST(c.affinity_score,30)
        + GREATEST(0,168 - EXTRACT(EPOCH FROM (now()-c.created_at))/3600) / 24.0
      ELSE 0 END AS rank_score
    FROM candidates c
  ), page_rows AS (
    SELECT * FROM ranked
    ORDER BY CASE WHEN p_target_id IS NOT NULL AND id=p_target_id THEN 0 ELSE 1 END,
             CASE WHEN v_feed='for_you' THEN rank_score ELSE 0 END DESC,
             created_at DESC,
             id DESC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(page_rows) ORDER BY CASE WHEN p_target_id IS NOT NULL AND id=p_target_id THEN 0 ELSE 1 END, CASE WHEN v_feed='for_you' THEN rank_score ELSE 0 END DESC, created_at DESC, id DESC),'[]'::jsonb)
  INTO v_result FROM page_rows;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_social_post_view(p_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_count integer;
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  INSERT INTO public.social_post_views(post_id,user_id) VALUES(p_post_id,v_uid) ON CONFLICT DO NOTHING;
  SELECT count(*)::integer INTO v_count FROM public.social_post_views WHERE post_id=p_post_id;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_social_post_reaction(p_post_id uuid,p_reaction text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_current text; v_count integer; v_author uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  IF p_reaction NOT IN ('like','love','care','haha','wow','sad','angry') THEN RAISE EXCEPTION 'Invalid reaction'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=p_post_id AND p_reaction=ANY(p.allowed_reactions)) THEN RAISE EXCEPTION 'Reaction disabled for this post'; END IF;
  SELECT reaction INTO v_current FROM public.social_post_reactions WHERE post_id=p_post_id AND user_id=v_uid FOR UPDATE;
  IF v_current=p_reaction THEN
    DELETE FROM public.social_post_reactions WHERE post_id=p_post_id AND user_id=v_uid;
    v_current:=NULL;
  ELSE
    INSERT INTO public.social_post_reactions(post_id,user_id,reaction) VALUES(p_post_id,v_uid,p_reaction)
    ON CONFLICT(post_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction,updated_at=now();
    v_current:=p_reaction;
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.social_post_reactions WHERE post_id=p_post_id;
  SELECT author_id INTO v_author FROM public.social_posts WHERE id=p_post_id;
  IF v_current IS NOT NULL AND v_author<>v_uid THEN
    INSERT INTO public.social_notifications(user_id,actor_id,notification_type,entity_type,entity_id,metadata)
    VALUES(v_author,v_uid,'social_reaction','social_post',p_post_id,jsonb_build_object('reaction',v_current));
  END IF;
  RETURN jsonb_build_object('reaction',v_current,'reaction_count',v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_social_post_save(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_saved boolean; v_count integer;
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.social_post_saves WHERE post_id=p_post_id AND user_id=v_uid) THEN
    DELETE FROM public.social_post_saves WHERE post_id=p_post_id AND user_id=v_uid; v_saved:=false;
  ELSE
    INSERT INTO public.social_post_saves(post_id,user_id) VALUES(p_post_id,v_uid); v_saved:=true;
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.social_post_saves WHERE post_id=p_post_id;
  RETURN jsonb_build_object('saved',v_saved,'save_count',v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_social_post_comment(p_post_id uuid,p_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_body text:=trim(COALESCE(p_body,'')); v_id uuid; v_count integer; v_author uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.social_posts WHERE id=p_post_id AND comments_enabled=true) THEN RAISE EXCEPTION 'Comments are disabled'; END IF;
  IF char_length(v_body) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Comment must be 1 to 2000 characters'; END IF;
  INSERT INTO public.social_post_comments(post_id,user_id,body) VALUES(p_post_id,v_uid,v_body) RETURNING id INTO v_id;
  SELECT count(*)::integer INTO v_count FROM public.social_post_comments WHERE post_id=p_post_id AND status='visible';
  SELECT author_id INTO v_author FROM public.social_posts WHERE id=p_post_id;
  IF v_author<>v_uid THEN
    INSERT INTO public.social_notifications(user_id,actor_id,notification_type,entity_type,entity_id,metadata)
    VALUES(v_author,v_uid,'social_comment','social_post',p_post_id,jsonb_build_object('comment_id',v_id));
  END IF;
  RETURN jsonb_build_object('comment_id',v_id,'comment_count',v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_social_post_comments(p_post_id uuid)
RETURNS TABLE(id uuid,user_id uuid,body text,created_at timestamptz,author_name text,author_avatar text,can_delete boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  RETURN QUERY
  SELECT c.id,c.user_id,c.body,c.created_at,COALESCE(u.full_name,u.username,'DRIGHT User')::text,u.avatar_url,
         (c.user_id=v_uid OR p.author_id=v_uid) AS can_delete
  FROM public.social_post_comments c
  JOIN public.users u ON u.id=c.user_id
  JOIN public.social_posts p ON p.id=c.post_id
  WHERE c.post_id=p_post_id AND c.status='visible'
    AND NOT EXISTS(SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id=v_uid AND b.blocked_id=c.user_id) OR (b.blocker_id=c.user_id AND b.blocked_id=v_uid))
  ORDER BY c.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_social_post_comment(p_comment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_post uuid; v_comment_user uuid; v_post_author uuid; v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT c.post_id,c.user_id,p.author_id INTO v_post,v_comment_user,v_post_author
  FROM public.social_post_comments c JOIN public.social_posts p ON p.id=c.post_id
  WHERE c.id=p_comment_id FOR UPDATE OF c;
  IF NOT FOUND OR (v_comment_user<>v_uid AND v_post_author<>v_uid) THEN RAISE EXCEPTION 'Not allowed to delete this comment'; END IF;
  DELETE FROM public.social_post_comments WHERE id=p_comment_id;
  SELECT count(*)::integer INTO v_count FROM public.social_post_comments WHERE post_id=v_post AND status='visible';
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_social_post_event(p_post_id uuid,p_event_type text,p_dwell_ms integer DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_type text:=lower(trim(COALESCE(p_event_type,''))); v_dwell integer;
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  IF v_type NOT IN ('share','watch_complete','dwell','not_interested','hide_creator','profile_visit') THEN RAISE EXCEPTION 'Invalid social event'; END IF;
  v_dwell:=CASE WHEN p_dwell_ms IS NULL THEN NULL ELSE LEAST(GREATEST(p_dwell_ms,0),3600000) END;
  IF v_type IN ('not_interested','hide_creator') AND EXISTS(SELECT 1 FROM public.social_post_events WHERE post_id=p_post_id AND user_id=v_uid AND event_type=v_type) THEN RETURN true; END IF;
  INSERT INTO public.social_post_events(post_id,user_id,event_type,dwell_ms) VALUES(p_post_id,v_uid,v_type,v_dwell);
  RETURN true;
END;
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'create_social_post(text,text,text,text,boolean,text[],integer,integer)',
    'update_social_post(uuid,text,text,text,text,boolean,text[],integer,integer)',
    'delete_social_post(uuid)',
    'get_social_feed(text,integer,integer,uuid)',
    'record_social_post_view(uuid)',
    'set_social_post_reaction(uuid,text)',
    'toggle_social_post_save(uuid)',
    'add_social_post_comment(uuid,text)',
    'get_social_post_comments(uuid)',
    'delete_social_post_comment(uuid)',
    'record_social_post_event(uuid,text,integer)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.'||fn||' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||fn||' TO authenticated, service_role';
  END LOOP;
END $$;