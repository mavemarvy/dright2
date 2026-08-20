-- Migration 072b — Add missing RPCs for conversationMemory.ts and responseCache.ts

CREATE OR REPLACE FUNCTION increment_conversation_stats(p_conversation_id uuid, p_tokens int DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_conversations SET tokens_total = COALESCE(tokens_total, 0) + p_tokens, updated_at = now()
  WHERE id = p_conversation_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION increment_cache_hits(p_cache_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_cache SET hit_count = COALESCE(hit_count, 0) + 1, last_accessed_at = now()
  WHERE cache_key = p_cache_key;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_conversation_stats(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_cache_hits(text) TO authenticated;