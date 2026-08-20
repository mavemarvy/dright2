/*
# RBAC Expansion: 26 Admin Roles + Granular Permissions

## Purpose
Expands the existing RBAC system from 17 system roles to 26 administrative roles,
and adds ~45 new granular permissions covering all administrative domains.
Maps every role to its appropriate permissions via role_permissions.

Existing roles, permissions, and mappings are preserved. Migration is idempotent.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. ADD NEW SYSTEM ROLES (idempotent)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.roles (name, slug, description, color, icon, is_system)
SELECT * FROM (VALUES
  ('Platform Admin', 'platform_admin', 'General operational administrator with platform-wide view access', '#3b82f6', 'LayoutDashboard', true),
  ('User Management Admin', 'user_management_admin', 'Manage user profiles, account states, and verification', '#0891b2', 'Users', true),
  ('Marketplace Admin', 'marketplace_admin', 'Manage marketplace listings, products, services, and categories', '#059669', 'Store', true),
  ('Marketplace Moderator', 'marketplace_moderator', 'Review listings, handle content violations and disputes', '#d97706', 'Shield', true),
  ('Payment Admin', 'payment_admin', 'Monitor payment transactions and reconcile errors', '#7c3aed', 'CreditCard', true),
  ('Affiliate Admin', 'affiliate_admin', 'Manage affiliates, commissions, and affiliate fraud', '#db2777', 'Share2', true),
  ('Referral Admin', 'referral_admin', 'Manage referral campaigns, rewards, and abuse review', '#ea580c', 'Gift', true),
  ('Sales & Marketing Admin', 'sales_marketing_admin', 'Manage sales operations and marketing campaigns', '#2563eb', 'TrendingUp', true),
  ('Advertising Admin', 'advertising_admin', 'Manage platform advertising and ad campaign review', '#9333ea', 'Megaphone', true),
  ('Fraud & Risk Admin', 'fraud_risk_admin', 'Investigate fraud, review suspicious accounts and transactions', '#dc2626', 'ShieldAlert', true),
  ('Content & CMS Admin', 'content_cms_admin', 'Edit homepage, banners, FAQs, and informational pages', '#65a30d', 'FileEdit', true),
  ('Badge & Trust Admin', 'badge_trust_admin', 'Create and assign badges, manage trust indicators', '#ca8a04', 'Award', true),
  ('AI Admin', 'ai_admin', 'Manage AI settings, monitor usage and costs', '#7c3aed', 'Brain', true),
  ('AI Support Manager', 'ai_support_manager', 'Monitor AI support conversations and escalations', '#8b5cf6', 'MessageSquare', true),
  ('Analytics Admin', 'analytics_admin', 'Read-only access to all analytics and reporting', '#0d9488', 'BarChart3', true),
  ('Sales Team Manager', 'sales_team_manager', 'Manage internal sales team and advertiser performance', '#4f46e5', 'Users', true),
  ('Campaign Manager', 'campaign_manager', 'Create and manage promotional campaigns', '#0284c7', 'Rocket', true),
  ('Notification Admin', 'notification_admin', 'Manage notification templates and campaigns', '#f59e0b', 'Bell', true),
  ('Localization Admin', 'localization_admin', 'Manage languages, translations, and regional content', '#14b8a6', 'Globe', true),
  ('Technical Admin', 'technical_admin', 'Manage technical configuration and integrations', '#64748b', 'Wrench', true),
  ('Security Admin', 'security_admin', 'Review security events and investigate incidents', '#991b1b', 'Lock', true),
  ('System Config Admin', 'system_config_admin', 'Edit system configurations and platform fees', '#475569', 'Settings', true)
) AS v(name, slug, description, color, icon, is_system)
WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.slug = v.slug);

-- ═══════════════════════════════════════════════════════════════
-- 2. ADD NEW PERMISSIONS (idempotent)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.permissions (module, action, label, description)
SELECT * FROM (VALUES
  ('referrals', 'view', 'View Referrals', 'View referral chains and conversions'),
  ('referrals', 'manage', 'Manage Referrals', 'Manage referral campaigns and eligibility rules'),
  ('referrals', 'rewards_manage', 'Manage Referral Rewards', 'Review and manage referral rewards'),
  ('advertising', 'view', 'View Advertising', 'View ad campaigns and placements'),
  ('advertising', 'approve', 'Approve Ads', 'Approve ad campaigns'),
  ('advertising', 'reject', 'Reject Ads', 'Reject ad campaigns'),
  ('advertising', 'campaigns_manage', 'Manage Ad Campaigns', 'Manage advertising placements and campaigns'),
  ('ai', 'view', 'View AI', 'View AI dashboard and analytics'),
  ('ai', 'manage', 'Manage AI', 'Manage AI provider configuration and settings'),
  ('ai', 'review_support', 'Review AI Support', 'Monitor AI support conversations and escalations'),
  ('analytics', 'view_all', 'View All Analytics', 'View platform-wide analytics'),
  ('system', 'view', 'View System', 'View system configuration and health'),
  ('system', 'configure', 'Configure System', 'Edit system configurations and platform fees'),
  ('system', 'manage_integrations', 'Manage Integrations', 'Manage third-party integrations'),
  ('audit', 'view', 'View Audit Logs', 'View admin activity audit logs'),
  ('notifications', 'view', 'View Notifications', 'View notification center'),
  ('notifications', 'manage', 'Manage Notifications', 'Create and send platform notifications'),
  ('notifications', 'templates', 'Manage Templates', 'Manage notification templates'),
  ('localization', 'view', 'View Localization', 'View supported languages'),
  ('localization', 'manage', 'Manage Localization', 'Manage translations and regional content'),
  ('security', 'view', 'View Security', 'View security events and authentication activity'),
  ('security', 'manage', 'Manage Security', 'Manage security policies and investigate incidents'),
  ('rbac', 'view', 'View RBAC', 'View roles and permissions'),
  ('rbac', 'roles_create', 'Create Roles', 'Create custom admin roles'),
  ('rbac', 'roles_edit', 'Edit Roles', 'Edit existing roles and permissions'),
  ('rbac', 'roles_delete', 'Delete Roles', 'Delete or archive custom roles'),
  ('rbac', 'permissions_assign', 'Assign Permissions', 'Assign permissions to roles and users'),
  ('finance', 'view_withdrawals', 'View Withdrawals', 'View withdrawal queue'),
  ('finance', 'reject_withdrawals', 'Reject Withdrawals', 'Reject withdrawal requests'),
  ('finance', 'refunds_create', 'Create Refunds', 'Process refunds'),
  ('finance', 'view_commissions', 'View Commissions', 'View affiliate and referral commissions'),
  ('finance', 'view_fees', 'View Platform Fees', 'View platform fee configuration'),
  ('affiliates', 'view', 'View Affiliates', 'View affiliate performance and rankings'),
  ('affiliates', 'manage', 'Manage Affiliates', 'Manage affiliate applications and settings'),
  ('affiliates', 'fraud_review', 'Review Affiliate Fraud', 'Review affiliate fraud alerts'),
  ('users', 'view_activity', 'View User Activity', 'View user activity history'),
  ('users', 'manage_roles', 'Manage User Roles', 'Assign roles to users'),
  ('marketplace', 'manage_categories', 'Manage Categories', 'Manage marketplace categories'),
  ('marketplace', 'review_sellers', 'Review Sellers', 'Review seller content and submissions'),
  ('support', 'issue_refunds', 'Issue Small Refunds', 'Issue small refunds within limits'),
  ('support', 'escalate', 'Escalate Issues', 'Escalate support cases'),
  ('compliance', 'view', 'View Compliance', 'View compliance records'),
  ('compliance', 'manage', 'Manage Compliance', 'Manage KYC and compliance reviews'),
  ('compliance', 'kyc_review', 'Review KYC', 'Review KYC verifications'),
  ('campaigns', 'manage', 'Manage Campaigns', 'Create and manage promotional campaigns'),
  ('campaigns', 'view_performance', 'View Campaign Performance', 'View campaign analytics'),
  ('badges', 'view', 'View Badges', 'View badges and trust indicators'),
  ('admins', 'reject', 'Reject Admins', 'Reject admin applications'),
  ('admins', 'view_activity', 'View Admin Activity', 'View admin activity history')
) AS v(module, action, label, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p
  WHERE p.module = v.module AND p.action = v.action AND p.is_deleted = false
);

-- ═══════════════════════════════════════════════════════════════
-- 3. ROLE-PERMISSION MAPPINGS
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_r_id uuid;
  v_p_id uuid;
  v_pair text;
  v_pair_arr text[];
  v_perms text;
  i int;
  rp record;
BEGIN
  -- Use a temp table for role → permissions mappings
  CREATE TEMP TABLE rpm (r_slug text, r_perms text) ON COMMIT DROP;

  INSERT INTO rpm VALUES
    ('platform_admin', 'users:view|users:verify|marketplace:view|analytics:view|analytics:view_all|announcements:publish|announcements:edit|support:view_tickets|finance:view_payments|security:view_logs|notifications:view|system:view|audit:view'),
    ('user_management_admin', 'users:view|users:verify|users:suspend|users:restore|users:view_activity|users:manage_roles|support:view_tickets|analytics:view|audit:view'),
    ('marketplace_admin', 'marketplace:view|marketplace:edit|marketplace:feature|marketplace:manage_categories|marketplace:review_sellers|products:approve|products:archive|services:approve|services:reject|jobs:approve|jobs:reject|analytics:view|cms:view'),
    ('marketplace_moderator', 'marketplace:view|marketplace:hide|products:review|products:approve|products:reject|services:review|services:approve|services:reject|jobs:review|jobs:approve|jobs:reject|users:suspend|security:view_fraud|badges:view|cms:view'),
    ('payment_admin', 'finance:view_payments|finance:view_withdrawals|analytics:view|audit:view'),
    ('affiliate_admin', 'affiliates:view|affiliates:manage|affiliates:fraud_review|analytics:view|finance:view_commissions|users:view'),
    ('referral_admin', 'referrals:view|referrals:manage|referrals:rewards_manage|analytics:view|finance:view_commissions|security:view_fraud'),
    ('sales_marketing_admin', 'promotions:manage|promotions:schedule|promotions:analytics|campaigns:manage|campaigns:view_performance|analytics:view|marketplace:view|announcements:publish|announcements:edit'),
    ('advertising_admin', 'advertising:view|advertising:approve|advertising:reject|advertising:campaigns_manage|analytics:view|campaigns:view_performance'),
    ('fraud_risk_admin', 'security:view_fraud|security:view_logs|security:view|affiliates:fraud_review|finance:view_payments|analytics:view|users:view|audit:view'),
    ('content_cms_admin', 'cms:view|cms:edit|cms:publish|cms:archive|announcements:edit|announcements:publish|announcements:delete|tutorials:edit|tutorials:publish|tutorials:archive'),
    ('badge_trust_admin', 'badges:view|badges:manage|badges:assign|users:verify|analytics:view'),
    ('ai_admin', 'ai:view|ai:manage|analytics:view|system:view'),
    ('ai_support_manager', 'ai:view|ai:review_support|support:view_tickets|support:reply'),
    ('analytics_admin', 'analytics:view|analytics:view_all|analytics:export|campaigns:view_performance|finance:view_payments|marketplace:view'),
    ('sales_team_manager', 'analytics:view|marketplace:view|campaigns:view_performance|promotions:analytics|users:view'),
    ('campaign_manager', 'campaigns:manage|campaigns:view_performance|campaigns:approve|campaigns:reject|campaigns:review|promotions:manage|promotions:schedule|analytics:view'),
    ('notification_admin', 'notifications:view|notifications:manage|notifications:templates|announcements:edit|announcements:publish'),
    ('localization_admin', 'localization:view|localization:manage|cms:view|cms:edit'),
    ('technical_admin', 'system:view|system:manage_integrations|analytics:view|audit:view'),
    ('security_admin', 'security:view|security:manage|security:view_logs|security:view_fraud|security:ban_devices|audit:view|users:view'),
    ('system_config_admin', 'system:view|system:configure|announcements:edit|announcements:publish|cms:view|cms:edit|audit:view'),
    ('finance_manager', 'finance:view_withdrawals|finance:reject_withdrawals|finance:refunds_create|finance:view_commissions|finance:view_fees|finance:export_reports|finance:approve_withdrawals|finance:view_payments|analytics:view|audit:view'),
    ('customer_support', 'support:view_tickets|support:reply|support:close|support:assign|support:issue_refunds|support:escalate|users:view|analytics:view'),
    ('security_manager', 'security:view|security:manage|security:view_logs|security:view_fraud|security:ban_devices|audit:view|users:view|users:suspend|users:ban'),
    ('marketing_manager', 'promotions:manage|promotions:schedule|promotions:analytics|campaigns:manage|campaigns:view_performance|announcements:edit|announcements:publish|analytics:view|advertising:view'),
    ('content_manager', 'cms:view|cms:edit|cms:publish|cms:archive|announcements:edit|announcements:publish|tutorials:edit|tutorials:publish|tutorials:archive'),
    ('customer_success', 'support:view_tickets|support:reply|support:close|users:view|analytics:view|notifications:view'),
    ('affiliate_manager', 'affiliates:view|affiliates:manage|affiliates:fraud_review|finance:view_commissions|analytics:view|users:view'),
    ('analytics_manager', 'analytics:view|analytics:view_all|analytics:export|campaigns:view_performance|finance:view_payments|marketplace:view|users:view'),
    ('vendor_manager', 'marketplace:view|marketplace:edit|marketplace:review_sellers|products:review|products:approve|products:reject|users:view'),
    ('legal_manager', 'compliance:view|compliance:manage|compliance:kyc_review|security:view_logs|audit:view|users:view'),
    ('promotions_manager', 'promotions:manage|promotions:schedule|promotions:analytics|campaigns:manage|campaigns:view_performance|analytics:view'),
    ('job_moderator', 'jobs:review|jobs:approve|jobs:reject|marketplace:view|users:view'),
    ('product_moderator', 'products:review|products:approve|products:reject|marketplace:view|users:view|badges:view'),
    ('service_moderator', 'services:review|services:approve|services:reject|marketplace:view|users:view'),
    ('campaign_moderator', 'campaigns:review|campaigns:approve|campaigns:reject|campaigns:view_performance|advertising:view|analytics:view'),
    ('marketplace_manager', 'marketplace:view|marketplace:edit|marketplace:feature|marketplace:manage_categories|marketplace:review_sellers|products:approve|products:archive|services:approve|jobs:approve|analytics:view|badges:view');

  FOR rp IN SELECT r_slug, r_perms FROM rpm LOOP
    SELECT id INTO v_r_id FROM public.roles WHERE slug = rp.r_slug AND is_deleted = false;
    IF v_r_id IS NULL THEN
      RAISE NOTICE 'Role not found: %', rp.r_slug;
      CONTINUE;
    END IF;

    v_pair_arr := string_to_array(rp.r_perms, '|');
    FOR i IN 1..COALESCE(array_length(v_pair_arr, 1), 0) LOOP
      v_pair := v_pair_arr[i];
      SELECT id INTO v_p_id FROM public.permissions
        WHERE module = split_part(v_pair, ':', 1)
          AND action = split_part(v_pair, ':', 2)
          AND is_deleted = false;
      IF v_p_id IS NOT NULL THEN
        INSERT INTO public.role_permissions (role_id, permission_id)
        VALUES (v_r_id, v_p_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  -- Super Admin gets ALL permissions
  SELECT id INTO v_r_id FROM public.roles WHERE slug = 'super_admin' AND is_deleted = false;
  IF v_r_id IS NOT NULL THEN
    FOR v_p_id IN SELECT id FROM public.permissions WHERE is_deleted = false LOOP
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (v_r_id, v_p_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  DROP TABLE rpm;
END $$;
