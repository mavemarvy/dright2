import { useState, useEffect } from 'react';
import {
  ShoppingCart, Heart, Share2, Check, Loader2, ShoppingBag, Send,
} from 'lucide-react';
import { formatCurrency } from '../../lib/currency';
import { getListingConfig } from './listingTypes';

interface MobileActionBarProps {
  listingType: string;
  price: number;
  isFree: boolean;
  finalPrice?: number;
  onBuyNow?: () => void;
  onShare?: () => void;
  checkoutLoading?: boolean;
  isOutOfStock?: boolean;
  isOwner?: boolean;
  applied?: boolean;
  onApply?: () => void;
}

export default function MobileActionBar({
  listingType, price, isFree, finalPrice, onBuyNow, onShare,
  checkoutLoading, isOutOfStock, isOwner, applied, onApply,
}: MobileActionBarProps) {
  const config = getListingConfig(listingType);
  const [saved, setSaved] = useState(false);
  const isJob = listingType.toUpperCase() === 'JOB';
  const displayPrice = finalPrice ?? price;

  useEffect(() => {
    const savedItems = JSON.parse(localStorage.getItem('dright_saved_listings') || '[]');
    setSaved(savedItems.includes(window.location.pathname));
  }, []);

  const handleSave = () => {
    const key = 'dright_saved_listings';
    const items = JSON.parse(localStorage.getItem(key) || '[]');
    const path = window.location.pathname;
    if (items.includes(path)) {
      localStorage.setItem(key, JSON.stringify(items.filter((p: string) => p !== path)));
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
    } catch { /* ignore */ }
    onShare?.();
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-lg">
      <div className="flex items-center gap-2 p-3">
        {/* Price */}
        <div className="shrink-0 min-w-0 flex-1">
          {isFree ? (
            <p className="text-lg font-bold text-success">FREE</p>
          ) : (
            <p className="text-lg font-bold text-gray-900 truncate">{formatCurrency(displayPrice)}</p>
          )}
        </div>

        {/* Save button */}
        {!isOwner && (
          <button
            onClick={handleSave}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
              saved ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-600'
            }`}
            aria-label="Save listing"
          >
            <Heart className={`w-5 h-5 ${saved ? 'fill-primary-600' : ''}`} />
          </button>
        )}

        {/* Share button */}
        {!isOwner && (
          <button
            onClick={handleShareCopy}
            className="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center transition-colors shrink-0"
            aria-label="Share listing"
          >
            <Share2 className="w-5 h-5" />
          </button>
        )}

        {/* Primary CTA */}
        {!isOwner && (
          isJob ? (
            applied ? (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-success-muted text-success rounded-xl font-semibold text-sm shrink-0">
                <Check className="w-4 h-4" />Applied
              </div>
            ) : (
              <button
                onClick={onApply}
                className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm flex items-center gap-1.5 shrink-0"
              >
                <Send className="w-4 h-4" />Apply
              </button>
            )
          ) : (
            <button
              onClick={onBuyNow}
              disabled={checkoutLoading || isOutOfStock}
              className="px-5 py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm flex items-center gap-1.5 shrink-0 disabled:opacity-50 min-h-[40px]"
            >
              {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>
                {isFree ? <ShoppingBag className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                {isFree ? 'Get Free' : config.primaryActionLabel}
              </>}
            </button>
          )
        )}

        {isOwner && (
          <div className="px-4 py-2.5 bg-gray-100 text-gray-500 rounded-xl font-medium text-sm">
            Your listing
          </div>
        )}
      </div>
    </div>
  );
}
