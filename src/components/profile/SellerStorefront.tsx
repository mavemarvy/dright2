import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Package, Star, Download, Sparkles, Video, ShoppingBag,
  ChevronDown,
} from 'lucide-react';
import type { ProfileProduct, SortOption } from './profileTypes';
import { formatCurrency } from '../../lib/currency';

interface SellerStorefrontProps {
  products: ProfileProduct[];
  storeTitle: string | null;
  storeDescription: string | null;
  storeBannerUrl: string | null;
  averageRating: number;
  totalReviews: number;
  totalSales: number;
  responseTimeHours: number;
  sellerName: string | null;
}

export function SellerStorefront({
  products, storeTitle, storeDescription, storeBannerUrl,
  averageRating, totalReviews, totalSales, responseTimeHours, sellerName,
}: SellerStorefrontProps) {
  const [sort, setSort] = useState<SortOption>('newest');
  const [showAll, setShowAll] = useState(false);

  const sortedProducts = [...products].sort((a, b) => {
    switch (sort) {
      case 'price_low':
        return (a.is_free ? 0 : a.price) - (b.is_free ? 0 : b.price);
      case 'price_high':
        return (b.is_free ? 0 : b.price) - (a.is_free ? 0 : a.price);
      case 'rating':
        return (b.average_rating || 0) - (a.average_rating || 0);
      case 'best_match':
        return (b.average_rating || 0) * (b.total_reviews || 0) - (a.average_rating || 0) * (a.total_reviews || 0);
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const visibleProducts = showAll ? sortedProducts : sortedProducts.slice(0, 8);
  const storeName = storeTitle || `${sellerName || 'Seller'}'s Store`;

  return (
    <div className="space-y-6">
      {/* Store Stats Banner */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {storeBannerUrl && (
          <div className="h-24 sm:h-32 relative overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-500">
            <img src={storeBannerUrl} alt={storeName} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <ShoppingBag className="w-5 h-5 text-indigo-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{storeName}</h3>
          </div>
          {storeDescription && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">{storeDescription}</p>
          )}

          {/* Store Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StoreMetric
              label="Rating"
              value={averageRating > 0 ? averageRating.toFixed(1) : 'New'}
              icon={Star}
              color="text-amber-500"
            />
            <StoreMetric
              label="Reviews"
              value={totalReviews.toLocaleString()}
              icon={Star}
              color="text-blue-500"
            />
            <StoreMetric
              label="Total Sales"
              value={totalSales.toLocaleString()}
              icon={ShoppingBag}
              color="text-green-500"
            />
            <StoreMetric
              label="Response Time"
              value={responseTimeHours > 0 ? (responseTimeHours < 1 ? '<1h' : responseTimeHours < 24 ? `${Math.round(responseTimeHours)}h` : `${Math.round(responseTimeHours / 24)}d`) : '—'}
              icon={Sparkles}
              color="text-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Sort Bar */}
      {products.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:inline">Sort by</span>
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 outline-none cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="rating">Top Rated</option>
                <option value="best_match">Best Match</option>
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-3">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400">No products listed yet</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {visibleProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.3) }}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow group flex flex-col"
              >
                <Link to={`/product/${product.id}`} className="block relative aspect-square bg-gray-50 dark:bg-gray-800 overflow-hidden">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                  {/* Type badge */}
                  {product.product_type && product.product_type !== 'PHYSICAL' && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-indigo-600/90 backdrop-blur text-xs font-semibold text-white px-2 py-0.5 rounded-full">
                      {product.product_type === 'DIGITAL' && <Download className="w-3 h-3" />}
                      {product.product_type === 'SERVICE' && <Sparkles className="w-3 h-3" />}
                      {product.product_type === 'COURSE' && <Video className="w-3 h-3" />}
                      {product.product_type}
                    </span>
                  )}
                  {product.is_free && (
                    <span className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">FREE</span>
                  )}
                </Link>
                <div className="p-3 flex flex-col flex-1">
                  <Link to={`/product/${product.id}`}>
                    <h4 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2 hover:text-indigo-500 transition-colors">
                      {product.name}
                    </h4>
                  </Link>
                  <div className="flex items-center justify-between mt-auto pt-2">
                    {product.is_free ? (
                      <span className="text-base font-bold text-green-500">Free</span>
                    ) : (
                      <span className="text-base font-bold text-gray-900 dark:text-white">
                        {formatCurrency(Number(product.price))}
                      </span>
                    )}
                    {product.total_reviews && product.total_reviews > 0 ? (
                      <span className="flex items-center gap-0.5 text-xs text-gray-500">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {Number(product.average_rating || 0).toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Show More */}
          {products.length > 8 && !showAll && (
            <div className="flex justify-center">
              <button
                onClick={() => setShowAll(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Show all {products.length} products <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StoreMetric({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Star; color: string }) {
  return (
    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
      <Icon className={`w-4 h-4 ${color} shrink-0`} />
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}
