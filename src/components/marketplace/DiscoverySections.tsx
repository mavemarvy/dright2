import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Star, Package, Loader2, Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { usePersonalizedFeed, type RecommendationSection } from '../../lib/recommendationHooks';
import { useRecentlyViewed } from '../../lib/marketplaceHooks';
import { getRecentlyViewedIds } from '../../lib/marketplace';
import type { MarketplaceProduct } from './ProductCard';
import { formatCurrency } from '../../lib/currency';

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

// ─── Discovery Sections (no ranking labels) ───────────────────────────────────

function useDiscoverySections() {
  const [sections, setSections] = useState<{ id: string; products: MarketplaceProduct[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { recentlyViewed } = useRecentlyViewed(user?.id);

  useEffect(() => {
    (async () => {
      const results: { id: string; products: MarketplaceProduct[] }[] = [];

      const [topRatedRes, bestSellersRes] = await Promise.all([
        supabase.from('products').select(PRODUCT_SELECT).eq('is_active', true).eq('is_hidden', false).eq('approval_status', 'approved').gte('total_reviews', 3).order('average_rating', { ascending: false }).limit(12),
        supabase.from('products').select(PRODUCT_SELECT).eq('is_active', true).eq('is_hidden', false).eq('approval_status', 'approved').order('total_sales', { ascending: false }).limit(12),
      ]);

      const [topRated, bestSellers] = await Promise.all([
        enrichWithSellers((topRatedRes.data || []) as MarketplaceProduct[]),
        enrichWithSellers((bestSellersRes.data || []) as MarketplaceProduct[]),
      ]);

      if (topRated.length > 0) results.push({ id: 'top_rated', products: topRated });
      if (bestSellers.length > 0) results.push({ id: 'best_sellers', products: bestSellers });

      const viewedIds = recentlyViewed.length > 0 ? recentlyViewed : getRecentlyViewedIds();
      if (viewedIds.length > 0) {
        const viewedProducts = await enrichWithSellers(await fetchProductsByIds(viewedIds.slice(0, 10)));
        if (viewedProducts.length > 0) results.push({ id: 'recently_viewed', products: viewedProducts });
      }

      setSections(results);
      setLoading(false);
    })();
  }, [user?.id, recentlyViewed]);

  return { sections, loading };
}

// ─── Product Row (horizontal scroll, no ranking labels) ──────────────────────

function ProductRow({ products, label }: {
  products: MarketplaceProduct[];
  label: string;
}) {
  if (products.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-3">{label}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {products.map(product => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link
              to={`/product/${product.id}`}
              className="block w-44 bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group shrink-0"
            >
              <div className="h-32 bg-gray-50 overflow-hidden relative">
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
}

// ─── Personalized Feed Section ────────────────────────────────────────────────

function PersonalizedFeedSections({ sections }: { sections: RecommendationSection[] }) {
  if (sections.length === 0) return null;

  return (
    <div className="space-y-8">
      {sections.map(section => (
        <ProductRow
          key={section.strategy}
          products={section.products}
          label={section.label}
        />
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DiscoverySections() {
  const { user } = useAuth();
  const { sections: staticSections, loading: staticLoading } = useDiscoverySections();
  const { sections: personalizedSections, loading: personalizedLoading } = usePersonalizedFeed(user?.id);

  if (staticLoading && personalizedLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {user && personalizedSections.length > 0 && (
        <div className="bg-gradient-to-br from-primary-50 to-blue-50 rounded-3xl p-5 md:p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-9 h-9 rounded-xl bg-primary-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Recommended For You</h2>
              <p className="text-xs text-gray-500">Based on your activity</p>
            </div>
          </div>
          <PersonalizedFeedSections sections={personalizedSections} />
        </div>
      )}

      <div className="space-y-8">
        {staticSections.map(section => (
          <ProductRow
            key={section.id}
            products={section.products}
            label={section.id === 'top_rated' ? 'Highly Rated' : section.id === 'best_sellers' ? 'Discover More' : 'Recently Viewed'}
          />
        ))}
      </div>
    </div>
  );
}
