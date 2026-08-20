import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Star, Heart, Share2, ShoppingBag, MessageSquare, BadgeCheck,
  Package, Download,
} from 'lucide-react';
import type { MarketplaceProduct } from './ProductCard';
import { formatCurrency } from '../../lib/currency';

interface QuickViewModalProps {
  product: MarketplaceProduct | null;
  onClose: () => void;
  inWishlist: boolean;
  onToggleWishlist: (productId: string) => void;
  onShare: (product: MarketplaceProduct) => void;
  relatedProducts?: MarketplaceProduct[];
}

export default function QuickViewModal({
  product, onClose, inWishlist, onToggleWishlist, onShare, relatedProducts,
}: QuickViewModalProps) {
    const [activeImg, setActiveImg] = useState(0);

  const images = product
    ? [product.image_url, ...(product.images || [])].filter(Boolean) as string[]
    : [];

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden my-auto"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/90 backdrop-blur text-gray-600 hover:bg-white hover:text-gray-900 transition-colors z-10 shadow-md"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="grid md:grid-cols-2 max-h-[85vh] overflow-y-auto">
              {/* Image gallery */}
              <div className="p-4 md:p-6 bg-gray-50">
                <div className="aspect-square rounded-2xl bg-white overflow-hidden border border-gray-100">
                  {images[activeImg] ? (
                    <img src={images[activeImg]} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-16 h-16 text-gray-300" />
                    </div>
                  )}
                </div>
                {images.length > 1 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImg(idx)}
                        className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${
                          activeImg === idx ? 'border-primary-600' : 'border-gray-200'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Product details */}
              <div className="p-4 md:p-6 flex flex-col">
                {/* Seller */}
                <div className="flex items-center gap-2 mb-3">
                  {product.seller_avatar ? (
                    <img src={product.seller_avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary-700">
                        {(product.seller_name || 'S')[0]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1">
                      {product.seller_name || 'Seller'}
                      {product.seller_verified && <BadgeCheck className="w-4 h-4 text-blue-500" />}
                    </p>
                    {product.store_name && (
                      <Link to={`/shop/${product.uploaded_by}`} className="text-xs text-primary-600 hover:underline">
                        {product.store_name}
                      </Link>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-gray-900 leading-tight mb-2">{product.name}</h2>

                {/* Rating */}
                {(product.average_rating ?? 0) > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(n => (
                        <Star
                          key={n}
                          className={`w-4 h-4 ${n <= Math.round(product.average_rating || 0) ? 'fill-warning text-warning' : 'text-gray-200'}`}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{Number(product.average_rating).toFixed(1)}</span>
                    <span className="text-sm text-gray-400">({product.total_reviews || 0} reviews)</span>
                  </div>
                )}

                {/* Price */}
                <div className="flex items-baseline gap-3 mb-4">
                  {product.is_free ? (
                    <span className="text-2xl font-bold text-success">FREE</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-gray-900">{formatCurrency(product.price)}</span>
                      {product.old_price && product.old_price > product.price && (
                        <span className="text-base text-gray-400 line-through">{formatCurrency(product.old_price)}</span>
                      )}
                    </>
                  )}
                </div>

                {/* Stock */}
                {product.stock_quantity !== null && product.stock_quantity !== undefined && (
                  <p className={`text-sm mb-3 ${product.stock_quantity > 0 ? 'text-success' : 'text-error'}`}>
                    {product.stock_quantity > 0
                      ? `In stock: ${product.stock_quantity} available`
                      : 'Out of stock'}
                  </p>
                )}

                {/* Description */}
                {product.description && (
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-4 mb-4">
                    {product.description}
                  </p>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{product.category}</span>
                  {product.product_type && product.product_type !== 'PHYSICAL' && (
                    <span className="text-xs bg-primary-50 text-primary-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                      {product.product_type === 'DIGITAL' && <Download className="w-3 h-3" />}
                      {product.product_type}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-auto">
                  <Link
                    to={`/product/${product.id}`}
                    className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-center transition-colors flex items-center justify-center gap-2"
                  >
                    <ShoppingBag className="w-4 h-4" /> Buy Now
                  </Link>
                  <Link
                    to="/chat"
                    className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-colors"
                    title="Chat seller"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </Link>
                  <button
                    onClick={() => onToggleWishlist(product.id)}
                    className={`p-3 rounded-xl transition-colors ${
                      inWishlist ? 'bg-red-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    }`}
                    title="Wishlist"
                  >
                    <Heart className={`w-5 h-5 ${inWishlist ? 'fill-white' : ''}`} />
                  </button>
                  <button
                    onClick={() => onShare(product)}
                    className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-colors"
                    title="Share"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>

                {/* Related products */}
                {relatedProducts && relatedProducts.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Related Products</p>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {relatedProducts.slice(0, 4).map(rp => (
                        <Link
                          key={rp.id}
                          to={`/product/${rp.id}`}
                          onClick={onClose}
                          className="shrink-0 w-28"
                        >
                          <div className="w-28 h-28 rounded-xl bg-gray-50 overflow-hidden border border-gray-100">
                            {rp.image_url ? (
                              <img src={rp.image_url} alt={rp.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-6 h-6 text-gray-300" />
                              </div>
                            )}
                          </div>
                          <p className="text-xs font-medium text-gray-700 mt-1.5 line-clamp-2">{rp.name}</p>
                          <p className="text-xs font-bold text-gray-900">
                            {rp.is_free ? 'FREE' : formatCurrency(rp.price)}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
