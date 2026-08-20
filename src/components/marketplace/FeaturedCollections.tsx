import { useRef } from 'react';
import { motion } from 'framer-motion';
void motion;
import {
  TrendingUp, Award, Zap, Sparkles, Star, Download,
  BadgeCheck, ChevronLeft, ChevronRight, Package,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { FEATURED_COLLECTIONS } from '../../lib/marketplace';
import type { MarketplaceProduct } from './ProductCard';
import { formatCurrency } from '../../lib/currency';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp, Award, Zap, Sparkles, Star, Download, BadgeCheck,
};

interface FeaturedCollectionsProps {
  products: MarketplaceProduct[];
  onProductQuickView: (product: MarketplaceProduct) => void;
}

function CollectionRow({
  collection, products, onQuickView,
}: {
  collection: typeof FEATURED_COLLECTIONS[0];
  products: MarketplaceProduct[];
  onQuickView: (p: MarketplaceProduct) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
    const Icon = ICON_MAP[collection.icon] || Package;

  if (products.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 280;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              {collection.title}
              {collection.badge && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white ${collection.badgeColor || 'bg-primary-600'}`}>
                  {collection.badge}
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-400">{collection.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => scroll('left')} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => scroll('right')} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto scroll-smooth pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'thin' }}>
        {products.map(product => (
          <div
            key={product.id}
            className="shrink-0 w-64 bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 group cursor-pointer"
            onClick={() => onQuickView(product)}
          >
            <div className="relative h-36 bg-gray-50 overflow-hidden">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-12 h-12 text-gray-300" />
                </div>
              )}
              {product.is_free && (
                <span className="absolute top-2 left-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">FREE</span>
              )}
            </div>
            <div className="p-3">
              <Link to={`/product/${product.id}`} onClick={(e) => e.stopPropagation()}>
                <h4 className="font-medium text-gray-900 text-sm line-clamp-1 hover:text-primary-600 transition-colors">{product.name}</h4>
              </Link>
              <p className="text-xs text-gray-400 mt-0.5">{product.category}</p>
              <div className="flex items-center justify-between mt-2 gap-1">
                <span className="font-bold text-gray-900 text-sm truncate">
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
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FeaturedCollections({ products, onProductQuickView }: FeaturedCollectionsProps) {
  // Sort products into different collections
  const sortedByNewest = [...products].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const sortedBySales = [...products].sort((a, b) =>
    (b.total_sales ?? 0) - (a.total_sales ?? 0)
  );

  const sortedByRating = [...products].sort((a, b) =>
    (b.average_rating ?? 0) - (a.average_rating ?? 0)
  );

  const digitalProducts = products.filter(p =>
    p.product_type === 'DIGITAL' || p.product_type === 'COURSE'
  );

  const verifiedSellerProducts = products.filter(p => p.seller_verified);

  const collectionData: Record<string, MarketplaceProduct[]> = {
    trending: sortedBySales.slice(0, 10),
    best_sellers: sortedBySales.slice(0, 10),
    flash_deals: sortedByNewest.slice(0, 10),
    recently_added: sortedByNewest.slice(0, 10),
    top_rated: sortedByRating.slice(0, 10),
    digital_best: digitalProducts.slice(0, 10),
    verified_sellers: verifiedSellerProducts.slice(0, 10),
  };

  return (
    <div className="space-y-2">
      {FEATURED_COLLECTIONS.map(collection => (
        <CollectionRow
          key={collection.id}
          collection={collection}
          products={collectionData[collection.id] || []}
          onQuickView={onProductQuickView}
        />
      ))}
    </div>
  );
}
