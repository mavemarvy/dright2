import { supabase } from './supabase';

export type MarketplaceListingTypeCode =
  | 'PHYSICAL'
  | 'DIGITAL'
  | 'SERVICE'
  | 'COURSE'
  | 'JOB'
  | 'TASK'
  | 'PRODUCT'
  | 'CAMPAIGN';

export interface MarketplaceEngineSettings {
  taxonomy_enabled: boolean;
  dynamic_forms_enabled: boolean;
  seller_commission_policy_enabled: boolean;
  legacy_fallback_enabled: boolean;
  engine_version: number;
}

export interface MarketplaceListingType {
  code: MarketplaceListingTypeCode;
  label: string;
  description: string | null;
  legacy_entity_table: string | null;
  legacy_type_value: string | null;
  sort_order: number;
}

export interface MarketplaceCategory {
  id: string;
  listing_type_code: MarketplaceListingTypeCode;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  sort_order: number;
  is_leaf: boolean;
}

export interface MarketplaceAttributeDefinition {
  id: string;
  listing_type_code: MarketplaceListingTypeCode;
  category_id: string | null;
  attribute_key: string;
  label: string;
  input_type: string;
  is_required: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_comparable: boolean;
  show_on_card: boolean;
  show_on_details: boolean;
  options: unknown[];
  validation: Record<string, unknown>;
  sort_order: number;
  schema_version: number;
}

export interface SellerCommissionPolicy {
  policy_id: string | null;
  listing_type_code: MarketplaceListingTypeCode;
  category_id: string | null;
  commission_kind: 'affiliate';
  default_percentage: number;
  min_percentage: number;
  max_percentage: number;
  allow_seller_override: boolean;
  priority: number;
}

const LEGACY_SAFE_COMMISSION_POLICY: Omit<SellerCommissionPolicy, 'listing_type_code'> = {
  policy_id: null,
  category_id: null,
  commission_kind: 'affiliate',
  default_percentage: 10,
  min_percentage: 0,
  max_percentage: 100,
  allow_seller_override: true,
  priority: 100,
};

export async function fetchMarketplaceEngineSettings(): Promise<MarketplaceEngineSettings> {
  const { data, error } = await supabase
    .from('marketplace_engine_settings')
    .select('taxonomy_enabled,dynamic_forms_enabled,seller_commission_policy_enabled,legacy_fallback_enabled,engine_version')
    .eq('id', true)
    .maybeSingle();

  if (error || !data) {
    return {
      taxonomy_enabled: false,
      dynamic_forms_enabled: false,
      seller_commission_policy_enabled: false,
      legacy_fallback_enabled: true,
      engine_version: 1,
    };
  }

  return data as MarketplaceEngineSettings;
}

export async function fetchMarketplaceListingTypes(): Promise<MarketplaceListingType[]> {
  const { data, error } = await supabase
    .from('marketplace_listing_types')
    .select('code,label,description,legacy_entity_table,legacy_type_value,sort_order')
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  if (error) return [];
  return (data ?? []) as MarketplaceListingType[];
}

export async function fetchMarketplaceCategories(
  listingTypeCode: MarketplaceListingTypeCode,
  parentId: string | null = null
): Promise<MarketplaceCategory[]> {
  let query = supabase
    .from('marketplace_taxonomy_categories')
    .select('id,listing_type_code,parent_id,name,slug,description,icon,image_url,sort_order,is_leaf')
    .eq('listing_type_code', listingTypeCode)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as MarketplaceCategory[];
}

export async function fetchMarketplaceAttributes(
  listingTypeCode: MarketplaceListingTypeCode,
  categoryId: string | null
): Promise<MarketplaceAttributeDefinition[]> {
  const baseSelect = 'id,listing_type_code,category_id,attribute_key,label,input_type,is_required,is_searchable,is_filterable,is_sortable,is_comparable,show_on_card,show_on_details,options,validation,sort_order,schema_version';

  const globalQuery = supabase
    .from('marketplace_attribute_definitions')
    .select(baseSelect)
    .eq('listing_type_code', listingTypeCode)
    .eq('is_active', true)
    .is('category_id', null)
    .order('sort_order', { ascending: true });

  const categoryQuery = categoryId
    ? supabase
        .from('marketplace_attribute_definitions')
        .select(baseSelect)
        .eq('listing_type_code', listingTypeCode)
        .eq('is_active', true)
        .eq('category_id', categoryId)
        .order('sort_order', { ascending: true })
    : null;

  const [globalResult, categoryResult] = await Promise.all([
    globalQuery,
    categoryQuery ?? Promise.resolve({ data: [], error: null }),
  ]);

  if (globalResult.error || categoryResult.error) return [];

  const merged = new Map<string, MarketplaceAttributeDefinition>();
  for (const row of (globalResult.data ?? []) as MarketplaceAttributeDefinition[]) {
    merged.set(row.attribute_key, row);
  }
  for (const row of (categoryResult.data ?? []) as MarketplaceAttributeDefinition[]) {
    merged.set(row.attribute_key, row);
  }

  return [...merged.values()].sort((a, b) => a.sort_order - b.sort_order);
}

export function validateMarketplaceAttributes(
  definitions: MarketplaceAttributeDefinition[],
  values: Record<string, unknown>
): string | null {
  for (const definition of definitions) {
    const value = values[definition.attribute_key];
    const empty = value === null
      || value === undefined
      || value === ''
      || (Array.isArray(value) && value.length === 0);

    if (definition.is_required && empty) {
      return `${definition.label} is required.`;
    }
    if (empty) continue;

    const validation = definition.validation ?? {};
    if (typeof value === 'number') {
      const min = Number(validation.min);
      const max = Number(validation.max);
      if (Number.isFinite(min) && value < min) return `${definition.label} must be at least ${min}.`;
      if (Number.isFinite(max) && value > max) return `${definition.label} must be no more than ${max}.`;
    }

    if (typeof value === 'string') {
      const minLength = Number(validation.minLength);
      const maxLength = Number(validation.maxLength);
      if (Number.isFinite(minLength) && value.length < minLength) {
        return `${definition.label} must contain at least ${minLength} characters.`;
      }
      if (Number.isFinite(maxLength) && value.length > maxLength) {
        return `${definition.label} must contain no more than ${maxLength} characters.`;
      }
    }
  }

  return null;
}

export async function resolveSellerCommissionPolicy(
  listingTypeCode: MarketplaceListingTypeCode,
  categoryId: string | null = null
): Promise<SellerCommissionPolicy> {
  const settings = await fetchMarketplaceEngineSettings();

  // Critical compatibility rule: until explicitly enabled, preserve the current
  // DRIGHT2 seller commission behavior (10% default, 0-100 input range).
  if (!settings.seller_commission_policy_enabled) {
    return {
      ...LEGACY_SAFE_COMMISSION_POLICY,
      listing_type_code: listingTypeCode,
    };
  }

  const { data, error } = await supabase.rpc('resolve_marketplace_seller_commission_policy', {
    p_listing_type_code: listingTypeCode,
    p_category_id: categoryId,
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return {
      ...LEGACY_SAFE_COMMISSION_POLICY,
      listing_type_code: listingTypeCode,
    };
  }

  return {
    policy_id: row.policy_id ?? null,
    listing_type_code: row.listing_type_code as MarketplaceListingTypeCode,
    category_id: row.category_id ?? null,
    commission_kind: 'affiliate',
    default_percentage: Number(row.default_percentage),
    min_percentage: Number(row.min_percentage),
    max_percentage: Number(row.max_percentage),
    allow_seller_override: Boolean(row.allow_seller_override),
    priority: Number(row.priority),
  };
}

export function validateSellerCommission(
  value: number,
  policy: SellerCommissionPolicy
): { valid: boolean; normalized: number; message?: string } {
  if (!Number.isFinite(value)) {
    return {
      valid: false,
      normalized: policy.default_percentage,
      message: 'Enter a valid commission percentage.',
    };
  }

  if (!policy.allow_seller_override && value !== policy.default_percentage) {
    return {
      valid: false,
      normalized: policy.default_percentage,
      message: `Commission is fixed at ${policy.default_percentage}% for this listing type.`,
    };
  }

  if (value < policy.min_percentage || value > policy.max_percentage) {
    return {
      valid: false,
      normalized: Math.min(policy.max_percentage, Math.max(policy.min_percentage, value)),
      message: `Commission must be between ${policy.min_percentage}% and ${policy.max_percentage}%.`,
    };
  }

  return { valid: true, normalized: value };
}


export interface UpsertMarketplaceListingExtensionInput {
  entityType: 'product' | 'job';
  entityId: string;
  listingTypeCode: MarketplaceListingTypeCode;
  categoryId?: string | null;
  schemaVersion?: number;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  sellerAffiliateCommission?: number | null;
}

export async function upsertMarketplaceListingExtension(
  input: UpsertMarketplaceListingExtensionInput
): Promise<{ id: string | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('upsert_marketplace_listing_extension', {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_listing_type_code: input.listingTypeCode,
    p_category_id: input.categoryId ?? null,
    p_schema_version: input.schemaVersion ?? 1,
    p_attributes: input.attributes ?? {},
    p_metadata: input.metadata ?? {},
    p_seller_affiliate_commission: input.sellerAffiliateCommission ?? null,
  });

  return {
    id: typeof data === 'string' ? data : null,
    error: error ? new Error(error.message) : null,
  };
}
