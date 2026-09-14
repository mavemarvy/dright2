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
  return {
    items: (payload.items || []) as MarketplaceFeedPage['items'],
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
