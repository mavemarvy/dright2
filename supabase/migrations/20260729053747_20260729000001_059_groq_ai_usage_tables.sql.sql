/*
# Groq AI Integration — Usage Logging Tables

## Purpose
Adds two new tables to support the Groq AI integration:
1. `ai_messages` — Individual AI messages (separate from ai_conversations which stores the chat thread)
2. `ai_usage` — Per-request usage logging for analytics, rate limiting, and cost tracking

## New Tables

### ai_messages
- `id` (uuid, PK)
- `conversation_id` (uuid, FK to ai_conversations, CASCADE DELETE)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid(), FK to auth.users, CASCADE DELETE)
- `role` (text: 'user' | 'assistant' | 'system')
- `content` (text, NOT NULL)
- `tokens` (integer, default 0)
- `model` (text, default 'groq-llama-3.3-70b')
- `feature` (text — which AI feature was used: chat, search, product-description, rewrite, summarize, moderate)
- `latency_ms` (integer, response time in ms)
- `created_at` (timestamptz, DEFAULT now())

### ai_usage
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL, DEFAULT auth.uid(), FK to auth.users, CASCADE DELETE)
- `feature` (text, NOT NULL — which endpoint was called)
- `prompt` (text, NOT NULL — sanitized input prompt)
- `response` (text — AI response, nullable for failed requests)
- `tokens` (integer, default 0)
- `model` (text, default 'groq-llama-3.3-70b')
- `latency_ms` (integer, response time)
- `success` (boolean, default true)
- `error_message` (text, nullable)
- `created_at` (timestamptz, DEFAULT now())

## Security
- RLS enabled on both tables
- Owner-scoped CRUD: authenticated users can only access their own rows
- `user_id` defaults to `auth.uid()` so inserts from the edge function (using service role) work correctly

## Indexes
- `idx_ai_messages_conv` on ai_messages(conversation_id, created_at)
- `idx_ai_usage_user_date` on ai_usage(user_id, created_at DESC)
- `idx_ai_usage_feature` on ai_usage(feature, created_at DESC)

## Notes
1. ai_conversations table already exists from migration 055 — not recreated here
2. ai_quality_scores, ai_recommendations, ai_forecasts, ai_reports also exist — untouched
3. Both new tables use DEFAULT auth.uid() so service-role inserts that omit user_id still work
4. The edge function will insert into ai_usage using the service role key, bypassing RLS
5. Frontend reads of ai_usage / ai_messages go through RLS-scoped authenticated queries
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. AI MESSAGES TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  tokens integer NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT 'groq-llama-3.3-70b',
  feature text NOT NULL DEFAULT 'chat',
  latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_messages" ON ai_messages;
CREATE POLICY "select_own_ai_messages"
  ON ai_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ai_messages" ON ai_messages;
CREATE POLICY "insert_own_ai_messages"
  ON ai_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ai_messages" ON ai_messages;
CREATE POLICY "delete_own_ai_messages"
  ON ai_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_messages_user ON ai_messages(user_id, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. AI USAGE TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  prompt text NOT NULL,
  response text,
  tokens integer NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT 'groq-llama-3.3-70b',
  latency_ms integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_usage" ON ai_usage;
CREATE POLICY "select_own_ai_usage"
  ON ai_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_ai_usage" ON ai_usage;
CREATE POLICY "insert_own_ai_usage"
  ON ai_usage FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_ai_usage" ON ai_usage;
CREATE POLICY "delete_own_ai_usage"
  ON ai_usage FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage(feature, created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. ADD UPDATE POLICY TO ai_conversations (was missing in migration 055)
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "update_own_conversations" ON ai_conversations;
CREATE POLICY "update_own_conversations"
  ON ai_conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
