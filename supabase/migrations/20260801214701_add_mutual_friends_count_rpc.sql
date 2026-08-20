-- Mutual friends count: A follows B AND B follows A
CREATE OR REPLACE FUNCTION get_mutual_friends_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM user_follows f1
  INNER JOIN user_follows f2
    ON f1.following_id = f2.follower_id
   AND f1.follower_id = f2.following_id
  WHERE f1.follower_id = p_user_id
    AND f1.following_id <> p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_mutual_friends_count TO authenticated;