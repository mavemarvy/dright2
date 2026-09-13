-- DRIGHT2 News media -> Social bridge.
-- Plain-text News remains News-only. Eligible image/video News is mirrored into
-- the existing Social post/recommendation/session infrastructure.

ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_source_type_check;
ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_source_type_check
  CHECK (source_type = ANY (ARRAY['user'::text,'community'::text,'news'::text]));

ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_linked_entity_type_check;
ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_linked_entity_type_check
  CHECK (linked_entity_type IS NULL OR linked_entity_type = ANY (
    ARRAY['product'::text,'service'::text,'course'::text,'job'::text,'store'::text,'creator'::text,'community'::text,'news'::text]
  ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_news_source
  ON public.social_posts(linked_entity_id)
  WHERE source_type='news' AND linked_entity_type='news' AND linked_entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_news_media_to_social()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE
  v_eligible boolean;
  v_post_id uuid;
BEGIN
  v_eligible := NEW.is_active
    AND (NEW.content_kind='news' OR NEW.show_in_news=true)
    AND NEW.media_type IN ('image','video')
    AND NULLIF(trim(COALESCE(NEW.media_url,'')),'') IS NOT NULL
    AND NEW.created_by IS NOT NULL;

  SELECT id INTO v_post_id
  FROM public.social_posts
  WHERE source_type='news'
    AND linked_entity_type='news'
    AND linked_entity_id=NEW.id
  LIMIT 1;

  IF v_eligible THEN
    INSERT INTO public.social_posts(
      id,author_id,body,media_path,media_type,visibility,comments_enabled,
      allowed_reactions,is_active,created_at,updated_at,source_type,category,
      linked_entity_type,linked_entity_id,linked_entity_url,is_pinned,moderation_status
    ) VALUES (
      COALESCE(v_post_id,gen_random_uuid()),NEW.created_by,
      concat_ws(E'\n',NULLIF(trim(NEW.title),''),NULLIF(trim(NEW.message),'')),
      NEW.media_url,NEW.media_type,'public',COALESCE(NEW.comments_enabled,true),
      COALESCE(NEW.allowed_reactions,ARRAY['like','love','care','haha','wow','sad','angry']::text[]),
      true,COALESCE(NEW.published_at,NEW.created_at,now()),now(),'news',NEW.type,
      'news',NEW.id,'/news?item='||NEW.id::text,COALESCE(NEW.is_pinned,false),'approved'
    )
    ON CONFLICT (id) DO UPDATE SET
      author_id=EXCLUDED.author_id,
      body=EXCLUDED.body,
      media_path=EXCLUDED.media_path,
      media_type=EXCLUDED.media_type,
      comments_enabled=EXCLUDED.comments_enabled,
      allowed_reactions=EXCLUDED.allowed_reactions,
      is_active=true,
      updated_at=now(),
      category=EXCLUDED.category,
      linked_entity_url=EXCLUDED.linked_entity_url,
      is_pinned=EXCLUDED.is_pinned,
      moderation_status='approved';
  ELSIF v_post_id IS NOT NULL THEN
    UPDATE public.social_posts SET is_active=false,updated_at=now() WHERE id=v_post_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_news_media_to_social ON public.global_announcements;
CREATE TRIGGER trg_sync_news_media_to_social
AFTER INSERT OR UPDATE OF title,message,media_url,media_type,is_active,show_in_news,
  content_kind,comments_enabled,allowed_reactions,is_pinned,created_by,published_at,type
ON public.global_announcements
FOR EACH ROW EXECUTE FUNCTION public.sync_news_media_to_social();

INSERT INTO public.social_posts(
  author_id,body,media_path,media_type,visibility,comments_enabled,allowed_reactions,
  is_active,created_at,updated_at,source_type,category,linked_entity_type,
  linked_entity_id,linked_entity_url,is_pinned,moderation_status
)
SELECT g.created_by,
       concat_ws(E'\n',NULLIF(trim(g.title),''),NULLIF(trim(g.message),'')),
       g.media_url,g.media_type,'public',COALESCE(g.comments_enabled,true),
       COALESCE(g.allowed_reactions,ARRAY['like','love','care','haha','wow','sad','angry']::text[]),
       true,COALESCE(g.published_at,g.created_at,now()),now(),'news',g.type,'news',g.id,
       '/news?item='||g.id::text,COALESCE(g.is_pinned,false),'approved'
FROM public.global_announcements g
WHERE g.is_active=true
  AND (g.content_kind='news' OR g.show_in_news=true)
  AND g.media_type IN ('image','video')
  AND NULLIF(trim(COALESCE(g.media_url,'')),'') IS NOT NULL
  AND g.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.social_posts p
    WHERE p.source_type='news' AND p.linked_entity_type='news' AND p.linked_entity_id=g.id
  );

-- Canonical News top-level engagement is mirrored to Social so both surfaces
-- show the same reactions, saves and comments while Social ranking can use them.
CREATE OR REPLACE FUNCTION public.sync_global_reaction_to_social()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_content uuid; v_user uuid; v_post uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_content:=OLD.content_id; v_user:=OLD.user_id;
  ELSE v_content:=NEW.content_id; v_user:=NEW.user_id; END IF;
  SELECT id INTO v_post FROM public.social_posts
   WHERE source_type='news' AND linked_entity_type='news' AND linked_entity_id=v_content LIMIT 1;
  IF v_post IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF TG_OP='DELETE' THEN
    DELETE FROM public.social_post_reactions WHERE post_id=v_post AND user_id=v_user;
    RETURN OLD;
  END IF;
  INSERT INTO public.social_post_reactions(post_id,user_id,reaction,created_at,updated_at)
  VALUES(v_post,NEW.user_id,NEW.reaction,NEW.created_at,NEW.updated_at)
  ON CONFLICT(post_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction,updated_at=EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_global_save_to_social()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_content uuid; v_user uuid; v_post uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_content:=OLD.content_id; v_user:=OLD.user_id;
  ELSE v_content:=NEW.content_id; v_user:=NEW.user_id; END IF;
  SELECT id INTO v_post FROM public.social_posts
   WHERE source_type='news' AND linked_entity_type='news' AND linked_entity_id=v_content LIMIT 1;
  IF v_post IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF TG_OP='DELETE' THEN
    DELETE FROM public.social_post_saves WHERE post_id=v_post AND user_id=v_user;
    RETURN OLD;
  END IF;
  INSERT INTO public.social_post_saves(post_id,user_id,created_at)
  VALUES(v_post,NEW.user_id,NEW.created_at)
  ON CONFLICT(post_id,user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_global_comment_to_social()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_content uuid; v_post uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_content:=OLD.content_id; ELSE v_content:=NEW.content_id; END IF;
  SELECT id INTO v_post FROM public.social_posts
   WHERE source_type='news' AND linked_entity_type='news' AND linked_entity_id=v_content LIMIT 1;
  IF v_post IS NULL THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF TG_OP='DELETE' THEN
    DELETE FROM public.social_post_comments WHERE id=OLD.id;
    RETURN OLD;
  END IF;
  INSERT INTO public.social_post_comments(id,post_id,user_id,body,status,created_at,updated_at)
  VALUES(NEW.id,v_post,NEW.user_id,NEW.body,NEW.status,NEW.created_at,NEW.updated_at)
  ON CONFLICT(id) DO UPDATE SET body=EXCLUDED.body,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_global_reaction_to_social ON public.global_content_reactions;
CREATE TRIGGER trg_sync_global_reaction_to_social
AFTER INSERT OR UPDATE OR DELETE ON public.global_content_reactions
FOR EACH ROW EXECUTE FUNCTION public.sync_global_reaction_to_social();
DROP TRIGGER IF EXISTS trg_sync_global_save_to_social ON public.global_content_saves;
CREATE TRIGGER trg_sync_global_save_to_social
AFTER INSERT OR DELETE ON public.global_content_saves
FOR EACH ROW EXECUTE FUNCTION public.sync_global_save_to_social();
DROP TRIGGER IF EXISTS trg_sync_global_comment_to_social ON public.global_content_comments;
CREATE TRIGGER trg_sync_global_comment_to_social
AFTER INSERT OR UPDATE OR DELETE ON public.global_content_comments
FOR EACH ROW EXECUTE FUNCTION public.sync_global_comment_to_social();

INSERT INTO public.social_post_reactions(post_id,user_id,reaction,created_at,updated_at)
SELECT p.id,r.user_id,r.reaction,r.created_at,r.updated_at
FROM public.global_content_reactions r
JOIN public.social_posts p ON p.source_type='news' AND p.linked_entity_type='news' AND p.linked_entity_id=r.content_id
ON CONFLICT(post_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction,updated_at=EXCLUDED.updated_at;

INSERT INTO public.social_post_saves(post_id,user_id,created_at)
SELECT p.id,s.user_id,s.created_at
FROM public.global_content_saves s
JOIN public.social_posts p ON p.source_type='news' AND p.linked_entity_type='news' AND p.linked_entity_id=s.content_id
ON CONFLICT(post_id,user_id) DO NOTHING;

INSERT INTO public.social_post_comments(id,post_id,user_id,body,status,created_at,updated_at)
SELECT c.id,p.id,c.user_id,c.body,c.status,c.created_at,c.updated_at
FROM public.global_content_comments c
JOIN public.social_posts p ON p.source_type='news' AND p.linked_entity_type='news' AND p.linked_entity_id=c.content_id
ON CONFLICT(id) DO UPDATE SET body=EXCLUDED.body,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at;

-- Existing Social controls delegate News-mirror engagement to canonical News.
CREATE OR REPLACE FUNCTION public.set_social_post_reaction(p_post_id uuid,p_reaction text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_current text; v_count integer; v_author uuid; v_news uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  SELECT linked_entity_id INTO v_news FROM public.social_posts
   WHERE id=p_post_id AND source_type='news' AND linked_entity_type='news';
  IF v_news IS NOT NULL THEN RETURN public.set_global_content_reaction(v_news,p_reaction); END IF;
  IF p_reaction NOT IN ('like','love','care','haha','wow','sad','angry') THEN RAISE EXCEPTION 'Invalid reaction'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.social_posts p WHERE p.id=p_post_id AND p_reaction=ANY(p.allowed_reactions)) THEN RAISE EXCEPTION 'Reaction disabled for this post'; END IF;
  SELECT reaction INTO v_current FROM public.social_post_reactions WHERE post_id=p_post_id AND user_id=v_uid FOR UPDATE;
  IF v_current=p_reaction THEN
    DELETE FROM public.social_post_reactions WHERE post_id=p_post_id AND user_id=v_uid; v_current:=NULL;
  ELSE
    INSERT INTO public.social_post_reactions(post_id,user_id,reaction) VALUES(p_post_id,v_uid,p_reaction)
    ON CONFLICT(post_id,user_id) DO UPDATE SET reaction=EXCLUDED.reaction,updated_at=now(); v_current:=p_reaction;
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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_saved boolean; v_count integer; v_news uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  SELECT linked_entity_id INTO v_news FROM public.social_posts
   WHERE id=p_post_id AND source_type='news' AND linked_entity_type='news';
  IF v_news IS NOT NULL THEN RETURN public.toggle_global_content_save(v_news); END IF;
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
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_body text:=trim(COALESCE(p_body,'')); v_id uuid; v_count integer; v_author uuid; v_news uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
  SELECT linked_entity_id INTO v_news FROM public.social_posts
   WHERE id=p_post_id AND source_type='news' AND linked_entity_type='news';
  IF v_news IS NOT NULL THEN RETURN public.add_global_content_comment(v_news,p_body); END IF;
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

CREATE OR REPLACE FUNCTION public.delete_social_post_comment(p_comment_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_post uuid; v_comment_user uuid; v_post_author uuid; v_count integer; v_news uuid; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT c.post_id,c.user_id,p.author_id,
         CASE WHEN p.source_type='news' AND p.linked_entity_type='news' THEN p.linked_entity_id ELSE NULL END
    INTO v_post,v_comment_user,v_post_author,v_news
  FROM public.social_post_comments c JOIN public.social_posts p ON p.id=c.post_id
  WHERE c.id=p_comment_id FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment not found'; END IF;
  IF v_news IS NOT NULL THEN
    IF v_comment_user<>v_uid THEN RAISE EXCEPTION 'Use News moderation controls for this comment'; END IF;
    v_result:=public.delete_own_global_content_comment(p_comment_id);
    RETURN COALESCE((v_result->>'comment_count')::integer,0);
  END IF;
  IF v_comment_user<>v_uid AND v_post_author<>v_uid THEN RAISE EXCEPTION 'Not allowed to delete this comment'; END IF;
  DELETE FROM public.social_post_comments WHERE id=p_comment_id;
  SELECT count(*)::integer INTO v_count FROM public.social_post_comments WHERE post_id=v_post AND status='visible';
  RETURN v_count;
END;
$$;

-- News mirrors cannot be altered or deleted through ordinary Social author RPCs.
CREATE OR REPLACE FUNCTION public.update_social_post(
  p_post_id uuid,p_body text,p_media_path text,p_media_type text,p_visibility text,
  p_comments_enabled boolean,p_allowed_reactions text[],p_media_width integer,p_media_height integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_body text:=COALESCE(p_body,''); v_path text:=NULLIF(trim(COALESCE(p_media_path,'')),''); v_visibility text:=lower(trim(COALESCE(p_visibility,'public'))); v_allowed text[]:=COALESCE(p_allowed_reactions,ARRAY['like','love','care','haha','wow','sad','angry']::text[]);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.social_posts WHERE id=p_post_id AND author_id=v_uid AND source_type<>'news' FOR UPDATE) THEN RAISE EXCEPTION 'Post not found, not owned by you, or managed from News'; END IF;
  IF char_length(v_body)>5000 THEN RAISE EXCEPTION 'Post text is too long'; END IF;
  IF length(trim(v_body))=0 AND v_path IS NULL THEN RAISE EXCEPTION 'Add text, a photo, or a video'; END IF;
  IF v_visibility NOT IN ('public','followers','friends','private') THEN RAISE EXCEPTION 'Invalid visibility'; END IF;
  IF v_path IS NOT NULL THEN
    IF p_media_type NOT IN ('image','video') THEN RAISE EXCEPTION 'Invalid media type'; END IF;
    IF v_path NOT LIKE v_uid::text||'/%' OR position('..' in v_path)>0 THEN RAISE EXCEPTION 'Invalid social media path'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(v_allowed) r WHERE r NOT IN ('like','love','care','haha','wow','sad','angry')) THEN RAISE EXCEPTION 'Invalid reaction option'; END IF;
  UPDATE public.social_posts SET body=v_body,media_path=v_path,media_type=CASE WHEN v_path IS NULL THEN NULL ELSE p_media_type END,media_width=p_media_width,media_height=p_media_height,visibility=v_visibility,comments_enabled=COALESCE(p_comments_enabled,true),allowed_reactions=v_allowed,updated_at=now(),edited_at=now()
  WHERE id=p_post_id AND author_id=v_uid AND source_type<>'news';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_social_post(p_post_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_path text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT media_path INTO v_path FROM public.social_posts
   WHERE id=p_post_id AND author_id=v_uid AND source_type<>'news' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Post not found, not owned by you, or managed from News'; END IF;
  DELETE FROM public.social_posts WHERE id=p_post_id AND author_id=v_uid AND source_type<>'news';
  DELETE FROM public.activity_feed WHERE user_id=v_uid AND related_id=p_post_id AND related_type='social_post';
  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_news_media_to_social() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_global_reaction_to_social() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_global_save_to_social() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_global_comment_to_social() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_social_post_reaction(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.toggle_social_post_save(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.add_social_post_comment(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_social_post_comment(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_social_post(uuid,text,text,text,text,boolean,text[],integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_social_post(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_social_post_reaction(uuid,text),public.toggle_social_post_save(uuid),public.add_social_post_comment(uuid,text),public.delete_social_post_comment(uuid),public.update_social_post(uuid,text,text,text,text,boolean,text[],integer,integer),public.delete_social_post(uuid) TO authenticated,service_role;
