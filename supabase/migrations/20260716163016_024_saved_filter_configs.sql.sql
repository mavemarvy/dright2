/*
# Saved Filter Configurations

1. Purpose
- Allows users to save their marketplace filter state as named configurations
- Persist across sessions via Supabase backend
- Supports loading, deleting, and auto-saving current filter state

2. New Table: saved_filters
- id (uuid PK)
- user_id (uuid FK → auth.users, ON DELETE CASCADE, defaults to auth.uid())
- name (text) — user-given name for the configuration (e.g., "My Custom Filter")
- search_query (text) — search text, default ''
- category_filter (text) — selected category, default 'All'
- sort_by (text) — sort option, default 'newest'
- location_filter (text) — location text, default ''
- price_min (text) — min price, default ''
- price_max (text) — max price, default ''
- date_filter (text) — date range, default 'all'
- is_default (boolean) — whether this is the user's default config, default false
- created_at (timestamptz)
- updated_at (timestamptz)

3. Security
- RLS enabled, owner-scoped CRUD (auth.uid() = user_id)
- user_id defaults to auth.uid() so inserts from the anon-key client succeed

4. Notes
- Each user can have multiple named configurations
- Auto-save updates the "current" config row on every filter change (debounced in app)
- Clear empties all values; Reset restores predefined defaults
*/

CREATE TABLE IF NOT EXISTS saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  search_query text NOT NULL DEFAULT '',
  category_filter text NOT NULL DEFAULT 'All',
  sort_by text NOT NULL DEFAULT 'newest',
  location_filter text NOT NULL DEFAULT '',
  price_min text NOT NULL DEFAULT '',
  price_max text NOT NULL DEFAULT '',
  date_filter text NOT NULL DEFAULT 'all',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_saved_filters" ON saved_filters;
CREATE POLICY "select_own_saved_filters"
  ON saved_filters FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saved_filters" ON saved_filters;
CREATE POLICY "insert_own_saved_filters"
  ON saved_filters FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_saved_filters" ON saved_filters;
CREATE POLICY "update_own_saved_filters"
  ON saved_filters FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saved_filters" ON saved_filters;
CREATE POLICY "delete_own_saved_filters"
  ON saved_filters FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS saved_filters_user_idx ON saved_filters (user_id);
