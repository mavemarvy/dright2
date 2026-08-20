/*
# Create increment_sales_counts RPC function

1. New Functions
- `increment_sales_counts(user_id uuid)` — atomically increments `weekly_sales_count` and `total_sales_count` for the given user. This ensures free product sales count toward weekly streaks and progression.

2. Security
- SECURITY DEFINER so it can run from the anon/authenticated client context.
- Only increments counts; does not expose any data.
*/

CREATE OR REPLACE FUNCTION increment_sales_counts(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET
    weekly_sales_count = weekly_sales_count + 1,
    total_sales_count = total_sales_count + 1
  WHERE id = user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_sales_counts(uuid) TO authenticated, anon;
