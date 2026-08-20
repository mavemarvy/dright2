/*
# Social System RPCs — Profile Search, Following Feed, Suggested Users, Social Analytics
*/

CREATE OR REPLACE FUNCTION search_users(
  p_query TEXT,
  p_limit INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT u.id, u.name, u.username, u.avatar_url,
        COALESCE(u.verified, u.is_verified) AS verified,
        u.verification_level, u.profession, u.company_name, u.brand,
        u.country, u.city, u.bio,
        (SELECT count(*) FROM user_follows WHERE following_id = u.id) AS followers
      FROM users u
      WHERE u.id != auth.uid()
        AND (
          u.name ILIKE '%' || p_query || '%' OR
          u.username ILIKE '%' || p_query || '%' OR
          u.company_name ILIKE '%' || p_query || '%' OR
          u.brand ILIKE '%' || p_query || '%' OR
          u.profession ILIKE '%' || p_query || '%' OR
          u.country ILIKE '%' || p_query || '%' OR
          u.city ILIKE '%' || p_query || '%' OR
          EXISTS (SELECT 1 FROM unnest(u.skills) AS skill WHERE skill ILIKE '%' || p_query || '%')
        )
        AND NOT EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = auth.uid() AND blocked_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = u.id AND blocked_id = auth.uid())
      ORDER BY followers DESC
      LIMIT p_limit
    ) t
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION search_users TO authenticated;

CREATE OR REPLACE FUNCTION get_following_feed(
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT af.id, af.user_id, af.event_type, af.category, af.title, af.description,
        af.related_id, af.related_type, af.metadata, af.created_at,
        u.name AS actor_name, u.username AS actor_username, u.avatar_url AS actor_avatar,
        COALESCE(u.verified, u.is_verified) AS actor_verified
      FROM activity_feed af
      JOIN users u ON u.id = af.user_id
      WHERE af.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = auth.uid())
        AND af.user_id != auth.uid()
      ORDER BY af.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) t
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION get_following_feed TO authenticated;

CREATE OR REPLACE FUNCTION get_suggested_users(
  p_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t))
    FROM (
      SELECT u.id, u.name, u.username, u.avatar_url,
        COALESCE(u.verified, u.is_verified) AS verified,
        u.profession, u.city,
        (SELECT count(*) FROM user_follows WHERE following_id = u.id) AS followers
      FROM users u
      WHERE u.id != auth.uid()
        AND u.id NOT IN (SELECT following_id FROM user_follows WHERE follower_id = auth.uid())
        AND NOT EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = auth.uid() AND blocked_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM user_blocks WHERE blocker_id = u.id AND blocked_id = auth.uid())
      ORDER BY followers DESC
      LIMIT p_limit
    ) t
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION get_suggested_users TO authenticated;

CREATE OR REPLACE FUNCTION get_social_analytics(
  p_user_id UUID DEFAULT NULL,
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_start TIMESTAMP := now() - (p_days || ' days')::INTERVAL;
BEGIN
  RETURN jsonb_build_object(
    'follower_growth', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS cnt FROM user_follows WHERE following_id = v_uid AND created_at >= v_start GROUP BY d ORDER BY d) t
    ),
    'profile_reach', (SELECT count(*) FROM profile_views WHERE profile_id = v_uid AND created_at >= v_start),
    'most_viewed_product', (
      SELECT jsonb_build_object('id', t.entity_id, 'name', p.name, 'views', t.cnt)
      FROM (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE seller_id = v_uid AND event_type = 'product_view' AND created_at >= v_start GROUP BY entity_id ORDER BY cnt DESC LIMIT 1) t
      LEFT JOIN products p ON p.id = t.entity_id
    ),
    'most_shared_product', (
      SELECT jsonb_build_object('id', t.entity_id, 'name', p.name, 'shares', t.cnt)
      FROM (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE seller_id = v_uid AND event_type = 'share' AND created_at >= v_start GROUP BY entity_id ORDER BY cnt DESC LIMIT 1) t
      LEFT JOIN products p ON p.id = t.entity_id
    ),
    'most_saved_product', (
      SELECT jsonb_build_object('id', t.entity_id, 'name', p.name, 'saves', t.cnt)
      FROM (SELECT entity_id, count(*) AS cnt FROM analytics_events WHERE seller_id = v_uid AND event_type = 'favorite' AND created_at >= v_start GROUP BY entity_id ORDER BY cnt DESC LIMIT 1) t
      LEFT JOIN products p ON p.id = t.entity_id
    ),
    'returning_visitors', (
      SELECT count(*) FROM (
        SELECT COALESCE(viewer_id::text, session_id) AS vid FROM profile_views WHERE profile_id = v_uid AND created_at >= v_start
        GROUP BY COALESCE(viewer_id::text, session_id) HAVING count(*) > 1
      ) sub
    ),
    'follower_conversion', (
      SELECT CASE WHEN (SELECT count(*) FROM profile_views WHERE profile_id = v_uid AND created_at >= v_start) > 0 THEN
        ROUND((SELECT count(*) FROM user_follows WHERE following_id = v_uid AND created_at >= v_start)::numeric /
        (SELECT count(*) FROM profile_views WHERE profile_id = v_uid AND created_at >= v_start) * 100, 2) ELSE 0 END
    ),
    'visitor_countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT country, count(*) AS cnt FROM profile_views WHERE profile_id = v_uid AND country IS NOT NULL AND created_at >= v_start GROUP BY country ORDER BY cnt DESC LIMIT 10) t
    ),
    'traffic_sources', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (SELECT source, count(*) AS cnt FROM profile_views WHERE profile_id = v_uid AND created_at >= v_start GROUP BY source ORDER BY cnt DESC) t
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_social_analytics TO authenticated;
