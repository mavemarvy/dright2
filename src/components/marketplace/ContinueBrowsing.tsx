import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, X, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useRecentlyViewed } from '../../lib/marketplaceHooks';
import { getRecentlyViewedIds, clearRecentlyViewed } from '../../lib/marketplace';
import type { MarketplaceProduct } from './ProductCard';
import { formatCurrency } from '../../lib/currency';

const PRODUCT_SELECT = `
  id, name, description, price, commission_rate, image_url, category,
  uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
  initial_stock, product_type, demo_video_url, total_reviews,
  average_rating, total_sales, view_count, is_featured, is_sponsored
`;

export default function ContinueBrowsing() {
  const { user } = useAuth();
  const { recentlyViewed } = useRecentlyViewed(user?.id);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const ids = recentlyViewed.length > 0 ? recentlyViewed : getRecentlyViewedIds();
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .in('id', ids.slice(0, 10))
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved');
      const map = new Map((data || []).map(p => [p.id, p as MarketplaceProduct]));
      setProducts(ids.map(id => map.get(id)).filter((p): p is MarketplaceProduct => p !== undefined));
      setLoading(false);
    })();
  }, [recentlyViewed]);

  const handleClear = () => {
    clearRecentlyViewed();
    setProducts([]);
  };

  if (loading || products.length === 0) return null;

  return (
    <section aria-label="Continue browsing">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-gray-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Continue Browsing</h2>
        </div>
        <button
          onClick={handleClear}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-error transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {products.map((product, idx) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.05, 0.3) }}
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
                <span className="text-sm font-bold text-gray-900 mt-1.5 block">
                  {product.is_free ? 'FREE' : formatCurrency(product.price)}
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
