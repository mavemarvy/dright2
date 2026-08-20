import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Heart, Share2, Eye, Star, Download,
  Zap, Package, Copy, Check, MessageSquare, ShoppingBag,
  BadgeCheck, Clock, Briefcase, Images,
  Sparkles,
} from 'lucide-react';
import { getProductBadges, type ProductBadge } from '../../lib/marketplace';
import { ProfileLink } from '../Social';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/currency';

export interface MarketplaceProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  commission_rate: number;
  image_url: string | null;
  images?: string[] | null;
  category: string;
  uploaded_by: string;
  created_at: string;
  sales_team_tier?: string | null;
  is_free?: boolean;
  stock_quantity?: number | null;
  initial_stock?: number | null;
  product_type?: string;
  demo_video_url?: string | null;
  seller_name?: string | null;
  seller_avatar?: string | null;
  seller_verified?: boolean;
  store_name?: string | null;
  total_reviews?: number;
  average_rating?: number;
  total_sales?: number;
  view_count?: number;
  discount_percent?: number;
  old_price?: number | null;
  is_featured?: boolean;
  is_sponsored?: boolean;
}

interface ProductCardProps {
  product: MarketplaceProduct;
  index: number;
  inWishlist: boolean;
  onToggleWishlist: (productId: string) => void;
  onQuickView: (product: MarketplaceProduct) => void;
  onShare: (product: MarketplaceProduct) => void;
  onCopyAffiliate: (product: MarketplaceProduct) => void;
  copiedId?: string | null;
  affiliateCode?: string | null;
  variant?: 'default' | 'compact';
}

const BADGE_STYLES: Record<string, string> = {
  'bg-red-500': 'bg-red-500 text-white',
  'bg-amber-500': 'bg-amber-500 text-white',
  'bg-orange-500': 'bg-orange-500 text-white',
  'bg-green-500': 'bg-green-500 text-white',
  'bg-emerald-500': 'bg-emerald-500 text-white',
  'bg-blue-500': 'bg-blue-500 text-white',
  'bg-purple-500': 'bg-purple-500 text-white',
  'bg-indigo-500': 'bg-indigo-500 text-white',
  'bg-teal-500': 'bg-teal-500 text-white',
  'bg-rose-500': 'bg-rose-500 text-white',
  'bg-yellow-500': 'bg-yellow-500 text-black',
  'bg-amber-600': 'bg-amber-600 text-white',
};

function isServiceCategory(category: string): boolean {
  const cat = category?.toLowerCase() ?? '';
  return cat.includes('service') || cat.includes('freelanc');
}

function isJobCategory(category: string, productType?: string): boolean {
  const cat = category?.toLowerCase() ?? '';
  return cat.includes('job') || productType === 'job';
}

function StockBadge({ stock }: { stock: number | null | undefined }) {
  if (stock === null || stock === undefined) return null;
  if (stock <= 0) return <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">Out of stock</span>;
  if (stock <= 5) return <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Only {stock} left</span>;
  return null;
}

export default function ProductCard({
  product, index, inWishlist, onToggleWishlist, onQuickView, onShare,
  onCopyAffiliate, copiedId, affiliateCode, variant = 'default',
}: ProductCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const isJob = isJobCategory(product.category, product.product_type);
  const isService = isServiceCategory(product.category);
  const imageCount = product.images?.length ?? 0;

  const badges = getProductBadges({
    product_type: product.product_type,
    is_free: product.is_free,
    stock_quantity: product.stock_quantity,
    total_sales: product.total_sales,
    average_rating: product.average_rating,
    created_at: product.created_at,
    is_verified_seller: product.seller_verified,
    is_featured: product.is_featured,
    is_sponsored: product.is_sponsored,
  });

  const commission = product.is_free ? 0 : (product.price * product.commission_rate) / 100;
  const discountPercent = product.discount_percent ?? (product.old_price && product.old_price > product.price
    ? Math.round(((product.old_price - product.price) / product.old_price) * 100)
    : 0);

  const handleImgError = useCallback(() => setImgLoaded(true), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-xl hover:border-gray-200 dark:hover:border-gray-600 card-hover transition-all duration-300 group flex flex-col"
    >
      {/* Image area */}
      <div className="relative h-48 bg-gray-50 dark:bg-gray-700 overflow-hidden">
        <Link to={`/product/${product.id}`}>
          {!imgLoaded && (
            <div className="absolute inset-0 skeleton" />
          )}
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={handleImgError}
              className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" onLoad={() => setImgLoaded(true)}>
              {isJob ? <Briefcase className="w-14 h-14 text-gray-300 dark:text-gray-500" /> : <Package className="w-14 h-14 text-gray-300 dark:text-gray-500" />}
            </div>
          )}
        </Link>

        {/* Badges top-left */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
          {badges.slice(0, 2).map((badge: ProductBadge, i: number) => (
            <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm ${BADGE_STYLES[badge.color] || badge.color}`}>
              {badge.label}
            </span>
          ))}
        </div>

        {/* Discount badge top-right */}
        {discountPercent > 0 && (
          <div className="absolute top-2.5 right-2.5 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm flex items-center gap-0.5">
            <Zap className="w-3 h-3" /> {discountPercent}% OFF
          </div>
        )}

        {/* Multi-image indicator */}
        {imageCount > 1 && (
          <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur text-white text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1">
            <Images className="w-3 h-3" /> {imageCount}
          </div>
        )}

        {/* Sponsored label */}
        {product.is_sponsored && !discountPercent && imageCount <= 1 && (
          <div className="absolute top-2.5 right-2.5 bg-gray-900/70 backdrop-blur text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-0.5">
            <Sparkles className="w-2.5 h-2.5" /> Sponsored
          </div>
        )}

        {/* Wishlist button */}
        <button
          onClick={(e) => { e.preventDefault(); onToggleWishlist(product.id); }}
          className={`absolute bottom-2.5 right-2.5 p-2.5 rounded-full backdrop-blur transition-all shadow-sm min-h-[40px] min-w-[40px] flex items-center justify-center ${
            inWishlist ? 'bg-red-500 text-white' : 'bg-white/80 text-gray-600 hover:bg-white hover:text-red-500'
          }`}
          aria-label={inWishlist ? 'Remove from saved' : 'Save item'}
        >
          <Heart className={`w-4 h-4 ${inWishlist ? 'fill-white' : ''}`} />
        </button>

        {/* Video indicator */}
        {product.demo_video_url && (
          <div className="absolute bottom-2.5 left-2.5 bg-black/60 backdrop-blur text-white text-[10px] font-medium px-2 py-1 rounded-full flex items-center gap-1">
            <Download className="w-3 h-3" /> Video
          </div>
        )}

        {/* Quick view on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => { e.preventDefault(); onQuickView(product); }}
            className="px-4 py-2 bg-white/95 backdrop-blur rounded-xl text-sm font-semibold text-gray-900 shadow-lg hover:bg-white transition-colors flex items-center gap-2"
          >
            <Eye className="w-4 h-4" /> Quick View
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        {/* Seller info */}
        <div className="flex items-center gap-2 mb-2.5">
          <ProfileLink
            userId={product.uploaded_by}
            username={product.seller_name || undefined}
            displayName={product.seller_name || undefined}
            avatar={product.seller_avatar}
            size="sm"
            showName={true}
            showBadge={true}
            verified={product.seller_verified}
            className="flex-1 min-w-0"
          />
          {product.seller_verified && (
            <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" aria-label="Verified seller" />
          )}
          <ProductCardFollowButton sellerId={product.uploaded_by} />
        </div>

        {/* Title */}
        <Link to={`/product/${product.id}`}>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight line-clamp-2 mb-1 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Description preview (compact) */}
        {variant === 'default' && product.description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-1 mb-2">{product.description}</p>
        )}

        {/* Category + meta row */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">{product.category}</span>
          {isService && (
            <span className="text-[10px] text-purple-600 bg-purple-50 rounded-full px-2 py-0.5 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" /> Service
            </span>
          )}
          {isJob && (
            <span className="text-[10px] text-orange-600 bg-orange-50 rounded-full px-2 py-0.5 flex items-center gap-0.5">
              <Briefcase className="w-2.5 h-2.5" /> Job
            </span>
          )}
          <StockBadge stock={product.stock_quantity} />
        </div>

        {/* Rating */}
        {(product.average_rating ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{Number(product.average_rating).toFixed(1)}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">({product.total_reviews || 0} reviews)</span>
            {(product.total_sales ?? 0) > 0 && (
              <span className="text-xs text-gray-400 ml-1">· {product.total_sales} sold</span>
            )}
          </div>
        )}

        {/* Price */}
        <div className="flex items-baseline gap-2 mb-2 mt-auto">
          {product.is_free ? (
            <span className="text-lg font-bold text-emerald-600">FREE</span>
          ) : isJob ? (
            <div className="flex flex-col">
              <span className="text-xs text-gray-400">Salary</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(product.price)}</span>
            </div>
          ) : isService ? (
            <div className="flex flex-col">
              <span className="text-xs text-gray-400 dark:text-gray-500">Starting at</span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(product.price)}</span>
            </div>
          ) : (
            <>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(product.price)}</span>
              {product.old_price && product.old_price > product.price && (
                <span className="text-sm text-gray-400 dark:text-gray-500 line-through">{formatCurrency(product.old_price)}</span>
              )}
            </>
          )}
        </div>

        {/* Commission */}
        {!product.is_free && commission > 0 && (
          <p className="text-xs text-emerald-600 font-medium mb-2.5">
            Earn {formatCurrency(commission)} commission
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Link
            to={`/product/${product.id}`}
            className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold text-center transition-colors flex items-center justify-center gap-1.5"
          >
            {isJob ? (
              <><Briefcase className="w-4 h-4" /> Apply</>
            ) : isService ? (
              <><ShoppingBag className="w-4 h-4" /> Hire</>
            ) : (
              <><ShoppingBag className="w-4 h-4" /> Buy</>
            )}
          </Link>
          <Link
            to="/chat"
            className="p-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Chat with seller"
          >
            <MessageSquare className="w-4 h-4" />
          </Link>
          <button
            onClick={() => onShare(product)}
            className="p-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {affiliateCode && (
            <button
              onClick={() => onCopyAffiliate(product)}
              className={`p-2.5 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
                copiedId === product.id
                  ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
              }`}
              aria-label="Copy affiliate link"
            >
              {copiedId === product.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ProductCardFollowButton({ sellerId }: { sellerId: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', sellerId)
      .then(({ count: c }) => setCount(c ?? 0));
  }, [sellerId]);
  if (!count) return null;
  return <span className="text-[10px] text-gray-400 shrink-0">{count}f</span>;
}
