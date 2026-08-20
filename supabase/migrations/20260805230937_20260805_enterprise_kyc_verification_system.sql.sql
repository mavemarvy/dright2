-- Enterprise KYC Verification & Compliance System
-- Prompt 0.5 - Using kyc_ prefix to avoid conflicts with existing verification tables

-- ─── KYC Providers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,
  provider_type TEXT NOT NULL DEFAULT 'manual',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  config_schema JSONB DEFAULT '{}',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL UNIQUE REFERENCES kyc_providers(id) ON DELETE CASCADE,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  api_key TEXT,
  secret_key TEXT,
  webhook_secret TEXT,
  mode TEXT NOT NULL DEFAULT 'sandbox',
  health_status TEXT DEFAULT 'unknown',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  error_log JSONB DEFAULT '[]',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type TEXT NOT NULL UNIQUE,
  is_required BOOLEAN NOT NULL DEFAULT false,
  required_for_action TEXT,
  description TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  user_type TEXT NOT NULL DEFAULT 'buyer',
  status TEXT NOT NULL DEFAULT 'not_started',
  provider_id UUID REFERENCES kyc_providers(id),
  verification_level TEXT DEFAULT 'standard',
  expires_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  reviewer_id UUID REFERENCES users(id),
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES kyc_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_id UUID REFERENCES kyc_providers(id),
  provider_reference TEXT,
  provider_result JSONB,
  reviewer_id UUID REFERENCES users(id),
  reviewer_notes TEXT,
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_url TEXT NOT NULL,
  doc_name TEXT,
  doc_mime_type TEXT,
  doc_size_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  replaced_by UUID REFERENCES kyc_documents(id),
  reviewer_id UUID REFERENCES users(id),
  reviewer_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  notes TEXT,
  internal_notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  admin_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  ip_address TEXT,
  device_info TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Enable RLS ────────────────────────────────────────────────────────
ALTER TABLE kyc_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_audit_logs ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ──────────────────────────────────────────────────────
CREATE POLICY "read_kyc_providers" ON kyc_providers
  FOR SELECT TO authenticated USING (is_deleted = false);
CREATE POLICY "insert_kyc_provider" ON kyc_providers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_kyc_provider" ON kyc_providers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_kyc_provider_settings" ON kyc_provider_settings
  FOR SELECT TO authenticated USING (is_deleted = false);
CREATE POLICY "insert_kyc_provider_setting" ON kyc_provider_settings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_kyc_provider_setting" ON kyc_provider_settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_kyc_rules" ON kyc_rules
  FOR SELECT TO authenticated USING (is_deleted = false);
CREATE POLICY "insert_kyc_rule" ON kyc_rules
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_kyc_rule" ON kyc_rules
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "select_own_kyc_profile" ON kyc_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_kyc_profile" ON kyc_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_kyc_profile" ON kyc_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "select_own_kyc_submission" ON kyc_submissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_kyc_submission" ON kyc_submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_kyc_submission" ON kyc_submissions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "select_own_kyc_document" ON kyc_documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert_own_kyc_document" ON kyc_documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_kyc_document" ON kyc_documents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "select_own_kyc_review" ON kyc_reviews
  FOR SELECT TO authenticated USING (
    auth.uid() = reviewer_id
    OR EXISTS (
      SELECT 1 FROM kyc_submissions s
      WHERE s.id = kyc_reviews.submission_id
      AND s.user_id = auth.uid()
    )
  );
CREATE POLICY "insert_kyc_review" ON kyc_reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "select_own_kyc_audit" ON kyc_audit_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = admin_id);
CREATE POLICY "insert_kyc_audit_log" ON kyc_audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── Seed Default Providers ────────────────────────────────────────────
INSERT INTO kyc_providers (name, slug, display_name, description, provider_type, is_enabled, is_system)
VALUES
  ('Manual Review', 'manual', 'Manual Review', 'In-house manual document review by authorized administrators', 'manual', true, true),
  ('Smile ID', 'smile_id', 'Smile ID', 'Smile Identity KYC API for identity verification', 'automated', false, false),
  ('Sumsub', 'sumsub', 'Sumsub', 'Sumsub KYC and compliance verification platform', 'automated', false, false),
  ('Persona', 'persona', 'Persona', 'Persona identity verification platform', 'automated', false, false),
  ('Veriff', 'veriff', 'Veriff', 'Veriff AI-powered identity verification', 'automated', false, false),
  ('Custom Provider', 'custom', 'Custom Provider', 'Custom verification provider integration', 'automated', false, false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO kyc_provider_settings (provider_id, is_connected, is_enabled, is_active, mode, health_status)
SELECT id, true, true, true, 'sandbox', 'healthy'
FROM kyc_providers WHERE slug = 'manual'
ON CONFLICT (provider_id) DO NOTHING;

INSERT INTO kyc_provider_settings (provider_id, is_connected, is_enabled, is_active, mode, health_status)
SELECT id, false, false, false, 'sandbox', 'unknown'
FROM kyc_providers WHERE slug != 'manual'
ON CONFLICT (provider_id) DO NOTHING;

INSERT INTO kyc_rules (user_type, is_required, required_for_action, description)
VALUES
  ('buyer', false, NULL, 'Verification is optional for buyers'),
  ('seller', true, 'listing_products', 'Required before listing products'),
  ('vendor', true, 'selling', 'Required before selling'),
  ('affiliate', true, 'withdrawals', 'Required before withdrawals'),
  ('employer', true, 'posting_jobs', 'Required before posting jobs'),
  ('service_provider', true, 'accepting_orders', 'Required before accepting orders'),
  ('campaign_creator', true, 'launching_campaigns', 'Required before launching campaigns'),
  ('admin', true, 'admin_activation', 'Always required before admin activation')
ON CONFLICT (user_type) DO NOTHING;

-- ─── Storage Bucket ────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-docs', 'kyc-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "users_upload_own_kyc_docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc-docs' AND auth.uid() = owner);
CREATE POLICY "users_read_own_kyc_docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-docs' AND auth.uid() = owner);
CREATE POLICY "users_update_own_kyc_docs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'kyc-docs' AND auth.uid() = owner)
  WITH CHECK (bucket_id = 'kyc-docs' AND auth.uid() = owner);

-- ─── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kyc_profiles_user_id ON kyc_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_profiles_status ON kyc_profiles(status);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_profile_id ON kyc_submissions(profile_id);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_user_id ON kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_status ON kyc_submissions(status);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_submission_id ON kyc_documents(submission_id);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_user_id ON kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_reviews_submission_id ON kyc_reviews(submission_id);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_user_id ON kyc_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_created_at ON kyc_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_rules_user_type ON kyc_rules(user_type);
