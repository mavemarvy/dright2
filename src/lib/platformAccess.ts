import { supabase } from './supabase';

export type PlatformAccessState =
  | 'admin'
  | 'policy_off'
  | 'configuration_pending'
  | 'buyer_free'
  | 'trial'
  | 'subscribed'
  | 'subscription_required';

export interface PlatformAccessStatus {
  authenticated: boolean;
  roles?: string[];
  buyer_free: boolean;
  policy_enabled?: boolean;
  price?: number;
  currency?: string;
  trial_enabled?: boolean;
  trial_days?: number;
  trial_start?: string | null;
  trial_end?: string | null;
  trial_source?: string | null;
  trial_active?: boolean;
  trial_total_days?: number;
  trial_days_used?: number;
  trial_days_remaining?: number;
  subscription_active?: boolean;
  subscription_id?: string | null;
  subscription_status?: string | null;
  subscription_plan_name?: string | null;
  subscription_interval?: string | null;
  subscription_period_start?: string | null;
  subscription_period_end?: string | null;
  subscription_days_used?: number;
  subscription_days_remaining?: number;
  grace_period_end?: string | null;
  cancel_at_period_end?: boolean;
  requires_subscription?: boolean;
  plan_id?: string | null;
  access_state: PlatformAccessState;
}

export interface PlatformAccessRoleRule {
  role_key: string;
  label: string;
  description: string | null;
  requires_subscription: boolean;
  locked_free: boolean;
  sort_order: number;
}

export interface PlatformAccessFeatureRule {
  feature_key: string;
  label: string;
  description: string | null;
  role_keys: string[];
  requires_subscription: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface PlatformAccessAdminPolicy {
  settings: {
    singleton: boolean;
    enabled: boolean;
    monthly_price: number;
    currency: string;
    trial_enabled: boolean;
    trial_days: number;
    grace_period_days: number;
    buyer_free: boolean;
    policy_started_at: string;
    updated_at: string;
    updated_by: string | null;
  };
  roles: PlatformAccessRoleRule[];
  features: PlatformAccessFeatureRule[];
  plan: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    plan_type: string;
    amount: number;
    currency: string;
    interval: string;
    is_active: boolean;
  } | null;
}

export async function getMyPlatformAccess(): Promise<PlatformAccessStatus | null> {
  const { data, error } = await supabase.rpc('get_my_platform_access');
  if (error) {
    console.error('Failed to resolve DRIGHT platform access', error);
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    authenticated: Boolean(row.authenticated),
    roles: Array.isArray(row.roles) ? row.roles.map(String) : [],
    buyer_free: Boolean(row.buyer_free ?? true),
    policy_enabled: Boolean(row.policy_enabled),
    price: Number(row.price ?? 0),
    currency: String(row.currency ?? 'USD'),
    trial_enabled: Boolean(row.trial_enabled),
    trial_days: Number(row.trial_days ?? 30),
    trial_start: row.trial_start ? String(row.trial_start) : null,
    trial_end: row.trial_end ? String(row.trial_end) : null,
    trial_source: row.trial_source ? String(row.trial_source) : null,
    trial_active: Boolean(row.trial_active),
    trial_total_days: Number(row.trial_total_days ?? 0),
    trial_days_used: Number(row.trial_days_used ?? 0),
    trial_days_remaining: Number(row.trial_days_remaining ?? 0),
    subscription_active: Boolean(row.subscription_active),
    subscription_id: row.subscription_id ? String(row.subscription_id) : null,
    subscription_status: row.subscription_status ? String(row.subscription_status) : null,
    subscription_plan_name: row.subscription_plan_name ? String(row.subscription_plan_name) : null,
    subscription_interval: row.subscription_interval ? String(row.subscription_interval) : null,
    subscription_period_start: row.subscription_period_start ? String(row.subscription_period_start) : null,
    subscription_period_end: row.subscription_period_end ? String(row.subscription_period_end) : null,
    subscription_days_used: Number(row.subscription_days_used ?? 0),
    subscription_days_remaining: Number(row.subscription_days_remaining ?? 0),
    grace_period_end: row.grace_period_end ? String(row.grace_period_end) : null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    requires_subscription: Boolean(row.requires_subscription),
    plan_id: row.plan_id ? String(row.plan_id) : null,
    access_state: String(row.access_state ?? 'buyer_free') as PlatformAccessState,
  };
}

export async function canUsePlatformFeature(featureKey: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_use_platform_feature', {
    p_feature_key: featureKey,
  });
  if (error) {
    console.error('Failed to resolve DRIGHT platform feature access', featureKey, error);
    return false;
  }
  return data === true;
}

export async function getAdminPlatformAccessPolicy(): Promise<PlatformAccessAdminPolicy | null> {
  const { data, error } = await supabase.rpc('admin_get_platform_access_policy');
  if (error) {
    if (error.message && !/permission/i.test(error.message)) {
      console.error('Failed to load platform access policy', error);
    }
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const payload = data as any;
  return {
    settings: {
      ...payload.settings,
      monthly_price: Number(payload.settings?.monthly_price ?? 0),
      trial_days: Number(payload.settings?.trial_days ?? 30),
      grace_period_days: Number(payload.settings?.grace_period_days ?? 3),
    },
    roles: Array.isArray(payload.roles)
      ? payload.roles.map((row: any) => ({
          ...row,
          requires_subscription: Boolean(row.requires_subscription),
          locked_free: Boolean(row.locked_free),
          sort_order: Number(row.sort_order ?? 100),
        }))
      : [],
    features: Array.isArray(payload.features)
      ? payload.features.map((row: any) => ({
          ...row,
          role_keys: Array.isArray(row.role_keys) ? row.role_keys.map(String) : [],
          requires_subscription: Boolean(row.requires_subscription),
          is_active: Boolean(row.is_active),
          sort_order: Number(row.sort_order ?? 100),
        }))
      : [],
    plan: payload.plan
      ? {
          ...payload.plan,
          amount: Number(payload.plan.amount ?? 0),
        }
      : null,
  };
}

export async function updateAdminPlatformAccessPolicy(
  policy: PlatformAccessAdminPolicy,
): Promise<PlatformAccessAdminPolicy> {
  const { data, error } = await supabase.rpc('admin_update_platform_access_policy', {
    p_settings: {
      enabled: policy.settings.enabled,
      monthly_price: Number(policy.settings.monthly_price || 0),
      currency: String(policy.settings.currency || 'USD').toUpperCase(),
      trial_enabled: policy.settings.trial_enabled,
      trial_days: Number(policy.settings.trial_days || 0),
      grace_period_days: Number(policy.settings.grace_period_days || 0),
    },
    p_roles: policy.roles.map(role => ({
      role_key: role.role_key,
      requires_subscription: role.locked_free ? false : role.requires_subscription,
    })),
    p_features: policy.features.map(feature => ({
      feature_key: feature.feature_key,
      requires_subscription: feature.requires_subscription,
      is_active: feature.is_active,
    })),
  });

  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('Invalid platform access policy response');

  const next = await getAdminPlatformAccessPolicy();
  if (!next) throw new Error('Unable to reload platform access policy');
  return next;
}


export interface AdminSubscriptionPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  plan_type: string;
  amount: number;
  currency: string;
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly';
  trial_days: number;
  grace_period_days: number;
  features: string[];
  is_active: boolean;
  paystack_plan_code: string | null;
  sort_order: number;
}

export interface AdminSubscriptionCatalog {
  plans: AdminSubscriptionPlan[];
  platform_access: PlatformAccessAdminPolicy | null;
}

export async function getAdminSubscriptionCatalog(): Promise<AdminSubscriptionCatalog | null> {
  const { data, error } = await supabase.rpc('admin_get_subscription_catalog');
  if (error || !data || typeof data !== 'object') {
    if (error && !/permission/i.test(error.message || '')) console.error('Failed to load subscription catalog', error);
    return null;
  }
  const payload = data as Record<string, any>;
  const plans = Array.isArray(payload.plans)
    ? payload.plans.map((row: any) => ({
        ...row,
        amount: Number(row.amount ?? 0),
        trial_days: Number(row.trial_days ?? 0),
        grace_period_days: Number(row.grace_period_days ?? 0),
        sort_order: Number(row.sort_order ?? 0),
        features: Array.isArray(row.features) ? row.features.map(String) : [],
        is_active: Boolean(row.is_active),
      }))
    : [];
  return {
    plans,
    platform_access: payload.platform_access
      ? await getAdminPlatformAccessPolicy()
      : null,
  };
}

export async function updateAdminSubscriptionPlan(
  plan: AdminSubscriptionPlan,
): Promise<AdminSubscriptionPlan> {
  const { data, error } = await supabase.rpc('admin_update_subscription_plan', {
    p_plan_id: plan.id,
    p_patch: {
      name: plan.name,
      description: plan.description,
      amount: Number(plan.amount || 0),
      currency: String(plan.currency || 'USD').toUpperCase(),
      interval: plan.plan_type === 'platform_access' ? 'monthly' : plan.interval,
      // Introductory access trials are centralized in platform_access_settings.
      // Optional add-on plans never create a second free-trial period.
      trial_days: 0,
      grace_period_days: Number(plan.grace_period_days || 0),
      features: plan.features,
      is_active: plan.is_active,
    },
  });
  if (error) throw error;
  const row = data as any;
  return {
    ...row,
    amount: Number(row.amount ?? 0),
    trial_days: Number(row.trial_days ?? 0),
    grace_period_days: Number(row.grace_period_days ?? 0),
    sort_order: Number(row.sort_order ?? 0),
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    is_active: Boolean(row.is_active),
  } as AdminSubscriptionPlan;
}

export interface SalesProgressionStatus {
  authenticated: boolean;
  eligible: boolean;
  stage_key: string;
  stage_label: string;
  weekly_target: number;
  weekly_sales: number;
  remaining_sales: number;
  target_met: boolean;
  period_start: string;
  period_end: string;
  seconds_remaining: number;
  next_stage_key: string | null;
  downgrade_stage_key: string | null;
}

export async function getMySalesProgressionStatus(): Promise<SalesProgressionStatus | null> {
  const { data, error } = await supabase.rpc('get_my_sales_progression_status');
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    authenticated: Boolean(row.authenticated),
    eligible: Boolean(row.eligible),
    stage_key: String(row.stage_key || ''),
    stage_label: String(row.stage_label || ''),
    weekly_target: Number(row.weekly_target ?? 0),
    weekly_sales: Number(row.weekly_sales ?? 0),
    remaining_sales: Number(row.remaining_sales ?? 0),
    target_met: Boolean(row.target_met),
    period_start: String(row.period_start || ''),
    period_end: String(row.period_end || ''),
    seconds_remaining: Number(row.seconds_remaining ?? 0),
    next_stage_key: row.next_stage_key ? String(row.next_stage_key) : null,
    downgrade_stage_key: row.downgrade_stage_key ? String(row.downgrade_stage_key) : null,
  };
}
