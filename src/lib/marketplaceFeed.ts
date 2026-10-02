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

  // Ranked-feed RPCs intentionally return a compact product payload. First-party
  // DRIGHT products, however, can be priced in NGN or another source currency.
  // Re-hydrate every Official Store item from its authoritative settings before
  // rendering so a source amount is never treated as canonical USD.
  const [{ data: starterData }, { data: officialData }] = await Promise.all([
    supabase.rpc('get_public_dright_starter_product'),
    supabase.rpc('get_public_dright_official_products'),
  ]);

  const starterPayload = starterData && typeof starterData === 'object'
    ? starterData as Record<string, any>
    : null;
  const starterProduct = starterPayload?.available ? starterPayload.product : null;
  const starterId = starterProduct?.marketplace_product_id
    ? String(starterProduct.marketplace_product_id)
    : null;

  const officialByProductId = new Map<string, Record<string, any>>();
  if (Array.isArray(officialData)) {
    for (const row of officialData) {
      if (!row || typeof row !== 'object') continue;
      const productId = String((row as Record<string, any>).marketplace_product_id || '');
      if (productId) officialByProductId.set(productId, row as Record<string, any>);
    }
  }

  items = items.map((item) => {
    if (starterId && item.id === starterId) {
      const currency = String(starterProduct.currency || 'NGN').toUpperCase();
      return {
        ...item,
        price: Number(starterProduct.price ?? item.price ?? 0),
        is_free: Number(starterProduct.price ?? item.price ?? 0) === 0,
        image_url: starterProduct.image_url || item.image_url || '/dright-logo.webp',
        sku: 'DRIGHT-STARTER-ACCESS',
        affiliate_commission_percent: Number(starterProduct.affiliate_commission_percent ?? 0),
        seller_name: 'Official DRIGHT Store',
        seller_avatar: '/dright-logo.webp',
        seller_verified: true,
        store_name: 'Official DRIGHT Store',
        specifications: {
          ...(item.specifications || {}),
          system_product_kind: 'dright_starter_access',
          price_currency: currency,
          source_currency: currency,
          display_currency: currency,
          official_rating_enabled: Boolean(starterProduct.official_rating_enabled),
          official_rating: Number(starterProduct.official_rating ?? 0),
          special_route: '/dright/starter',
          official_store: true,
          first_party: true,
        },
      };
    }

    const official = officialByProductId.get(item.id);
    if (!official) return item;

    const currency = String(official.currency || 'NGN').toUpperCase();
    const authoritativePrice = Number(official.price ?? item.price ?? 0);
    return {
      ...item,
      name: String(official.name || item.name),
      description: official.description ?? item.description,
      price: authoritativePrice,
      is_free: authoritativePrice === 0,
      image_url: official.image_url || item.image_url,
      product_type: official.product_type || item.product_type,
      category: official.category || item.category,
      is_featured: official.is_featured === true,
      affiliate_commission_percent: Number(official.affiliate_commission_percent ?? item.affiliate_commission_percent ?? 0),
      seller_name: 'Official DRIGHT Store',
      seller_avatar: '/dright-logo.webp',
      seller_verified: true,
      store_name: 'Official DRIGHT Store',
      specifications: {
        ...(item.specifications || {}),
        price_currency: currency,
        source_currency: currency,
        display_currency: currency,
        official_store: true,
        first_party: true,
        official_product_id: String(official.id || ''),
        official_rating_enabled: official.official_rating_enabled === true,
        official_rating: Number(official.official_rating ?? 0),
        official_badge_enabled: official.official_badge_enabled !== false,
        platform_fee_percent: 0,
      },
    };
  });

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
