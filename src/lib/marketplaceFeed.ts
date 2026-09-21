import { supabase } from './supabase';
import type { MarketplaceProduct } from '../components/marketplace/ProductCard';

export interface MarketplaceFeedFilters {
  search?: string;
  category?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  location?: string;
  verifiedOnly?: boolean;
  minRating?: number | null;
  productType?: string;
}

export interface MarketplaceFeedPage {
  items: (MarketplaceProduct & { recommendation_reason?: string })[];
  hasMore: boolean;
  nextCursor: string | null;
  personalized: boolean;
  algorithmVersion: number;
}

export async function fetchMarketplaceFeedV2(
  filters: MarketplaceFeedFilters,
  cursor: string | null = null,
  limit = 30,
): Promise<MarketplaceFeedPage> {
  const { data, error } = await supabase.rpc('get_marketplace_feed_v2', {
    p_cursor: cursor,
    p_limit: Math.max(10, Math.min(limit, 60)),
    p_search: filters.search?.trim() || null,
    p_category: filters.category && filters.category !== 'All' ? filters.category : null,
    p_min_price: filters.minPrice ?? null,
    p_max_price: filters.maxPrice ?? null,
    p_location: filters.location?.trim() || null,
    p_verified_only: Boolean(filters.verifiedOnly),
    p_min_rating: filters.minRating && filters.minRating > 0 ? filters.minRating : null,
    p_product_type: filters.productType || null,
  });
  if (error) throw error;
  const payload = (data || {}) as {
    items?: unknown[]; has_more?: boolean; next_cursor?: string | null;
    personalized?: boolean; algorithm_version?: number;
  };

  let items = (payload.items || []) as MarketplaceFeedPage['items'];

  // The Starter catalog mirror lives in the generic products table for ranking,
  // but its authoritative commercial currency is NGN, not the marketplace USD base.
  // Enrich the ranked item from the first-party settings RPC so ProductCard never
  // converts ₦5,000 as though it were $5,000.
  const { data: starterData } = await supabase.rpc('get_public_dright_starter_product');
  const starterPayload = starterData && typeof starterData === 'object'
    ? starterData as Record<string, any>
    : null;
  const starterProduct = starterPayload?.available ? starterPayload.product : null;
  const starterId = starterProduct?.marketplace_product_id
    ? String(starterProduct.marketplace_product_id)
    : null;

  if (starterId) {
    items = items.map(item => item.id === starterId
      ? {
          ...item,
          sku: 'DRIGHT-STARTER-ACCESS',
          affiliate_commission_percent: Number(starterProduct.affiliate_commission_percent ?? 0),
          specifications: {
            ...(item.specifications || {}),
            system_product_kind: 'dright_starter_access',
            source_currency: String(starterProduct.currency || 'NGN').toUpperCase(),
            display_currency: String(starterProduct.currency || 'NGN').toUpperCase(),
            official_rating_enabled: Boolean(starterProduct.official_rating_enabled),
            official_rating: Number(starterProduct.official_rating ?? 0),
            special_route: '/dright/starter',
            official_store: true,
            first_party: true,
          },
        }
      : item);
  }

  return {
    items,
    hasMore: Boolean(payload.has_more),
    nextCursor: payload.next_cursor || null,
    personalized: Boolean(payload.personalized),
    algorithmVersion: Number(payload.algorithm_version || 2),
  };
}

export function dedupeMarketplaceItems(items: MarketplaceFeedPage['items']) {
  const seen = new Set<string>();
  return items.filter(item => item?.id && !seen.has(item.id) && seen.add(item.id));
}
