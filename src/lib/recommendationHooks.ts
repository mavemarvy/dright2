// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Recommendation Hooks
// React hooks for consuming the recommendation engine in UI components.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import {
  type RecommendationStrategy,
  type InterestProfile,
  getInterestProfile,
  recommendForYou,
  becauseYouViewed,
  peopleAlsoViewed,
  similarListings,
  trendingInInterests,
  bestSellersInInterests,
  highlyRatedInInterests,
  newListingsYouMayLike,
  coldStartRecommendations,
  logRecommendationClicked,
} from './recommendationEngine';
import { useRecentlyViewed } from './marketplaceHooks';
import type { MarketplaceProduct } from '../components/marketplace/ProductCard';

const PRODUCT_SELECT = `
  id, name, description, price, commission_rate, image_url, category,
  uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
  initial_stock, product_type, demo_video_url, total_reviews,
  average_rating, total_sales, view_count, is_featured, is_sponsored
`;

async function fetchProductsByIds(ids: string[]): Promise<MarketplaceProduct[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .in('id', ids)
    .eq('is_active', true)
    .eq('is_hidden', false)
    .eq('approval_status', 'approved');
  return (data || []) as MarketplaceProduct[];
}

async function enrichWithSellers(products: MarketplaceProduct[]): Promise<MarketplaceProduct[]> {
  if (products.length === 0) return products;
  const sellerIds = [...new Set(products.map(p => p.uploaded_by))];
  const { data: sellers } = await supabase
    .from('users')
    .select('id, full_name, avatar_url, is_verified')
    .in('id', sellerIds);
  const sellerMap = new Map((sellers || []).map(s => [s.id, s]));
  return products.map(p => {
    const seller = sellerMap.get(p.uploaded_by);
    return {
      ...p,
      seller_name: seller?.full_name || null,
      seller_avatar: seller?.avatar_url || null,
      seller_verified: seller?.is_verified || false,
      store_name: null,
    };
  });
}

// Preserve input order when fetching
function orderByIds<T extends { id: string }>(ids: string[], items: T[]): T[] {
  const map = new Map(items.map(i => [i.id, i]));
  return ids.map(id => map.get(id)).filter((x): x is T => x !== undefined);
}

export interface RecommendationSection {
  strategy: RecommendationStrategy;
  label: string;
  icon: string;
  products: MarketplaceProduct[];
  reason: string;
}

const STRATEGY_META: Record<RecommendationStrategy, { label: string; icon: string }> = {
  recommended_for_you: { label: 'Recommended For You', icon: 'Sparkles' },
  because_you_viewed: { label: 'Because You Viewed', icon: 'Eye' },
  people_also_viewed: { label: 'People Also Viewed', icon: 'Users' },
  similar_listings: { label: 'Similar Listings', icon: 'Layers' },
  trending_in_interests: { label: 'Trending In Your Interests', icon: 'TrendingUp' },
  best_sellers_in_interests: { label: 'Best Sellers In Your Interests', icon: 'ShoppingBag' },
  highly_rated_in_interests: { label: 'Highly Rated In Your Interests', icon: 'Star' },
  new_listings_you_may_like: { label: 'New Listings You May Like', icon: 'Sparkles' },
  recommended_sellers: { label: 'Recommended Sellers', icon: 'Store' },
  recommended_categories: { label: 'Recommended Categories', icon: 'Grid' },
};

/**
 * Hook for the personalized home feed — generates multiple recommendation sections.
 */
export function usePersonalizedFeed(userId: string | null | undefined) {
  const [sections, setSections] = useState<RecommendationSection[]>([]);
  const [loading, setLoading] = useState(true);
  const { recentlyViewed } = useRecentlyViewed(userId || undefined);

  const buildFeed = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const profile = await getInterestProfile(userId);
      const ctx = { userId, profile, limit: 10 };
      const exclude = new Set<string>();

      const results: RecommendationSection[] = [];

      // 1. Recommended For You (always first)
      const rfy = await recommendForYou(ctx);
      if (rfy.ids.length > 0) {
        const products = await enrichWithSellers(await fetchProductsByIds(rfy.ids));
        results.push({
          strategy: 'recommended_for_you',
          ...STRATEGY_META.recommended_for_you,
          products: orderByIds(rfy.ids, products),
          reason: rfy.reason,
        });
        rfy.ids.forEach(id => exclude.add(id));
      }

      // 2. Because You Viewed
      if (recentlyViewed.length > 0) {
        const byv = await becauseYouViewed({ ...ctx, excludeIds: [...exclude] }, recentlyViewed);
        if (byv.ids.length > 0) {
          const products = await enrichWithSellers(await fetchProductsByIds(byv.ids));
          results.push({
            strategy: 'because_you_viewed',
            ...STRATEGY_META.because_you_viewed,
            products: orderByIds(byv.ids, products),
            reason: byv.reason,
          });
          byv.ids.forEach(id => exclude.add(id));
        }
      }

      // 3. Trending In Interests
      const trending = await trendingInInterests({ ...ctx, excludeIds: [...exclude], limit: 8 });
      if (trending.ids.length > 0) {
        const products = await enrichWithSellers(await fetchProductsByIds(trending.ids));
        results.push({
          strategy: 'trending_in_interests',
          ...STRATEGY_META.trending_in_interests,
          products: orderByIds(trending.ids, products),
          reason: trending.reason,
        });
        trending.ids.forEach(id => exclude.add(id));
      }

      // 4. Best Sellers In Interests
      const bestSellers = await bestSellersInInterests({ ...ctx, excludeIds: [...exclude], limit: 8 });
      if (bestSellers.ids.length > 0) {
        const products = await enrichWithSellers(await fetchProductsByIds(bestSellers.ids));
        results.push({
          strategy: 'best_sellers_in_interests',
          ...STRATEGY_META.best_sellers_in_interests,
          products: orderByIds(bestSellers.ids, products),
          reason: bestSellers.reason,
        });
        bestSellers.ids.forEach(id => exclude.add(id));
      }

      // 5. Highly Rated In Interests
      const highlyRated = await highlyRatedInInterests({ ...ctx, excludeIds: [...exclude], limit: 8 });
      if (highlyRated.ids.length > 0) {
        const products = await enrichWithSellers(await fetchProductsByIds(highlyRated.ids));
        results.push({
          strategy: 'highly_rated_in_interests',
          ...STRATEGY_META.highly_rated_in_interests,
          products: orderByIds(highlyRated.ids, products),
          reason: highlyRated.reason,
        });
        highlyRated.ids.forEach(id => exclude.add(id));
      }

      // 6. New Listings You May Like
      const newListings = await newListingsYouMayLike({ ...ctx, excludeIds: [...exclude], limit: 8 });
      if (newListings.ids.length > 0) {
        const products = await enrichWithSellers(await fetchProductsByIds(newListings.ids));
        results.push({
          strategy: 'new_listings_you_may_like',
          ...STRATEGY_META.new_listings_you_may_like,
          products: orderByIds(newListings.ids, products),
          reason: newListings.reason,
        });
      }

      setSections(results);
    } catch (err) {
      console.error('usePersonalizedFeed error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, recentlyViewed]);

  useEffect(() => {
    buildFeed();
  }, [buildFeed]);

  return { sections, loading, refetch: buildFeed };
}

/**
 * Hook for related listings on a product detail page.
 * Uses people_also_viewed (collaborative) + similar_listings (content-based).
 */
export function useRelatedListings(currentProductId: string | undefined, userId: string | null | undefined) {
  const [sections, setSections] = useState<RecommendationSection[]>([]);
  const [loading, setLoading] = useState(true);

  const build = useCallback(async () => {
    if (!currentProductId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results: RecommendationSection[] = [];
      const exclude = new Set<string>([currentProductId]);

      // 1. People Also Viewed (collaborative filtering)
      const pav = await peopleAlsoViewed(currentProductId, [...exclude], 8);
      if (pav.ids.length > 0) {
        const products = await enrichWithSellers(await fetchProductsByIds(pav.ids));
        if (products.length > 0) {
          results.push({
            strategy: 'people_also_viewed',
            ...STRATEGY_META.people_also_viewed,
            products: orderByIds(pav.ids, products),
            reason: pav.reason,
          });
          pav.ids.forEach(id => exclude.add(id));
        }
      }

      // 2. Similar Listings (content-based)
      const similar = await similarListings(currentProductId, [...exclude], 6);
      if (similar.ids.length > 0) {
        const products = await enrichWithSellers(await fetchProductsByIds(similar.ids));
        if (products.length > 0) {
          results.push({
            strategy: 'similar_listings',
            ...STRATEGY_META.similar_listings,
            products: orderByIds(similar.ids, products),
            reason: similar.reason,
          });
        }
      }

      setSections(results);
    } catch (err) {
      console.error('useRelatedListings error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentProductId]);

  useEffect(() => {
    build();
  }, [build]);

  const trackClick = useCallback((listingId: string, strategy: RecommendationStrategy) => {
    if (userId) logRecommendationClicked(userId, listingId, strategy);
  }, [userId]);

  return { sections, loading, trackClick };
}

/**
 * Hook for the user's interest profile — for display in UI.
 */
export function useInterestProfile(userId: string | null | undefined) {
  const [profile, setProfile] = useState<InterestProfile>({ scores: {}, topCategories: [], interactionCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    getInterestProfile(userId).then(p => {
      setProfile(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  return { profile, loading };
}

/**
 * Hook for cold-start feed (guests or new users with no activity).
 */
export function useColdStartFeed() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      const result = await coldStartRecommendations(12, new Set());
      const fetched = await enrichWithSellers(await fetchProductsByIds(result.ids));
      setProducts(fetched);
      setLoading(false);
    })();
  }, []);

  return { products, loading };
}
