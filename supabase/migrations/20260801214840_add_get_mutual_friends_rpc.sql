-- Mutual friends list: users where A follows B AND B follows A
CREATE OR REPLACE FUNCTION get_mutual_friends(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  username text,
  avatar_url text,
  is_verified boolean,
  location text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.full_name, u.username, u.avatar_url, u.is_verified, u.location
  FROM user_follows f1
  INNER JOIN user_follows f2
    ON f1.following_id = f2.follower_id
   AND f1.follower_id = f2.following_id
  INNER JOIN users u ON u.id = f1.following_id
  WHERE f1.follower_id = p_user_id
    AND f1.following_id <> p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_mutual_friends TO authenticated;