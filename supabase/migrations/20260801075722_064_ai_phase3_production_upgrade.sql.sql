/*
# AI Phase 3 — Production Upgrade Schema

## Purpose
Upgrades DRIGHT's AI system to production-grade with persistent conversation memory,
image library, response cache, voice transcription logs, AI context engine, and
expanded usage analytics.

## New Tables
1. ai_voice_transcriptions — voice transcription records with confidence/timestamps
2. ai_cache — server-side response cache with TTL and invalidation
3. ai_context_snapshots — user context loaded before AI requests
4. ai_abuse_log — prompt injection attempts and abuse detection logs

## Modified Tables
- ai_images — added columns: favorite, deleted_at, storage_path, generation_ms, cost, size, quality
- ai_conversations — added columns: title, archived, summary, provider, tokens_total, cost_total, updated_at
- ai_usage — added columns: cache_hit, fallback_used, conversation_id

## Security
- All new tables have RLS enabled with owner-scoped policies
- ai_cache is shared (anon+authenticated), no user data in values
- ai_abuse_log is admin-only
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ai_images — add new columns for image library
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_images' AND column_name = 'favorite') THEN
    ALTER TABLE ai_images ADD COLUMN favorite boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_images' AND column_name = 'deleted_at') THEN
    ALTER TABLE ai_images ADD COLUMN deleted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_images' AND column_name = 'storage_path') THEN
    ALTER TABLE ai_images ADD COLUMN storage_path text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_images' AND column_name = 'generation_ms') THEN
    ALTER TABLE ai_images ADD COLUMN generation_ms integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_images' AND column_name = 'cost') THEN
    ALTER TABLE ai_images ADD COLUMN cost numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_images' AND column_name = 'size') THEN
    ALTER TABLE ai_images ADD COLUMN size text DEFAULT '1024x1024';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_images' AND column_name = 'quality') THEN
    ALTER TABLE ai_images ADD COLUMN quality text DEFAULT 'standard';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_images_user_deleted ON ai_images(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_ai_images_user_favorite ON ai_images(user_id, favorite) WHERE favorite = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ai_conversations — add columns for persistent memory
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_conversations' AND column_name = 'title') THEN
    ALTER TABLE ai_conversations ADD COLUMN title text DEFAULT 'New Conversation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_conversations' AND column_name = 'archived') THEN
    ALTER TABLE ai_conversations ADD COLUMN archived boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_conversations' AND column_name = 'summary') THEN
    ALTER TABLE ai_conversations ADD COLUMN summary text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_conversations' AND column_name = 'provider') THEN
    ALTER TABLE ai_conversations ADD COLUMN provider text DEFAULT 'groq';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_conversations' AND column_name = 'tokens_total') THEN
    ALTER TABLE ai_conversations ADD COLUMN tokens_total integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_conversations' AND column_name = 'cost_total') THEN
    ALTER TABLE ai_conversations ADD COLUMN cost_total numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_conversations' AND column_name = 'updated_at') THEN
    ALTER TABLE ai_conversations ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_conversations' AND column_name = 'user_id' AND column_default IS NULL) THEN
    ALTER TABLE ai_conversations ALTER COLUMN user_id SET DEFAULT auth.uid();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_archived ON ai_conversations(user_id, archived);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ai_usage — add cache_hit and fallback tracking
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage' AND column_name = 'cache_hit') THEN
    ALTER TABLE ai_usage ADD COLUMN cache_hit boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage' AND column_name = 'fallback_used') THEN
    ALTER TABLE ai_usage ADD COLUMN fallback_used boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage' AND column_name = 'conversation_id') THEN
    ALTER TABLE ai_usage ADD COLUMN conversation_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_usage_feature_created ON ai_usage(feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_created ON ai_usage(provider, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ai_voice_transcriptions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_voice_transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  audio_url text NOT NULL DEFAULT '',
  storage_path text,
  transcript text NOT NULL DEFAULT '',
  language text,
  language_confidence numeric,
  duration_seconds numeric DEFAULT 0,
  model text NOT NULL DEFAULT 'whisper-1',
  provider text NOT NULL DEFAULT 'openai',
  confidence numeric,
  segments jsonb,
  context_type text,
  context_id uuid,
  status text NOT NULL DEFAULT 'completed',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_voice_transcriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transcriptions" ON ai_voice_transcriptions;
CREATE POLICY "select_own_transcriptions" ON ai_voice_transcriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_transcriptions" ON ai_voice_transcriptions;
CREATE POLICY "insert_own_transcriptions" ON ai_voice_transcriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_transcriptions" ON ai_voice_transcriptions;
CREATE POLICY "delete_own_transcriptions" ON ai_voice_transcriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_voice_user_created ON ai_voice_transcriptions(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. ai_cache — shared response cache
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text UNIQUE NOT NULL,
  cache_value jsonb NOT NULL,
  feature text NOT NULL,
  ttl_seconds integer NOT NULL DEFAULT 300,
  hit_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_ai_cache" ON ai_cache;
CREATE POLICY "read_ai_cache" ON ai_cache
  FOR SELECT TO anon, authenticated USING (expires_at > now());

DROP POLICY IF EXISTS "insert_ai_cache" ON ai_cache;
CREATE POLICY "insert_ai_cache" ON ai_cache
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_ai_cache" ON ai_cache;
CREATE POLICY "update_ai_cache" ON ai_cache
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_ai_cache" ON ai_cache;
CREATE POLICY "delete_ai_cache" ON ai_cache
  FOR DELETE TO anon, authenticated USING (expires_at <= now());

CREATE INDEX IF NOT EXISTS idx_ai_cache_key_expires ON ai_cache(cache_key, expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_cache_feature ON ai_cache(feature);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. ai_context_snapshots
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  context_type text NOT NULL DEFAULT 'general',
  context_data jsonb NOT NULL DEFAULT '{}',
  message_count integer NOT NULL DEFAULT 0,
  tokens_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_context_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_context" ON ai_context_snapshots;
CREATE POLICY "select_own_context" ON ai_context_snapshots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_context" ON ai_context_snapshots;
CREATE POLICY "insert_own_context" ON ai_context_snapshots
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_context" ON ai_context_snapshots;
CREATE POLICY "delete_own_context" ON ai_context_snapshots
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_context_user_created ON ai_context_snapshots(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. ai_abuse_log
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_abuse_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ip_address text,
  feature text,
  prompt text NOT NULL DEFAULT '',
  violation_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  blocked boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_abuse_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_abuse_log_admin" ON ai_abuse_log;
CREATE POLICY "select_abuse_log_admin" ON ai_abuse_log
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'ai_admin', 'system_admin', 'marketplace_admin', 'moderator'))
  );

DROP POLICY IF EXISTS "insert_abuse_log" ON ai_abuse_log;
CREATE POLICY "insert_abuse_log" ON ai_abuse_log
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_ablog_user_created ON ai_abuse_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_ablog_severity ON ai_abuse_log(severity, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. RLS for ai_images (if missing)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_images' AND policyname = 'select_own_images') THEN
    EXECUTE 'CREATE POLICY "select_own_images" ON ai_images FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_images' AND policyname = 'insert_own_images') THEN
    EXECUTE 'CREATE POLICY "insert_own_images" ON ai_images FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_images' AND policyname = 'update_own_images') THEN
    EXECUTE 'CREATE POLICY "update_own_images" ON ai_images FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_images' AND policyname = 'delete_own_images') THEN
    EXECUTE 'CREATE POLICY "delete_own_images" ON ai_images FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. RLS for ai_conversations (if missing)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_conversations' AND policyname = 'select_own_conversations') THEN
    EXECUTE 'CREATE POLICY "select_own_conversations" ON ai_conversations FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_conversations' AND policyname = 'insert_own_conversations') THEN
    EXECUTE 'CREATE POLICY "insert_own_conversations" ON ai_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_conversations' AND policyname = 'update_own_conversations') THEN
    EXECUTE 'CREATE POLICY "update_own_conversations" ON ai_conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_conversations' AND policyname = 'delete_own_conversations') THEN
    EXECUTE 'CREATE POLICY "delete_own_conversations" ON ai_conversations FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. RLS for ai_messages (if missing)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_messages' AND policyname = 'select_own_messages') THEN
    EXECUTE 'CREATE POLICY "select_own_messages" ON ai_messages FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_messages' AND policyname = 'insert_own_messages') THEN
    EXECUTE 'CREATE POLICY "insert_own_messages" ON ai_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_messages' AND policyname = 'delete_own_messages') THEN
    EXECUTE 'CREATE POLICY "delete_own_messages" ON ai_messages FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. RLS for ai_usage
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage' AND policyname = 'select_usage_admin') THEN
    EXECUTE 'CREATE POLICY "select_usage_admin" ON ai_usage FOR SELECT TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN (''super_admin'', ''ai_admin'', ''system_admin'', ''marketplace_admin'', ''moderator'')))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage' AND policyname = 'insert_usage') THEN
    EXECUTE 'CREATE POLICY "insert_usage" ON ai_usage FOR INSERT TO anon, authenticated WITH CHECK (true)';
  END IF;
END $$;
