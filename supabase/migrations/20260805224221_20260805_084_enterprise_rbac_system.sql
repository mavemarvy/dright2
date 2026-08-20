/*
# Enterprise RBAC System — Roles, Permissions, Badges, Moderation, Publishing Workflow

## Overview
Database-driven Role-Based Access Control (RBAC) for DRIGHT admin platform.
Replaces hardcoded admin roles with configurable roles, permissions, badges,
moderation queues, and publishing workflows. Future-proof: new modules register
new permissions without code rewrites.

## New Tables
1. roles — admin roles (system + custom)
2. permissions — granular permission catalog by module
3. role_permissions — role ↔ permission join
4. admin_permissions — per-admin permission overrides
5. admin_agreements — admin agreement acceptance records
6. admin_verifications — admin verification documents
7. marketplace_moderation — marketplace moderation queue (products, services, jobs, campaigns)
8. badges — badge definitions
9. badge_assignments — user badge awards
10. publishing_workflow — CMS content publishing state machine

## Security
- RLS on all tables
- Super admin manages roles/permissions
- Admins view own agreements/verifications
- Public reads active badges
- Soft deletes throughout
*/

-- 1. ROLES
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  color text DEFAULT '#6366f1',
  icon text DEFAULT 'Shield',
  is_system boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "roles_select_admin" ON roles;
CREATE POLICY "roles_select_admin" ON roles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "roles_insert_superadmin" ON roles;
CREATE POLICY "roles_insert_superadmin" ON roles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "roles_update_superadmin" ON roles;
CREATE POLICY "roles_update_superadmin" ON roles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "roles_delete_superadmin" ON roles;
CREATE POLICY "roles_delete_superadmin" ON roles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));

INSERT INTO roles (name, slug, description, color, icon, is_system) VALUES
  ('Super Admin','super_admin','Full platform access and control.','#7c3aed','Crown',true),
  ('Marketplace Manager','marketplace_manager','Manages marketplace listings and seller performance.','#2563eb','Store',true),
  ('Product Moderator','product_moderator','Reviews and moderates digital products.','#059669','Package',true),
  ('Job Moderator','job_moderator','Reviews and moderates job listings.','#0891b2','Briefcase',true),
  ('Service Moderator','service_moderator','Reviews and moderates service offerings.','#7c3aed','Wrench',true),
  ('Campaign Moderator','campaign_moderator','Reviews and moderates advertising campaigns.','#db2777','Megaphone',true),
  ('Customer Support','customer_support','Handles support tickets and user inquiries.','#d97706','HeadphonesIcon',true),
  ('Customer Success','customer_success','Proactively supports user onboarding and retention.','#16a34a','Heart',true),
  ('Marketing Manager','marketing_manager','Manages promotions, banners, and marketing campaigns.','#ea580c','TrendingUp',true),
  ('Promotions Manager','promotions_manager','Creates and manages discount codes and promotional offers.','#9333ea','Tag',true),
  ('Finance Manager','finance_manager','Reviews payments, approves withdrawals, and exports reports.','#0f766e','DollarSign',true),
  ('Vendor Manager','vendor_manager','Manages vendor accounts and seller onboarding.','#1d4ed8','Users',true),
  ('Affiliate Manager','affiliate_manager','Oversees affiliate programs and referral tracking.','#7e22ce','Share2',true),
  ('Content Manager','content_manager','Manages CMS content, announcements, and tutorials.','#0369a1','FileText',true),
  ('Security Manager','security_manager','Monitors fraud, user security, and platform integrity.','#b91c1c','Shield',true),
  ('Legal Manager','legal_manager','Reviews legal documents, agreements, and compliance content.','#78350f','Scale',true),
  ('Analytics Manager','analytics_manager','Accesses platform analytics, reports, and business intelligence.','#115e59','BarChart2',true)
ON CONFLICT (slug) DO NOTHING;

-- 2. PERMISSIONS
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(module, action)
);
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "permissions_select_admin" ON permissions;
CREATE POLICY "permissions_select_admin" ON permissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "permissions_manage_superadmin" ON permissions;
CREATE POLICY "permissions_manage_superadmin" ON permissions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));

INSERT INTO permissions (module, action, label, description) VALUES
  ('marketplace','view','View Marketplace','Browse all marketplace listings'),
  ('marketplace','edit','Edit Listings','Modify any marketplace listing'),
  ('marketplace','delete','Delete Listings','Permanently remove listings'),
  ('marketplace','approve','Approve Listings','Approve pending listings'),
  ('marketplace','reject','Reject Listings','Reject pending listings'),
  ('marketplace','feature','Feature Listings','Mark listings as featured'),
  ('marketplace','hide','Hide Listings','Hide listings from public view'),
  ('products','review','Review Products','Access product review queue'),
  ('products','approve','Approve Products','Approve product submissions'),
  ('products','reject','Reject Products','Reject product submissions'),
  ('products','archive','Archive Products','Move products to archive'),
  ('jobs','review','Review Jobs','Access job listing review queue'),
  ('jobs','approve','Approve Jobs','Approve job submissions'),
  ('jobs','reject','Reject Jobs','Reject job submissions'),
  ('services','review','Review Services','Access service listing review queue'),
  ('services','approve','Approve Services','Approve service submissions'),
  ('services','reject','Reject Services','Reject service submissions'),
  ('cms','view','View CMS','Browse CMS content'),
  ('cms','edit','Edit Content','Edit CMS pages and blocks'),
  ('cms','publish','Publish Content','Publish content to live site'),
  ('cms','archive','Archive Content','Archive CMS content'),
  ('cms','delete','Delete Content','Permanently delete content'),
  ('announcements','publish','Publish Announcements','Publish platform announcements'),
  ('announcements','edit','Edit Announcements','Edit announcement content'),
  ('announcements','delete','Delete Announcements','Delete announcements'),
  ('tutorials','publish','Publish Tutorials','Publish tutorial content'),
  ('tutorials','edit','Edit Tutorials','Edit tutorial content'),
  ('tutorials','archive','Archive Tutorials','Archive tutorial content'),
  ('promotions','manage','Manage Promotions','Create and edit promotional campaigns'),
  ('promotions','analytics','View Promo Analytics','View promotion performance analytics'),
  ('promotions','schedule','Schedule Promotions','Schedule timed promotions'),
  ('support','view_tickets','View Tickets','View all support tickets'),
  ('support','reply','Reply to Tickets','Send replies to support tickets'),
  ('support','assign','Assign Tickets','Assign tickets to team members'),
  ('support','close','Close Tickets','Close resolved tickets'),
  ('users','view','View Users','Browse user accounts'),
  ('users','suspend','Suspend Users','Temporarily suspend user accounts'),
  ('users','ban','Ban Users','Permanently ban user accounts'),
  ('users','restore','Restore Users','Restore suspended/banned accounts'),
  ('users','verify','Verify Users','Manually verify user accounts'),
  ('finance','view_payments','View Payments','View all payment transactions'),
  ('finance','approve_withdrawals','Approve Withdrawals','Approve withdrawal requests'),
  ('finance','export_reports','Export Reports','Export financial reports'),
  ('analytics','view','View Analytics','Access platform analytics'),
  ('analytics','export','Export Analytics','Export analytics data'),
  ('badges','manage','Manage Badges','Create, edit, and assign badges'),
  ('badges','assign','Assign Badges','Award badges to users'),
  ('admins','view','View Admins','View administrator list'),
  ('admins','create','Create Admins','Invite new administrators'),
  ('admins','activate','Activate Admins','Activate pending admin accounts'),
  ('admins','suspend','Suspend Admins','Suspend active admin accounts'),
  ('admins','assign_roles','Assign Admin Roles','Assign roles to administrators'),
  ('campaigns','review','Review Campaigns','Access campaign review queue'),
  ('campaigns','approve','Approve Campaigns','Approve campaign submissions'),
  ('campaigns','reject','Reject Campaigns','Reject campaign submissions'),
  ('security','view_fraud','View Fraud Alerts','Access fraud detection and alerts'),
  ('security','ban_devices','Ban Devices','Block flagged devices and IPs'),
  ('security','view_logs','View Audit Logs','Access security audit logs')
ON CONFLICT (module, action) DO NOTHING;

-- 3. ROLE PERMISSIONS
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission_id)
);
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_permissions_select_admin" ON role_permissions;
CREATE POLICY "role_permissions_select_admin" ON role_permissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "role_permissions_manage_superadmin" ON role_permissions;
CREATE POLICY "role_permissions_manage_superadmin" ON role_permissions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.slug = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 4. ADMIN PERMISSIONS
CREATE TABLE IF NOT EXISTS admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  is_granted boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(admin_id, permission_id)
);
ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_permissions_select" ON admin_permissions;
CREATE POLICY "admin_permissions_select" ON admin_permissions FOR SELECT TO authenticated
  USING (admin_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "admin_permissions_manage_superadmin" ON admin_permissions;
CREATE POLICY "admin_permissions_manage_superadmin" ON admin_permissions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));

-- 5. ADMIN AGREEMENTS
CREATE TABLE IF NOT EXISTS admin_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agreement_version text NOT NULL DEFAULT 'v1.0',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  pdf_downloaded boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_agreements_select" ON admin_agreements;
CREATE POLICY "admin_agreements_select" ON admin_agreements FOR SELECT TO authenticated
  USING (admin_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.admin_role = 'super_admin' AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "admin_agreements_insert" ON admin_agreements;
CREATE POLICY "admin_agreements_insert" ON admin_agreements FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid());
DROP POLICY IF EXISTS "admin_agreements_update" ON admin_agreements;
CREATE POLICY "admin_agreements_update" ON admin_agreements FOR UPDATE TO authenticated
  USING (admin_id = auth.uid()) WITH CHECK (admin_id = auth.uid());

-- 6. ADMIN VERIFICATIONS
CREATE TABLE IF NOT EXISTS admin_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('government_id','proof_of_address','selfie','other')),
  doc_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','verified','rejected')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_notes text,
  reviewed_at timestamptz,
  phone_verified boolean NOT NULL DEFAULT false,
  email_verified boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_verifications_select" ON admin_verifications;
CREATE POLICY "admin_verifications_select" ON admin_verifications FOR SELECT TO authenticated
  USING (admin_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "admin_verifications_insert" ON admin_verifications;
CREATE POLICY "admin_verifications_insert" ON admin_verifications FOR INSERT TO authenticated
  WITH CHECK (admin_id = auth.uid());
DROP POLICY IF EXISTS "admin_verifications_update" ON admin_verifications;
CREATE POLICY "admin_verifications_update" ON admin_verifications FOR UPDATE TO authenticated
  USING (admin_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'))
  WITH CHECK (admin_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- 7. MARKETPLACE MODERATION (new table, avoids conflict with existing moderation_queue)
CREATE TABLE IF NOT EXISTS marketplace_moderation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('product','service','job','campaign')),
  entity_id uuid NOT NULL,
  submitter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','under_review','approved','rejected','revision_requested')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  moderator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason text,
  revision_notes text,
  reviewer_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  review_started_at timestamptz,
  review_completed_at timestamptz,
  version int NOT NULL DEFAULT 1,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_moderation_status ON marketplace_moderation(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_moderation_entity ON marketplace_moderation(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_moderation_moderator ON marketplace_moderation(moderator_id);
ALTER TABLE marketplace_moderation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketplace_moderation_select_admin" ON marketplace_moderation;
CREATE POLICY "marketplace_moderation_select_admin" ON marketplace_moderation FOR SELECT TO authenticated
  USING (submitter_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "marketplace_moderation_insert" ON marketplace_moderation;
CREATE POLICY "marketplace_moderation_insert" ON marketplace_moderation FOR INSERT TO authenticated
  WITH CHECK (submitter_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "marketplace_moderation_update_admin" ON marketplace_moderation;
CREATE POLICY "marketplace_moderation_update_admin" ON marketplace_moderation FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- 8. BADGES
CREATE TABLE IF NOT EXISTS badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  image_url text,
  image_type text CHECK (image_type IN ('png','svg','webp')),
  display_priority int NOT NULL DEFAULT 0,
  target_type text NOT NULL DEFAULT 'any' CHECK (target_type IN ('seller','buyer','affiliate','vendor','employer','campaign_creator','verified_business','top_seller','top_affiliate','featured_store','any')),
  eligibility_rules jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "badges_select_public" ON badges;
CREATE POLICY "badges_select_public" ON badges FOR SELECT TO anon, authenticated USING (is_active = true AND is_deleted = false);
DROP POLICY IF EXISTS "badges_manage_admin" ON badges;
CREATE POLICY "badges_manage_admin" ON badges FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

INSERT INTO badges (name, slug, description, target_type, display_priority, is_active) VALUES
  ('Verified Seller','verified_seller','Identity-verified seller on DRIGHT.','seller',100,true),
  ('Top Seller','top_seller','Consistently high-performing seller.','top_seller',90,true),
  ('Featured Store','featured_store','Officially featured DRIGHT store.','featured_store',80,true),
  ('Verified Business','verified_business','Registered and verified business entity.','verified_business',70,true),
  ('Top Affiliate','top_affiliate','High-earning affiliate partner.','top_affiliate',60,true),
  ('Trusted Buyer','trusted_buyer','Buyer with excellent transaction history.','buyer',50,true)
ON CONFLICT (slug) DO NOTHING;

-- 9. BADGE ASSIGNMENTS
CREATE TABLE IF NOT EXISTS badge_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(badge_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_badge_assignments_user ON badge_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_badge_assignments_badge ON badge_assignments(badge_id);
ALTER TABLE badge_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "badge_assignments_select_public" ON badge_assignments;
CREATE POLICY "badge_assignments_select_public" ON badge_assignments FOR SELECT TO anon, authenticated USING (is_active = true AND is_deleted = false);
DROP POLICY IF EXISTS "badge_assignments_manage_admin" ON badge_assignments;
CREATE POLICY "badge_assignments_manage_admin" ON badge_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- 10. PUBLISHING WORKFLOW
CREATE TABLE IF NOT EXISTS publishing_workflow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','published','scheduled','archived','hidden')),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  publisher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes text,
  rejection_reason text,
  scheduled_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  version int NOT NULL DEFAULT 1,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_publishing_workflow_entity ON publishing_workflow(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_publishing_workflow_status ON publishing_workflow(status);
ALTER TABLE publishing_workflow ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "publishing_workflow_select_admin" ON publishing_workflow;
CREATE POLICY "publishing_workflow_select_admin" ON publishing_workflow FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));
DROP POLICY IF EXISTS "publishing_workflow_insert" ON publishing_workflow;
CREATE POLICY "publishing_workflow_insert" ON publishing_workflow FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true));
DROP POLICY IF EXISTS "publishing_workflow_update_admin" ON publishing_workflow;
CREATE POLICY "publishing_workflow_update_admin" ON publishing_workflow FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true AND users.admin_status = 'active'));

-- 11. Add RBAC columns to users table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='rbac_role_id') THEN
    ALTER TABLE users ADD COLUMN rbac_role_id uuid REFERENCES roles(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='admin_pending_since') THEN
    ALTER TABLE users ADD COLUMN admin_pending_since timestamptz;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='agreement_accepted') THEN
    ALTER TABLE users ADD COLUMN agreement_accepted boolean NOT NULL DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='verification_status') THEN
    ALTER TABLE users ADD COLUMN verification_status text DEFAULT 'not_submitted' CHECK (verification_status IN ('not_submitted','pending','under_review','verified','rejected'));
  END IF;
END $$;
