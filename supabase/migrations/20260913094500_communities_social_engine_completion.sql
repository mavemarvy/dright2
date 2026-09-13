-- DRIGHT2 Communities + Social Field completion
-- Forward-only production migration. Reuses users, user_follows, social posts,
-- analytics, chat, moderation and promotion infrastructure.

-- ---------------------------------------------------------------------------
-- Config extensions
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS show_full_name boolean NOT NULL DEFAULT true;

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
  ADD COLUMN IF NOT EXISTS community_config jsonb NOT NULL DEFAULT '{"creation_enabled":true,"creation_min_followers":100,"max_communities_per_user":10,"monetization_enabled":true,"premium_platform_fee_percent":10,"max_posts_per_hour":30}'::jsonb,
  ADD COLUMN IF NOT EXISTS social_config jsonb NOT NULL DEFAULT '{"enabled":true,"session_expiry_hours":24,"max_posts_per_hour":30,"click_dedupe_seconds":2,"recommendation_reasons":true}'::jsonb;

ALTER TABLE public.promotion_distribution_settings
  ADD COLUMN IF NOT EXISTS social_feed_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS social_min_organic_between_ads integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS social_max_ads_per_session integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS social_same_campaign_daily_cap integer NOT NULL DEFAULT 2;

-- ---------------------------------------------------------------------------
-- Communities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text NULL CHECK (description IS NULL OR char_length(description) <= 5000),
  avatar_url text NULL,
  banner_url text NULL,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','hidden')),
  category text NULL,
  country text NULL,
  location text NULL,
  member_count integer NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  follower_count integer NOT NULL DEFAULT 0 CHECK (follower_count >= 0),
  post_count integer NOT NULL DEFAULT 0 CHECK (post_count >= 0),
  is_verified boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','restricted','suspended','archived')),
  creation_requirement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  monetization_enabled boolean NOT NULL DEFAULT false,
  premium_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_members (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','moderator','member')),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','pending','invited','declined','banned','left')),
  invited_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  joined_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.community_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','revoked','expired')),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz NULL,
  UNIQUE (community_id,invited_user_id,status)
);

CREATE TABLE IF NOT EXISTS public.community_member_mutes (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  muted_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id,user_id,muted_user_id),
  CHECK (user_id <> muted_user_id)
);

CREATE TABLE IF NOT EXISTS public.community_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  target_type text NOT NULL CHECK (target_type IN ('community','member','post','message')),
  target_id uuid NULL,
  action text NOT NULL,
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_membership_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 80),
  description text NULL,
  price numeric(18,2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'USD',
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_membership_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE RESTRICT,
  tier_id uuid NOT NULL REFERENCES public.community_membership_tiers(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount numeric(18,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  platform_fee_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (platform_fee_amount >= 0),
  owner_earning_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (owner_earning_amount >= 0),
  payment_reference text NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','reversed','failed')),
  paid_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communities_owner ON public.communities(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communities_discovery ON public.communities(status,visibility,is_featured,member_count DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_communities_category ON public.communities(category,status,visibility);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON public.community_members(user_id,state,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_members_community_state ON public.community_members(community_id,state,role);
CREATE INDEX IF NOT EXISTS idx_community_invites_user ON public.community_invites(invited_user_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_community_moderation_log ON public.community_moderation_log(community_id,created_at DESC);

-- ---------------------------------------------------------------------------
-- Extend the existing Social content model instead of creating community posts
-- ---------------------------------------------------------------------------
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS community_id uuid NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'user' CHECK (source_type IN ('user','community')),
  ADD COLUMN IF NOT EXISTS category text NULL,
  ADD COLUMN IF NOT EXISTS topic_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS linked_entity_type text NULL CHECK (linked_entity_type IS NULL OR linked_entity_type IN ('product','service','course','job','store','creator','community')),
  ADD COLUMN IF NOT EXISTS linked_entity_id uuid NULL,
  ADD COLUMN IF NOT EXISTS linked_entity_url text NULL,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('approved','pending','hidden','rejected'));

CREATE INDEX IF NOT EXISTS idx_social_posts_community_created ON public.social_posts(community_id,created_at DESC) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_social_posts_category_created ON public.social_posts(category,created_at DESC) WHERE is_active AND moderation_status='approved';
CREATE INDEX IF NOT EXISTS idx_social_posts_author_active_created ON public.social_posts(author_id,created_at DESC) WHERE is_active AND moderation_status='approved';

-- ---------------------------------------------------------------------------
-- Social feed sessions / telemetry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_feed_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  feed_mode text NOT NULL CHECK (feed_mode IN ('social','following','friends','mine','community')),
  community_id uuid NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  current_post_id uuid NULL REFERENCES public.social_posts(id) ON DELETE SET NULL,
  current_position integer NOT NULL DEFAULT 0 CHECK (current_position >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.social_feed_session_items (
  session_id uuid NOT NULL REFERENCES public.social_feed_sessions(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  position integer NOT NULL,
  rank_score numeric NOT NULL DEFAULT 0,
  recommendation_reason text NULL,
  served_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz NULL,
  PRIMARY KEY (session_id,post_id),
  UNIQUE (session_id,position)
);

CREATE INDEX IF NOT EXISTS idx_social_feed_sessions_user_activity ON public.social_feed_sessions(user_id,last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_feed_items_session_position ON public.social_feed_session_items(session_id,position);
CREATE INDEX IF NOT EXISTS idx_social_feed_items_post ON public.social_feed_session_items(post_id,served_at DESC);

ALTER TABLE public.social_post_events
  ADD COLUMN IF NOT EXISTS watch_ms integer NULL CHECK (watch_ms IS NULL OR (watch_ms >= 0 AND watch_ms <= 86400000)),
  ADD COLUMN IF NOT EXISTS completion_ratio numeric NULL CHECK (completion_ratio IS NULL OR (completion_ratio >= 0 AND completion_ratio <= 1.5)),
  ADD COLUMN IF NOT EXISTS session_id uuid NULL REFERENCES public.social_feed_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.social_post_events DROP CONSTRAINT IF EXISTS social_post_events_event_type_check;
ALTER TABLE public.social_post_events ADD CONSTRAINT social_post_events_event_type_check CHECK (event_type IN (
  'impression','click','view_start','qualified_view','pause','resume','watch_complete','replay','skip','dwell',
  'share','not_interested','hide_creator','profile_visit','follow','unfollow','entity_click','report'
));

ALTER TABLE public.social_post_views
  ADD COLUMN IF NOT EXISTS first_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS play_count integer NOT NULL DEFAULT 1 CHECK (play_count >= 1),
  ADD COLUMN IF NOT EXISTS qualified_view_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS total_watch_ms bigint NOT NULL DEFAULT 0 CHECK (total_watch_ms >= 0),
  ADD COLUMN IF NOT EXISTS last_completion_ratio numeric NOT NULL DEFAULT 0 CHECK (last_completion_ratio >= 0 AND last_completion_ratio <= 1.5);

CREATE INDEX IF NOT EXISTS idx_social_events_post_type_created ON public.social_post_events(post_id,event_type,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_events_user_created ON public.social_post_events(user_id,created_at DESC);

-- Reuse existing chat conversations for community channels.
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS community_id uuid NULL REFERENCES public.communities(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_one_community_channel ON public.chat_conversations(community_id) WHERE community_id IS NOT NULL AND channel_type='community';

-- ---------------------------------------------------------------------------
-- Security helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_is_active_member(p_community_id uuid,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.community_members m
    WHERE m.community_id=p_community_id AND m.user_id=p_user_id AND m.state='active'
  );
$$;

CREATE OR REPLACE FUNCTION public.community_has_role(p_community_id uuid,p_roles text[],p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.community_members m
    WHERE m.community_id=p_community_id AND m.user_id=p_user_id AND m.state='active' AND m.role=ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.community_can_view(p_community_id uuid,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id=p_community_id
      AND (
        public.is_platform_admin()
        OR c.owner_id=p_user_id
        OR (c.status IN ('active','restricted') AND c.visibility IN ('public','private'))
        OR public.community_is_active_member(c.id,p_user_id)
      )
      AND (c.visibility <> 'hidden' OR public.community_is_active_member(c.id,p_user_id) OR c.owner_id=p_user_id OR public.is_platform_admin())
  );
$$;

REVOKE ALL ON FUNCTION public.community_is_active_member(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.community_has_role(uuid,text[],uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.community_can_view(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_is_active_member(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.community_has_role(uuid,text[],uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.community_can_view(uuid,uuid) TO authenticated,service_role;

-- Replace the original Social visibility helper to include communities and moderation.
CREATE OR REPLACE FUNCTION public.social_can_view_post(p_post_id uuid,p_viewer uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.social_posts p
    JOIN public.users u ON u.id=p.author_id
    LEFT JOIN public.communities c ON c.id=p.community_id
    WHERE p.id=p_post_id
      AND p.is_active=true
      AND p_viewer IS NOT NULL
      AND (p.author_id=p_viewer OR p.moderation_status='approved' OR public.is_platform_admin())
      AND COALESCE(upper(u.account_status),'ACTIVE') <> 'BANNED'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_id=p_viewer AND b.blocked_id=p.author_id)
           OR (b.blocker_id=p.author_id AND b.blocked_id=p_viewer)
      )
      AND (
        p.author_id=p_viewer
        OR public.is_platform_admin()
        OR (
          p.community_id IS NULL
          AND (
            p.visibility='public'
            OR (p.visibility='followers' AND EXISTS (SELECT 1 FROM public.user_follows f WHERE f.follower_id=p_viewer AND f.following_id=p.author_id))
            OR (p.visibility='friends' AND EXISTS (
              SELECT 1 FROM public.user_follows f1
              JOIN public.user_follows f2 ON f2.follower_id=f1.following_id AND f2.following_id=f1.follower_id
              WHERE f1.follower_id=p_viewer AND f1.following_id=p.author_id
            ))
          )
        )
        OR (
          p.community_id IS NOT NULL
          AND c.status IN ('active','restricted')
          AND (
            public.community_is_active_member(c.id,p_viewer)
            OR (c.visibility='public' AND p.visibility='public')
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.social_can_view_post(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.social_can_view_post(uuid,uuid) TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_member_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_moderation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_membership_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_feed_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_feed_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communities_read_authorized ON public.communities;
CREATE POLICY communities_read_authorized ON public.communities FOR SELECT TO authenticated USING (public.community_can_view(id,auth.uid()));
DROP POLICY IF EXISTS community_members_read_authorized ON public.community_members;
CREATE POLICY community_members_read_authorized ON public.community_members FOR SELECT TO authenticated USING (public.community_can_view(community_id,auth.uid()));
DROP POLICY IF EXISTS community_invites_read_own ON public.community_invites;
CREATE POLICY community_invites_read_own ON public.community_invites FOR SELECT TO authenticated USING (invited_user_id=auth.uid() OR invited_by=auth.uid() OR public.community_has_role(community_id,ARRAY['owner','admin','moderator']::text[],auth.uid()));
DROP POLICY IF EXISTS community_mutes_own ON public.community_member_mutes;
CREATE POLICY community_mutes_own ON public.community_member_mutes FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid() AND public.community_is_active_member(community_id,auth.uid()));
DROP POLICY IF EXISTS community_moderation_read_staff ON public.community_moderation_log;
CREATE POLICY community_moderation_read_staff ON public.community_moderation_log FOR SELECT TO authenticated USING (public.community_has_role(community_id,ARRAY['owner','admin','moderator']::text[],auth.uid()) OR public.is_platform_admin());
DROP POLICY IF EXISTS community_tiers_read ON public.community_membership_tiers;
CREATE POLICY community_tiers_read ON public.community_membership_tiers FOR SELECT TO authenticated USING (is_active AND public.community_can_view(community_id,auth.uid()));
DROP POLICY IF EXISTS community_payments_own ON public.community_membership_payments;
CREATE POLICY community_payments_own ON public.community_membership_payments FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.community_has_role(community_id,ARRAY['owner','admin']::text[],auth.uid()) OR public.is_platform_admin());
DROP POLICY IF EXISTS social_sessions_own ON public.social_feed_sessions;
CREATE POLICY social_sessions_own ON public.social_feed_sessions FOR SELECT TO authenticated USING (user_id=auth.uid());
DROP POLICY IF EXISTS social_session_items_own ON public.social_feed_session_items;
CREATE POLICY social_session_items_own ON public.social_feed_session_items FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.social_feed_sessions s WHERE s.id=session_id AND s.user_id=auth.uid()));

-- Community chat access extends the existing chat policies without replacing them.
DROP POLICY IF EXISTS community_chat_conversation_read ON public.chat_conversations;
CREATE POLICY community_chat_conversation_read ON public.chat_conversations FOR SELECT TO authenticated USING (community_id IS NOT NULL AND public.community_is_active_member(community_id,auth.uid()));
DROP POLICY IF EXISTS community_chat_message_read ON public.chat_messages;
CREATE POLICY community_chat_message_read ON public.chat_messages FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.chat_conversations c WHERE c.id=conversation_id AND c.community_id IS NOT NULL AND public.community_is_active_member(c.community_id,auth.uid())));
DROP POLICY IF EXISTS community_chat_message_insert ON public.chat_messages;
CREATE POLICY community_chat_message_insert ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (sender_id=auth.uid() AND EXISTS(SELECT 1 FROM public.chat_conversations c WHERE c.id=conversation_id AND c.community_id IS NOT NULL AND public.community_is_active_member(c.community_id,auth.uid())));

REVOKE INSERT,UPDATE,DELETE ON public.communities FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.community_members FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.community_invites FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.community_moderation_log FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.community_membership_tiers FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.community_membership_payments FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.social_feed_sessions FROM anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.social_feed_session_items FROM anon,authenticated;
GRANT SELECT ON public.communities,public.community_members,public.community_invites,public.community_member_mutes,public.community_moderation_log,public.community_membership_tiers,public.community_membership_payments,public.social_feed_sessions,public.social_feed_session_items TO authenticated;
GRANT ALL ON public.communities,public.community_members,public.community_invites,public.community_member_mutes,public.community_moderation_log,public.community_membership_tiers,public.community_membership_payments,public.social_feed_sessions,public.social_feed_session_items TO service_role;

-- ---------------------------------------------------------------------------
-- Public-profile safe contract. Never returns admin/RBAC fields.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_profile_safe(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE
  v_viewer uuid:=auth.uid();
  v_user public.users%ROWTYPE;
  v_following boolean:=false;
  v_profile_allowed boolean:=false;
BEGIN
  IF v_viewer IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_user FROM public.users WHERE id=p_user_id AND COALESCE(upper(account_status),'ACTIVE') <> 'BANNED';
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_following:=EXISTS(SELECT 1 FROM public.user_follows f WHERE f.follower_id=v_viewer AND f.following_id=p_user_id);
  v_profile_allowed:=v_viewer=p_user_id OR v_user.privacy_profile='public' OR (v_user.privacy_profile='followers_only' AND v_following);
  RETURN jsonb_build_object(
    'id',v_user.id,
    'username',v_user.username,
    'full_name',CASE WHEN v_user.show_full_name AND v_profile_allowed THEN v_user.full_name ELSE NULL END,
    'avatar_url',v_user.avatar_url,
    'cover_image',CASE WHEN v_profile_allowed THEN v_user.cover_image ELSE NULL END,
    'bio',CASE WHEN v_profile_allowed THEN v_user.bio ELSE NULL END,
    'country',CASE WHEN v_profile_allowed THEN v_user.country ELSE NULL END,
    'state',CASE WHEN v_profile_allowed THEN v_user.state ELSE NULL END,
    'city',CASE WHEN v_profile_allowed THEN v_user.city ELSE NULL END,
    'website',CASE WHEN v_profile_allowed THEN v_user.website ELSE NULL END,
    'languages',CASE WHEN v_profile_allowed THEN COALESCE(v_user.languages,'{}'::text[]) ELSE '{}'::text[] END,
    'created_at',CASE WHEN v_profile_allowed THEN v_user.created_at ELSE NULL END,
    'is_verified',COALESCE(v_user.is_verified,false),
    'profile_allowed',v_profile_allowed,
    'privacy_activity',v_user.privacy_activity,
    'privacy_portfolio',v_user.privacy_portfolio,
    'is_following',v_following
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_profile_safe(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_safe(uuid) TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Community service layer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_community(
  p_name text,p_slug text,p_description text DEFAULT NULL,p_visibility text DEFAULT 'public',p_category text DEFAULT NULL,p_country text DEFAULT NULL,p_location text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_cfg jsonb; v_min integer; v_max integer; v_followers integer; v_existing integer; v_id uuid; v_slug text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT community_config INTO v_cfg FROM public.system_config WHERE singleton=true LIMIT 1;
  v_cfg:=COALESCE(v_cfg,'{}'::jsonb);
  IF COALESCE((v_cfg->>'creation_enabled')::boolean,true)=false THEN RAISE EXCEPTION 'Community creation is currently disabled'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=v_uid AND COALESCE(upper(account_status),'ACTIVE')='ACTIVE') THEN RAISE EXCEPTION 'Account is not eligible to create communities'; END IF;
  v_min:=COALESCE((v_cfg->>'creation_min_followers')::integer,100);
  v_max:=COALESCE((v_cfg->>'max_communities_per_user')::integer,10);
  SELECT count(*)::integer INTO v_followers FROM public.user_follows WHERE following_id=v_uid;
  IF v_followers<v_min THEN RAISE EXCEPTION 'You need at least % followers to create a community',v_min; END IF;
  SELECT count(*)::integer INTO v_existing FROM public.communities WHERE owner_id=v_uid AND status<>'archived';
  IF v_existing>=v_max THEN RAISE EXCEPTION 'Community creation limit reached'; END IF;
  IF p_visibility NOT IN ('public','private','hidden') THEN RAISE EXCEPTION 'Invalid community visibility'; END IF;
  v_slug:=lower(trim(p_slug));
  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Community slug may contain lowercase letters, numbers and hyphens'; END IF;
  IF EXISTS(SELECT 1 FROM public.communities WHERE slug=v_slug) THEN RAISE EXCEPTION 'Community slug is already in use'; END IF;

  INSERT INTO public.communities(owner_id,name,slug,description,visibility,category,country,location,member_count,creation_requirement_snapshot,monetization_enabled)
  VALUES(v_uid,trim(p_name),v_slug,NULLIF(trim(COALESCE(p_description,'')),''),p_visibility,NULLIF(trim(COALESCE(p_category,'')),''),NULLIF(trim(COALESCE(p_country,'')),''),NULLIF(trim(COALESCE(p_location,'')),''),1,
    jsonb_build_object('creation_min_followers',v_min,'followers_at_creation',v_followers,'max_communities_per_user',v_max),
    COALESCE((v_cfg->>'monetization_enabled')::boolean,true)) RETURNING id INTO v_id;
  INSERT INTO public.community_members(community_id,user_id,role,state,joined_at) VALUES(v_id,v_uid,'owner','active',now());
  INSERT INTO public.community_moderation_log(community_id,actor_id,target_type,target_id,action) VALUES(v_id,v_uid,'community',v_id,'created');
  RETURN (SELECT jsonb_build_object('id',id,'public_id',public_id,'slug',slug,'name',name,'visibility',visibility) FROM public.communities WHERE id=v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_communities(p_mode text DEFAULT 'discover',p_query text DEFAULT NULL,p_limit integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_limit integer:=LEAST(GREATEST(COALESCE(p_limit,30),1),60); v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.sort_featured DESC,x.sort_members DESC,x.created_at DESC),'[]'::jsonb) INTO v_result
 FROM (
   SELECT c.id,c.public_id,c.name,c.slug,c.description,c.avatar_url,c.banner_url,c.visibility,c.category,c.country,c.location,c.member_count,c.post_count,c.is_verified,c.is_featured,c.created_at,
     m.role AS viewer_role,m.state AS viewer_state,
     c.is_featured AS sort_featured,c.member_count AS sort_members
   FROM public.communities c
   LEFT JOIN public.community_members m ON m.community_id=c.id AND m.user_id=v_uid
   WHERE public.community_can_view(c.id,v_uid)
     AND c.status IN ('active','restricted')
     AND (p_query IS NULL OR trim(p_query)='' OR c.name ILIKE '%'||trim(p_query)||'%' OR c.slug ILIKE '%'||trim(p_query)||'%' OR c.public_id ILIKE '%'||trim(p_query)||'%' OR COALESCE(c.category,'') ILIKE '%'||trim(p_query)||'%')
     AND (
       lower(COALESCE(p_mode,'discover')) IN ('discover','recommended','popular','new')
       OR (lower(p_mode)='mine' AND m.state='active')
       OR (lower(p_mode)='requests' AND public.community_has_role(c.id,ARRAY['owner','admin','moderator']::text[],v_uid))
     )
   ORDER BY CASE WHEN lower(COALESCE(p_mode,'discover'))='new' THEN 0 ELSE CASE WHEN c.is_featured THEN 0 ELSE 1 END END,c.member_count DESC,c.created_at DESC
   LIMIT v_limit
 ) x;
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_community_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT jsonb_build_object(
   'id',c.id,'public_id',c.public_id,'owner_id',c.owner_id,'name',c.name,'slug',c.slug,'description',c.description,'avatar_url',c.avatar_url,'banner_url',c.banner_url,
   'visibility',c.visibility,'category',c.category,'country',c.country,'location',c.location,'member_count',c.member_count,'post_count',c.post_count,'is_verified',c.is_verified,'is_featured',c.is_featured,
   'status',c.status,'monetization_enabled',c.monetization_enabled,'premium_enabled',c.premium_enabled,'created_at',c.created_at,
   'viewer_role',m.role,'viewer_state',m.state,'can_manage',COALESCE(m.role IN ('owner','admin','moderator'),false) OR public.is_platform_admin()
 ) INTO v_result
 FROM public.communities c LEFT JOIN public.community_members m ON m.community_id=c.id AND m.user_id=v_uid
 WHERE c.slug=lower(trim(p_slug)) AND public.community_can_view(c.id,v_uid);
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_or_request_community(p_community_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_visibility text; v_status text; v_state text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT visibility,status INTO v_visibility,v_status FROM public.communities WHERE id=p_community_id FOR UPDATE;
 IF NOT FOUND OR v_status NOT IN ('active','restricted') THEN RAISE EXCEPTION 'Community is unavailable'; END IF;
 IF v_visibility='hidden' AND NOT EXISTS(SELECT 1 FROM public.community_invites WHERE community_id=p_community_id AND invited_user_id=v_uid AND status='pending' AND expires_at>now()) THEN RAISE EXCEPTION 'This hidden community requires an invitation'; END IF;
 v_state:=CASE WHEN v_visibility='private' THEN 'pending' ELSE 'active' END;
 INSERT INTO public.community_members(community_id,user_id,role,state,joined_at,updated_at)
 VALUES(p_community_id,v_uid,'member',v_state,CASE WHEN v_state='active' THEN now() ELSE NULL END,now())
 ON CONFLICT(community_id,user_id) DO UPDATE SET state=CASE WHEN community_members.state='banned' THEN 'banned' ELSE EXCLUDED.state END,role=CASE WHEN community_members.role='owner' THEN 'owner' ELSE 'member' END,joined_at=CASE WHEN EXCLUDED.state='active' THEN COALESCE(community_members.joined_at,now()) ELSE community_members.joined_at END,updated_at=now()
 RETURNING state INTO v_state;
 IF v_state='banned' THEN RAISE EXCEPTION 'You are banned from this community'; END IF;
 UPDATE public.communities SET member_count=(SELECT count(*) FROM public.community_members WHERE community_id=p_community_id AND state='active'),updated_at=now() WHERE id=p_community_id;
 RETURN jsonb_build_object('state',v_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_community(p_community_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_role text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT role INTO v_role FROM public.community_members WHERE community_id=p_community_id AND user_id=v_uid FOR UPDATE;
 IF NOT FOUND THEN RETURN true; END IF;
 IF v_role='owner' THEN RAISE EXCEPTION 'Transfer or archive the community before the owner leaves'; END IF;
 UPDATE public.community_members SET state='left',updated_at=now() WHERE community_id=p_community_id AND user_id=v_uid;
 UPDATE public.communities SET member_count=(SELECT count(*) FROM public.community_members WHERE community_id=p_community_id AND state='active'),updated_at=now() WHERE id=p_community_id;
 RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_community_member(p_community_id uuid,p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_id uuid;
BEGIN
 IF NOT public.community_has_role(p_community_id,ARRAY['owner','admin','moderator']::text[],v_uid) THEN RAISE EXCEPTION 'Community staff permission required'; END IF;
 IF p_user_id=v_uid THEN RAISE EXCEPTION 'You are already in this community'; END IF;
 INSERT INTO public.community_invites(community_id,invited_user_id,invited_by) VALUES(p_community_id,p_user_id,v_uid)
 ON CONFLICT(community_id,invited_user_id,status) DO UPDATE SET invited_by=EXCLUDED.invited_by,expires_at=now()+interval '14 days',created_at=now()
 RETURNING id INTO v_id;
 INSERT INTO public.community_members(community_id,user_id,role,state,invited_by,updated_at) VALUES(p_community_id,p_user_id,'member','invited',v_uid,now())
 ON CONFLICT(community_id,user_id) DO UPDATE SET state=CASE WHEN community_members.state='banned' THEN 'banned' ELSE 'invited' END,invited_by=v_uid,updated_at=now();
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_community_invite(p_invite_id uuid,p_accept boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_community uuid;
BEGIN
 SELECT community_id INTO v_community FROM public.community_invites WHERE id=p_invite_id AND invited_user_id=v_uid AND status='pending' AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation is unavailable'; END IF;
 UPDATE public.community_invites SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,responded_at=now() WHERE id=p_invite_id;
 UPDATE public.community_members SET state=CASE WHEN p_accept THEN 'active' ELSE 'declined' END,joined_at=CASE WHEN p_accept THEN now() ELSE joined_at END,updated_at=now() WHERE community_id=v_community AND user_id=v_uid AND state<>'banned';
 UPDATE public.communities SET member_count=(SELECT count(*) FROM public.community_members WHERE community_id=v_community AND state='active'),updated_at=now() WHERE id=v_community;
 RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_community_member(p_community_id uuid,p_user_id uuid,p_action text,p_role text DEFAULT NULL,p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_actor_role text; v_target_role text; v_action text:=lower(trim(p_action));
BEGIN
 SELECT role INTO v_actor_role FROM public.community_members WHERE community_id=p_community_id AND user_id=v_uid AND state='active';
 IF NOT (v_actor_role IN ('owner','admin','moderator') OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Community staff permission required'; END IF;
 SELECT role INTO v_target_role FROM public.community_members WHERE community_id=p_community_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
 IF v_target_role='owner' AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Community owner cannot be moderated by community staff'; END IF;
 IF v_action IN ('promote','demote','set_role') THEN
   IF NOT (v_actor_role='owner' OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Only the owner may change staff roles'; END IF;
   IF p_role NOT IN ('admin','moderator','member') THEN RAISE EXCEPTION 'Invalid member role'; END IF;
   UPDATE public.community_members SET role=p_role,updated_at=now() WHERE community_id=p_community_id AND user_id=p_user_id;
 ELSIF v_action='approve' THEN UPDATE public.community_members SET state='active',joined_at=COALESCE(joined_at,now()),updated_at=now() WHERE community_id=p_community_id AND user_id=p_user_id AND state='pending';
 ELSIF v_action='reject' THEN UPDATE public.community_members SET state='declined',updated_at=now() WHERE community_id=p_community_id AND user_id=p_user_id AND state='pending';
 ELSIF v_action='remove' THEN UPDATE public.community_members SET state='left',role='member',updated_at=now() WHERE community_id=p_community_id AND user_id=p_user_id;
 ELSIF v_action='ban' THEN UPDATE public.community_members SET state='banned',role='member',updated_at=now() WHERE community_id=p_community_id AND user_id=p_user_id;
 ELSIF v_action='unban' THEN UPDATE public.community_members SET state='left',role='member',updated_at=now() WHERE community_id=p_community_id AND user_id=p_user_id AND state='banned';
 ELSE RAISE EXCEPTION 'Invalid moderation action'; END IF;
 INSERT INTO public.community_moderation_log(community_id,actor_id,target_type,target_id,action,reason) VALUES(p_community_id,v_uid,'member',p_user_id,v_action,p_reason);
 UPDATE public.communities SET member_count=(SELECT count(*) FROM public.community_members WHERE community_id=p_community_id AND state='active'),updated_at=now() WHERE id=p_community_id;
 RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_community_post(
 p_community_id uuid,p_body text,p_media_path text DEFAULT NULL,p_media_type text DEFAULT NULL,p_category text DEFAULT NULL,p_topic_tags text[] DEFAULT '{}'::text[],p_linked_entity_type text DEFAULT NULL,p_linked_entity_id uuid DEFAULT NULL,p_linked_entity_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_id uuid; v_max integer:=30; v_cfg jsonb; v_community_category text;
BEGIN
 IF NOT public.community_is_active_member(p_community_id,v_uid) THEN RAISE EXCEPTION 'Active community membership required'; END IF;
 IF EXISTS(SELECT 1 FROM public.community_members WHERE community_id=p_community_id AND user_id=v_uid AND state='banned') THEN RAISE EXCEPTION 'You are banned from this community'; END IF;
 SELECT community_config INTO v_cfg FROM public.system_config WHERE singleton=true LIMIT 1;
 v_max:=COALESCE((v_cfg->>'max_posts_per_hour')::integer,30);
 IF (SELECT count(*) FROM public.social_posts WHERE author_id=v_uid AND community_id=p_community_id AND created_at>now()-interval '1 hour')>=v_max THEN RAISE EXCEPTION 'Community posting rate limit reached'; END IF;
 SELECT category INTO v_community_category FROM public.communities WHERE id=p_community_id AND status IN ('active','restricted');
 IF NOT FOUND THEN RAISE EXCEPTION 'Community is unavailable'; END IF;
 IF length(trim(COALESCE(p_body,'')))=0 AND NULLIF(trim(COALESCE(p_media_path,'')),'') IS NULL AND p_linked_entity_id IS NULL THEN RAISE EXCEPTION 'Add text, media, or a linked DRIGHT entity'; END IF;
 INSERT INTO public.social_posts(author_id,body,media_path,media_type,visibility,community_id,source_type,category,topic_tags,linked_entity_type,linked_entity_id,linked_entity_url,moderation_status)
 VALUES(v_uid,COALESCE(p_body,''),NULLIF(trim(COALESCE(p_media_path,'')),''),p_media_type,'public',p_community_id,'community',COALESCE(NULLIF(trim(COALESCE(p_category,'')),''),v_community_category),COALESCE(p_topic_tags,'{}'::text[]),p_linked_entity_type,p_linked_entity_id,p_linked_entity_url,'approved') RETURNING id INTO v_id;
 UPDATE public.communities SET post_count=(SELECT count(*) FROM public.social_posts WHERE community_id=p_community_id AND is_active AND moderation_status='approved'),updated_at=now() WHERE id=p_community_id;
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_community_post(p_post_id uuid,p_action text,p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_community uuid; v_action text:=lower(trim(p_action));
BEGIN
 SELECT community_id INTO v_community FROM public.social_posts WHERE id=p_post_id AND community_id IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Community post not found'; END IF;
 IF NOT (public.community_has_role(v_community,ARRAY['owner','admin','moderator']::text[],v_uid) OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Community staff permission required'; END IF;
 IF v_action='remove' THEN UPDATE public.social_posts SET is_active=false,moderation_status='hidden',updated_at=now() WHERE id=p_post_id;
 ELSIF v_action='restore' THEN UPDATE public.social_posts SET is_active=true,moderation_status='approved',updated_at=now() WHERE id=p_post_id;
 ELSIF v_action='pin' THEN UPDATE public.social_posts SET is_pinned=true,updated_at=now() WHERE id=p_post_id;
 ELSIF v_action='unpin' THEN UPDATE public.social_posts SET is_pinned=false,updated_at=now() WHERE id=p_post_id;
 ELSE RAISE EXCEPTION 'Invalid post moderation action'; END IF;
 INSERT INTO public.community_moderation_log(community_id,actor_id,target_type,target_id,action,reason) VALUES(v_community,v_uid,'post',p_post_id,v_action,p_reason);
 UPDATE public.communities SET post_count=(SELECT count(*) FROM public.social_posts WHERE community_id=v_community AND is_active AND moderation_status='approved'),updated_at=now() WHERE id=v_community;
 RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_community_members(p_community_id uuid,p_state text DEFAULT 'active')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_result jsonb;
BEGIN
 IF NOT public.community_can_view(p_community_id,v_uid) THEN RAISE EXCEPTION 'Community unavailable'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'state',m.state,'joined_at',m.joined_at,'full_name',u.full_name,'username',u.username,'avatar_url',u.avatar_url) ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,u.full_name),'[]'::jsonb)
 INTO v_result FROM public.community_members m JOIN public.users u ON u.id=m.user_id
 WHERE m.community_id=p_community_id AND (p_state IS NULL OR m.state=p_state);
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_community_chat(p_community_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_owner uuid; v_id uuid;
BEGIN
 IF NOT public.community_is_active_member(p_community_id,v_uid) THEN RAISE EXCEPTION 'Active community membership required'; END IF;
 SELECT id INTO v_id FROM public.chat_conversations WHERE community_id=p_community_id AND channel_type='community' LIMIT 1;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 SELECT owner_id INTO v_owner FROM public.communities WHERE id=p_community_id AND status IN ('active','restricted') FOR UPDATE;
 IF v_owner IS NULL THEN RAISE EXCEPTION 'Community is unavailable'; END IF;
 INSERT INTO public.chat_conversations(channel_type,customer_id,seller_id,status,context_type,context_id,context_data,initiator_id,community_id)
 VALUES('community',v_owner,NULL,'open','community',p_community_id,jsonb_build_object('community_id',p_community_id),v_uid,p_community_id)
 ON CONFLICT DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN SELECT id INTO v_id FROM public.chat_conversations WHERE community_id=p_community_id AND channel_type='community' LIMIT 1; END IF;
 RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_community_target(p_community_id uuid,p_target_type text,p_target_id uuid,p_reason text,p_category text DEFAULT 'other')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_id uuid;
BEGIN
 IF v_uid IS NULL OR NOT public.community_can_view(p_community_id,v_uid) THEN RAISE EXCEPTION 'Community unavailable'; END IF;
 IF p_target_type NOT IN ('community','community_post','community_member','community_message') THEN RAISE EXCEPTION 'Invalid report target'; END IF;
 INSERT INTO public.moderation_reports(reporter_id,target_type,target_id,reason,report_category,status)
 VALUES(v_uid,p_target_type,COALESCE(p_target_id,p_community_id),left(trim(p_reason),2000),COALESCE(NULLIF(trim(p_category),''),'other'),'pending') RETURNING id INTO v_id;
 INSERT INTO public.moderation_queue(item_type,item_id,reason,reported_by,status)
 SELECT p_target_type,COALESCE(p_target_id,p_community_id),left(trim(p_reason),2000),v_uid,'pending'
 WHERE NOT EXISTS(SELECT 1 FROM public.moderation_queue WHERE item_type=p_target_type AND item_id=COALESCE(p_target_id,p_community_id) AND status='pending');
 RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Canonical video click/view/playback telemetry
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_social_post_click(p_post_id uuid,p_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_count integer; v_recent boolean;
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 v_recent:=EXISTS(SELECT 1 FROM public.social_post_events WHERE post_id=p_post_id AND user_id=v_uid AND event_type='click' AND created_at>now()-interval '2 seconds');
 IF NOT v_recent THEN
   INSERT INTO public.social_post_events(post_id,user_id,event_type,session_id) VALUES(p_post_id,v_uid,'click',p_session_id);
   INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,session_id,source,metadata,is_bot)
   VALUES('social_video_click','social_post',p_post_id,v_uid,p_session_id::text,'social',jsonb_build_object('surface','social'),false);
 END IF;
 SELECT count(*)::integer INTO v_count FROM public.social_post_events WHERE post_id=p_post_id AND event_type='click';
 RETURN jsonb_build_object('click_count',v_count,'recorded',NOT v_recent);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_social_video_start(p_post_id uuid,p_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_views integer; v_plays bigint;
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.social_posts WHERE id=p_post_id AND media_type='video') THEN RAISE EXCEPTION 'Post is not a video'; END IF;
 INSERT INTO public.social_post_views(post_id,user_id,viewed_at,first_started_at,last_started_at,play_count)
 VALUES(p_post_id,v_uid,now(),now(),now(),1)
 ON CONFLICT(post_id,user_id) DO UPDATE SET viewed_at=now(),last_started_at=now(),play_count=social_post_views.play_count+1;
 INSERT INTO public.social_post_events(post_id,user_id,event_type,session_id) VALUES(p_post_id,v_uid,'view_start',p_session_id);
 INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,session_id,source,metadata,is_bot)
 VALUES('social_video_start','social_post',p_post_id,v_uid,p_session_id::text,'social',jsonb_build_object('surface','social'),false);
 UPDATE public.social_feed_session_items SET viewed_at=COALESCE(viewed_at,now()) WHERE session_id=p_session_id AND post_id=p_post_id;
 UPDATE public.social_feed_sessions SET current_post_id=p_post_id,last_activity_at=now() WHERE id=p_session_id AND user_id=v_uid;
 SELECT count(*)::integer INTO v_views FROM public.social_post_views WHERE post_id=p_post_id;
 SELECT COALESCE(sum(play_count),0) INTO v_plays FROM public.social_post_views WHERE post_id=p_post_id;
 RETURN jsonb_build_object('view_count',v_views,'play_count',v_plays);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_social_video_progress(p_post_id uuid,p_event_type text,p_watch_ms integer DEFAULT NULL,p_completion_ratio numeric DEFAULT NULL,p_session_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_type text:=lower(trim(p_event_type)); v_watch integer:=LEAST(GREATEST(COALESCE(p_watch_ms,0),0),86400000); v_ratio numeric:=LEAST(GREATEST(COALESCE(p_completion_ratio,0),0),1.5);
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 IF v_type NOT IN ('qualified_view','pause','resume','watch_complete','replay','skip','dwell') THEN RAISE EXCEPTION 'Invalid playback event'; END IF;
 INSERT INTO public.social_post_events(post_id,user_id,event_type,dwell_ms,watch_ms,completion_ratio,session_id)
 VALUES(p_post_id,v_uid,v_type,CASE WHEN v_type='dwell' THEN v_watch ELSE NULL END,v_watch,v_ratio,p_session_id);
 UPDATE public.social_post_views SET
   qualified_view_at=CASE WHEN v_type='qualified_view' THEN COALESCE(qualified_view_at,now()) ELSE qualified_view_at END,
   total_watch_ms=total_watch_ms+v_watch,
   last_completion_ratio=GREATEST(last_completion_ratio,v_ratio)
 WHERE post_id=p_post_id AND user_id=v_uid;
 IF v_type IN ('qualified_view','watch_complete','replay','skip') THEN
   INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,session_id,source,metadata,is_bot)
   VALUES('social_'||CASE v_type WHEN 'watch_complete' THEN 'video_complete' ELSE v_type END,'social_post',p_post_id,v_uid,p_session_id::text,'social',jsonb_build_object('watch_ms',v_watch,'completion_ratio',v_ratio),false);
 END IF;
 RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_social_entity_click(p_post_id uuid,p_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_type text; v_entity uuid; v_url text; v_click uuid:=gen_random_uuid();
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 SELECT linked_entity_type,linked_entity_id,linked_entity_url INTO v_type,v_entity,v_url FROM public.social_posts WHERE id=p_post_id;
 IF v_type IS NULL THEN RAISE EXCEPTION 'No linked DRIGHT entity'; END IF;
 INSERT INTO public.social_post_events(post_id,user_id,event_type,session_id,metadata) VALUES(p_post_id,v_uid,'entity_click',p_session_id,jsonb_build_object('click_id',v_click,'entity_type',v_type,'entity_id',v_entity));
 INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,session_id,source,metadata,is_bot)
 VALUES('social_entity_click',COALESCE(v_type,'social_entity'),COALESCE(v_entity,p_post_id),v_uid,p_session_id::text,'social',jsonb_build_object('social_post_id',p_post_id,'click_id',v_click,'destination',v_url),false);
 RETURN jsonb_build_object('click_id',v_click,'entity_type',v_type,'entity_id',v_entity,'url',v_url);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_social_post_event(p_post_id uuid,p_event_type text,p_dwell_ms integer DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_type text:=lower(trim(COALESCE(p_event_type,''))); v_dwell integer;
BEGIN
 IF v_uid IS NULL OR NOT public.social_can_view_post(p_post_id,v_uid) THEN RAISE EXCEPTION 'Post unavailable'; END IF;
 IF v_type NOT IN ('impression','share','not_interested','hide_creator','profile_visit','follow','unfollow','report','dwell') THEN RAISE EXCEPTION 'Invalid social event'; END IF;
 v_dwell:=CASE WHEN p_dwell_ms IS NULL THEN NULL ELSE LEAST(GREATEST(p_dwell_ms,0),3600000) END;
 IF v_type IN ('not_interested','hide_creator') AND EXISTS(SELECT 1 FROM public.social_post_events WHERE post_id=p_post_id AND user_id=v_uid AND event_type=v_type) THEN RETURN true; END IF;
 INSERT INTO public.social_post_events(post_id,user_id,event_type,dwell_ms,watch_ms) VALUES(p_post_id,v_uid,v_type,v_dwell,CASE WHEN v_type='dwell' THEN v_dwell ELSE NULL END);
 INSERT INTO public.analytics_events(event_type,entity_type,entity_id,viewer_id,source,metadata,is_bot)
 VALUES('social_'||v_type,'social_post',p_post_id,v_uid,'social',jsonb_build_object('dwell_ms',v_dwell),false);
 RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Cursor/keyset Social recommendation service
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_social_feed_v2(
 p_feed text DEFAULT 'social',p_cursor text DEFAULT NULL,p_limit integer DEFAULT NULL,p_session_id uuid DEFAULT NULL,p_target_id uuid DEFAULT NULL,p_community_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE
 v_uid uuid:=auth.uid(); v_feed text:=lower(trim(COALESCE(p_feed,'social'))); v_session uuid; v_limit integer;
 v_cursor_score numeric; v_cursor_epoch numeric; v_cursor_id uuid; v_result jsonb; v_has_more boolean:=false; v_next text:=NULL; v_max_pos integer:=0;
 v_explore numeric:=10; v_recency numeric:=8; v_watch numeric:=20; v_completion numeric:=18; v_save numeric:=12; v_share numeric:=10; v_comment numeric:=8; v_follow numeric:=8; v_friend numeric:=14; v_creator numeric:=10; v_trend numeric:=8; v_fresh numeric:=8; v_negative numeric:=25; v_creator_max integer:=2; v_category_max integer:=4;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF v_feed='for_you' THEN v_feed:='social'; END IF;
 IF v_feed NOT IN ('social','following','friends','mine','community') THEN RAISE EXCEPTION 'Invalid Social feed'; END IF;
 IF v_feed='community' AND p_community_id IS NULL THEN RAISE EXCEPTION 'Community feed requires a community'; END IF;
 IF v_feed='community' AND NOT public.community_can_view(p_community_id,v_uid) THEN RAISE EXCEPTION 'Community unavailable'; END IF;
 SELECT COALESCE(p_limit,social_feed_batch_size),social_exploration_percentage,social_recency_weight,social_watch_weight,social_completion_weight,social_save_weight,social_share_weight,social_comment_weight,social_follow_weight,social_friend_affinity,social_creator_affinity,social_trend_weight,social_fresh_boost,social_negative_penalty,social_creator_max_per_window,social_category_max_per_window
 INTO v_limit,v_explore,v_recency,v_watch,v_completion,v_save,v_share,v_comment,v_follow,v_friend,v_creator,v_trend,v_fresh,v_negative,v_creator_max,v_category_max
 FROM public.algorithm_settings WHERE is_singleton=true LIMIT 1;
 v_limit:=LEAST(GREATEST(COALESCE(v_limit,20),5),50);

 IF p_session_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.social_feed_sessions WHERE id=p_session_id AND user_id=v_uid AND expires_at>now() AND feed_mode=v_feed AND community_id IS NOT DISTINCT FROM p_community_id) THEN
   v_session:=p_session_id;
   UPDATE public.social_feed_sessions SET last_activity_at=now(),expires_at=GREATEST(expires_at,now()+interval '2 hours') WHERE id=v_session;
 ELSE
   INSERT INTO public.social_feed_sessions(user_id,feed_mode,community_id) VALUES(v_uid,v_feed,p_community_id) RETURNING id INTO v_session;
 END IF;

 IF p_cursor IS NOT NULL AND p_cursor<>'' THEN
   BEGIN
     v_cursor_score:=split_part(p_cursor,'|',1)::numeric;
     v_cursor_epoch:=split_part(p_cursor,'|',2)::numeric;
     v_cursor_id:=split_part(p_cursor,'|',3)::uuid;
   EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid Social cursor'; END;
 END IF;

 SELECT COALESCE(max(position),-1)+1 INTO v_max_pos FROM public.social_feed_session_items WHERE session_id=v_session;

 WITH relation AS (
   SELECT u.id AS author_id,
     EXISTS(SELECT 1 FROM public.user_follows f WHERE f.follower_id=v_uid AND f.following_id=u.id) AS is_following,
     EXISTS(SELECT 1 FROM public.user_follows f1 JOIN public.user_follows f2 ON f2.follower_id=f1.following_id AND f2.following_id=f1.follower_id WHERE f1.follower_id=v_uid AND f1.following_id=u.id) AS is_friend
   FROM public.users u
 ), post_stats AS (
   SELECT p.id,
     count(DISTINCT r.user_id)::numeric AS reactions,
     count(DISTINCT c.id)::numeric AS comments,
     count(DISTINCT s.user_id)::numeric AS saves,
     count(DISTINCT CASE WHEN e.event_type='share' THEN e.id END)::numeric AS shares,
     count(DISTINCT CASE WHEN e.event_type='watch_complete' THEN e.id END)::numeric AS completes,
     COALESCE(sum(CASE WHEN e.watch_ms IS NOT NULL THEN e.watch_ms ELSE 0 END),0)::numeric AS watch_ms,
     count(DISTINCT v.user_id)::numeric AS views
   FROM public.social_posts p
   LEFT JOIN public.social_post_reactions r ON r.post_id=p.id
   LEFT JOIN public.social_post_comments c ON c.post_id=p.id AND c.status='visible'
   LEFT JOIN public.social_post_saves s ON s.post_id=p.id
   LEFT JOIN public.social_post_events e ON e.post_id=p.id
   LEFT JOIN public.social_post_views v ON v.post_id=p.id
   GROUP BY p.id
 ), creator_affinity AS (
   SELECT target.author_id,
     (count(DISTINCT r.post_id)*2 + count(DISTINCT c.post_id)*3 + count(DISTINCT s.post_id)*4)::numeric AS score
   FROM public.social_posts target
   LEFT JOIN public.social_posts interacted ON interacted.author_id=target.author_id
   LEFT JOIN public.social_post_reactions r ON r.post_id=interacted.id AND r.user_id=v_uid
   LEFT JOIN public.social_post_comments c ON c.post_id=interacted.id AND c.user_id=v_uid
   LEFT JOIN public.social_post_saves s ON s.post_id=interacted.id AND s.user_id=v_uid
   GROUP BY target.author_id
 ), base AS (
   SELECT p.*,u.full_name AS author_name,u.username AS author_username,u.avatar_url AS author_avatar,COALESCE(u.is_verified,false) AS author_verified,
     rel.is_following,rel.is_friend,COALESCE(ps.views,0)::integer AS view_count,COALESCE(ps.reactions,0)::integer AS reaction_count,COALESCE(ps.comments,0)::integer AS comment_count,COALESCE(ps.saves,0)::integer AS save_count,
     (SELECT x.reaction FROM public.social_post_reactions x WHERE x.post_id=p.id AND x.user_id=v_uid) AS current_reaction,
     EXISTS(SELECT 1 FROM public.social_post_saves x WHERE x.post_id=p.id AND x.user_id=v_uid) AS is_saved,
     c.name AS community_name,c.slug AS community_slug,c.avatar_url AS community_avatar,c.visibility AS community_visibility,
     COALESCE(ps.watch_ms,0) AS agg_watch_ms,COALESCE(ps.completes,0) AS completes,COALESCE(ps.shares,0) AS shares,COALESCE(ca.score,0) AS affinity,
     CASE WHEN p.category IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_interest_profiles ip WHERE ip.user_id=v_uid AND p.category=ANY(ip.top_categories)) THEN 1 ELSE 0 END AS interest_hit,
     COALESCE((SELECT count(*) FROM public.social_feed_session_items si JOIN public.social_posts sp ON sp.id=si.post_id WHERE si.session_id=v_session AND sp.author_id=p.author_id),0)::numeric AS creator_seen,
     COALESCE((SELECT count(*) FROM public.social_feed_session_items si JOIN public.social_posts sp ON sp.id=si.post_id WHERE si.session_id=v_session AND sp.category IS NOT DISTINCT FROM p.category),0)::numeric AS category_seen
   FROM public.social_posts p
   JOIN public.users u ON u.id=p.author_id
   JOIN relation rel ON rel.author_id=p.author_id
   LEFT JOIN post_stats ps ON ps.id=p.id
   LEFT JOIN creator_affinity ca ON ca.author_id=p.author_id
   LEFT JOIN public.communities c ON c.id=p.community_id
   WHERE public.social_can_view_post(p.id,v_uid)
     AND p.moderation_status='approved'
     AND NOT EXISTS(SELECT 1 FROM public.social_feed_session_items si WHERE si.session_id=v_session AND si.post_id=p.id)
     AND NOT EXISTS(SELECT 1 FROM public.social_post_events e WHERE e.user_id=v_uid AND e.post_id=p.id AND e.event_type='not_interested')
     AND NOT EXISTS(SELECT 1 FROM public.social_post_events e JOIN public.social_posts hp ON hp.id=e.post_id WHERE e.user_id=v_uid AND e.event_type='hide_creator' AND hp.author_id=p.author_id)
     AND (v_feed<>'mine' OR p.author_id=v_uid)
     AND (v_feed<>'following' OR rel.is_following)
     AND (v_feed<>'friends' OR rel.is_friend)
     AND (v_feed<>'community' OR p.community_id=p_community_id)
 ), ranked AS (
   SELECT b.*,
     (
       ln(1+GREATEST(b.agg_watch_ms,0)/1000.0)*v_watch
       + ln(1+GREATEST(b.completes,0))*v_completion
       + ln(1+GREATEST(b.save_count,0))*v_save
       + ln(1+GREATEST(b.shares,0))*v_share
       + ln(1+GREATEST(b.comment_count,0))*v_comment
       + CASE WHEN b.is_following THEN v_follow ELSE 0 END
       + CASE WHEN b.is_friend THEN v_friend ELSE 0 END
       + LEAST(b.affinity,20)*v_creator/20.0
       + b.interest_hit*12
       + ln(1+b.reaction_count+b.comment_count+b.saves+b.shares)*v_trend
       + GREATEST(0,1-EXTRACT(EPOCH FROM (now()-b.created_at))/604800.0)*v_recency
       + CASE WHEN b.created_at>now()-interval '48 hours' THEN v_fresh ELSE 0 END
       + CASE WHEN mod(abs(hashtextextended(b.id::text||v_session::text,0)),100)<v_explore THEN v_explore/2 ELSE 0 END
       - (b.creator_seen*LEAST(v_negative,10))
       - (b.category_seen*LEAST(v_negative/2,5))
     )::numeric AS rank_score,
     CASE WHEN b.is_friend THEN 'From a friend' WHEN b.is_following THEN 'Because you follow this creator' WHEN b.interest_hit=1 THEN 'Based on your interests' WHEN b.community_id IS NOT NULL THEN 'From a public community you may like' WHEN b.created_at>now()-interval '48 hours' THEN 'Fresh on DRIGHT' ELSE 'Recommended for you' END AS recommendation_reason
   FROM base b
 ), keyed AS (
   SELECT r.*,
     row_number() OVER(PARTITION BY r.author_id ORDER BY r.rank_score DESC,r.created_at DESC,r.id DESC) AS creator_batch_rank,
     row_number() OVER(PARTITION BY COALESCE(r.category,'__none__') ORDER BY r.rank_score DESC,r.created_at DESC,r.id DESC) AS category_batch_rank
   FROM ranked r
   WHERE v_cursor_score IS NULL OR r.rank_score<v_cursor_score OR (r.rank_score=v_cursor_score AND EXTRACT(EPOCH FROM r.created_at)<v_cursor_epoch) OR (r.rank_score=v_cursor_score AND EXTRACT(EPOCH FROM r.created_at)=v_cursor_epoch AND r.id<v_cursor_id)
 ), page_all AS (
   SELECT * FROM keyed
   WHERE creator_batch_rank<=GREATEST(v_creator_max,1) AND category_batch_rank<=GREATEST(v_category_max,1)
   ORDER BY CASE WHEN p_target_id IS NOT NULL AND id=p_target_id THEN 0 ELSE 1 END,rank_score DESC,created_at DESC,id DESC
   LIMIT v_limit+1
 ), page AS (
   SELECT * FROM page_all LIMIT v_limit
 ), inserted AS (
   INSERT INTO public.social_feed_session_items(session_id,post_id,position,rank_score,recommendation_reason)
   SELECT v_session,p.id,v_max_pos+row_number() OVER(ORDER BY CASE WHEN p_target_id IS NOT NULL AND p.id=p_target_id THEN 0 ELSE 1 END,p.rank_score DESC,p.created_at DESC,p.id DESC)-1,p.rank_score,p.recommendation_reason FROM page p
   ON CONFLICT(session_id,post_id) DO NOTHING
   RETURNING post_id
 )
 SELECT jsonb_build_object(
   'items',COALESCE(jsonb_agg(to_jsonb(page) - 'rank_score' - 'creator_batch_rank' - 'category_batch_rank' - 'agg_watch_ms' - 'completes' - 'shares' - 'affinity' - 'interest_hit' - 'creator_seen' - 'category_seen' ORDER BY CASE WHEN p_target_id IS NOT NULL AND page.id=p_target_id THEN 0 ELSE 1 END,page.rank_score DESC,page.created_at DESC,page.id DESC),'[]'::jsonb),
   'has_more',(SELECT count(*) FROM page_all)>v_limit,
   'next_cursor',(SELECT CASE WHEN count(*)=0 THEN NULL ELSE (array_agg(rank_score::text||'|'||EXTRACT(EPOCH FROM created_at)::text||'|'||id::text ORDER BY CASE WHEN p_target_id IS NOT NULL AND id=p_target_id THEN 0 ELSE 1 END,rank_score DESC,created_at DESC,id DESC))[LEAST(count(*)::integer,v_limit)] END FROM page),
   'session_id',v_session,
   'feed',v_feed
 ) INTO v_result FROM page;

 UPDATE public.social_feed_sessions SET last_activity_at=now() WHERE id=v_session;
 RETURN COALESCE(v_result,jsonb_build_object('items','[]'::jsonb,'has_more',false,'next_cursor',NULL,'session_id',v_session,'feed',v_feed));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_social_session_position(p_session_id uuid,p_post_id uuid,p_position integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
 UPDATE public.social_feed_sessions SET current_post_id=p_post_id,current_position=GREATEST(COALESCE(p_position,0),0),last_activity_at=now() WHERE id=p_session_id AND user_id=v_uid AND expires_at>now();
 RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_social_session_state(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
 RETURN (SELECT jsonb_build_object('session_id',id,'feed',feed_mode,'community_id',community_id,'current_post_id',current_post_id,'current_position',current_position,'started_at',started_at,'last_activity_at',last_activity_at,'expires_at',expires_at) FROM public.social_feed_sessions WHERE id=p_session_id AND user_id=v_uid AND expires_at>now());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_social_account_suggestions(p_mode text DEFAULT 'following',p_limit integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.mutual_score DESC,x.followers DESC),'[]'::jsonb) INTO v_result FROM (
   SELECT u.id,u.full_name,u.username,u.avatar_url,COALESCE(u.is_verified,false) AS is_verified,
     (SELECT count(*) FROM public.user_follows f WHERE f.following_id=u.id)::integer AS followers,
     (SELECT count(*) FROM public.user_follows a JOIN public.user_follows b ON b.following_id=a.follower_id AND b.follower_id=v_uid WHERE a.following_id=u.id)::integer AS mutual_score
   FROM public.users u
   WHERE u.id<>v_uid AND COALESCE(upper(u.account_status),'ACTIVE')='ACTIVE'
     AND NOT EXISTS(SELECT 1 FROM public.user_follows f WHERE f.follower_id=v_uid AND f.following_id=u.id)
     AND NOT EXISTS(SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id=v_uid AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=v_uid))
   ORDER BY mutual_score DESC,followers DESC,u.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit,12),1),30)
 ) x;
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_social_runtime_settings()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
 SELECT jsonb_build_object(
   'algorithm',(SELECT to_jsonb(a) FROM public.algorithm_settings a WHERE a.is_singleton=true LIMIT 1),
   'social',(SELECT s.social_config FROM public.system_config s WHERE s.singleton=true LIMIT 1),
   'community',(SELECT s.community_config FROM public.system_config s WHERE s.singleton=true LIMIT 1),
   'sponsored',(SELECT jsonb_build_object('enabled',social_feed_enabled,'min_organic_between_ads',social_min_organic_between_ads,'max_ads_per_session',social_max_ads_per_session,'same_campaign_daily_cap',social_same_campaign_daily_cap) FROM public.promotion_distribution_settings LIMIT 1)
 );
$$;

CREATE OR REPLACE FUNCTION public.admin_update_social_community_settings(p_settings jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_alg jsonb:=COALESCE(p_settings->'algorithm','{}'::jsonb); v_comm jsonb:=COALESCE(p_settings->'community','{}'::jsonb); v_social jsonb:=COALESCE(p_settings->'social','{}'::jsonb); v_ads jsonb:=COALESCE(p_settings->'sponsored','{}'::jsonb);
BEGIN
 IF v_uid IS NULL OR NOT (public.is_super_admin() OR public.has_rbac_permission('algorithm','manage')) THEN RAISE EXCEPTION 'Admin algorithm permission required'; END IF;
 UPDATE public.algorithm_settings SET
   social_feed_batch_size=LEAST(GREATEST(COALESCE((v_alg->>'social_feed_batch_size')::integer,social_feed_batch_size),5),50),
   social_exploration_percentage=LEAST(GREATEST(COALESCE((v_alg->>'social_exploration_percentage')::numeric,social_exploration_percentage),0),50),
   social_recency_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_recency_weight')::numeric,social_recency_weight),0),100),
   social_watch_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_watch_weight')::numeric,social_watch_weight),0),100),
   social_completion_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_completion_weight')::numeric,social_completion_weight),0),100),
   social_save_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_save_weight')::numeric,social_save_weight),0),100),
   social_share_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_share_weight')::numeric,social_share_weight),0),100),
   social_comment_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_comment_weight')::numeric,social_comment_weight),0),100),
   social_follow_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_follow_weight')::numeric,social_follow_weight),0),100),
   social_friend_affinity=LEAST(GREATEST(COALESCE((v_alg->>'social_friend_affinity')::numeric,social_friend_affinity),0),100),
   social_creator_affinity=LEAST(GREATEST(COALESCE((v_alg->>'social_creator_affinity')::numeric,social_creator_affinity),0),100),
   social_trend_weight=LEAST(GREATEST(COALESCE((v_alg->>'social_trend_weight')::numeric,social_trend_weight),0),100),
   social_fresh_boost=LEAST(GREATEST(COALESCE((v_alg->>'social_fresh_boost')::numeric,social_fresh_boost),0),100),
   social_negative_penalty=LEAST(GREATEST(COALESCE((v_alg->>'social_negative_penalty')::numeric,social_negative_penalty),0),100),
   social_creator_max_per_window=LEAST(GREATEST(COALESCE((v_alg->>'social_creator_max_per_window')::integer,social_creator_max_per_window),1),10),
   social_category_max_per_window=LEAST(GREATEST(COALESCE((v_alg->>'social_category_max_per_window')::integer,social_category_max_per_window),1),10),
   updated_at=now()
 WHERE is_singleton=true;
 UPDATE public.system_config SET community_config=community_config||v_comm,social_config=social_config||v_social,updated_at=now(),updated_by=v_uid WHERE singleton=true;
 UPDATE public.promotion_distribution_settings SET
   social_feed_enabled=COALESCE((v_ads->>'enabled')::boolean,social_feed_enabled),
   social_min_organic_between_ads=LEAST(GREATEST(COALESCE((v_ads->>'min_organic_between_ads')::integer,social_min_organic_between_ads),2),50),
   social_max_ads_per_session=LEAST(GREATEST(COALESCE((v_ads->>'max_ads_per_session')::integer,social_max_ads_per_session),0),20),
   social_same_campaign_daily_cap=LEAST(GREATEST(COALESCE((v_ads->>'same_campaign_daily_cap')::integer,social_same_campaign_daily_cap),1),20),updated_at=now(),updated_by=v_uid;
 PERFORM public.log_admin_activity('update_social_community_settings','system',NULL,p_settings);
 RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_dright_social_entities(p_query text,p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_q text:=trim(COALESCE(p_query,'')); v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF char_length(v_q)<2 THEN RETURN '[]'::jsonb; END IF;
 WITH matches AS (
   SELECT 'community'::text AS entity_type,c.id,c.name AS title,c.slug AS subtitle,c.avatar_url AS image_url,'/communities/'||c.slug AS path,3 AS weight FROM public.communities c WHERE public.community_can_view(c.id,v_uid) AND c.status IN ('active','restricted') AND (c.name ILIKE '%'||v_q||'%' OR c.slug ILIKE '%'||v_q||'%' OR c.public_id ILIKE '%'||v_q||'%' OR COALESCE(c.category,'') ILIKE '%'||v_q||'%')
   UNION ALL
   SELECT 'creator',u.id,COALESCE(NULLIF(u.full_name,''),u.username), '@'||u.username,u.avatar_url,'/profile/'||u.id,2 FROM public.users u WHERE COALESCE(upper(u.account_status),'ACTIVE')='ACTIVE' AND (u.username ILIKE '%'||v_q||'%' OR COALESCE(u.full_name,'') ILIKE '%'||v_q||'%') AND NOT EXISTS(SELECT 1 FROM public.user_blocks b WHERE (b.blocker_id=v_uid AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=v_uid))
   UNION ALL
   SELECT 'social_post',p.id,left(COALESCE(NULLIF(p.body,''),'Social post'),90),COALESCE('@'||u.username,c.name),u.avatar_url,'/social?post='||p.id,1 FROM public.social_posts p JOIN public.users u ON u.id=p.author_id LEFT JOIN public.communities c ON c.id=p.community_id WHERE public.social_can_view_post(p.id,v_uid) AND p.moderation_status='approved' AND (p.body ILIKE '%'||v_q||'%' OR v_q=ANY(p.topic_tags) OR COALESCE(p.category,'') ILIKE '%'||v_q||'%')
 )
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.weight DESC,x.title LIMIT LEAST(GREATEST(COALESCE(p_limit,20),1),50)),'[]'::jsonb) INTO v_result FROM matches x;
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_social_community_analytics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_since timestamptz:=now()-(LEAST(GREATEST(COALESCE(p_days,30),1),365)||' days')::interval;
BEGIN
 IF v_uid IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 RETURN jsonb_build_object(
  'social_sessions',(SELECT count(*) FROM public.social_feed_sessions WHERE started_at>=v_since),
  'social_unique_users',(SELECT count(DISTINCT user_id) FROM public.social_feed_sessions WHERE started_at>=v_since),
  'social_posts',(SELECT count(*) FROM public.social_posts WHERE created_at>=v_since),
  'video_starts',(SELECT count(*) FROM public.social_post_events WHERE event_type='view_start' AND created_at>=v_since),
  'video_clicks',(SELECT count(*) FROM public.social_post_events WHERE event_type='click' AND created_at>=v_since),
  'video_completions',(SELECT count(*) FROM public.social_post_events WHERE event_type='watch_complete' AND created_at>=v_since),
  'shares',(SELECT count(*) FROM public.social_post_events WHERE event_type='share' AND created_at>=v_since),
  'negative_feedback',(SELECT count(*) FROM public.social_post_events WHERE event_type IN ('not_interested','hide_creator','report') AND created_at>=v_since),
  'communities',(SELECT count(*) FROM public.communities WHERE created_at>=v_since),
  'community_active_members',(SELECT count(*) FROM public.community_members WHERE state='active'),
  'community_posts',(SELECT count(*) FROM public.social_posts WHERE community_id IS NOT NULL AND created_at>=v_since)
 );
END;
$$;

-- Execute grants for service RPCs.
DO $$
DECLARE fn text;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
  'get_public_profile_safe(uuid)',
  'create_community(text,text,text,text,text,text,text)',
  'list_communities(text,text,integer)',
  'get_community_by_slug(text)',
  'join_or_request_community(uuid)',
  'leave_community(uuid)',
  'invite_community_member(uuid,uuid)',
  'respond_community_invite(uuid,boolean)',
  'moderate_community_member(uuid,uuid,text,text,text)',
  'create_community_post(uuid,text,text,text,text,text[],text,uuid,text)',
  'moderate_community_post(uuid,text,text)',
  'get_community_members(uuid,text)',
  'get_or_create_community_chat(uuid)',
  'report_community_target(uuid,text,uuid,text,text)',
  'record_social_post_click(uuid,uuid)',
  'record_social_video_start(uuid,uuid)',
  'record_social_video_progress(uuid,text,integer,numeric,uuid)',
  'record_social_entity_click(uuid,uuid)',
  'record_social_post_event(uuid,text,integer)',
  'get_social_feed_v2(text,text,integer,uuid,uuid,uuid)',
  'update_social_session_position(uuid,uuid,integer)',
  'get_social_session_state(uuid)',
  'get_social_account_suggestions(text,integer)',
  'get_social_runtime_settings()',
  'search_dright_social_entities(text,integer)',
  'get_social_community_analytics(integer)'
 ] LOOP
   EXECUTE 'REVOKE ALL ON FUNCTION public.'||fn||' FROM PUBLIC,anon';
   EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||fn||' TO authenticated,service_role';
 END LOOP;
 EXECUTE 'REVOKE ALL ON FUNCTION public.admin_update_social_community_settings(jsonb) FROM PUBLIC,anon,authenticated';
 EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_update_social_community_settings(jsonb) TO authenticated,service_role';
END $$;
