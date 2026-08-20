-- Add provider column to ai_usage and ai_messages for per-provider tracking
-- Also adds estimated_cost and provider-level indexes

ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'groq';
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS estimated_cost numeric NOT NULL DEFAULT 0;
ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'groq';

-- Groq pricing: ~$0.59 per 1M tokens for llama-3.3-70b (~$0.00000059 per token)
-- Gemini pricing: ~$0.075 per 1M tokens for gemini-1.5-flash (~$0.000000075 per token)
-- We store a conservative estimate; exact costs vary by model

CREATE INDEX IF NOT EXISTS idx_ai_usage_provider ON ai_usage(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_success ON ai_usage(success, created_at DESC);
