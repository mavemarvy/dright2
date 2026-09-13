-- DRIGHT2 Social delivery, telemetry, ranking and Social-commerce attribution.

ALTER TABLE public.algorithm_settings
  ADD COLUMN IF NOT EXISTS social_feed_batch_size integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS social_exploration_percentage numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS social_recency_weight numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS social_watch_weight numeric NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS social_completion_weight numeric NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS social_save_weight numeric NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS social_share_weight numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS social_comment_weight numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS social_follow_weight numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS social_friend_affinity numeric NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS social_creator_affinity numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS social_trend_weight numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS social_fresh_boost numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS social_negative_penalty numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS social_creator_window integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS social_creator_max_per_window integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS social_category_window integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS social_category_max_per_window integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS social_qualified_view_ms integer NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS social_fast_skip_ms integer NOT NULL DEFAULT 1800;

ALTER TABLE public.system_config
  ADD COLUMN IF NOT EXISTS social_config jsonb NOT NULL DEFAULT '{"enabled":true,"session_expiry_hours":24,"max_posts_per_hour":30,"click_dedupe_seconds":2,"recommendation_reasons":true}'::jsonb;

ALTER TABLE public.promotion_distribution_settings
  ADD COLUMN IF NOT EXISTS social_feed_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS social_min_organic_between_ads integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS social_max_ads_per_session integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS social_same_campaign_daily_cap integer NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS public.social_feed_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  feed_mode text NOT NULL CHECK (feed_mode IN ('social','following','friends','mine','community')),
  community_id uuid NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  current_post_id uuid NULL REFERENCES public.social_posts(id) ON DELETE SET NULL,
  current_position integer NOT NULL DEFAULT 0 CHECK (current_position >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.social_feed_session_items (
  session_id uuid NOT NULL REFERENCES public.social_feed_sessions(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  rank_score numeric NOT NULL DEFAULT 0,
  recommendation_reason text NULL,
  served_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz NULL,
  PRIMARY KEY (session_id,post_id),
  UNIQUE (session_id,position)
);

CREATE INDEX IF NOT EXISTS idx_social_feed_sessions_user_activity ON public.social_feed_sessions(user_id,last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_feed_sessions_expiry ON public.social_feed_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_social_feed_items_session_position ON public.social_feed_session_items(session_id,position);
CREATE INDEX IF NOT EXISTS idx_social_feed_items_post ON public.social_feed_session_items(post_id,served_at DESC);

ALTER TABLE public.social_post_events
  ADD COLUMN IF NOT EXISTS watch_ms integer NULL,
  ADD COLUMN IF NOT EXISTS completion_ratio numeric NULL,
  ADD COLUMN IF NOT EXISTS session_id uuid NULL REFERENCES public.social_feed_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.social_post_events ADD CONSTRAINT social_post_events_watch_ms_check CHECK (watch_ms IS NULL OR (watch_ms>=0 AND watch_ms<=86400000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.social_post_events ADD CONSTRAINT social_post_events_completion_check CHECK (completion_ratio IS NULL OR (completion_ratio>=0 AND completion_ratio<=1.5));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.social_post_events DROP CONSTRAINT IF EXISTS social_post_events_event_type_check;
ALTER TABLE public.social_post_events ADD CONSTRAINT social_post_events_event_type_check CHECK (event_type IN ('impression','click','view_start','qualified_view','pause','resume','watch_complete','replay','skip','dwell','share','not_interested','hide_creator','profile_visit','follow','unfollow','entity_click','report'));

ALTER TABLE public.social_post_views
  ADD COLUMN IF NOT EXISTS first_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS play_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qualified_view_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS total_watch_ms bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_completion_ratio numeric NOT NULL DEFAULT 0;

DO $$ BEGIN ALTER TABLE public.social_post_views ADD CONSTRAINT social_post_views_play_count_check CHECK (play_count>=1); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.social_post_views ADD CONSTRAINT social_post_views_watch_check CHECK (total_watch_ms>=0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.social_post_views ADD CONSTRAINT social_post_views_completion_check CHECK (last_completion_ratio>=0 AND last_completion_ratio<=1.5); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_social_events_post_type_created ON public.social_post_events(post_id,event_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_events_user_created ON public.social_post_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_views_post_started ON public.social_post_views(post_id,last_started_at DESC);

ALTER TABLE public.social_feed_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_feed_session_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS social_sessions_own ON public.social_feed_sessions;
CREATE POLICY social_sessions_own ON public.social_feed_sessions FOR SELECT TO authenticated USING (user_id=auth.uid());
DROP POLICY IF EXISTS social_session_items_own ON public.social_feed_session_items;
CREATE POLICY social_session_items_own ON public.social_feed_session_items FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.social_feed_sessions s WHERE s.id=session_id AND s.user_id=auth.uid()));
REVOKE INSERT,UPDATE,DELETE ON public.social_feed_sessions,public.social_feed_session_items FROM anon,authenticated;
GRANT SELECT ON public.social_feed_sessions,public.social_feed_session_items TO authenticated;
GRANT ALL ON public.social_feed_sessions,public.social_feed_session_items TO service_role;

-- Enforce server-side Social writes so rate limits and canonical telemetry cannot be bypassed.
REVOKE INSERT,UPDATE,DELETE ON public.social_posts,public.social_post_reactions,public.social_post_comments,public.social_post_saves,public.social_post_views,public.social_post_events FROM anon,authenticated;
GRANT SELECT ON public.social_posts,public.social_post_reactions,public.social_post_comments,public.social_post_saves,public.social_post_views,public.social_post_events TO authenticated;

-- Preserve Social source into orders without trusting it blindly from the browser.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS social_source_post_id uuid NULL REFERENCES public.social_posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS social_session_id uuid NULL REFERENCES public.social_feed_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS social_click_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_orders_social_source ON public.orders(social_source_post_id) WHERE social_source_post_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_social_post_click(p_post_id uuid,p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_uid uuid:=auth.uid(); v_count integer; v_recent boolean; v_click_id uuid:=gen_random_uuid(); v_dedupe integer:=2;
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 SELECT COALESCE((social_config->>'click_dedupe_seconds')::integer,2) INTO v_dedupe FROM public.system_config WHERE singleton=true LIMIT 1;
 v_dedupe:=LEAST(GREATEST(COALESCE(v_dedupe,2),1),30);
 v_recent:=EXISTS(SELECT 1 FROM public.social_post_events WHERE post_id=p_post_id AND user_id=v_uid AND event_type='click' AND created_at>now()-(v_dedupe||' seconds')::interval);
 IF NOT v_recent THEN
   INSERT INTO public.social_post_events(id,post_id,user_id,event_type,session_id,metadata) VALUES(v_click_id,p_post_id,v_uid,'click',p_session_id,jsonb_build_object('surface','social'));
   INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,session_id,source,metadata,is_bot) VALUES('social_video_click','social_post',p_post_id,v_uid,p_session_id::text,'social',jsonb_build_object('click_id',v_click_id),false);
 END IF;
 SELECT count(*)::integer INTO v_count FROM public.social_post_events WHERE post_id=p_post_id AND event_type='click';
 RETURN jsonb_build_object('click_count',v_count,'click_id',CASE WHEN v_recent THEN NULL ELSE v_click_id END,'recorded',NOT v_recent);
END; $$;

CREATE OR REPLACE FUNCTION public.record_social_video_start(p_post_id uuid,p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_uid uuid:=auth.uid(); v_views bigint; v_unique bigint; v_play_count integer;
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.social_posts WHERE id=p_post_id AND media_type='video') THEN RAISE EXCEPTION 'Post is not a video'; END IF;
 INSERT INTO public.social_post_views(post_id,user_id,viewed_at,first_started_at,last_started_at,play_count) VALUES(p_post_id,v_uid,now(),now(),now(),1)
 ON CONFLICT(post_id,user_id) DO UPDATE SET viewed_at=now(),last_started_at=now(),play_count=public.social_post_views.play_count+1
 RETURNING play_count INTO v_play_count;
 INSERT INTO public.social_post_events(post_id,user_id,event_type,session_id,metadata) VALUES(p_post_id,v_uid,'view_start',p_session_id,jsonb_build_object('play_count_for_viewer',v_play_count));
 INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,session_id,source,metadata,is_bot) VALUES('social_video_start','social_post',p_post_id,v_uid,p_session_id::text,'social',jsonb_build_object('play_count_for_viewer',v_play_count),false);
 UPDATE public.social_feed_session_items SET viewed_at=COALESCE(viewed_at,now()) WHERE session_id=p_session_id AND post_id=p_post_id;
 UPDATE public.social_feed_sessions SET current_post_id=p_post_id,last_activity_at=now() WHERE id=p_session_id AND user_id=v_uid;
 SELECT COALESCE(sum(play_count),0),count(*) INTO v_views,v_unique FROM public.social_post_views WHERE post_id=p_post_id;
 RETURN jsonb_build_object('view_count',v_views,'unique_view_count',v_unique,'viewer_play_count',v_play_count);
END; $$;

CREATE OR REPLACE FUNCTION public.record_social_video_progress(p_post_id uuid,p_event_type text,p_watch_ms integer DEFAULT NULL,p_completion_ratio numeric DEFAULT NULL,p_session_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_uid uuid:=auth.uid(); v_type text:=lower(trim(p_event_type)); v_watch integer:=LEAST(GREATEST(COALESCE(p_watch_ms,0),0),86400000); v_ratio numeric:=LEAST(GREATEST(COALESCE(p_completion_ratio,0),0),1.5);
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 IF v_type NOT IN ('qualified_view','pause','resume','watch_complete','replay','skip','dwell') THEN RAISE EXCEPTION 'Invalid playback event'; END IF;
 INSERT INTO public.social_post_events(post_id,user_id,event_type,dwell_ms,watch_ms,completion_ratio,session_id) VALUES(p_post_id,v_uid,v_type,CASE WHEN v_type='dwell' THEN v_watch ELSE NULL END,v_watch,v_ratio,p_session_id);
 UPDATE public.social_post_views SET qualified_view_at=CASE WHEN v_type='qualified_view' THEN COALESCE(qualified_view_at,now()) ELSE qualified_view_at END,total_watch_ms=total_watch_ms+CASE WHEN v_type IN ('pause','watch_complete','skip','dwell') THEN v_watch ELSE 0 END,last_completion_ratio=GREATEST(last_completion_ratio,v_ratio) WHERE post_id=p_post_id AND user_id=v_uid;
 IF v_type IN ('qualified_view','watch_complete','replay','skip') THEN INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,session_id,source,metadata,is_bot) VALUES('social_'||CASE v_type WHEN 'watch_complete' THEN 'video_complete' ELSE v_type END,'social_post',p_post_id,v_uid,p_session_id::text,'social',jsonb_build_object('watch_ms',v_watch,'completion_ratio',v_ratio),false); END IF;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.record_social_entity_click(p_post_id uuid,p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_uid uuid:=auth.uid(); v_type text; v_entity uuid; v_url text; v_click uuid:=gen_random_uuid();
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 SELECT linked_entity_type,linked_entity_id,linked_entity_url INTO v_type,v_entity,v_url FROM public.social_posts WHERE id=p_post_id;
 IF v_type IS NULL THEN RAISE EXCEPTION 'No linked DRIGHT entity'; END IF;
 INSERT INTO public.social_post_events(id,post_id,user_id,event_type,session_id,metadata) VALUES(v_click,p_post_id,v_uid,'entity_click',p_session_id,jsonb_build_object('entity_type',v_type,'entity_id',v_entity));
 INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,session_id,source,metadata,is_bot) VALUES('social_entity_click',COALESCE(v_type,'social_entity'),COALESCE(v_entity,p_post_id),v_uid,p_session_id::text,'social',jsonb_build_object('social_post_id',p_post_id,'click_id',v_click,'destination',v_url),false);
 RETURN jsonb_build_object('click_id',v_click,'entity_type',v_type,'entity_id',v_entity,'url',v_url);
END; $$;

CREATE OR REPLACE FUNCTION public.record_social_post_event(p_post_id uuid,p_event_type text,p_dwell_ms integer DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_uid uuid:=auth.uid(); v_type text:=lower(trim(COALESCE(p_event_type,''))); v_dwell integer;
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 IF v_type NOT IN ('impression','share','not_interested','hide_creator','profile_visit','follow','unfollow','report','dwell') THEN RAISE EXCEPTION 'Invalid social event'; END IF;
 v_dwell:=CASE WHEN p_dwell_ms IS NULL THEN NULL ELSE LEAST(GREATEST(p_dwell_ms,0),3600000) END;
 IF v_type IN ('not_interested','hide_creator') AND EXISTS(SELECT 1 FROM public.social_post_events WHERE post_id=p_post_id AND user_id=v_uid AND event_type=v_type) THEN RETURN true; END IF;
 INSERT INTO public.social_post_events(post_id,user_id,event_type,dwell_ms,watch_ms) VALUES(p_post_id,v_uid,v_type,v_dwell,CASE WHEN v_type='dwell' THEN v_dwell ELSE NULL END);
 INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,source,metadata,is_bot) VALUES('social_'||v_type,'social_post',p_post_id,v_uid,'social',jsonb_build_object('dwell_ms',v_dwell),false);
 IF v_type='report' THEN INSERT INTO public.moderation_reports(reporter_id,target_type,target_id,reason,report_category,status) VALUES(v_uid,'social_post',p_post_id,'Reported from Social Field','social_content','pending'); END IF;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.get_social_feed_v2(p_feed text DEFAULT 'social',p_cursor text DEFAULT NULL,p_limit integer DEFAULT NULL,p_session_id uuid DEFAULT NULL,p_target_id uuid DEFAULT NULL,p_community_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
 v_uid uuid:=auth.uid(); v_feed text:=lower(trim(COALESCE(p_feed,'social'))); v_session uuid; v_limit integer:=20; v_start_pos integer:=0;
 v_cursor_score numeric; v_cursor_epoch numeric; v_cursor_id uuid;
 v_explore numeric:=10; v_recency numeric:=8; v_watch numeric:=20; v_completion numeric:=18; v_save numeric:=12; v_share numeric:=10; v_comment numeric:=8; v_follow numeric:=8; v_friend numeric:=14; v_creator numeric:=10; v_trend numeric:=8; v_fresh numeric:=8; v_negative numeric:=25; v_creator_max integer:=2; v_category_max integer:=4;
 v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF v_feed='for_you' THEN v_feed:='social'; END IF;
 IF v_feed NOT IN ('social','following','friends','mine','community') THEN RAISE EXCEPTION 'Invalid Social feed'; END IF;
 IF v_feed='community' AND (p_community_id IS NULL OR NOT public.community_can_view(p_community_id,v_uid)) THEN RAISE EXCEPTION 'Community unavailable'; END IF;
 SELECT COALESCE(p_limit,social_feed_batch_size),social_exploration_percentage,social_recency_weight,social_watch_weight,social_completion_weight,social_save_weight,social_share_weight,social_comment_weight,social_follow_weight,social_friend_affinity,social_creator_affinity,social_trend_weight,social_fresh_boost,social_negative_penalty,social_creator_max_per_window,social_category_max_per_window INTO v_limit,v_explore,v_recency,v_watch,v_completion,v_save,v_share,v_comment,v_follow,v_friend,v_creator,v_trend,v_fresh,v_negative,v_creator_max,v_category_max FROM public.algorithm_settings WHERE is_singleton=true LIMIT 1;
 v_limit:=LEAST(GREATEST(COALESCE(v_limit,20),5),50);
 IF p_session_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.social_feed_sessions WHERE id=p_session_id AND user_id=v_uid AND expires_at>now() AND feed_mode=v_feed AND community_id IS NOT DISTINCT FROM p_community_id) THEN v_session:=p_session_id; UPDATE public.social_feed_sessions SET last_activity_at=now(),expires_at=GREATEST(expires_at,now()+interval '2 hours') WHERE id=v_session;
 ELSE INSERT INTO public.social_feed_sessions(user_id,feed_mode,community_id) VALUES(v_uid,v_feed,p_community_id) RETURNING id INTO v_session; END IF;
 IF p_cursor IS NOT NULL AND p_cursor<>'' THEN BEGIN v_cursor_score:=split_part(p_cursor,'|',1)::numeric; v_cursor_epoch:=split_part(p_cursor,'|',2)::numeric; v_cursor_id:=split_part(p_cursor,'|',3)::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid Social cursor'; END; END IF;
 SELECT COALESCE(max(position),-1)+1 INTO v_start_pos FROM public.social_feed_session_items WHERE session_id=v_session;

 WITH base AS (
   SELECT p.id,p.author_id,p.body,p.media_path,p.media_type,p.media_width,p.media_height,p.visibility,p.comments_enabled,p.allowed_reactions,p.created_at,p.updated_at,p.edited_at,p.community_id,p.source_type,p.category,p.topic_tags,p.linked_entity_type,p.linked_entity_id,p.linked_entity_url,p.is_pinned,
     u.full_name AS author_name,u.username AS author_username,u.avatar_url AS author_avatar,COALESCE(u.is_verified,false) AS author_verified,
     EXISTS(SELECT 1 FROM public.user_follows f WHERE f.follower_id=v_uid AND f.following_id=p.author_id) AS is_following,
     EXISTS(SELECT 1 FROM public.user_follows f1 JOIN public.user_follows f2 ON f2.follower_id=f1.following_id AND f2.following_id=f1.follower_id WHERE f1.follower_id=v_uid AND f1.following_id=p.author_id) AS is_friend,
     COALESCE((SELECT sum(v.play_count) FROM public.social_post_views v WHERE v.post_id=p.id),0)::integer AS view_count,
     (SELECT count(*)::integer FROM public.social_post_views v WHERE v.post_id=p.id) AS unique_view_count,
     (SELECT count(*)::integer FROM public.social_post_events e WHERE e.post_id=p.id AND e.event_type='click') AS click_count,
     (SELECT count(*)::integer FROM public.social_post_reactions r WHERE r.post_id=p.id) AS reaction_count,
     (SELECT count(*)::integer FROM public.social_post_comments cm WHERE cm.post_id=p.id AND cm.status='visible') AS comment_count,
     (SELECT count(*)::integer FROM public.social_post_saves s WHERE s.post_id=p.id) AS save_count,
     (SELECT count(*)::integer FROM public.social_post_events e WHERE e.post_id=p.id AND e.event_type='share') AS share_count,
     (SELECT count(*)::integer FROM public.social_post_events e WHERE e.post_id=p.id AND e.event_type='watch_complete') AS completion_count,
     COALESCE((SELECT sum(e.watch_ms) FROM public.social_post_events e WHERE e.post_id=p.id AND e.watch_ms IS NOT NULL),0)::numeric AS aggregate_watch_ms,
     (SELECT r.reaction FROM public.social_post_reactions r WHERE r.post_id=p.id AND r.user_id=v_uid) AS current_reaction,
     EXISTS(SELECT 1 FROM public.social_post_saves s WHERE s.post_id=p.id AND s.user_id=v_uid) AS is_saved,
     c.name AS community_name,c.slug AS community_slug,c.avatar_url AS community_avatar,
     CASE WHEN p.category IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_interest_profiles ip WHERE ip.user_id=v_uid AND p.category=ANY(ip.top_categories)) THEN 1 ELSE 0 END AS interest_hit,
     COALESCE((SELECT count(*)*2 FROM public.social_post_reactions r JOIN public.social_posts rp ON rp.id=r.post_id WHERE r.user_id=v_uid AND rp.author_id=p.author_id),0)
       + COALESCE((SELECT count(*)*3 FROM public.social_post_comments cm JOIN public.social_posts cp ON cp.id=cm.post_id WHERE cm.user_id=v_uid AND cp.author_id=p.author_id),0)
       + COALESCE((SELECT count(*)*4 FROM public.social_post_saves s JOIN public.social_posts sp ON sp.id=s.post_id WHERE s.user_id=v_uid AND sp.author_id=p.author_id),0) AS creator_affinity,
     COALESCE((SELECT count(*) FROM public.social_feed_session_items si JOIN public.social_posts hp ON hp.id=si.post_id WHERE si.session_id=v_session AND hp.author_id=p.author_id),0) AS creator_seen,
     COALESCE((SELECT count(*) FROM public.social_feed_session_items si JOIN public.social_posts hp ON hp.id=si.post_id WHERE si.session_id=v_session AND hp.category IS NOT DISTINCT FROM p.category),0) AS category_seen
   FROM public.social_posts p
   JOIN public.users u ON u.id=p.author_id
   LEFT JOIN public.communities c ON c.id=p.community_id
   WHERE public.social_can_view_post(p.id,v_uid) AND p.moderation_status='approved'
     AND NOT EXISTS(SELECT 1 FROM public.social_feed_session_items si WHERE si.session_id=v_session AND si.post_id=p.id)
     AND NOT EXISTS(SELECT 1 FROM public.social_post_events e WHERE e.user_id=v_uid AND e.post_id=p.id AND e.event_type='not_interested')
     AND NOT EXISTS(SELECT 1 FROM public.social_post_events e JOIN public.social_posts hp ON hp.id=e.post_id WHERE e.user_id=v_uid AND e.event_type='hide_creator' AND hp.author_id=p.author_id)
     AND (v_feed<>'mine' OR p.author_id=v_uid)
     AND (v_feed<>'following' OR EXISTS(SELECT 1 FROM public.user_follows f WHERE f.follower_id=v_uid AND f.following_id=p.author_id))
     AND (v_feed<>'friends' OR EXISTS(SELECT 1 FROM public.user_follows f1 JOIN public.user_follows f2 ON f2.follower_id=f1.following_id AND f2.following_id=f1.follower_id WHERE f1.follower_id=v_uid AND f1.following_id=p.author_id))
     AND (v_feed<>'community' OR p.community_id=p_community_id)
 ), ranked AS (
   SELECT b.*,
    (ln(1+GREATEST(b.aggregate_watch_ms,0)/1000.0)*v_watch + ln(1+GREATEST(b.completion_count,0))*v_completion + ln(1+GREATEST(b.save_count,0))*v_save + ln(1+GREATEST(b.share_count,0))*v_share + ln(1+GREATEST(b.comment_count,0))*v_comment + CASE WHEN b.is_following THEN v_follow ELSE 0 END + CASE WHEN b.is_friend THEN v_friend ELSE 0 END + LEAST(b.creator_affinity::numeric,20)*v_creator/20.0 + b.interest_hit*12 + ln(1+b.reaction_count+b.comment_count+b.save_count+b.share_count)*v_trend + GREATEST(0,1-EXTRACT(EPOCH FROM (now()-b.created_at))/604800.0)*v_recency + CASE WHEN b.created_at>now()-interval '48 hours' THEN v_fresh ELSE 0 END + CASE WHEN mod(abs(hashtextextended(b.id::text||v_session::text,0)),100)<v_explore THEN v_explore/2 ELSE 0 END - b.creator_seen*LEAST(v_negative,10) - b.category_seen*LEAST(v_negative/2,5))::numeric AS rank_score,
    CASE WHEN b.is_friend THEN 'From a friend' WHEN b.is_following THEN 'Because you follow this creator' WHEN b.interest_hit=1 THEN 'Based on your interests' WHEN b.community_id IS NOT NULL THEN 'From a community you may like' WHEN b.created_at>now()-interval '48 hours' THEN 'Fresh on DRIGHT' ELSE 'Recommended for you' END AS recommendation_reason
   FROM base b
 ), keyed AS (
   SELECT r.*,row_number() OVER(PARTITION BY r.author_id ORDER BY r.rank_score DESC,r.created_at DESC,r.id DESC) AS creator_batch_rank,row_number() OVER(PARTITION BY COALESCE(r.category,'__none__') ORDER BY r.rank_score DESC,r.created_at DESC,r.id DESC) AS category_batch_rank
   FROM ranked r
   WHERE v_cursor_score IS NULL OR r.rank_score<v_cursor_score OR (r.rank_score=v_cursor_score AND EXTRACT(EPOCH FROM r.created_at)<v_cursor_epoch) OR (r.rank_score=v_cursor_score AND EXTRACT(EPOCH FROM r.created_at)=v_cursor_epoch AND r.id<v_cursor_id)
 ), page_all AS (
   SELECT * FROM keyed WHERE creator_batch_rank<=GREATEST(v_creator_max,1) AND category_batch_rank<=GREATEST(v_category_max,1)
   ORDER BY CASE WHEN p_target_id IS NOT NULL AND id=p_target_id THEN 0 ELSE 1 END,rank_score DESC,created_at DESC,id DESC LIMIT v_limit+1
 ), page AS (
   SELECT * FROM page_all ORDER BY CASE WHEN p_target_id IS NOT NULL AND id=p_target_id THEN 0 ELSE 1 END,rank_score DESC,created_at DESC,id DESC LIMIT v_limit
 ), inserted AS (
   INSERT INTO public.social_feed_session_items(session_id,post_id,position,rank_score,recommendation_reason)
   SELECT v_session,p.id,(v_start_pos+(row_number() OVER(ORDER BY CASE WHEN p_target_id IS NOT NULL AND p.id=p_target_id THEN 0 ELSE 1 END,p.rank_score DESC,p.created_at DESC,p.id DESC)-1))::integer,p.rank_score,p.recommendation_reason FROM page p
   ON CONFLICT(session_id,post_id) DO NOTHING RETURNING post_id
 )
 SELECT jsonb_build_object(
   'items',COALESCE(jsonb_agg(to_jsonb(page)-'rank_score'-'creator_batch_rank'-'category_batch_rank'-'aggregate_watch_ms'-'completion_count'-'share_count'-'interest_hit'-'creator_affinity'-'creator_seen'-'category_seen' ORDER BY CASE WHEN p_target_id IS NOT NULL AND page.id=p_target_id THEN 0 ELSE 1 END,page.rank_score DESC,page.created_at DESC,page.id DESC),'[]'::jsonb),
   'has_more',(SELECT count(*) FROM page_all)>v_limit,
   'next_cursor',(SELECT rank_score::text||'|'||EXTRACT(EPOCH FROM created_at)::text||'|'||id::text FROM page ORDER BY rank_score ASC,created_at ASC,id ASC LIMIT 1),
   'session_id',v_session,'feed',v_feed
 ) INTO v_result FROM page;
 UPDATE public.social_feed_sessions SET last_activity_at=now() WHERE id=v_session;
 RETURN COALESCE(v_result,jsonb_build_object('items','[]'::jsonb,'has_more',false,'next_cursor',NULL,'session_id',v_session,'feed',v_feed));
END; $$;

CREATE OR REPLACE FUNCTION public.update_social_session_position(p_session_id uuid,p_post_id uuid,p_position integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$ DECLARE v_uid uuid:=auth.uid(); BEGIN UPDATE public.social_feed_sessions SET current_post_id=p_post_id,current_position=GREATEST(COALESCE(p_position,0),0),last_activity_at=now() WHERE id=p_session_id AND user_id=v_uid AND expires_at>now(); RETURN FOUND; END; $$;
CREATE OR REPLACE FUNCTION public.get_social_session_state(p_session_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$ DECLARE v_uid uuid:=auth.uid(); BEGIN RETURN (SELECT jsonb_build_object('session_id',id,'feed',feed_mode,'community_id',community_id,'current_post_id',current_post_id,'current_position',current_position,'started_at',started_at,'last_activity_at',last_activity_at,'expires_at',expires_at) FROM public.social_feed_sessions WHERE id=p_session_id AND user_id=v_uid AND expires_at>now()); END; $$;

CREATE OR REPLACE FUNCTION public.get_social_account_suggestions(p_mode text DEFAULT 'following',p_limit integer DEFAULT 12) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_uid uuid:=auth.uid(); v_result jsonb; BEGIN IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.mutual_score DESC,x.followers DESC),'[]'::jsonb) INTO v_result FROM (SELECT u.id,CASE WHEN u.show_full_name AND u.privacy_full_name='public' THEN u.full_name ELSE NULL END AS full_name,u.username,u.avatar_url,COALESCE(u.is_verified,false) AS is_verified,(SELECT count(*) FROM public.user_follows f WHERE f.following_id=u.id)::integer AS followers,(SELECT count(*) FROM public.user_follows a JOIN public.user_follows b ON b.following_id=a.follower_id AND b.follower_id=v_uid WHERE a.following_id=u.id)::integer AS mutual_score FROM public.users u WHERE u.id<>v_uid AND COALESCE(upper(u.account_status),'ACTIVE')='ACTIVE' AND NOT EXISTS(SELECT 1 FROM public.user_follows f WHERE f.follower_id=v_uid AND f.following_id=u.id) AND NOT EXISTS(SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id=v_uid AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=v_uid)) ORDER BY mutual_score DESC,followers DESC,u.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,12),1),30)) x; RETURN v_result; END; $$;

CREATE OR REPLACE FUNCTION public.get_social_runtime_settings() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$ SELECT jsonb_build_object('algorithm',(SELECT to_jsonb(a) FROM public.algorithm_settings a WHERE a.is_singleton=true LIMIT 1),'social',(SELECT s.social_config FROM public.system_config s WHERE s.singleton=true LIMIT 1),'community',(SELECT s.community_config FROM public.system_config s WHERE s.singleton=true LIMIT 1),'sponsored',(SELECT jsonb_build_object('enabled',social_feed_enabled,'min_organic_between_ads',social_min_organic_between_ads,'max_ads_per_session',social_max_ads_per_session,'same_campaign_daily_cap',social_same_campaign_daily_cap) FROM public.promotion_distribution_settings LIMIT 1)); $$;

CREATE OR REPLACE FUNCTION public.search_dright_social_entities(p_query text,p_limit integer DEFAULT 20) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_uid uuid:=auth.uid(); v_q text:=trim(COALESCE(p_query,'')); v_result jsonb; BEGIN IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF char_length(v_q)<2 THEN RETURN '[]'::jsonb; END IF;
 WITH matches AS (
   SELECT 'community'::text AS entity_type,c.id,c.name AS title,c.slug AS subtitle,c.avatar_url AS image_url,'/communities/'||c.slug AS path,3 AS weight FROM public.communities c WHERE public.community_can_view(c.id,v_uid) AND c.status IN ('active','restricted') AND (c.name ILIKE '%'||v_q||'%' OR c.slug ILIKE '%'||v_q||'%' OR c.public_id ILIKE '%'||v_q||'%' OR COALESCE(c.category,'') ILIKE '%'||v_q||'%')
   UNION ALL SELECT 'creator',u.id,COALESCE(CASE WHEN u.show_full_name AND u.privacy_full_name='public' THEN NULLIF(u.full_name,'') END,u.username),'@'||u.username,u.avatar_url,'/profile/'||u.id,2 FROM public.users u WHERE COALESCE(upper(u.account_status),'ACTIVE')='ACTIVE' AND (u.username ILIKE '%'||v_q||'%' OR (u.show_full_name AND u.privacy_full_name='public' AND COALESCE(u.full_name,'') ILIKE '%'||v_q||'%')) AND NOT EXISTS(SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id=v_uid AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=v_uid))
   UNION ALL SELECT 'social_post',p.id,left(COALESCE(NULLIF(p.body,''),'Social post'),90),COALESCE('@'||u.username,c.name),u.avatar_url,'/social?post='||p.id,1 FROM public.social_posts p JOIN public.users u ON u.id=p.author_id LEFT JOIN public.communities c ON c.id=p.community_id WHERE public.social_can_view_post(p.id,v_uid) AND p.moderation_status='approved' AND (p.body ILIKE '%'||v_q||'%' OR v_q=ANY(p.topic_tags) OR COALESCE(p.category,'') ILIKE '%'||v_q||'%')
 ), limited AS (SELECT * FROM matches ORDER BY weight DESC,title LIMIT LEAST(GREATEST(COALESCE(p_limit,20),1),50))
 SELECT COALESCE(jsonb_agg(to_jsonb(limited) ORDER BY weight DESC,title),'[]'::jsonb) INTO v_result FROM limited; RETURN v_result; END; $$;

CREATE OR REPLACE FUNCTION public.get_social_community_analytics(p_days integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_uid uuid:=auth.uid(); v_since timestamptz:=now()-(LEAST(GREATEST(COALESCE(p_days,30),1),365)||' days')::interval; BEGIN IF v_uid IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF; RETURN jsonb_build_object('social_sessions',(SELECT count(*) FROM public.social_feed_sessions WHERE started_at>=v_since),'social_unique_users',(SELECT count(DISTINCT user_id) FROM public.social_feed_sessions WHERE started_at>=v_since),'social_posts',(SELECT count(*) FROM public.social_posts WHERE created_at>=v_since),'video_starts',(SELECT count(*) FROM public.social_post_events WHERE event_type='view_start' AND created_at>=v_since),'video_clicks',(SELECT count(*) FROM public.social_post_events WHERE event_type='click' AND created_at>=v_since),'video_completions',(SELECT count(*) FROM public.social_post_events WHERE event_type='watch_complete' AND created_at>=v_since),'shares',(SELECT count(*) FROM public.social_post_events WHERE event_type='share' AND created_at>=v_since),'negative_feedback',(SELECT count(*) FROM public.social_post_events WHERE event_type IN ('not_interested','hide_creator','report') AND created_at>=v_since),'communities',(SELECT count(*) FROM public.communities WHERE created_at>=v_since),'community_active_members',(SELECT count(*) FROM public.community_members WHERE state='active'),'community_posts',(SELECT count(*) FROM public.social_posts WHERE community_id IS NOT NULL AND created_at>=v_since)); END; $$;

DO $$ DECLARE fn text; BEGIN FOREACH fn IN ARRAY ARRAY['record_social_post_click(uuid,uuid)','record_social_video_start(uuid,uuid)','record_social_video_progress(uuid,text,integer,numeric,uuid)','record_social_entity_click(uuid,uuid)','record_social_post_event(uuid,text,integer)','get_social_feed_v2(text,text,integer,uuid,uuid,uuid)','update_social_session_position(uuid,uuid,integer)','get_social_session_state(uuid)','get_social_account_suggestions(text,integer)','get_social_runtime_settings()','search_dright_social_entities(text,integer)','get_social_community_analytics(integer)'] LOOP EXECUTE 'REVOKE ALL ON FUNCTION public.'||fn||' FROM PUBLIC,anon'; EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||fn||' TO authenticated,service_role'; END LOOP; END $$;