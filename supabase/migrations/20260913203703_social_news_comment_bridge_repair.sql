CREATE OR REPLACE FUNCTION public.get_social_post_comments_v2(p_post_id uuid)
RETURNS TABLE(
  id uuid,
  parent_comment_id uuid,
  user_id uuid,
  body text,
  created_at timestamptz,
  author_name text,
  author_avatar text,
  can_delete boolean,
  reaction_count integer,
  reaction_breakdown jsonb,
  current_reaction text,
  reply_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_news uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id, v_uid) THEN
    RAISE EXCEPTION 'Post unavailable';
  END IF;

  SELECT linked_entity_id
  INTO v_news
  FROM public.social_posts
  WHERE id = p_post_id
    AND source_type = 'news'
    AND linked_entity_type = 'news';

  IF v_news IS NOT NULL THEN
    RETURN QUERY
      SELECT g.id, g.parent_comment_id, g.user_id, g.body, g.created_at,
             g.author_name, g.author_avatar, g.can_delete, g.reaction_count,
             g.reaction_breakdown, g.current_reaction, g.reply_count
      FROM public.get_global_content_comments_v2(v_news) AS g;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT c.id,
           c.parent_comment_id,
           c.user_id,
           c.body,
           c.created_at,
           COALESCE(NULLIF(u.full_name,''), NULLIF(u.username,''), 'DRIGHT User')::text,
           u.avatar_url,
           (c.user_id = v_uid OR (p.author_id = v_uid AND p.source_type <> 'news')),
           (SELECT count(*)::integer FROM public.social_post_comment_reactions r WHERE r.comment_id = c.id),
           COALESCE((SELECT jsonb_object_agg(x.reaction,x.cnt)
                     FROM (SELECT r.reaction, count(*)::integer cnt
                           FROM public.social_post_comment_reactions r
                           WHERE r.comment_id = c.id
                           GROUP BY r.reaction) x), '{}'::jsonb),
           (SELECT r.reaction FROM public.social_post_comment_reactions r WHERE r.comment_id = c.id AND r.user_id = v_uid),
           (SELECT count(*)::integer FROM public.social_post_comments rc WHERE rc.parent_comment_id = c.id AND rc.status = 'visible')
    FROM public.social_post_comments c
    JOIN public.users u ON u.id = c.user_id
    JOIN public.social_posts p ON p.id = c.post_id
    WHERE c.post_id = p_post_id
      AND c.status = 'visible'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_id = v_uid AND b.blocked_id = c.user_id)
           OR (b.blocker_id = c.user_id AND b.blocked_id = v_uid)
      )
    ORDER BY c.created_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_social_post_comment(p_comment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_post uuid;
  v_comment_user uuid;
  v_post_author uuid;
  v_count integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.global_content_comments gc
    JOIN public.social_posts p
      ON p.source_type = 'news'
     AND p.linked_entity_type = 'news'
     AND p.linked_entity_id = gc.content_id
    WHERE gc.id = p_comment_id
      AND gc.status = 'visible'
      AND public.social_can_view_post(p.id, v_uid)
  ) THEN
    v_result := public.delete_own_global_content_comment(p_comment_id);
    RETURN COALESCE((v_result->>'comment_count')::integer, 0);
  END IF;

  SELECT c.post_id, c.user_id, p.author_id
  INTO v_post, v_comment_user, v_post_author
  FROM public.social_post_comments c
  JOIN public.social_posts p ON p.id = c.post_id
  WHERE c.id = p_comment_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comment not found';
  END IF;

  IF v_comment_user <> v_uid AND v_post_author <> v_uid THEN
    RAISE EXCEPTION 'Not allowed to delete this comment';
  END IF;

  DELETE FROM public.social_post_comments WHERE id = p_comment_id;
  SELECT count(*)::integer INTO v_count
  FROM public.social_post_comments
  WHERE post_id = v_post AND status = 'visible';
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_social_post_comments_v2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_social_post_comment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_social_post_comments_v2(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_social_post_comment(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_global_content_comments_v2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_global_content_reply(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_global_content_comment_reaction(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_global_content_comments_v2(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_global_content_reply(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_global_content_comment_reaction(uuid,text) TO authenticated, service_role;