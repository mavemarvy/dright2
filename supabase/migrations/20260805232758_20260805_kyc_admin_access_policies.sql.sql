-- Admin access policies for KYC tables
-- Allows active admins to read all submissions/documents/reviews/audit logs
-- and update submission status during review

-- Admin can read all KYC profiles (for review queue)
CREATE POLICY "admin_read_all_kyc_profiles"
  ON kyc_profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- Admin can update any KYC profile (status changes during review)
CREATE POLICY "admin_update_all_kyc_profiles"
  ON kyc_profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- Admin can read all KYC submissions (review queue)
CREATE POLICY "admin_read_all_kyc_submissions"
  ON kyc_submissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- Admin can update any KYC submission (approve/reject/request info)
CREATE POLICY "admin_update_all_kyc_submissions"
  ON kyc_submissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- Admin can read all KYC documents (review documents)
CREATE POLICY "admin_read_all_kyc_documents"
  ON kyc_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- Admin can update any KYC document (approve/reject individual docs)
CREATE POLICY "admin_update_all_kyc_documents"
  ON kyc_documents FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- Admin can read all KYC reviews
CREATE POLICY "admin_read_all_kyc_reviews"
  ON kyc_reviews FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- Admin can read all KYC audit logs
CREATE POLICY "admin_read_all_kyc_audit_logs"
  ON kyc_audit_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- Admin can read all KYC storage objects (document download/preview)
CREATE POLICY "admin_read_all_kyc_storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-docs' AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- Only super_admin can delete KYC providers and rules (already enforced by existing policies)
-- Super admin can manage provider settings (already has update policy, add delete)
CREATE POLICY "super_admin_delete_kyc_provider_setting"
  ON kyc_provider_settings FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));

CREATE POLICY "super_admin_delete_kyc_rule"
  ON kyc_rules FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));

-- Super admin can delete KYC providers
CREATE POLICY "super_admin_delete_kyc_provider"
  ON kyc_providers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));
