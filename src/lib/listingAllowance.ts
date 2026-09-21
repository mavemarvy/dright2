import { supabase } from './supabase';

export interface ListingCapacityPack {
  id: string;
  name: string;
  description: string | null;
  listing_count: number;
  amount: number;
  currency: string;
  validity_days: number;
  listing_type_code: string | null;
  category_id: string | null;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
}

export interface ListingCapacityStatus {
  authenticated: boolean;
  enabled?: boolean;
  period_start?: string;
  period_end?: string;
  policy?: {
    rule_id: string | null;
    rule_name: string;
    scope_type: string;
    free_allowance: number;
    bucket_key: string;
  };
  free_allowance?: number;
  free_used?: number;
  free_remaining?: number;
  extra_allowance?: number;
  extra_used?: number;
  extra_remaining?: number;
  total_remaining?: number;
  packs?: ListingCapacityPack[];
}

export interface ListingAllowanceSettings {
  singleton: boolean;
  enabled: boolean;
  default_free_allowance: number;
  period_kind: 'calendar_month';
  warning_thresholds: number[];
  updated_at: string;
  updated_by: string | null;
}

export interface ListingAllowanceRule {
  id: string;
  name: string;
  scope_type: 'global' | 'listing_type' | 'category' | 'role' | 'user';
  listing_type_code: string | null;
  category_id: string | null;
  role_key: string | null;
  user_id: string | null;
  free_allowance: number;
  priority: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface AdminListingCapacityConfig {
  settings: ListingAllowanceSettings;
  rules: ListingAllowanceRule[];
  packs: ListingCapacityPack[];
}

function normalizePack(row: any): ListingCapacityPack {
  return {
    ...row,
    listing_count: Number(row.listing_count ?? 0),
    amount: Number(row.amount ?? 0),
    validity_days: Number(row.validity_days ?? 30),
    sort_order: Number(row.sort_order ?? 100),
    is_active: Boolean(row.is_active),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
}

function normalizeRule(row: any): ListingAllowanceRule {
  return {
    ...row,
    free_allowance: Number(row.free_allowance ?? 0),
    priority: Number(row.priority ?? 100),
    is_active: Boolean(row.is_active),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
}

export async function getMyListingCapacity(
  listingTypeCode?: string | null,
  categoryId?: string | null,
): Promise<ListingCapacityStatus | null> {
  const { data, error } = await supabase.rpc('get_my_listing_capacity', {
    p_listing_type_code: listingTypeCode ? listingTypeCode.toUpperCase() : null,
    p_category_id: categoryId || null,
  });
  if (error) {
    console.error('Failed to load listing capacity', error);
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, any>;
  return {
    authenticated: Boolean(row.authenticated),
    enabled: Boolean(row.enabled ?? true),
    period_start: row.period_start ? String(row.period_start) : undefined,
    period_end: row.period_end ? String(row.period_end) : undefined,
    policy: row.policy && typeof row.policy === 'object'
      ? {
          rule_id: row.policy.rule_id ? String(row.policy.rule_id) : null,
          rule_name: String(row.policy.rule_name || 'Default monthly allowance'),
          scope_type: String(row.policy.scope_type || 'default'),
          free_allowance: Number(row.policy.free_allowance ?? 0),
          bucket_key: String(row.policy.bucket_key || 'default'),
        }
      : undefined,
    free_allowance: Number(row.free_allowance ?? 0),
    free_used: Number(row.free_used ?? 0),
    free_remaining: Number(row.free_remaining ?? 0),
    extra_allowance: Number(row.extra_allowance ?? 0),
    extra_used: Number(row.extra_used ?? 0),
    extra_remaining: Number(row.extra_remaining ?? 0),
    total_remaining: Number(row.total_remaining ?? 0),
    packs: Array.isArray(row.packs) ? row.packs.map(normalizePack) : [],
  };
}

export async function canCreateListing(
  listingTypeCode?: string | null,
  categoryId?: string | null,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_create_listing', {
    p_listing_type_code: listingTypeCode ? listingTypeCode.toUpperCase() : null,
    p_category_id: categoryId || null,
  });
  if (error) {
    console.error('Failed to resolve listing capacity', error);
    return false;
  }
  return data === true;
}

export async function getAdminListingCapacityConfig(): Promise<AdminListingCapacityConfig | null> {
  const { data, error } = await supabase.rpc('admin_get_listing_capacity_config');
  if (error || !data || typeof data !== 'object') {
    if (error && !/permission/i.test(error.message || '')) console.error('Failed to load listing capacity config', error);
    return null;
  }
  const payload = data as Record<string, any>;
  return {
    settings: {
      ...payload.settings,
      enabled: Boolean(payload.settings?.enabled ?? true),
      default_free_allowance: Number(payload.settings?.default_free_allowance ?? 5),
      warning_thresholds: Array.isArray(payload.settings?.warning_thresholds)
        ? payload.settings.warning_thresholds.map(Number)
        : [80, 90, 100],
    },
    rules: Array.isArray(payload.rules) ? payload.rules.map(normalizeRule) : [],
    packs: Array.isArray(payload.packs) ? payload.packs.map(normalizePack) : [],
  };
}

export async function updateAdminListingAllowanceSettings(
  settings: Pick<ListingAllowanceSettings, 'enabled' | 'default_free_allowance' | 'warning_thresholds'>,
): Promise<ListingAllowanceSettings> {
  const { data, error } = await supabase.rpc('admin_update_listing_allowance_settings', {
    p_patch: {
      enabled: settings.enabled,
      default_free_allowance: Number(settings.default_free_allowance || 0),
      warning_thresholds: settings.warning_thresholds.map(Number),
    },
  });
  if (error) throw error;
  const row = data as any;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    default_free_allowance: Number(row.default_free_allowance ?? 0),
    warning_thresholds: Array.isArray(row.warning_thresholds) ? row.warning_thresholds.map(Number) : [],
  };
}

export async function upsertAdminListingCapacityPack(
  pack: Partial<ListingCapacityPack> & Pick<ListingCapacityPack, 'name' | 'listing_count' | 'amount' | 'currency' | 'validity_days'>,
): Promise<ListingCapacityPack> {
  const { data, error } = await supabase.rpc('admin_upsert_listing_capacity_pack', {
    p_pack: {
      id: pack.id || null,
      name: pack.name,
      description: pack.description || null,
      listing_count: Number(pack.listing_count || 0),
      amount: Number(pack.amount || 0),
      currency: String(pack.currency || 'NGN').toUpperCase(),
      validity_days: Number(pack.validity_days || 30),
      listing_type_code: pack.listing_type_code || null,
      category_id: pack.category_id || null,
      is_active: Boolean(pack.is_active),
      sort_order: Number(pack.sort_order ?? 100),
    },
  });
  if (error) throw error;
  return normalizePack(data);
}

export async function upsertAdminListingAllowanceRule(
  rule: Partial<ListingAllowanceRule> & Pick<ListingAllowanceRule, 'name' | 'scope_type' | 'free_allowance'>,
): Promise<ListingAllowanceRule> {
  const { data, error } = await supabase.rpc('admin_upsert_listing_allowance_rule', {
    p_rule: {
      id: rule.id || null,
      name: rule.name,
      scope_type: rule.scope_type,
      listing_type_code: rule.listing_type_code || null,
      category_id: rule.category_id || null,
      role_key: rule.role_key || null,
      user_id: rule.user_id || null,
      free_allowance: Number(rule.free_allowance || 0),
      priority: Number(rule.priority ?? 100),
      is_active: Boolean(rule.is_active ?? true),
    },
  });
  if (error) throw error;
  return normalizeRule(data);
}
