import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Package, Star, Users, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRecentlyViewed } from '../../lib/marketplaceHooks';
import { getRecentlyViewedIds } from '../../lib/marketplace';
import { useRelatedListings } from '../../lib/recommendationHooks';
import type { MarketplaceProduct } from './ProductCard';
import { formatCurrency } from '../../lib/currency';

type RecommendationStrategy =
  | 'browsing_history'
  | 'wishlist'
  | 'same_category'
  | 'same_seller'
  | 'price_range'
  | 'trending'
  | 'top_rated'
  | 'new_arrivals'
  | 'verified_sellers';

interface PersonalizedRecommendationsProps {
  currentProductId?: string;
  currentCategory?: string;
  currentSellerId?: string;
  currentPrice?: number;
}

const STRATEGY_LABELS: Record<RecommendationStrategy, { label: string; icon: string }> = {
  browsing_history: { label: 'Based on Your Browsing', icon: 'Eye' },
  wishlist: { label: 'Similar to Your Wishlist', icon: 'Heart' },
  same_category: { label: 'More in This Category', icon: 'Package' },
  same_seller: { label: 'From This Seller', icon: 'Store' },
  price_range: { label: 'In Your Price Range', icon: 'TrendingUp' },
  trending: { label: 'Trending Now', icon: 'TrendingUp' },
  top_rated: { label: 'Top Rated', icon: 'Star' },
  new_arrivals: { label: 'New Arrivals', icon: 'Sparkles' },
  verified_sellers: { label: 'From Verified Sellers', icon: 'BadgeCheck' },
};

async function fetchProducts(ids: string[]): Promise<MarketplaceProduct[]> {
  const { data } = await supabase
    .from('products')
    .select(`
      id, name, description, price, commission_rate, image_url, category,
      uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
      initial_stock, product_type, demo_video_url, total_reviews,
      average_rating, total_sales, view_count
    `)
    .in('id', ids)
    .eq('is_active', true)
    .eq('is_hidden', false)
    .eq('approval_status', 'approved')
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

export default function PersonalizedRecommendations({
  currentProductId, currentCategory, currentSellerId, currentPrice,
}: PersonalizedRecommendationsProps) {
  const { user } = useAuth();
  const { recentlyViewed } = useRecentlyViewed(user?.id);
  
  // Collaborative filtering + content-based similarity (Phase 2)
  const { sections: relatedSections } = useRelatedListings(currentProductId || undefined, user?.id);

  const [recommendations, setRecommendations] = useState<Array<{
    strategy: RecommendationStrategy;
    products: MarketplaceProduct[];
  }>>([]);
  const [loading, setLoading] = useState(true);

  const buildRecommendations = useCallback(async () => {
    const sections: Array<{ strategy: RecommendationStrategy; products: MarketplaceProduct[] }> = [];

    // 1. Browsing history
    const viewedIds = recentlyViewed.length > 0 ? recentlyViewed : getRecentlyViewedIds();
    const filteredViewedIds = viewedIds.filter(id => id !== currentProductId);
    if (filteredViewedIds.length > 0) {
      const products = await enrichWithSellers(await fetchProducts(filteredViewedIds.slice(0, 6)));
      if (products.length > 0) sections.push({ strategy: 'browsing_history', products });
    }

    // 2. Same category
    if (currentCategory) {
      const { data } = await supabase
        .from('products')
        .select(`
          id, name, description, price, commission_rate, image_url, category,
          uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
          initial_stock, product_type, demo_video_url, total_reviews,
          average_rating, total_sales, view_count
        `)
        .eq('category', currentCategory)
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .neq('id', currentProductId || '')
        .limit(6);
      if (data && data.length > 0) {
        const enriched = await enrichWithSellers(data as MarketplaceProduct[]);
        sections.push({ strategy: 'same_category', products: enriched });
      }
    }

    // 3. Same seller
    if (currentSellerId) {
      const { data } = await supabase
        .from('products')
        .select(`
          id, name, description, price, commission_rate, image_url, category,
          uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
          initial_stock, product_type, demo_video_url, total_reviews,
          average_rating, total_sales, view_count
        `)
        .eq('uploaded_by', currentSellerId)
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .neq('id', currentProductId || '')
        .limit(4);
      if (data && data.length > 0) {
        const enriched = await enrichWithSellers(data as MarketplaceProduct[]);
        sections.push({ strategy: 'same_seller', products: enriched });
      }
    }

    // 4. Price range
    if (currentPrice && currentPrice > 0) {
      const minP = currentPrice * 0.7;
      const maxP = currentPrice * 1.3;
      const { data } = await supabase
        .from('products')
        .select(`
          id, name, description, price, commission_rate, image_url, category,
          uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
          initial_stock, product_type, demo_video_url, total_reviews,
          average_rating, total_sales, view_count
        `)
        .gte('price', minP)
        .lte('price', maxP)
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .neq('id', currentProductId || '')
        .limit(6);
      if (data && data.length > 0) {
        const enriched = await enrichWithSellers(data as MarketplaceProduct[]);
        sections.push({ strategy: 'price_range', products: enriched });
      }
    }

    // 5. Trending
    {
      const { data } = await supabase
        .from('products')
        .select(`
          id, name, description, price, commission_rate, image_url, category,
          uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
          initial_stock, product_type, demo_video_url, total_reviews,
          average_rating, total_sales, view_count
        `)
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .neq('id', currentProductId || '')
        .order('total_sales', { ascending: false })
        .limit(8);
      if (data && data.length > 0) {
        const enriched = await enrichWithSellers(data as MarketplaceProduct[]);
        sections.push({ strategy: 'trending', products: enriched });
      }
    }

    // 6. Top rated
    {
      const { data } = await supabase
        .from('products')
        .select(`
          id, name, description, price, commission_rate, image_url, category,
          uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
          initial_stock, product_type, demo_video_url, total_reviews,
          average_rating, total_sales, view_count
        `)
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .neq('id', currentProductId || '')
        .gte('average_rating', 4)
        .order('average_rating', { ascending: false })
        .limit(6);
      if (data && data.length > 0) {
        const enriched = await enrichWithSellers(data as MarketplaceProduct[]);
        sections.push({ strategy: 'top_rated', products: enriched });
      }
    }

    setRecommendations(sections);
    setLoading(false);
  }, [recentlyViewed, currentProductId, currentCategory, currentSellerId, currentPrice]);

  useEffect(() => {
    buildRecommendations();
  }, [buildRecommendations]);

  if (loading || (recommendations.length === 0 && relatedSections.length === 0)) return null;

  // Render collaborative-filtering sections first (people also viewed, similar)
  const relatedIcons: Record<string, typeof Sparkles> = {
    people_also_viewed: Users,
    similar_listings: Layers,
  };

  return (
    <div className="space-y-8 mt-8">
      {relatedSections.map(section => {
        const Icon = relatedIcons[section.icon] || Sparkles;
        return (
          <div key={section.strategy}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <Icon className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900">{section.label}</h3>
              {section.reason && <span className="text-xs text-gray-400">· {section.reason}</span>}
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
              {section.products.map(product => (
                <motion.div key={product.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Link to={`/product/${product.id}`} className="block w-44 bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group shrink-0">
                    <div className="h-32 bg-gray-50 overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><Package className="w-10 h-10 text-gray-300" /></div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{product.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{product.category}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-gray-900">{product.is_free ? 'FREE' : formatCurrency(product.price)}</span>
                        {(product.average_rating ?? 0) > 0 && (
                          <div className="flex items-center gap-0.5"><Star className="w-3 h-3 fill-warning text-warning" /><span className="text-xs text-gray-500">{Number(product.average_rating).toFixed(1)}</span></div>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}

      {recommendations.map((section, sIdx) => {
        const meta = STRATEGY_LABELS[section.strategy];
        return (
          <div key={section.strategy}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-primary-50 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-600" />
              </div>
              <h3 className="font-bold text-gray-900">{meta.label}</h3>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
              {section.products.map(product => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(sIdx * 0.05, 0.2) }}
                >
                  <Link
                    to={`/product/${product.id}`}
                    className="block w-44 bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group shrink-0"
                  >
                    <div className="h-32 bg-gray-50 overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-10 h-10 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-gray-900 line-clamp-2">{product.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{product.category}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-bold text-gray-900">
                          {product.is_free ? 'FREE' : formatCurrency(product.price)}
                        </span>
                        {(product.average_rating ?? 0) > 0 && (
                          <div className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-warning text-warning" />
                            <span className="text-xs text-gray-500">{Number(product.average_rating).toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
