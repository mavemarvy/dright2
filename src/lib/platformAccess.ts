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
  trial_end?: string | null;
  trial_active?: boolean;
  subscription_active?: boolean;
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
    trial_end: row.trial_end ? String(row.trial_end) : null,
    trial_active: Boolean(row.trial_active),
    subscription_active: Boolean(row.subscription_active),
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
