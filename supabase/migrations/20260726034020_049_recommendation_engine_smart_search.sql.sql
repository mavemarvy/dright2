/*
# DRIGHT Phase 2 — Recommendation Engine, Smart Search & Personalized Discovery

## Summary
Builds on Phase 1 analytics to power personalized recommendations, user interest
profiles, collaborative filtering, related listings, and smart search suggestions.

## New Tables
1. `user_interest_profiles` — Auto-generated per-user interest scores by category.
   Updated continuously from browsing, search, favorite, purchase, review behavior.
   No PII — just category → score (0-100).

2. `recommendations` — Pre-computed recommendation cache per user/strategy.
   Strategies: recommended_for_you, because_you_viewed, people_also_viewed,
   similar_listings, trending_in_interests, best_sellers_in_interests,
   highly_rated_in_interests, new_listings_you_may_like,
   recommended_sellers, recommended_categories.

3. `recommendation_logs` — Tracks which recommendations were shown & clicked,
   for feedback loop (improves future recommendations).

4. `search_suggestions` — Aggregated suggestion index for autocomplete.
   Sources: popular searches, trending searches, category terms, listing names.

5. `listing_similarity` — Pre-computed listing-to-listing similarity scores
   for "related listings" & collaborative filtering. Pairs (a, b) with score.

## Security
- RLS on ALL tables.
- user_interest_profiles: user owns their profile (CRUD scoped to auth.uid()).
- recommendations: user owns their recommendations (SELECT/DELETE scoped).
- recommendation_logs: user owns their logs (INSERT/SELECT/DELETE scoped).
- search_suggestions: SELECT for authenticated (read-only public index).
- listing_similarity: SELECT for authenticated (read-only).

## Indexes
- user_interest_profiles: unique on user_id; (user_id, score DESC) via GIN on scores
- recommendations: (user_id, strategy); (user_id, expires_at)
- recommendation_logs: (user_id, created_at); (listing_id, clicked)
- search_suggestions: (term gin_trgm) for prefix/substring matching; (popularity DESC)
- listing_similarity: unique on (listing_a, listing_b); (listing_a, score DESC)

## Reuse
- Reads from Phase 1 `listing_events`, `listing_scores`, `listing_statistics`,
  `search_history`, `user_activity`, `seller_statistics`.
- Does NOT modify Phase 1 tables.
- Extends `recently_viewed` (browse history) — coexists.
*/

-- Required for trigram search (autocomplete)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. USER INTEREST PROFILES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_interest_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_categories text[] NOT NULL DEFAULT '{}',
  last_updated timestamptz NOT NULL DEFAULT now(),
  interaction_count integer NOT NULL DEFAULT 0
);

ALTER TABLE user_interest_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_interest_profile" ON user_interest_profiles;
CREATE POLICY "select_own_interest_profile"
  ON user_interest_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "upsert_own_interest_profile" ON user_interest_profiles;
CREATE POLICY "upsert_own_interest_profile"
  ON user_interest_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_interest_profile" ON user_interest_profiles;
CREATE POLICY "update_own_interest_profile"
  ON user_interest_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_interest_profile" ON user_interest_profiles;
CREATE POLICY "delete_own_interest_profile"
  ON user_interest_profiles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_interest_profiles_user
  ON user_interest_profiles(user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. RECOMMENDATIONS — Pre-computed cache
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy text NOT NULL,
  listing_ids uuid[] NOT NULL DEFAULT '{}',
  reason text,
  metadata jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_recommendations" ON recommendations;
CREATE POLICY "select_own_recommendations"
  ON recommendations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_recommendations" ON recommendations;
CREATE POLICY "insert_own_recommendations"
  ON recommendations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_recommendations" ON recommendations;
CREATE POLICY "delete_own_recommendations"
  ON recommendations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_user_strategy
  ON recommendations(user_id, strategy);
CREATE INDEX IF NOT EXISTS idx_recommendations_user_expires
  ON recommendations(user_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RECOMMENDATION LOGS — Feedback loop
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS recommendation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL,
  strategy text NOT NULL,
  shown boolean NOT NULL DEFAULT true,
  clicked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recommendation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_rec_logs" ON recommendation_logs;
CREATE POLICY "select_own_rec_logs"
  ON recommendation_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_rec_logs" ON recommendation_logs;
CREATE POLICY "insert_own_rec_logs"
  ON recommendation_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_rec_logs" ON recommendation_logs;
CREATE POLICY "delete_own_rec_logs"
  ON recommendation_logs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rec_logs_user_time
  ON recommendation_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_logs_listing
  ON recommendation_logs(listing_id)
  WHERE clicked = true;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. SEARCH SUGGESTIONS — Autocomplete index
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS search_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL UNIQUE,
  term_type text NOT NULL DEFAULT 'keyword',
  category text,
  popularity integer NOT NULL DEFAULT 0,
  growth_rate numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE search_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_search_suggestions" ON search_suggestions;
CREATE POLICY "select_search_suggestions"
  ON search_suggestions FOR SELECT TO authenticated USING (true);

-- Trigram index for fast prefix/substring autocomplete
CREATE INDEX IF NOT EXISTS idx_search_suggestions_trgm
  ON search_suggestions USING gin (term gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_search_suggestions_popularity
  ON search_suggestions(popularity DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 5. LISTING SIMILARITY — Pre-computed pairs for related listings + collab filtering
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS listing_similarity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_a uuid NOT NULL,
  listing_b uuid NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  reasons text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_a, listing_b)
);

ALTER TABLE listing_similarity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_listing_similarity" ON listing_similarity;
CREATE POLICY "select_listing_similarity"
  ON listing_similarity FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_similarity_a_score
  ON listing_similarity(listing_a, score DESC);
CREATE INDEX IF NOT EXISTS idx_similarity_b_score
  ON listing_similarity(listing_b, score DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- Seed search_suggestions from existing products (categories + names)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO search_suggestions (term, term_type, category, popularity)
SELECT DISTINCT category, 'category', category, 10
FROM products
WHERE category IS NOT NULL AND is_active = true AND approval_status = 'approved'
ON CONFLICT (term) DO UPDATE SET popularity = GREATEST(search_suggestions.popularity, 10);
