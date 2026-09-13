-- Public profile privacy boundary.
-- Public profile consumers never receive admin/RBAC fields from this RPC.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS show_full_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS privacy_full_name text NOT NULL DEFAULT 'public';

DO $$ BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_privacy_full_name_check
    CHECK (privacy_full_name IN ('public','followers_only','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
  v_name_allowed boolean:=false;
BEGIN
  IF v_viewer IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_user
  FROM public.users
  WHERE id=p_user_id AND COALESCE(upper(account_status),'ACTIVE')<>'BANNED';
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id=v_viewer AND b.blocked_id=p_user_id)
       OR (b.blocker_id=p_user_id AND b.blocked_id=v_viewer)
  ) AND v_viewer<>p_user_id THEN
    RETURN NULL;
  END IF;

  v_following:=EXISTS(
    SELECT 1 FROM public.user_follows f
    WHERE f.follower_id=v_viewer AND f.following_id=p_user_id
  );

  v_profile_allowed:=
    v_viewer=p_user_id
    OR v_user.privacy_profile='public'
    OR (v_user.privacy_profile='followers_only' AND v_following);

  v_name_allowed:=
    v_user.show_full_name
    AND (
      v_viewer=p_user_id
      OR v_user.privacy_full_name='public'
      OR (v_user.privacy_full_name='followers_only' AND v_following)
    );

  RETURN jsonb_build_object(
    'id',v_user.id,
    'username',v_user.username,
    'full_name',CASE WHEN v_name_allowed THEN v_user.full_name ELSE NULL END,
    'avatar_url',v_user.avatar_url,
    'cover_image',CASE WHEN v_profile_allowed THEN v_user.cover_image ELSE NULL END,
    'bio',CASE WHEN v_profile_allowed THEN v_user.bio ELSE NULL END,
    'website',CASE WHEN v_profile_allowed THEN v_user.website ELSE NULL END,
    'country',CASE WHEN v_profile_allowed THEN v_user.country ELSE NULL END,
    'state',CASE WHEN v_profile_allowed THEN v_user.state ELSE NULL END,
    'city',CASE WHEN v_profile_allowed THEN v_user.city ELSE NULL END,
    'languages',CASE WHEN v_profile_allowed THEN COALESCE(v_user.languages,'{}'::text[]) ELSE '{}'::text[] END,
    'created_at',CASE WHEN v_profile_allowed THEN v_user.created_at ELSE NULL END,
    'is_verified',COALESCE(v_user.is_verified,false),
    'profile_allowed',v_profile_allowed,
    'privacy_activity',v_user.privacy_activity,
    'privacy_portfolio',v_user.privacy_portfolio,
    'privacy_followers',v_user.privacy_followers,
    'privacy_following',v_user.privacy_following,
    'is_following',v_following
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_profile_safe(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_public_profile_safe(uuid) TO authenticated,service_role;
