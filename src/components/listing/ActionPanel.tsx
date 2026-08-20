import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Heart, Share2, Loader2, Check, ShoppingBag,
  MessageSquare, Send, Store,
} from 'lucide-react';
import { formatCurrency } from '../../lib/currency';
import { getListingConfig } from './listingTypes';

interface ActionPanelProps {
  listingType: string;
  price: number;
  isFree: boolean;
  finalPrice?: number;
  originalPrice?: number | null;
  stockQuantity?: number | null;
  quantity?: number;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onBuyNow?: () => void;
  onAddToCart?: () => void;
  onContactSeller?: () => void;
  onApply?: () => void;
  checkoutLoading?: boolean;
  isOutOfStock?: boolean;
  hasPurchased?: boolean;
  sellerId?: string;
  isOwner?: boolean;
  applied?: boolean;
  saveLabel?: string;
}

export default function ActionPanel({
  listingType, price, isFree, finalPrice, originalPrice, stockQuantity,
  quantity, onIncrement, onDecrement, onBuyNow, onAddToCart, onContactSeller,
  onApply, checkoutLoading, isOutOfStock, hasPurchased, sellerId,
  isOwner, applied,
}: ActionPanelProps) {
  const config = getListingConfig(listingType);
  const [saved, setSaved] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    const savedItems = JSON.parse(localStorage.getItem('dright_saved_listings') || '[]');
    setSaved(savedItems.includes(window.location.pathname));
  }, []);

  const handleSave = () => {
    const key = 'dright_saved_listings';
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const path = window.location.pathname;
    if (items.includes(path)) {
      const next = items.filter((p: string) => p !== path);
      localStorage.setItem(key, JSON.stringify(next));
      setSaved(false);
    } else {
      items.push(path);
      localStorage.setItem(key, JSON.stringify(items));
      setSaved(true);
    }
  };

  const handleShareCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const displayPrice = finalPrice ?? price;
  const discountPct = originalPrice && originalPrice > displayPrice && originalPrice > 0
    ? Math.round(((originalPrice - displayPrice) / originalPrice) * 100)
    : 0;
  const savings = originalPrice && originalPrice > displayPrice ? originalPrice - displayPrice : 0;

  const isJob = listingType.toUpperCase() === 'JOB';
  const isService = listingType.toUpperCase() === 'SERVICE';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm sticky top-4">
      {/* Price Section */}
      {config.hasPrice && (
        <div className="mb-4">
          {isFree ? (
            <p className="text-3xl font-bold text-success">FREE</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-baseline gap-3">
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(displayPrice)}</p>
                {originalPrice && originalPrice > displayPrice && (
                  <span className="text-lg text-gray-400 line-through">{formatCurrency(originalPrice)}</span>
                )}
              </div>
              {discountPct > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="px-2 py-0.5 rounded-full bg-error-muted text-error font-bold text-xs">
                    -{discountPct}%
                  </span>
                  <span className="text-success font-medium">Save {formatCurrency(savings)}</span>
                </div>
              )}
              {isService && (
                <p className="text-xs text-gray-400">Starting price — select a package below</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stock Status */}
      {stockQuantity !== undefined && stockQuantity !== null && !isJob && !isService && (
        <div className="mb-3 text-sm font-medium">
          {stockQuantity === 0 ? (
            <span className="text-error flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-error" />Out of Stock
            </span>
          ) : stockQuantity <= 5 ? (
            <span className="text-amber-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />Low Stock — only {stockQuantity} left
            </span>
          ) : (
            <span className="text-success flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success" />In Stock
            </span>
          )}
        </div>
      )}

      {/* Quantity Selector */}
      {config.hasQuantity && !isFree && !isOutOfStock && (
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-700">Quantity</label>
          <div className="flex items-center gap-2">
            <button
              onClick={onDecrement}
              disabled={(quantity ?? 1) <= 1}
              className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 transition-colors"
              aria-label="Decrease quantity"
            >
              <span className="text-lg">−</span>
            </button>
            <span className="w-12 text-center font-semibold text-gray-900">{quantity ?? 1}</span>
            <button
              onClick={onIncrement}
              disabled={stockQuantity !== null && (quantity ?? 1) >= (stockQuantity ?? 0)}
              className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 disabled:opacity-50 transition-colors"
              aria-label="Increase quantity"
            >
              <span className="text-lg">+</span>
            </button>
          </div>
        </div>
      )}

      {/* Primary Actions */}
      <div className="space-y-2.5">
        {isOwner ? (
          <div className="text-center py-4 bg-gray-50 rounded-xl text-sm text-gray-500 font-medium">
            This is your listing
          </div>
        ) : isJob ? (
          // Job actions
          <>
            {applied ? (
              <div className="flex items-center justify-center gap-2 py-4 bg-success-muted text-success rounded-2xl font-semibold">
                <Check className="w-5 h-5" /> Applied
              </div>
            ) : (
              <button
                onClick={onApply}
                className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 min-h-[56px] shadow-lg shadow-primary-600/20"
              >
                <Send className="w-5 h-5" />{config.primaryActionLabel}
              </button>
            )}
          </>
        ) : hasPurchased ? (
          <div className="flex items-center justify-center gap-2 py-4 bg-success-muted text-success rounded-2xl font-semibold">
            <Check className="w-5 h-5" />Purchased — Check Downloads
          </div>
        ) : (
          // Product/Digital/Service/Course actions
          <>
            {!isService && (
              <button
                onClick={onAddToCart || onBuyNow}
                disabled={checkoutLoading || isOutOfStock}
                className="w-full py-3.5 bg-white border-2 border-primary-600 text-primary-600 hover:bg-primary-50 rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[52px]"
              >
                {checkoutLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><ShoppingCart className="w-5 h-5" />Add to Cart</>}
              </button>
            )}
            <button
              onClick={onBuyNow}
              disabled={checkoutLoading || isOutOfStock}
              className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-h-[56px] shadow-lg shadow-primary-600/20"
            >
              {checkoutLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>
                {isService ? <ShoppingBag className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
                {isFree ? 'Get for Free' : `${config.primaryActionLabel} — ${formatCurrency(displayPrice)}`}
              </>}
            </button>
          </>
        )}

        {/* Secondary Actions */}
        {!isOwner && (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleSave}
              className={`py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                saved ? 'bg-primary-50 text-primary-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Heart className={`w-4 h-4 ${saved ? 'fill-primary-600' : ''}`} />
              {saved ? 'Saved' : config.saveLabel}
            </button>
            <button
              onClick={onContactSeller}
              className="py-2.5 rounded-xl text-sm font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center gap-1.5"
            >
              <MessageSquare className="w-4 h-4" />Contact
            </button>
            <button
              onClick={handleShareCopy}
              className={`py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                shareCopied ? 'bg-success-muted text-success' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {shareCopied ? <><Check className="w-4 h-4" />Copied</> : <><Share2 className="w-4 h-4" />Share</>}
            </button>
          </div>
        )}

        {/* Visit Store */}
        {sellerId && (
          <Link
            to={`/shop/${sellerId}`}
            className="w-full py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:border-primary-300 hover:text-primary-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <Store className="w-4 h-4" />Visit Store
          </Link>
        )}
      </div>
    </div>
  );
}
