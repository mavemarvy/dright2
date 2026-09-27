const MODULES = {
  listings: new Set([
    'super_admin', 'marketplace_admin', 'marketplace_moderator',
    'marketplace_manager', 'vendor_manager', 'product_moderator',
    'service_moderator', 'job_moderator', 'advertising_admin',
    'campaign_manager', 'campaign_moderator'
  ]),
  withdrawals: new Set(['super_admin', 'finance_admin', 'finance_manager']),
  support: new Set([
    'super_admin', 'platform_admin', 'customer_support', 'customer_success',
    'support_admin', 'ai_support_manager'
  ])
};

export function canAccessModule(role, moduleName) {
  if (!role) return false;
  return MODULES[moduleName]?.has(role) === true;
}
