-- Community management, Social rate limits and admin-controlled tuning.

CREATE OR REPLACE FUNCTION public.update_community(
 p_community_id uuid,p_name text,p_description text,p_visibility text,p_category text,p_country text,p_location text,p_avatar_url text,p_banner_url text,p_monetization_enabled boolean,p_premium_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_role text; v_cfg jsonb;
BEGIN
 SELECT role INTO v_role FROM public.community_members WHERE community_id=p_community_id AND user_id=v_uid AND state='active';
 IF NOT (v_role IN ('owner','admin') OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Community owner/admin permission required'; END IF;
 IF lower(p_visibility) NOT IN ('public','private','hidden') THEN RAISE EXCEPTION 'Invalid visibility'; END IF;
 SELECT community_config INTO v_cfg FROM public.system_config WHERE singleton=true LIMIT 1;
 UPDATE public.communities SET name=trim(p_name),description=NULLIF(trim(COALESCE(p_description,'')),''),visibility=lower(p_visibility),category=NULLIF(trim(COALESCE(p_category,'')),''),country=NULLIF(trim(COALESCE(p_country,'')),''),location=NULLIF(trim(COALESCE(p_location,'')),''),avatar_url=NULLIF(trim(COALESCE(p_avatar_url,'')),''),banner_url=NULLIF(trim(COALESCE(p_banner_url,'')),''),monetization_enabled=COALESCE(p_monetization_enabled,false) AND COALESCE((v_cfg->>'monetization_enabled')::boolean,true),premium_enabled=COALESCE(p_premium_enabled,false) AND COALESCE((v_cfg->>'monetization_enabled')::boolean,true),updated_at=now() WHERE id=p_community_id;
 INSERT INTO public.community_moderation_log(community_id,actor_id,target_type,target_id,action,metadata) VALUES(p_community_id,v_uid,'community',p_community_id,'settings_updated',jsonb_build_object('visibility',p_visibility));
 RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_community(p_community_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
 IF NOT (public.community_has_role(p_community_id,ARRAY['owner']::text[],v_uid) OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Community owner permission required'; END IF;
 UPDATE public.communities SET status='archived',updated_at=now() WHERE id=p_community_id;
 UPDATE public.social_posts SET is_active=false,updated_at=now() WHERE community_id=p_community_id;
 INSERT INTO public.community_moderation_log(community_id,actor_id,target_type,target_id,action) VALUES(p_community_id,v_uid,'community',p_community_id,'archived');
 RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_community_ownership(p_community_id uuid,p_new_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
 IF NOT public.community_has_role(p_community_id,ARRAY['owner']::text[],v_uid) THEN RAISE EXCEPTION 'Only the current owner may transfer ownership'; END IF;
 IF p_new_owner_id=v_uid THEN RETURN true; END IF;
 IF NOT public.community_is_active_member(p_community_id,p_new_owner_id) THEN RAISE EXCEPTION 'New owner must be an active community member'; END IF;
 UPDATE public.community_members SET role='admin',updated_at=now() WHERE community_id=p_community_id AND user_id=v_uid;
 UPDATE public.community_members SET role='owner',updated_at=now() WHERE community_id=p_community_id AND user_id=p_new_owner_id;
 UPDATE public.communities SET owner_id=p_new_owner_id,updated_at=now() WHERE id=p_community_id;
 INSERT INTO public.community_moderation_log(community_id,actor_id,target_type,target_id,action,metadata) VALUES(p_community_id,v_uid,'member',p_new_owner_id,'ownership_transferred',jsonb_build_object('previous_owner',v_uid));
 INSERT INTO public.social_notifications(user_id,actor_id,notification_type,entity_type,entity_id,metadata) VALUES(p_new_owner_id,v_uid,'community_new_owner','community',p_community_id,'{}'::jsonb);
 RETURN true;
END;
$$;

-- Social posting remains RPC-authoritative and rate limited.
CREATE OR REPLACE FUNCTION public.create_social_post(
  p_body text,p_media_path text,p_media_type text,p_visibility text,p_comments_enabled boolean,p_allowed_reactions text[],p_media_width integer,p_media_height integer
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_id uuid; v_body text:=COALESCE(p_body,''); v_path text:=NULLIF(trim(COALESCE(p_media_path,'')),''); v_visibility text:=lower(trim(COALESCE(p_visibility,'public'))); v_allowed text[]:=COALESCE(p_allowed_reactions,ARRAY['like','love','care','haha','wow','sad','angry']::text[]); v_max integer:=30;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT COALESCE((social_config->>'max_posts_per_hour')::integer,30) INTO v_max FROM public.system_config WHERE singleton=true LIMIT 1; v_max:=LEAST(GREATEST(COALESCE(v_max,30),1),200);
 IF (SELECT count(*) FROM public.social_posts WHERE author_id=v_uid AND created_at>now()-interval '1 hour')>=v_max THEN RAISE EXCEPTION 'Social posting rate limit reached'; END IF;
 IF char_length(v_body)>5000 THEN RAISE EXCEPTION 'Post text is too long'; END IF;
 IF length(trim(v_body))=0 AND v_path IS NULL THEN RAISE EXCEPTION 'Add text, a photo, or a video'; END IF;
 IF v_visibility NOT IN ('public','followers','friends','private') THEN RAISE EXCEPTION 'Invalid visibility'; END IF;
 IF v_path IS NOT NULL AND (p_media_type NOT IN ('image','video') OR v_path NOT LIKE v_uid::text||'/%' OR position('..' in v_path)>0) THEN RAISE EXCEPTION 'Invalid social media path'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(v_allowed) r WHERE r NOT IN ('like','love','care','haha','wow','sad','angry')) THEN RAISE EXCEPTION 'Invalid reaction option'; END IF;
 INSERT INTO public.social_posts(author_id,body,media_path,media_type,media_width,media_height,visibility,comments_enabled,allowed_reactions,source_type,moderation_status) VALUES(v_uid,v_body,v_path,CASE WHEN v_path IS NULL THEN NULL ELSE p_media_type END,p_media_width,p_media_height,v_visibility,COALESCE(p_comments_enabled,true),v_allowed,'user','approved') RETURNING id INTO v_id;
 INSERT INTO public.activity_feed(user_id,event_type,category,title,description,related_id,related_type,metadata) VALUES(v_uid,'social_post_created','social','Posted on Social',left(v_body,280),v_id,'social_post',jsonb_build_object('media_type',p_media_type,'visibility',v_visibility));
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_social_community_settings(p_settings jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_alg jsonb:=COALESCE(p_settings->'algorithm','{}'::jsonb); v_comm jsonb:=COALESCE(p_settings->'community','{}'::jsonb); v_social jsonb:=COALESCE(p_settings->'social','{}'::jsonb); v_ads jsonb:=COALESCE(p_settings->'sponsored','{}'::jsonb);
BEGIN
 IF v_uid IS NULL OR NOT (public.is_super_admin() OR public.has_rbac_permission('algorithm','manage')) THEN RAISE EXCEPTION 'Algorithm administration permission required'; END IF;
 UPDATE public.algorithm_settings SET social_feed_batch_size=LEAST(GREATEST(COALESCE((v_alg->>'social_feed_batch_size')::integer,social_feed_batch_size),5),50),social_exploration_percentage=LEAST(GREATEST(COALESCE((v_alg->>'social_exploration_percentage')::numeric,social_exploration_percentage),0),50),social_recency_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_recency_weight')::numeric,social_recency_weight),0),100),social_watch_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_watch_weight')::numeric,social_watch_weight),0),100),social_completion_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_completion_weight')::numeric,social_completion_weight),0),100),social_save_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_save_weight')::numeric,social_save_weight),0),100),social_share_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_share_weight')::numeric,social_share_weight),0),100),social_comment_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_comment_weight')::numeric,social_comment_weight),0),100),social_follow_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_follow_weight')::numeric,social_follow_weight),0),100),social_friend_affinity=LEAST(GREATEST(COALESCE((v_alg->>'social_friend_affinity')::numeric,social_friend_affinity),0),100),social_creator_affinity=LEAST(GREATEST(COALESCE((v_alg->>'social_creator_affinity')::numeric,social_creator_affinity),0),100),social_trend_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_trend_weight')::numeric,social_trend_weight),0),100),social_fresh_boost=LEAST(GREATEST(COALESCE((v_alg->>'social_fresh_boost')::numeric,social_fresh_boost),0),100),social_negative_penalty=LEAST(GREATEST(COALESCE((v_alg->>'social_negative_penalty')::numeric,social_negative_penalty),0),100),social_creator_max_per_window=LEAST(GREATEST(COALESCE((v_alg->>'social_creator_max_per_window')::integer,social_creator_max_per_window),1),10),social_category_max_per_window=LEAST(GREATEST(COALESCE((v_alg->>'social_category_max_per_window')::integer,social_category_max_per_window),1),10),social_qualified_view_ms=LEAST(GREATEST(COALESCE((v_alg->>'social_qualified_view_ms')::integer,social_qualified_view_ms),500),30000),social_fast_skip_ms=LEAST(GREATEST(COALESCE((v_alg->>'social_fast_skip_ms')::integer,social_fast_skip_ms),250),10000),updated_at=now() WHERE is_singleton=true;
 UPDATE public.system_config SET community_config=community_config||v_comm,social_config=social_config||v_social,updated_at=now(),updated_by=v_uid WHERE singleton=true;
 UPDATE public.promotion_distribution_settings SET social_feed_enabled=COALESCE((v_ads->>'enabled')::boolean,social_feed_enabled),social_min_organic_between_ads=LEAST(GREATEST(COALESCE((v_ads->>'min_organic_between_ads')::integer,social_min_organic_between_ads),2),50),social_max_ads_per_session=LEAST(GREATEST(COALESCE((v_ads->>'max_ads_per_session')::integer,social_max_ads_per_session),0),20),social_same_campaign_daily_cap=LEAST(GREATEST(COALESCE((v_ads->>'same_campaign_daily_cap')::integer,social_same_campaign_daily_cap),1),20),updated_at=now(),updated_by=v_uid;
 PERFORM public.log_admin_activity('update_social_community_settings','system',NULL,p_settings);
 RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_community(uuid,text,text,text,text,text,text,text,text,boolean,boolean),public.archive_community(uuid),public.transfer_community_ownership(uuid,uuid),public.create_social_post(text,text,text,text,boolean,text[],integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_community(uuid,text,text,text,text,text,text,text,text,boolean,boolean),public.archive_community(uuid),public.transfer_community_ownership(uuid,uuid),public.create_social_post(text,text,text,text,boolean,text[],integer,integer) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_update_social_community_settings(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_social_community_settings(jsonb) TO authenticated,service_role;
