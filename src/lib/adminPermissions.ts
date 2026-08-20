import type { AdminRole } from '../contexts/AuthContext';

export type AdminPageKey =
  | 'dashboard'
  | 'users'
  | 'products'
  | 'verifications'
  | 'fraud_reports'
  | 'payouts'
  | 'wallet_manager'
  | 'payment_security'
  | 'withdrawals'
  | 'settlements'
  | 'admins'
  | 'invite'
  | 'settings'
  | 'announcements'
  | 'site_settings'
  | 'local_seo'
  | 'tickets'
  | 'reviews'
  | 'locked_accounts'
  | 'appeals'
  | 'referral_analytics'
  | 'marketplace'
  | 'notifications'
  | 'algorithm'
  | 'promotions'
  | 'coupons'
  | 'giveaways'
  | 'marketplace_analytics'
  | 'moderation'
  | 'fraud'
  | 'financial'
  | 'audit_logs'
  | 'ai'
  | 'ai_config'
  | 'ai_prompts'
  | 'ai_moderation'
  | 'ai_images'
  | 'env_health'
  | 'product_edits'
  | 'system_health'
  | 'auth_center'
  | 'payment_providers'
  | 'webhook_logs'
  | 'payment_analytics'
  | 'cms'
  | 'cms_media'
  | 'content'
  | 'banners'
  | 'roles'
  | 'moderation_center'
  | 'badges'
  | 'admin_approval'
  | 'publishing'
  | 'crm'
  | 'customer_recovery'
  | 'subscription_recovery'
  | 'sales_operations'
  | 'customer_care'
  | 'marketing_dashboard'
  | 'admin_performance'
  | 'ai_insights'
  | 'compliance_center'
  | 'integration_hub'
  | 'integration_logs'
  | 'enterprise_analytics'
  | 'reports_center'
  | 'business_intelligence'
  | 'customer_analytics'
  | 'affiliate_analytics'
  | 'financial_analytics'
  | 'support_analytics'
  | 'admin_performance_analytics';

export const ROLE_PAGE_ACCESS: Record<AdminRole, AdminPageKey[]> = {
  super_admin: [
    'dashboard', 'users', 'products', 'verifications', 'fraud_reports',
    'payouts', 'wallet_manager', 'payment_security', 'withdrawals', 'settlements', 'admins', 'invite', 'settings',
    'announcements', 'site_settings', 'local_seo', 'tickets', 'reviews', 'locked_accounts', 'appeals', 'referral_analytics', 'marketplace', 'notifications', 'algorithm', 'promotions', 'coupons', 'giveaways', 'marketplace_analytics', 'moderation', 'fraud', 'financial', 'audit_logs', 'ai', 'ai_config', 'ai_prompts', 'ai_moderation', 'ai_images', 'env_health', 'product_edits', 'system_health', 'auth_center', 'payment_providers', 'webhook_logs', 'payment_analytics', 'cms', 'cms_media', 'content', 'banners', 'roles', 'moderation_center', 'badges', 'admin_approval', 'publishing', 'crm', 'customer_recovery', 'subscription_recovery', 'sales_operations', 'customer_care', 'marketing_dashboard', 'admin_performance', 'ai_insights', 'integration_hub', 'integration_logs', 'enterprise_analytics', 'reports_center', 'business_intelligence', 'customer_analytics', 'affiliate_analytics', 'financial_analytics', 'support_analytics', 'admin_performance_analytics',
  ],
  platform_admin: ['dashboard', 'users', 'marketplace', 'marketplace_analytics', 'tickets', 'notifications', 'announcements', 'site_settings', 'reports_center', 'enterprise_analytics'],
  user_management_admin: ['dashboard', 'users', 'verifications', 'locked_accounts', 'appeals', 'audit_logs'],
  marketplace_admin: ['dashboard', 'products', 'product_edits', 'marketplace', 'marketplace_analytics', 'cms'],
  marketplace_moderator: ['dashboard', 'products', 'product_edits', 'moderation', 'moderation_center', 'reviews', 'marketplace'],
  finance_admin: ['dashboard', 'settlements', 'withdrawals', 'payment_providers', 'webhook_logs', 'payment_analytics', 'subscription_recovery', 'sales_operations', 'financial_analytics', 'enterprise_analytics', 'reports_center', 'financial'],
  finance_manager: ['dashboard', 'settlements', 'withdrawals', 'payment_providers', 'webhook_logs', 'payment_analytics', 'subscription_recovery', 'sales_operations', 'financial_analytics', 'enterprise_analytics', 'reports_center', 'financial'],
  payment_admin: ['dashboard', 'payment_analytics', 'webhook_logs', 'payment_providers', 'payment_security'],
  affiliate_admin: ['dashboard', 'affiliate_analytics', 'users'],
  affiliate_manager: ['dashboard', 'affiliate_analytics', 'users'],
  referral_admin: ['dashboard', 'referral_analytics', 'fraud_reports'],
  sales_marketing_admin: ['dashboard', 'promotions', 'coupons', 'giveaways', 'marketing_dashboard', 'marketplace', 'announcements', 'enterprise_analytics'],
  marketing_manager: ['dashboard', 'promotions', 'coupons', 'giveaways', 'marketing_dashboard', 'announcements', 'enterprise_analytics', 'affiliate_analytics'],
  advertising_admin: ['dashboard', 'promotions', 'marketing_dashboard', 'enterprise_analytics'],
  customer_support: ['dashboard', 'tickets', 'crm', 'customer_care', 'customer_recovery'],
  customer_success: ['dashboard', 'tickets', 'crm', 'customer_care', 'customer_recovery', 'notifications'],
  trust_safety_admin: ['dashboard', 'verifications', 'fraud_reports', 'compliance_center', 'moderation', 'moderation_center', 'appeals'],
  fraud_risk_admin: ['dashboard', 'fraud', 'fraud_reports', 'audit_logs', 'users'],
  security_admin: ['dashboard', 'auth_center', 'audit_logs', 'system_health', 'users', 'fraud_reports'],
  security_manager: ['dashboard', 'auth_center', 'audit_logs', 'system_health', 'users', 'locked_accounts', 'fraud_reports', 'fraud'],
  content_cms_admin: ['dashboard', 'cms', 'cms_media', 'content', 'banners', 'announcements'],
  content_manager: ['dashboard', 'cms', 'cms_media', 'content', 'banners', 'announcements'],
  badge_trust_admin: ['dashboard', 'badges', 'verifications', 'users'],
  ai_admin: ['dashboard', 'ai', 'ai_config', 'ai_insights', 'env_health'],
  ai_support_manager: ['dashboard', 'ai', 'ai_insights', 'tickets'],
  analytics_admin: ['dashboard', 'enterprise_analytics', 'marketplace_analytics', 'customer_analytics', 'affiliate_analytics', 'financial_analytics', 'support_analytics', 'admin_performance_analytics', 'reports_center', 'business_intelligence'],
  analytics_manager: ['dashboard', 'enterprise_analytics', 'marketplace_analytics', 'customer_analytics', 'affiliate_analytics', 'financial_analytics', 'support_analytics', 'admin_performance_analytics', 'reports_center', 'business_intelligence'],
  sales_team_manager: ['dashboard', 'marketplace', 'marketing_dashboard', 'enterprise_analytics', 'users'],
  campaign_manager: ['dashboard', 'promotions', 'coupons', 'giveaways', 'marketing_dashboard', 'enterprise_analytics'],
  campaign_moderator: ['dashboard', 'promotions', 'marketing_dashboard', 'enterprise_analytics'],
  notification_admin: ['dashboard', 'notifications', 'announcements'],
  localization_admin: ['dashboard', 'cms', 'content', 'site_settings'],
  technical_admin: ['dashboard', 'integration_hub', 'integration_logs', 'system_health', 'env_health', 'audit_logs'],
  system_config_admin: ['dashboard', 'site_settings', 'settings', 'announcements', 'cms', 'audit_logs'],
  support_admin: ['dashboard', 'tickets', 'crm', 'customer_care', 'customer_recovery'],
  qa_admin: ['dashboard', 'reviews', 'locked_accounts', 'appeals', 'cms'],
  marketplace_manager: ['dashboard', 'products', 'product_edits', 'marketplace', 'marketplace_analytics', 'badges'],
  vendor_manager: ['dashboard', 'products', 'marketplace', 'users'],
  product_moderator: ['dashboard', 'products', 'product_edits', 'marketplace', 'badges'],
  service_moderator: ['dashboard', 'products', 'marketplace'],
  job_moderator: ['dashboard', 'products', 'marketplace'],
  promotions_manager: ['dashboard', 'promotions', 'coupons', 'giveaways', 'marketing_dashboard', 'enterprise_analytics'],
  legal_manager: ['dashboard', 'compliance_center', 'audit_logs', 'users'],
};

export function canAccessPage(role: AdminRole | null, page: AdminPageKey): boolean {
  if (!role) return false;
  return ROLE_PAGE_ACCESS[role].includes(page);
}

export function canAccessPath(role: AdminRole | null, pathname: string): boolean {
  if (!role) return false;
  const mapping: Record<string, AdminPageKey> = {
    '/admin': 'dashboard',
    '/admin/users': 'users',
    '/admin/products': 'products',
    '/admin/verifications': 'verifications',
    '/admin/fraud-reports': 'fraud_reports',
    '/admin/payouts': 'payouts',
    '/admin/wallet-manager': 'wallet_manager',
    '/admin/payment-security': 'payment_security',
    '/admin/withdrawals': 'withdrawals',
    '/admin/settlements': 'settlements',
    '/admin/admins': 'admins',
    '/admin/invite': 'invite',
    '/admin/settings': 'settings',
    '/admin/announcements': 'announcements',
    '/admin/site-settings': 'site_settings',
    '/admin/local-seo': 'local_seo',
    '/admin/tickets': 'tickets',
    '/admin/reviews': 'reviews',
    '/admin/locked-accounts': 'locked_accounts',
    '/admin/appeals': 'appeals',
    '/admin/referral-analytics': 'referral_analytics',
    '/admin/marketplace': 'marketplace',
    '/admin/notification-center': 'notifications',
    '/admin/algorithm': 'algorithm',
    '/admin/promotions': 'promotions',
    '/admin/coupons': 'coupons',
    '/admin/giveaways': 'giveaways',
    '/admin/marketplace-analytics': 'marketplace_analytics',
    '/admin/moderation': 'moderation',
    '/admin/fraud': 'fraud',
    '/admin/financial': 'financial',
    '/admin/audit-logs': 'audit_logs',
    '/admin/ai': 'ai',
    '/admin/ai-config': 'ai_config',
    '/admin/ai-prompts': 'ai_prompts',
    '/admin/ai-moderation': 'ai_moderation',
    '/admin/ai-images': 'ai_images',
    '/admin/env-health': 'env_health',
    '/admin/payment-providers': 'payment_providers',
    '/admin/webhook-logs': 'webhook_logs',
    '/admin/payment-analytics': 'payment_analytics',
    '/admin/cms': 'cms',
    '/admin/cms/media': 'cms_media',
    '/admin/content': 'content',
    '/admin/banners': 'banners',
    '/admin/product-edits': 'product_edits',
    '/admin/system-health': 'system_health',
    '/admin/auth-center': 'auth_center',
    '/admin/roles': 'roles',
    '/admin/moderation-center': 'moderation_center',
    '/admin/badges': 'badges',
    '/admin/admin-approval': 'admin_approval',
    '/admin/publishing': 'publishing',
    '/admin/crm': 'crm',
    '/admin/customer-recovery': 'customer_recovery',
    '/admin/subscription-recovery': 'subscription_recovery',
    '/admin/sales-operations': 'sales_operations',
    '/admin/customer-care': 'customer_care',
    '/admin/marketing-dashboard': 'marketing_dashboard',
    '/admin/admin-performance': 'admin_performance',
    '/admin/ai-insights': 'ai_insights',
    '/admin/integration-hub': 'integration_hub',
    '/admin/integration-logs': 'integration_logs',
    '/admin/enterprise-analytics': 'enterprise_analytics',
    '/admin/reports-center': 'reports_center',
    '/admin/business-intelligence': 'business_intelligence',
    '/admin/customer-analytics': 'customer_analytics',
    '/admin/affiliate-analytics': 'affiliate_analytics',
    '/admin/financial-analytics': 'financial_analytics',
    '/admin/support-analytics': 'support_analytics',
    '/admin/admin-performance-analytics': 'admin_performance_analytics',
  };
  const page = mapping[pathname];
  if (!page) return false;
  return canAccessPage(role, page);
}
