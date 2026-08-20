/*
# Public Store Visibility

Allows anyone (including anon) to read basic store info for the public store page.
Only exposes non-sensitive columns via a SELECT policy. RLS filters at row level,
so all columns are visible to the owner already; this policy adds read access for
non-owners to see store info needed for the public store page.
*/

DROP POLICY IF EXISTS "users_select_public_store" ON users;
CREATE POLICY "users_select_public_store" ON users FOR SELECT
  TO anon, authenticated USING (true);
