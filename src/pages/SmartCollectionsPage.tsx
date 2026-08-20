import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, Award, Eye, Star, Sparkles, BadgeCheck, Wallet,
  Crown, Gift, Package, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import SeoHead from '../components/SeoHead';
import NapFooter from '../components/NapFooter';
import { useWishlist } from '../lib/marketplaceHooks';
import { useAuth } from '../contexts/AuthContext';
import ProductCard, { type MarketplaceProduct } from '../components/marketplace/ProductCard';

interface SmartCollection {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  query: () => Promise<MarketplaceProduct[]>;
}

async function enrichWithSellers(products: MarketplaceProduct[]): Promise<MarketplaceProduct[]> {
  if (products.length === 0) return products;
  const sellerIds = [...new Set(products.map(p => p.uploaded_by))];
  const { data: sellers } = await supabase
    .from('users')
    .select('id, full_name, avatar_url, is_verified, store_title')
    .in('id', sellerIds);
  const sellerMap = new Map((sellers || []).map(s => [s.id, s]));
  return products.map(p => {
    const seller = sellerMap.get(p.uploaded_by);
    return {
      ...p,
      seller_name: seller?.full_name || null,
      seller_avatar: seller?.avatar_url || null,
      seller_verified: seller?.is_verified || false,
      store_name: seller?.store_title || null,
    };
  });
}

export default function SmartCollectionsPage() {
  const { user } = useAuth();
  const { wishlistIds, toggleWishlist } = useWishlist(user?.id);
  const [collections, setCollections] = useState<Array<{ id: string; title: string; subtitle: string; icon: string; color: string; products: MarketplaceProduct[] }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const baseQuery = () => supabase
      .from('products')
      .select(`
        id, name, description, price, commission_rate, image_url, category,
        uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
        initial_stock, product_type, demo_video_url, total_reviews,
        average_rating, total_sales, view_count
      `)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved');

    const collectionsConfig: SmartCollection[] = [
      {
        id: 'trending_today', title: 'Trending Today', subtitle: 'Most viewed products right now',
        icon: 'TrendingUp', color: 'bg-red-500',
        query: async () => {
          const { data } = await baseQuery().order('view_count', { ascending: false }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
      {
        id: 'most_purchased', title: 'Most Purchased', subtitle: 'Best sellers by total sales',
        icon: 'Award', color: 'bg-amber-500',
        query: async () => {
          const { data } = await baseQuery().order('total_sales', { ascending: false }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
      {
        id: 'most_viewed', title: 'Most Viewed', subtitle: 'Products catching everyone\'s attention',
        icon: 'Eye', color: 'bg-blue-500',
        query: async () => {
          const { data } = await baseQuery().order('view_count', { ascending: false }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
      {
        id: 'best_rated', title: 'Best Rated', subtitle: 'Highest rated by buyers',
        icon: 'Star', color: 'bg-yellow-500',
        query: async () => {
          const { data } = await baseQuery().gte('average_rating', 4).order('average_rating', { ascending: false }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
      {
        id: 'recently_added', title: 'Recently Added', subtitle: 'Fresh from the market',
        icon: 'Sparkles', color: 'bg-green-500',
        query: async () => {
          const { data } = await baseQuery().order('created_at', { ascending: false }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
      {
        id: 'verified_sellers', title: 'Verified Sellers', subtitle: 'Trusted and verified',
        icon: 'BadgeCheck', color: 'bg-indigo-500',
        query: async () => {
          const { data: verifiedSellers } = await supabase
            .from('users').select('id').eq('is_verified', true);
          if (!verifiedSellers || verifiedSellers.length === 0) return [];
          const { data } = await baseQuery()
            .in('uploaded_by', verifiedSellers.map(s => s.id))
            .order('total_sales', { ascending: false }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
      {
        id: 'budget_friendly', title: 'Budget Friendly', subtitle: 'Great products under $50',
        icon: 'Wallet', color: 'bg-teal-500',
        query: async () => {
          const { data } = await baseQuery().lte('price', 50).gt('price', 0).order('price', { ascending: true }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
      {
        id: 'premium', title: 'Premium Products', subtitle: 'High-end products $100+',
        icon: 'Crown', color: 'bg-purple-500',
        query: async () => {
          const { data } = await baseQuery().gte('price', 100).order('price', { ascending: false }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
      {
        id: 'free_products', title: 'Free Products', subtitle: 'Download at no cost',
        icon: 'Gift', color: 'bg-emerald-500',
        query: async () => {
          const { data } = await baseQuery().eq('is_free', true).order('created_at', { ascending: false }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
      {
        id: 'digital_best', title: 'Digital Best', subtitle: 'Top digital downloads',
        icon: 'Package', color: 'bg-cyan-500',
        query: async () => {
          const { data } = await baseQuery().in('product_type', ['DIGITAL', 'COURSE']).order('total_sales', { ascending: false }).limit(12);
          return enrichWithSellers((data || []) as MarketplaceProduct[]);
        },
      },
    ];

    const results = await Promise.all(
      collectionsConfig.map(async c => ({
        id: c.id, title: c.title, subtitle: c.subtitle, icon: c.icon, color: c.color,
        products: await c.query(),
      }))
    );
    setCollections(results.filter(r => r.products.length > 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    TrendingUp, Award, Eye, Star, Sparkles, BadgeCheck, Wallet, Crown, Gift, Package,
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <SeoHead
        title="Smart Collections"
        description="Discover trending, best-selling, top-rated, and curated product collections on Dright."
        canonical="/collections"
        keywords={['trending products', 'best sellers', 'top rated', 'free products', 'digital products']}
      />

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Smart Collections</h1>
        <p className="text-gray-500 mt-1">Automatically curated collections that update in real time based on marketplace activity</p>
      </div>

      {loading && (
        <div className="space-y-12">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="h-6 w-48 bg-gray-100 rounded animate-pulse mb-4" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="h-40 bg-gray-100 animate-pulse" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-12">
        {collections.map(collection => {
          const Icon = iconMap[collection.icon] || Package;
          return (
            <div key={collection.id}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${collection.color} flex items-center justify-center`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{collection.title}</h2>
                    <p className="text-sm text-gray-500">{collection.subtitle}</p>
                  </div>
                </div>
                <Link to="/market" className="text-sm text-primary-600 font-medium flex items-center gap-1 hover:underline">
                  View all <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {collection.products.slice(0, 8).map((product, idx) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={idx}
                    inWishlist={wishlistIds.has(product.id)}
                    onToggleWishlist={toggleWishlist}
                    onQuickView={() => {}}
                    onShare={() => {}}
                    onCopyAffiliate={() => {}}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <NapFooter compact />
    </div>
  );
}
