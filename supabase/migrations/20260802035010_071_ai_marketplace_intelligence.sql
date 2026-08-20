/*
# Phase 3.2 — AI Marketplace Intelligence
Extends existing ai_conversations table, creates ai_moderation_queue + ai_moderation_rules
*/

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS assistant_type text DEFAULT 'shopping';
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS messages jsonb DEFAULT '[]'::jsonb;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS message_count int DEFAULT 0;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

UPDATE ai_conversations SET assistant_type = COALESCE(context_type, 'shopping') WHERE assistant_type IS NULL OR assistant_type = '';

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_type ON ai_conversations(user_id, assistant_type);

CREATE TABLE IF NOT EXISTS ai_moderation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL DEFAULT 'product',
  entity_id uuid NOT NULL,
  content text NOT NULL,
  content_type text NOT NULL DEFAULT 'listing',
  risk_score numeric NOT NULL DEFAULT 0,
  risk_flags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  auto_action text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderation_status ON ai_moderation_queue(status);
CREATE INDEX IF NOT EXISTS idx_moderation_entity ON ai_moderation_queue(entity_type, entity_id);
ALTER TABLE ai_moderation_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_select_moderation" ON ai_moderation_queue;
CREATE POLICY "admin_select_moderation" ON ai_moderation_queue FOR SELECT TO authenticated USING (is_admin_user());
DROP POLICY IF EXISTS "admin_update_moderation" ON ai_moderation_queue;
CREATE POLICY "admin_update_moderation" ON ai_moderation_queue FOR UPDATE TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
DROP POLICY IF EXISTS "admin_insert_moderation" ON ai_moderation_queue;
CREATE POLICY "admin_insert_moderation" ON ai_moderation_queue FOR INSERT TO authenticated WITH CHECK (is_admin_user());
DROP POLICY IF EXISTS "admin_delete_moderation" ON ai_moderation_queue;
CREATE POLICY "admin_delete_moderation" ON ai_moderation_queue FOR DELETE TO authenticated USING (is_admin_user());

CREATE TABLE IF NOT EXISTS ai_moderation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type text NOT NULL,
  pattern text NOT NULL,
  action text NOT NULL DEFAULT 'review',
  severity text NOT NULL DEFAULT 'medium',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ai_moderation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_select_mod_rules" ON ai_moderation_rules;
CREATE POLICY "admin_select_mod_rules" ON ai_moderation_rules FOR SELECT TO authenticated USING (is_admin_user());
DROP POLICY IF EXISTS "admin_insert_mod_rules" ON ai_moderation_rules;
CREATE POLICY "admin_insert_mod_rules" ON ai_moderation_rules FOR INSERT TO authenticated WITH CHECK (is_admin_user());
DROP POLICY IF EXISTS "admin_update_mod_rules" ON ai_moderation_rules;
CREATE POLICY "admin_update_mod_rules" ON ai_moderation_rules FOR UPDATE TO authenticated USING (is_admin_user()) WITH CHECK (is_admin_user());
DROP POLICY IF EXISTS "admin_delete_mod_rules" ON ai_moderation_rules;
CREATE POLICY "admin_delete_mod_rules" ON ai_moderation_rules FOR DELETE TO authenticated USING (is_admin_user());

INSERT INTO ai_moderation_rules (rule_type, pattern, action, severity) VALUES
  ('spam', '(?i)(buy now|click here|free money|get rich|crypto giveaway)', 'review', 'high'),
  ('offensive', '(?i)(hate|stupid|idiot|moron)', 'review', 'medium'),
  ('scam', '(?i)(western union|money gram|advance fee|wire transfer first)', 'reject', 'high'),
  ('duplicate', 'same_title_same_seller', 'review', 'medium'),
  ('copyright', '(?i)(cracked|pirated|nulled|warez)', 'reject', 'high'),
  ('ai_spam', '(?i)(as an ai language model|i cannot help with)', 'review', 'low')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION save_ai_conversation(
  p_assistant_type text DEFAULT 'shopping',
  p_title text DEFAULT 'New Conversation',
  p_messages jsonb DEFAULT '[]'::jsonb,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_conversation_id IS NOT NULL THEN
    UPDATE ai_conversations
    SET messages = p_messages, context = p_context, message_count = jsonb_array_length(p_messages),
        last_message_at = now(), updated_at = now(), title = p_title, assistant_type = p_assistant_type
    WHERE id = p_conversation_id AND user_id = auth.uid()
    RETURNING id INTO v_id;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO ai_conversations (user_id, assistant_type, title, messages, context, message_count, last_message_at)
    VALUES (auth.uid(), p_assistant_type, p_title, p_messages, p_context, jsonb_array_length(p_messages), now())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_conversations(p_assistant_type text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'assistant_type', assistant_type, 'title', title,
    'message_count', message_count, 'last_message_at', last_message_at,
    'created_at', created_at
  ) ORDER BY last_message_at DESC NULLS LAST), '[]'::jsonb)
  FROM ai_conversations
  WHERE user_id = auth.uid() AND (p_assistant_type IS NULL OR assistant_type = p_assistant_type);
$$;

CREATE OR REPLACE FUNCTION get_ai_conversation_messages(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT messages FROM ai_conversations WHERE id = p_conversation_id AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION ai_product_optimization_score(p_product_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'title_score', LEAST(100, GREATEST(0,
      CASE WHEN char_length(name) >= 10 AND char_length(name) <= 80 THEN 80
           WHEN char_length(name) >= 5 THEN 50 ELSE 20 END
      + CASE WHEN name ~ '[0-9]' THEN 10 ELSE 0 END
      + CASE WHEN name ~* '\b(best|premium|pro|ultimate|complete|guide)\b' THEN 10 ELSE 0 END
    )),
    'description_score', LEAST(100, GREATEST(0,
      CASE WHEN char_length(COALESCE(description, '')) >= 200 THEN 80
           WHEN char_length(COALESCE(description, '')) >= 100 THEN 60
           WHEN char_length(COALESCE(description, '')) >= 50 THEN 40
           ELSE 15 END
      + CASE WHEN COALESCE(description, '') ~* '\b(feature|include|benefit|quality|professional)\b' THEN 15 ELSE 0 END
      + LEAST(5, char_length(COALESCE(description, '')) / 200)
    )),
    'image_score', CASE WHEN image_url IS NOT NULL THEN 90 ELSE 20 END,
    'pricing_score', LEAST(100, GREATEST(0,
      CASE WHEN is_free = true THEN 90
           WHEN price > 0 AND price <= 100 THEN 85
           WHEN price > 100 AND price <= 1000 THEN 80
           WHEN price > 1000 AND price <= 10000 THEN 70
           WHEN price > 10000 THEN 50
           ELSE 30 END
      + CASE WHEN commission_rate >= 10 AND commission_rate <= 30 THEN 10 ELSE 0 END
    )),
    'seo_score', LEAST(100, GREATEST(0,
      CASE WHEN tags IS NOT NULL AND array_length(tags, 1) >= 3 THEN 30 ELSE 5 END
      + CASE WHEN category IS NOT NULL AND category != '' THEN 20 ELSE 0 END
      + CASE WHEN description IS NOT NULL AND description ~* '[a-z]{3,}' THEN 20 ELSE 0 END
      + CASE WHEN specifications IS NOT NULL THEN 20 ELSE 0 END
      + CASE WHEN faqs IS NOT NULL AND jsonb_array_length(faqs) > 0 THEN 10 ELSE 0 END
    )),
    'tags_count', CASE WHEN tags IS NOT NULL THEN coalesce(array_length(tags, 1), 0) ELSE 0 END,
    'has_specifications', specifications IS NOT NULL,
    'has_faqs', faqs IS NOT NULL AND jsonb_array_length(faqs) > 0,
    'description_length', char_length(COALESCE(description, ''))
  )
  FROM products WHERE id = p_product_id;
$$;

CREATE OR REPLACE FUNCTION moderate_product_content(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
  v_risk_score numeric := 0;
  v_flags text[] := '{}';
  v_action text := 'approve';
  v_rule RECORD;
BEGIN
  SELECT name, description, category, tags, uploaded_by INTO v_product FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  FOR v_rule IN SELECT * FROM ai_moderation_rules WHERE is_active = true LOOP
    IF v_product.name ~* v_rule.pattern OR COALESCE(v_product.description, '') ~* v_rule.pattern THEN
      v_flags := array_append(v_flags, v_rule.rule_type);
      v_risk_score := v_risk_score + CASE v_rule.severity WHEN 'high' THEN 40 WHEN 'medium' THEN 20 WHEN 'low' THEN 10 END;
      IF v_rule.action = 'reject' THEN v_action := 'reject'; END IF;
    END IF;
  END LOOP;

  IF char_length(v_product.name) < 3 THEN
    v_flags := array_append(v_flags, 'title_too_short');
    v_risk_score := v_risk_score + 10;
  END IF;
  IF char_length(COALESCE(v_product.description, '')) < 20 THEN
    v_flags := array_append(v_flags, 'description_too_short');
    v_risk_score := v_risk_score + 10;
  END IF;

  PERFORM 1 FROM products p2
    WHERE p2.id != p_product_id AND p2.uploaded_by = v_product.uploaded_by AND p2.name = v_product.name AND p2.is_active = true;
  IF FOUND THEN
    v_flags := array_append(v_flags, 'potential_duplicate');
    v_risk_score := v_risk_score + 25;
  END IF;

  v_risk_score := LEAST(100, v_risk_score);
  IF v_action != 'reject' AND v_risk_score >= 50 THEN v_action := 'review';
  ELSIF v_action != 'reject' AND v_risk_score < 25 THEN v_action := 'approve';
  END IF;

  INSERT INTO ai_moderation_queue (entity_type, entity_id, content, risk_score, risk_flags, auto_action)
  VALUES ('product', p_product_id, v_product.name || ' ' || COALESCE(v_product.description, ''), v_risk_score, v_flags, v_action);

  RETURN jsonb_build_object('risk_score', v_risk_score, 'flags', v_flags, 'action', v_action);
END;
$$;

CREATE OR REPLACE FUNCTION get_moderation_queue(p_status text DEFAULT 'pending', p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id, 'entity_type', q.entity_type, 'entity_id', q.entity_id,
    'content', q.content, 'risk_score', q.risk_score, 'risk_flags', q.risk_flags,
    'status', q.status, 'auto_action', q.auto_action,
    'reviewed_by', q.reviewed_by, 'reviewed_at', q.reviewed_at,
    'review_note', q.review_note, 'created_at', q.created_at
  ) ORDER BY q.risk_score DESC), '[]'::jsonb)
  FROM ai_moderation_queue q
  WHERE q.status = p_status
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION update_moderation_status(p_id uuid, p_status text, p_note text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_moderation_queue
  SET status = p_status, review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION save_ai_conversation(text, text, jsonb, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_conversations(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_conversation_messages(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION ai_product_optimization_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION moderate_product_content(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_moderation_queue(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION update_moderation_status(uuid, text, text) TO authenticated;