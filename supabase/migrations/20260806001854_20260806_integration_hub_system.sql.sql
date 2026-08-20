/*
# Enterprise Integration Hub — Provider Management System (Retry 2)

Creates 7 tables for centralized third-party provider management.
All RLS policies use DROP POLICY IF EXISTS + CREATE POLICY pattern.
*/

-- ─── integration_providers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  provider_name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text,
  icon text,
  documentation_url text,
  supported_features text[] DEFAULT '{}',
  config_schema jsonb DEFAULT '{}',
  is_enabled boolean DEFAULT false,
  is_connected boolean DEFAULT false,
  environment text DEFAULT 'sandbox',
  is_default boolean DEFAULT false,
  display_order int DEFAULT 100,
  status text DEFAULT 'inactive',
  is_deleted boolean DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE integration_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_providers" ON integration_providers;
CREATE POLICY "admin_read_providers" ON integration_providers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "superadmin_insert_providers" ON integration_providers;
CREATE POLICY "superadmin_insert_providers" ON integration_providers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));
DROP POLICY IF EXISTS "superadmin_update_providers" ON integration_providers;
CREATE POLICY "superadmin_update_providers" ON integration_providers FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin')) WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));
DROP POLICY IF EXISTS "superadmin_delete_providers" ON integration_providers;
CREATE POLICY "superadmin_delete_providers" ON integration_providers FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));

-- ─── integration_provider_settings ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  setting_value text,
  is_secret boolean DEFAULT false,
  is_required boolean DEFAULT false,
  description text,
  category text DEFAULT 'general',
  status text DEFAULT 'active',
  is_deleted boolean DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(provider_id, setting_key)
);
ALTER TABLE integration_provider_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_provider_settings" ON integration_provider_settings;
CREATE POLICY "admin_read_provider_settings" ON integration_provider_settings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "superadmin_insert_provider_settings" ON integration_provider_settings;
CREATE POLICY "superadmin_insert_provider_settings" ON integration_provider_settings FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));
DROP POLICY IF EXISTS "superadmin_update_provider_settings" ON integration_provider_settings;
CREATE POLICY "superadmin_update_provider_settings" ON integration_provider_settings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin')) WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));
DROP POLICY IF EXISTS "superadmin_delete_provider_settings" ON integration_provider_settings;
CREATE POLICY "superadmin_delete_provider_settings" ON integration_provider_settings FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));

-- ─── integration_provider_logs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_provider_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid REFERENCES integration_providers(id) ON DELETE SET NULL,
  provider_key text,
  admin_id uuid,
  action text NOT NULL,
  result text DEFAULT 'success',
  error_message text,
  ip_address text,
  metadata jsonb DEFAULT '{}',
  status text DEFAULT 'active',
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE integration_provider_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_provider_logs" ON integration_provider_logs;
CREATE POLICY "admin_read_provider_logs" ON integration_provider_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "admin_insert_provider_logs" ON integration_provider_logs;
CREATE POLICY "admin_insert_provider_logs" ON integration_provider_logs FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

-- ─── integration_health_checks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  health_status text NOT NULL DEFAULT 'unknown',
  response_time_ms int,
  error_message text,
  checked_by uuid,
  checked_at timestamptz DEFAULT now(),
  status text DEFAULT 'active',
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE integration_health_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_health_checks" ON integration_health_checks;
CREATE POLICY "admin_read_health_checks" ON integration_health_checks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "admin_insert_health_checks" ON integration_health_checks;
CREATE POLICY "admin_insert_health_checks" ON integration_health_checks FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));

-- ─── integration_webhooks ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  webhook_url text,
  callback_url text,
  webhook_secret text,
  expected_events text[] DEFAULT '{}',
  last_received_at timestamptz,
  last_event_type text,
  status text DEFAULT 'inactive',
  is_deleted boolean DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE integration_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_webhooks" ON integration_webhooks;
CREATE POLICY "admin_read_webhooks" ON integration_webhooks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "superadmin_insert_webhooks" ON integration_webhooks;
CREATE POLICY "superadmin_insert_webhooks" ON integration_webhooks FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));
DROP POLICY IF EXISTS "superadmin_update_webhooks" ON integration_webhooks;
CREATE POLICY "superadmin_update_webhooks" ON integration_webhooks FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin')) WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));
DROP POLICY IF EXISTS "superadmin_delete_webhooks" ON integration_webhooks;
CREATE POLICY "superadmin_delete_webhooks" ON integration_webhooks FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));

-- ─── integration_api_keys ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  key_name text NOT NULL,
  key_value text,
  environment text DEFAULT 'sandbox',
  is_active boolean DEFAULT true,
  last_rotated_at timestamptz,
  expires_at timestamptz,
  status text DEFAULT 'active',
  is_deleted boolean DEFAULT false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE integration_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_api_keys" ON integration_api_keys;
CREATE POLICY "admin_read_api_keys" ON integration_api_keys FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "superadmin_insert_api_keys" ON integration_api_keys;
CREATE POLICY "superadmin_insert_api_keys" ON integration_api_keys FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));
DROP POLICY IF EXISTS "superadmin_update_api_keys" ON integration_api_keys;
CREATE POLICY "superadmin_update_api_keys" ON integration_api_keys FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin')) WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));
DROP POLICY IF EXISTS "superadmin_delete_api_keys" ON integration_api_keys;
CREATE POLICY "superadmin_delete_api_keys" ON integration_api_keys FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));

-- ─── integration_usage_statistics ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_usage_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  requests_count bigint DEFAULT 0,
  success_count bigint DEFAULT 0,
  error_count bigint DEFAULT 0,
  avg_response_time_ms int DEFAULT 0,
  total_cost numeric(12,4) DEFAULT 0,
  period_date date NOT NULL DEFAULT CURRENT_DATE,
  metadata jsonb DEFAULT '{}',
  status text DEFAULT 'active',
  is_deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE integration_usage_statistics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read_usage_stats" ON integration_usage_statistics;
CREATE POLICY "admin_read_usage_stats" ON integration_usage_statistics FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "superadmin_insert_usage_stats" ON integration_usage_statistics;
CREATE POLICY "superadmin_insert_usage_stats" ON integration_usage_statistics FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));
DROP POLICY IF EXISTS "superadmin_update_usage_stats" ON integration_usage_statistics;
CREATE POLICY "superadmin_update_usage_stats" ON integration_usage_statistics FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin')) WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_role = 'super_admin'));

-- ─── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_int_providers_category ON integration_providers(category);
CREATE INDEX IF NOT EXISTS idx_int_providers_status ON integration_providers(status);
CREATE INDEX IF NOT EXISTS idx_int_settings_provider ON integration_provider_settings(provider_id);
CREATE INDEX IF NOT EXISTS idx_int_logs_provider ON integration_provider_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_int_logs_created ON integration_provider_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_int_health_provider ON integration_health_checks(provider_id);
CREATE INDEX IF NOT EXISTS idx_int_health_checked ON integration_health_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_int_webhooks_provider ON integration_webhooks(provider_id);
CREATE INDEX IF NOT EXISTS idx_int_apikeys_provider ON integration_api_keys(provider_id);
CREATE INDEX IF NOT EXISTS idx_int_usage_provider ON integration_usage_statistics(provider_id);
CREATE INDEX IF NOT EXISTS idx_int_usage_date ON integration_usage_statistics(period_date DESC);

-- ─── Seed Default Providers ─────────────────────────────────────────────
INSERT INTO integration_providers (provider_key, provider_name, category, description, supported_features, config_schema, display_order, status) VALUES
  ('openai', 'OpenAI', 'ai', 'GPT models for AI assistant, content generation, and analytics', ARRAY['chat','embeddings','image_generation','transcription'], '{"api_key":{"type":"secret","required":true},"organization_id":{"type":"text"},"default_model":{"type":"select","options":["gpt-4o","gpt-4o-mini","gpt-4-turbo","gpt-3.5-turbo"],"default":"gpt-4o-mini"},"max_tokens":{"type":"number","default":4096},"temperature":{"type":"number","default":0.7},"timeout":{"type":"number","default":30},"rate_limit":{"type":"number","default":60}}', 1, 'inactive'),
  ('grok_xai', 'Grok (xAI)', 'ai', 'xAI Grok models for conversational AI', ARRAY['chat'], '{"api_key":{"type":"secret","required":true},"default_model":{"type":"select","options":["grok-2","grok-beta"],"default":"grok-beta"},"max_tokens":{"type":"number","default":4096},"temperature":{"type":"number","default":0.7},"timeout":{"type":"number","default":30}}', 2, 'inactive'),
  ('google_gemini', 'Google Gemini', 'ai', 'Google Gemini multimodal AI models', ARRAY['chat','embeddings','image_generation'], '{"api_key":{"type":"secret","required":true},"default_model":{"type":"select","options":["gemini-1.5-pro","gemini-1.5-flash","gemini-pro"],"default":"gemini-1.5-flash"},"max_tokens":{"type":"number","default":4096},"temperature":{"type":"number","default":0.7},"timeout":{"type":"number","default":30}}', 3, 'inactive'),
  ('openrouter', 'OpenRouter', 'ai', 'Unified API for multiple AI models', ARRAY['chat'], '{"api_key":{"type":"secret","required":true},"default_model":{"type":"text","default":"openai/gpt-4o-mini"},"max_tokens":{"type":"number","default":4096},"temperature":{"type":"number","default":0.7},"timeout":{"type":"number","default":30}}', 4, 'inactive'),
  ('custom_ai', 'Custom AI Provider', 'ai', 'Connect any OpenAI-compatible API endpoint', ARRAY['chat'], '{"api_key":{"type":"secret","required":true},"base_url":{"type":"text","required":true},"default_model":{"type":"text"},"max_tokens":{"type":"number","default":4096},"temperature":{"type":"number","default":0.7},"timeout":{"type":"number","default":30}}', 5, 'inactive'),
  ('paystack', 'Paystack', 'payment', 'Nigerian payment gateway for local and international payments', ARRAY['checkout','subscriptions','transfers','verification'], '{"public_key":{"type":"secret","required":true},"secret_key":{"type":"secret","required":true},"webhook_secret":{"type":"secret"}}', 10, 'inactive'),
  ('stripe', 'Stripe (Future)', 'payment', 'Global payment processing', ARRAY['checkout','subscriptions','transfers'], '{"public_key":{"type":"secret","required":true},"secret_key":{"type":"secret","required":true},"webhook_secret":{"type":"secret","required":true}}', 11, 'inactive'),
  ('flutterwave', 'Flutterwave (Future)', 'payment', 'African payment infrastructure', ARRAY['checkout','transfers'], '{"public_key":{"type":"secret","required":true},"secret_key":{"type":"secret","required":true},"webhook_secret":{"type":"secret"}}', 12, 'inactive'),
  ('wise', 'Wise (Future)', 'payment', 'International transfers', ARRAY['transfers'], '{"api_key":{"type":"secret","required":true},"profile_id":{"type":"text"}}', 13, 'inactive'),
  ('custom_payment', 'Custom Payment Provider', 'payment', 'Connect a custom payment gateway', ARRAY['checkout'], '{"api_key":{"type":"secret","required":true},"base_url":{"type":"text","required":true},"webhook_secret":{"type":"secret"}}', 14, 'inactive'),
  ('resend', 'Resend', 'email', 'Modern email API for developers', ARRAY['send','templates'], '{"api_key":{"type":"secret","required":true},"sender_name":{"type":"text","required":true},"sender_email":{"type":"email","required":true},"reply_to_email":{"type":"email"}}', 20, 'inactive'),
  ('sendgrid', 'SendGrid', 'email', 'Email delivery and marketing service', ARRAY['send','templates','marketing'], '{"api_key":{"type":"secret","required":true},"sender_name":{"type":"text","required":true},"sender_email":{"type":"email","required":true},"reply_to_email":{"type":"email"}}', 21, 'inactive'),
  ('mailgun', 'Mailgun', 'email', 'Email API for developers', ARRAY['send','templates'], '{"api_key":{"type":"secret","required":true},"domain":{"type":"text","required":true},"sender_name":{"type":"text","required":true},"sender_email":{"type":"email","required":true},"reply_to_email":{"type":"email"}}', 22, 'inactive'),
  ('amazon_ses', 'Amazon SES', 'email', 'Amazon Simple Email Service', ARRAY['send'], '{"access_key":{"type":"secret","required":true},"secret_key":{"type":"secret","required":true},"region":{"type":"text","default":"us-east-1"},"sender_name":{"type":"text","required":true},"sender_email":{"type":"email","required":true},"reply_to_email":{"type":"email"}}', 23, 'inactive'),
  ('smtp', 'SMTP', 'email', 'Standard SMTP relay', ARRAY['send'], '{"host":{"type":"text","required":true},"port":{"type":"number","default":587},"username":{"type":"text","required":true},"password":{"type":"secret","required":true},"sender_name":{"type":"text","required":true},"sender_email":{"type":"email","required":true},"reply_to_email":{"type":"email"}}', 24, 'inactive'),
  ('custom_email', 'Custom Email Provider', 'email', 'Connect a custom email API', ARRAY['send'], '{"api_key":{"type":"secret","required":true},"base_url":{"type":"text","required":true},"sender_name":{"type":"text","required":true},"sender_email":{"type":"email","required":true}}', 25, 'inactive'),
  ('twilio_sms', 'Twilio SMS', 'sms', 'Programmable SMS via Twilio', ARRAY['send_sms'], '{"account_sid":{"type":"text","required":true},"auth_token":{"type":"secret","required":true},"sender_id":{"type":"text","required":true}}', 30, 'inactive'),
  ('termii', 'Termii', 'sms', 'African SMS infrastructure', ARRAY['send_sms'], '{"api_key":{"type":"secret","required":true},"sender_id":{"type":"text","required":true}}', 31, 'inactive'),
  ('africas_talking', 'Africa''s Talking', 'sms', 'Pan-African SMS and USSD', ARRAY['send_sms'], '{"api_key":{"type":"secret","required":true},"username":{"type":"text","required":true},"sender_id":{"type":"text"}}', 32, 'inactive'),
  ('vonage_sms', 'Vonage SMS', 'sms', 'Global SMS via Vonage', ARRAY['send_sms'], '{"api_key":{"type":"secret","required":true},"api_secret":{"type":"secret","required":true},"sender_id":{"type":"text"}}', 33, 'inactive'),
  ('custom_sms', 'Custom SMS Provider', 'sms', 'Connect a custom SMS gateway', ARRAY['send_sms'], '{"api_key":{"type":"secret","required":true},"base_url":{"type":"text","required":true},"sender_id":{"type":"text"}}', 34, 'inactive'),
  ('twilio_voice', 'Twilio Voice', 'voice', 'Programmable voice calls', ARRAY['voice_call'], '{"account_sid":{"type":"text","required":true},"auth_token":{"type":"secret","required":true},"phone_number":{"type":"text","required":true}}', 40, 'inactive'),
  ('vonage_voice', 'Vonage Voice', 'voice', 'Voice API via Vonage', ARRAY['voice_call'], '{"api_key":{"type":"secret","required":true},"api_secret":{"type":"secret","required":true},"phone_number":{"type":"text"}}', 41, 'inactive'),
  ('whatsapp_business', 'WhatsApp Business API', 'whatsapp', 'WhatsApp Business Cloud API', ARRAY['send_message','templates'], '{"access_token":{"type":"secret","required":true},"phone_number_id":{"type":"text","required":true},"business_id":{"type":"text","required":true},"webhook_verify_token":{"type":"secret"}}', 50, 'inactive'),
  ('meta_cloud_api', 'Meta Cloud API', 'whatsapp', 'Meta WhatsApp Cloud API', ARRAY['send_message','templates'], '{"access_token":{"type":"secret","required":true},"phone_number_id":{"type":"text","required":true},"webhook_verify_token":{"type":"secret"}}', 51, 'inactive'),
  ('manual_review', 'Manual Review (Default)', 'kyc', 'Built-in manual KYC review workflow', ARRAY['document_check','selfie_check'], '{}', 60, 'active'),
  ('smile_id', 'Smile ID', 'kyc', 'African identity verification', ARRAY['document_check','selfie_check','address_check'], '{"api_key":{"type":"secret","required":true},"partner_id":{"type":"text","required":true},"environment":{"type":"select","options":["sandbox","production"],"default":"sandbox"}}', 61, 'inactive'),
  ('sumsub', 'Sumsub', 'kyc', 'Global identity verification', ARRAY['document_check','selfie_check','liveness'], '{"api_key":{"type":"secret","required":true},"api_secret":{"type":"secret","required":true},"app_token":{"type":"secret"}}', 62, 'inactive'),
  ('persona', 'Persona', 'kyc', 'Identity verification and KYC', ARRAY['document_check','selfie_check','liveness'], '{"api_key":{"type":"secret","required":true},"template_id":{"type":"text"},"environment":{"type":"select","options":["sandbox","production"],"default":"sandbox"}}', 63, 'inactive'),
  ('veriff', 'Veriff', 'kyc', 'AI-powered identity verification', ARRAY['document_check','selfie_check','liveness'], '{"api_key":{"type":"secret","required":true},"api_secret":{"type":"secret","required":true}}', 64, 'inactive'),
  ('custom_kyc', 'Custom KYC Provider', 'kyc', 'Connect a custom KYC service', ARRAY['document_check'], '{"api_key":{"type":"secret","required":true},"base_url":{"type":"text","required":true}}', 65, 'inactive'),
  ('fcm', 'Firebase Cloud Messaging', 'push', 'Push notifications for Android and Web', ARRAY['push_notification'], '{"server_key":{"type":"secret","required":true},"project_id":{"type":"text","required":true},"sender_id":{"type":"text"}}', 70, 'inactive'),
  ('apns', 'Apple Push (Future)', 'push', 'Push notifications for iOS', ARRAY['push_notification'], '{"team_id":{"type":"text","required":true},"key_id":{"type":"text","required":true},"private_key":{"type":"secret","required":true},"bundle_id":{"type":"text","required":true}}', 71, 'inactive'),
  ('web_push', 'Web Push (Future)', 'push', 'Browser web push notifications', ARRAY['push_notification'], '{"vapid_public_key":{"type":"secret","required":true},"vapid_private_key":{"type":"secret","required":true}}', 72, 'inactive'),
  ('supabase_storage', 'Supabase Storage', 'storage', 'Built-in Supabase file storage', ARRAY['upload','download','delete'], '{"bucket_name":{"type":"text","default":"default"}}', 80, 'active'),
  ('amazon_s3', 'Amazon S3', 'storage', 'AWS S3 object storage', ARRAY['upload','download','delete'], '{"access_key":{"type":"secret","required":true},"secret_key":{"type":"secret","required":true},"region":{"type":"text","default":"us-east-1"},"bucket":{"type":"text","required":true}}', 81, 'inactive'),
  ('cloudflare_r2', 'Cloudflare R2', 'storage', 'Cloudflare R2 object storage', ARRAY['upload','download','delete'], '{"account_id":{"type":"text","required":true},"access_key":{"type":"secret","required":true},"secret_key":{"type":"secret","required":true},"bucket":{"type":"text","required":true}}', 82, 'inactive'),
  ('google_cloud_storage', 'Google Cloud Storage', 'storage', 'GCS object storage', ARRAY['upload','download','delete'], '{"project_id":{"type":"text","required":true},"service_account_key":{"type":"secret","required":true},"bucket":{"type":"text","required":true}}', 83, 'inactive'),
  ('custom_storage', 'Custom Storage', 'storage', 'Connect a custom storage provider', ARRAY['upload','download','delete'], '{"api_key":{"type":"secret","required":true},"base_url":{"type":"text","required":true},"bucket":{"type":"text"}}', 84, 'inactive'),
  ('google_analytics_4', 'Google Analytics 4', 'analytics', 'Optional enhanced analytics', ARRAY['page_view','event_tracking'], '{"measurement_id":{"type":"text","required":true},"api_secret":{"type":"secret"}}', 90, 'inactive'),
  ('microsoft_clarity', 'Microsoft Clarity', 'analytics', 'Free session recording and heatmaps', ARRAY['session_recording','heatmaps'], '{"project_id":{"type":"text","required":true}}', 91, 'inactive'),
  ('posthog', 'PostHog', 'analytics', 'Product analytics and feature flags', ARRAY['event_tracking','funnels','feature_flags'], '{"api_key":{"type":"secret","required":true},"project_api_host":{"type":"text"}}', 92, 'inactive'),
  ('mixpanel', 'Mixpanel', 'analytics', 'Product analytics', ARRAY['event_tracking','funnels'], '{"project_token":{"type":"secret","required":true}}', 93, 'inactive'),
  ('canva_connect', 'Canva Connect API', 'design', 'Canva design integration', ARRAY['design_export','templates'], '{"client_id":{"type":"text","required":true},"client_secret":{"type":"secret","required":true}}', 100, 'inactive'),
  ('unsplash', 'Unsplash', 'design', 'Free high-quality stock photos', ARRAY['image_search'], '{"api_key":{"type":"secret","required":true}}', 101, 'inactive'),
  ('pexels', 'Pexels', 'design', 'Free stock photos and videos', ARRAY['image_search','video_search'], '{"api_key":{"type":"secret","required":true}}', 102, 'inactive'),
  ('pixabay', 'Pixabay', 'design', 'Free images and videos', ARRAY['image_search','video_search'], '{"api_key":{"type":"secret","required":true}}', 103, 'inactive'),
  ('custom_media', 'Custom Media Provider', 'design', 'Connect a custom media source', ARRAY['image_search'], '{"api_key":{"type":"secret","required":true},"base_url":{"type":"text","required":true}}', 104, 'inactive')
ON CONFLICT (provider_key) DO NOTHING;
