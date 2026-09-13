-- DRIGHT2 Communities foundation.
-- Reuses users, user_follows, social posts, chat, moderation and notifications.

ALTER TABLE public.system_config
  ADD COLUMN IF NOT EXISTS community_config jsonb NOT NULL DEFAULT '{"creation_enabled":true,"creation_min_followers":100,"max_communities_per_user":10,"monetization_enabled":true,"premium_platform_fee_percent":10,"max_posts_per_hour":30}'::jsonb;

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
  responded_at timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_pending_invite_unique
  ON public.community_invites(community_id,invited_user_id) WHERE status='pending';

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
CREATE INDEX IF NOT EXISTS idx_community_members_state_role ON public.community_members(community_id,state,role);
CREATE INDEX IF NOT EXISTS idx_community_invites_user ON public.community_invites(invited_user_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_community_moderation_log ON public.community_moderation_log(community_id,created_at DESC);

-- Community posts extend the existing Social content model.
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS community_id uuid NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS category text NULL,
  ADD COLUMN IF NOT EXISTS topic_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS linked_entity_type text NULL,
  ADD COLUMN IF NOT EXISTS linked_entity_id uuid NULL,
  ADD COLUMN IF NOT EXISTS linked_entity_url text NULL,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved';

DO $$ BEGIN
  ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_source_type_check CHECK (source_type IN ('user','community'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_linked_entity_type_check CHECK (linked_entity_type IS NULL OR linked_entity_type IN ('product','service','course','job','store','creator','community'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_moderation_status_check CHECK (moderation_status IN ('approved','pending','hidden','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_social_posts_community_created ON public.social_posts(community_id,created_at DESC) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_social_posts_category_created ON public.social_posts(category,created_at DESC) WHERE is_active AND moderation_status='approved';

-- Reuse the existing chat conversation/message stack for one community channel.
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS community_id uuid NULL REFERENCES public.communities(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_one_community_channel
  ON public.chat_conversations(community_id) WHERE community_id IS NOT NULL AND channel_type='community';

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
      AND (
        c.visibility<>'hidden'
        OR public.community_is_active_member(c.id,p_user_id)
        OR c.owner_id=p_user_id
        OR public.is_platform_admin()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.community_can_view_members(p_community_id uuid,p_user_id uuid DEFAULT auth.uid())
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
        OR public.community_is_active_member(c.id,p_user_id)
        OR (c.visibility='public' AND c.status IN ('active','restricted'))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.community_is_active_member(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.community_has_role(uuid,text[],uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.community_can_view(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.community_can_view_members(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_is_active_member(uuid,uuid),public.community_has_role(uuid,text[],uuid),public.community_can_view(uuid,uuid),public.community_can_view_members(uuid,uuid) TO authenticated,service_role;

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
      AND COALESCE(upper(u.account_status),'ACTIVE')<>'BANNED'
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_id=p_viewer AND b.blocked_id=p.author_id)
           OR (b.blocker_id=p.author_id AND b.blocked_id=p_viewer)
      )
      AND (
        p.author_id=p_viewer
        OR public.is_platform_admin()
        OR (
          p.community_id IS NULL AND (
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
          AND (public.community_is_active_member(c.id,p_viewer) OR (c.visibility='public' AND p.visibility='public'))
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.social_can_view_post(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.social_can_view_post(uuid,uuid) TO authenticated,service_role;

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_member_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_moderation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_membership_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communities_read_authorized ON public.communities;
CREATE POLICY communities_read_authorized ON public.communities FOR SELECT TO authenticated USING (public.community_can_view(id,auth.uid()));
DROP POLICY IF EXISTS community_members_read_authorized ON public.community_members;
CREATE POLICY community_members_read_authorized ON public.community_members FOR SELECT TO authenticated USING (public.community_can_view_members(community_id,auth.uid()));
DROP POLICY IF EXISTS community_invites_read_own ON public.community_invites;
CREATE POLICY community_invites_read_own ON public.community_invites FOR SELECT TO authenticated USING (invited_user_id=auth.uid() OR invited_by=auth.uid() OR public.community_has_role(community_id,ARRAY['owner','admin','moderator']::text[],auth.uid()));
DROP POLICY IF EXISTS community_mutes_own ON public.community_member_mutes;
CREATE POLICY community_mutes_own ON public.community_member_mutes FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid() AND public.community_is_active_member(community_id,auth.uid()));
DROP POLICY IF EXISTS community_moderation_read_staff ON public.community_moderation_log;
CREATE POLICY community_moderation_read_staff ON public.community_moderation_log FOR SELECT TO authenticated USING (public.community_has_role(community_id,ARRAY['owner','admin','moderator']::text[],auth.uid()) OR public.is_platform_admin());
DROP POLICY IF EXISTS community_tiers_read ON public.community_membership_tiers;
CREATE POLICY community_tiers_read ON public.community_membership_tiers FOR SELECT TO authenticated USING (is_active AND public.community_can_view(community_id,auth.uid()));
DROP POLICY IF EXISTS community_payments_read_authorized ON public.community_membership_payments;
CREATE POLICY community_payments_read_authorized ON public.community_membership_payments FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.community_has_role(community_id,ARRAY['owner','admin']::text[],auth.uid()) OR public.is_platform_admin());

REVOKE INSERT,UPDATE,DELETE ON public.communities,public.community_members,public.community_invites,public.community_moderation_log,public.community_membership_tiers,public.community_membership_payments FROM anon,authenticated;
GRANT SELECT ON public.communities,public.community_members,public.community_invites,public.community_member_mutes,public.community_moderation_log,public.community_membership_tiers,public.community_membership_payments TO authenticated;
GRANT ALL ON public.communities,public.community_members,public.community_invites,public.community_member_mutes,public.community_moderation_log,public.community_membership_tiers,public.community_membership_payments TO service_role;

DROP POLICY IF EXISTS community_chat_conversation_read ON public.chat_conversations;
CREATE POLICY community_chat_conversation_read ON public.chat_conversations FOR SELECT TO authenticated USING (community_id IS NOT NULL AND public.community_is_active_member(community_id,auth.uid()));
DROP POLICY IF EXISTS community_chat_message_read ON public.chat_messages;
CREATE POLICY community_chat_message_read ON public.chat_messages FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.chat_conversations c WHERE c.id=conversation_id AND c.community_id IS NOT NULL AND public.community_is_active_member(c.community_id,auth.uid())));
DROP POLICY IF EXISTS community_chat_message_insert ON public.chat_messages;
CREATE POLICY community_chat_message_insert ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (sender_id=auth.uid() AND EXISTS(SELECT 1 FROM public.chat_conversations c WHERE c.id=conversation_id AND c.community_id IS NOT NULL AND public.community_is_active_member(c.community_id,auth.uid())));

CREATE OR REPLACE FUNCTION public.create_community(
  p_name text,p_slug text,p_description text DEFAULT NULL,p_visibility text DEFAULT 'public',p_category text DEFAULT NULL,p_country text DEFAULT NULL,p_location text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'
AS $$
DECLARE v_uid uuid:=auth.uid(); v_cfg jsonb; v_min integer; v_max integer; v_followers integer; v_existing integer; v_id uuid; v_slug text;
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
  IF lower(p_visibility) NOT IN ('public','private','hidden') THEN RAISE EXCEPTION 'Invalid community visibility'; END IF;
  v_slug:=lower(trim(p_slug));
  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN RAISE EXCEPTION 'Community slug may contain lowercase letters, numbers and hyphens'; END IF;
  IF EXISTS(SELECT 1 FROM public.communities WHERE slug=v_slug) THEN RAISE EXCEPTION 'Community slug is already in use'; END IF;
  INSERT INTO public.communities(owner_id,name,slug,description,visibility,category,country,location,member_count,creation_requirement_snapshot,monetization_enabled)
  VALUES(v_uid,trim(p_name),v_slug,NULLIF(trim(COALESCE(p_description,'')),''),lower(p_visibility),NULLIF(trim(COALESCE(p_category,'')),''),NULLIF(trim(COALESCE(p_country,'')),''),NULLIF(trim(COALESCE(p_location,'')),''),1,jsonb_build_object('creation_min_followers',v_min,'followers_at_creation',v_followers,'max_communities_per_user',v_max),COALESCE((v_cfg->>'monetization_enabled')::boolean,true)) RETURNING id INTO v_id;
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
DECLARE v_uid uuid:=auth.uid(); v_result jsonb;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.is_featured DESC,x.member_count DESC,x.created_at DESC),'[]'::jsonb) INTO v_result
 FROM (
   SELECT c.id,c.public_id,c.name,c.slug,c.description,c.avatar_url,c.banner_url,c.visibility,c.category,c.country,c.location,c.member_count,c.post_count,c.is_verified,c.is_featured,c.created_at,m.role AS viewer_role,m.state AS viewer_state
   FROM public.communities c
   LEFT JOIN public.community_members m ON m.community_id=c.id AND m.user_id=v_uid
   WHERE public.community_can_view(c.id,v_uid) AND c.status IN ('active','restricted')
     AND (p_query IS NULL OR trim(p_query)='' OR c.name ILIKE '%'||trim(p_query)||'%' OR c.slug ILIKE '%'||trim(p_query)||'%' OR c.public_id ILIKE '%'||trim(p_query)||'%' OR COALESCE(c.category,'') ILIKE '%'||trim(p_query)||'%')
     AND (lower(COALESCE(p_mode,'discover')) IN ('discover','recommended','popular','new') OR (lower(p_mode)='mine' AND m.state='active') OR (lower(p_mode)='requests' AND public.community_has_role(c.id,ARRAY['owner','admin','moderator']::text[],v_uid)))
   ORDER BY CASE WHEN lower(COALESCE(p_mode,'discover'))='new' THEN c.created_at END DESC,c.is_featured DESC,c.member_count DESC,c.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit,30),1),60)
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
 SELECT jsonb_build_object('id',c.id,'public_id',c.public_id,'owner_id',c.owner_id,'name',c.name,'slug',c.slug,'description',c.description,'avatar_url',c.avatar_url,'banner_url',c.banner_url,'visibility',c.visibility,'category',c.category,'country',c.country,'location',c.location,'member_count',c.member_count,'post_count',c.post_count,'is_verified',c.is_verified,'is_featured',c.is_featured,'status',c.status,'monetization_enabled',c.monetization_enabled,'premium_enabled',c.premium_enabled,'created_at',c.created_at,'viewer_role',m.role,'viewer_state',m.state,'can_manage',COALESCE(m.role IN ('owner','admin','moderator'),false) OR public.is_platform_admin()) INTO v_result
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
 INSERT INTO public.community_members(community_id,user_id,role,state,joined_at,updated_at) VALUES(p_community_id,v_uid,'member',v_state,CASE WHEN v_state='active' THEN now() ELSE NULL END,now())
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
 SELECT id INTO v_id FROM public.community_invites WHERE community_id=p_community_id AND invited_user_id=p_user_id AND status='pending' FOR UPDATE;
 IF v_id IS NULL THEN INSERT INTO public.community_invites(community_id,invited_user_id,invited_by) VALUES(p_community_id,p_user_id,v_uid) RETURNING id INTO v_id;
 ELSE UPDATE public.community_invites SET invited_by=v_uid,expires_at=now()+interval '14 days',created_at=now() WHERE id=v_id; END IF;
 INSERT INTO public.community_members(community_id,user_id,role,state,invited_by,updated_at) VALUES(p_community_id,p_user_id,'member','invited',v_uid,now())
 ON CONFLICT(community_id,user_id) DO UPDATE SET state=CASE WHEN community_members.state='banned' THEN 'banned' ELSE 'invited' END,invited_by=v_uid,updated_at=now();
 INSERT INTO public.social_notifications(user_id,actor_id,notification_type,entity_type,entity_id,metadata) VALUES(p_user_id,v_uid,'community_invite','community',p_community_id,jsonb_build_object('invite_id',v_id));
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
 IF v_action IN ('approve','reject','remove','ban','unban','promote','demote','set_role') AND p_user_id<>v_uid THEN
   INSERT INTO public.social_notifications(user_id,actor_id,notification_type,entity_type,entity_id,metadata) VALUES(p_user_id,v_uid,'community_membership_update','community',p_community_id,jsonb_build_object('action',v_action,'role',p_role));
 END IF;
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
DECLARE v_uid uuid:=auth.uid(); v_id uuid; v_max integer:=30; v_cfg jsonb; v_community_category text; v_path text:=NULLIF(trim(COALESCE(p_media_path,'')),'');
BEGIN
 IF NOT public.community_is_active_member(p_community_id,v_uid) THEN RAISE EXCEPTION 'Active community membership required'; END IF;
 SELECT community_config INTO v_cfg FROM public.system_config WHERE singleton=true LIMIT 1;
 v_max:=COALESCE((v_cfg->>'max_posts_per_hour')::integer,30);
 IF (SELECT count(*) FROM public.social_posts WHERE author_id=v_uid AND community_id=p_community_id AND created_at>now()-interval '1 hour')>=v_max THEN RAISE EXCEPTION 'Community posting rate limit reached'; END IF;
 SELECT category INTO v_community_category FROM public.communities WHERE id=p_community_id AND status IN ('active','restricted');
 IF NOT FOUND THEN RAISE EXCEPTION 'Community is unavailable'; END IF;
 IF length(trim(COALESCE(p_body,'')))=0 AND v_path IS NULL AND p_linked_entity_id IS NULL THEN RAISE EXCEPTION 'Add text, media, or a linked DRIGHT entity'; END IF;
 IF v_path IS NOT NULL AND (v_path NOT LIKE v_uid::text||'/%' OR position('..' in v_path)>0 OR p_media_type NOT IN ('image','video')) THEN RAISE EXCEPTION 'Invalid social media path'; END IF;
 IF p_linked_entity_type IS NOT NULL AND p_linked_entity_type NOT IN ('product','service','course','job','store','creator','community') THEN RAISE EXCEPTION 'Invalid linked entity type'; END IF;
 INSERT INTO public.social_posts(author_id,body,media_path,media_type,visibility,community_id,source_type,category,topic_tags,linked_entity_type,linked_entity_id,linked_entity_url,moderation_status)
 VALUES(v_uid,COALESCE(p_body,''),v_path,CASE WHEN v_path IS NULL THEN NULL ELSE p_media_type END,'public',p_community_id,'community',COALESCE(NULLIF(trim(COALESCE(p_category,'')),''),v_community_category),COALESCE(p_topic_tags,'{}'::text[]),p_linked_entity_type,p_linked_entity_id,p_linked_entity_url,'approved') RETURNING id INTO v_id;
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
 IF NOT public.community_can_view_members(p_community_id,v_uid) THEN RAISE EXCEPTION 'Community unavailable'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'state',m.state,'joined_at',m.joined_at,'full_name',CASE WHEN u.show_full_name IS DISTINCT FROM false THEN u.full_name ELSE NULL END,'username',u.username,'avatar_url',u.avatar_url) ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,u.username),'[]'::jsonb)
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
DECLARE v_uid uuid:=auth.uid(); v_id uuid; v_target uuid:=COALESCE(p_target_id,p_community_id);
BEGIN
 IF v_uid IS NULL OR NOT public.community_can_view(p_community_id,v_uid) THEN RAISE EXCEPTION 'Community unavailable'; END IF;
 IF p_target_type NOT IN ('community','community_post','community_member','community_message') THEN RAISE EXCEPTION 'Invalid report target'; END IF;
 IF length(trim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'Report reason is required'; END IF;
 INSERT INTO public.moderation_reports(reporter_id,target_type,target_id,reason,report_category,status) VALUES(v_uid,p_target_type,v_target,left(trim(p_reason),2000),COALESCE(NULLIF(trim(p_category),''),'other'),'pending') RETURNING id INTO v_id;
 INSERT INTO public.moderation_queue(item_type,item_id,reason,reported_by,status)
 SELECT p_target_type,v_target,left(trim(p_reason),2000),v_uid,'pending'
 WHERE NOT EXISTS(SELECT 1 FROM public.moderation_queue WHERE item_type=p_target_type AND item_id=v_target AND status='pending');
 RETURN v_id;
END;
$$;

DO $$
DECLARE fn text;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
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
  'report_community_target(uuid,text,uuid,text,text)'
 ] LOOP
   EXECUTE 'REVOKE ALL ON FUNCTION public.'||fn||' FROM PUBLIC,anon';
   EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||fn||' TO authenticated,service_role';
 END LOOP;
END $$;
