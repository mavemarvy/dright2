import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal, X, MapPin, DollarSign, Star, Package,
  Download, Shield, ChevronDown, Check,
} from 'lucide-react';
import { SORT_OPTIONS } from '../../lib/marketplace';

export interface AdvancedFilterState {
  category: string;
  subcategory: string;
  location: string;
  priceMin: string;
  priceMax: string;
  condition: string;
  productType: string;
  delivery: string;
  verifiedSeller: boolean;
  minRating: number;
  availability: string;
  sortBy: string;
  hasDiscount: boolean;
  freeDelivery: boolean;
}

export const DEFAULT_FILTER_STATE: AdvancedFilterState = {
  category: 'All',
  subcategory: '',
  location: '',
  priceMin: '',
  priceMax: '',
  condition: '',
  productType: '',
  delivery: '',
  verifiedSeller: false,
  minRating: 0,
  availability: '',
  sortBy: 'newest',
  hasDiscount: false,
  freeDelivery: false,
};

const PRODUCT_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'PHYSICAL', label: 'Physical' },
  { value: 'DIGITAL', label: 'Digital' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'COURSE', label: 'Course' },
];

const AVAILABILITY_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'limited', label: 'Limited Stock' },
];

const DELIVERY_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'free', label: 'Free Delivery' },
  { value: 'paid', label: 'Paid Delivery' },
  { value: 'instant', label: 'Instant Download' },
];

const RATING_OPTIONS = [0, 3, 3.5, 4, 4.5];

interface AdvancedFilterBarProps {
  filters: AdvancedFilterState;
  onFilterChange: (filters: AdvancedFilterState) => void;
  resultCount: number;
}

export default function AdvancedFilterBar({ filters, onFilterChange, resultCount }: AdvancedFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const activeFilterCount = [
    filters.category !== 'All',
    filters.subcategory,
    filters.location,
    filters.priceMin,
    filters.priceMax,
    filters.condition,
    filters.productType,
    filters.delivery,
    filters.verifiedSeller,
    filters.minRating > 0,
    filters.availability,
    filters.hasDiscount,
    filters.freeDelivery,
  ].filter(Boolean).length;

  const update = (partial: Partial<AdvancedFilterState>) => {
    onFilterChange({ ...filters, ...partial });
  };

  const clearAll = () => {
    onFilterChange({ ...DEFAULT_FILTER_STATE, sortBy: filters.sortBy });
  };

  const sortLabel = SORT_OPTIONS.find(o => o.value === filters.sortBy)?.label ?? 'Sort';

  return (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border border-gray-100 rounded-2xl shadow-sm">
      {/* Main bar */}
      <div className="flex items-center gap-2 p-3 overflow-x-auto">
        {/* Filter toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors shrink-0 ${
            activeFilterCount > 0 || expanded
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-white text-primary-600 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sort dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium transition-colors"
          >
            <span className="hidden sm:inline">{sortLabel}</span>
            <span className="sm:hidden">Sort</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {showSortMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute top-full mt-1 right-0 w-52 bg-white rounded-xl shadow-lg border border-gray-100 z-40 overflow-hidden max-h-80 overflow-y-auto"
              >
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { update({ sortBy: opt.value }); setShowSortMenu(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-primary-50 transition-colors flex items-center justify-between ${
                      filters.sortBy === opt.value ? 'text-primary-600 font-semibold bg-primary-50' : 'text-gray-700'
                    }`}
                  >
                    {opt.label}
                    {filters.sortBy === opt.value && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Quick toggles */}
        <button
          onClick={() => update({ verifiedSeller: !filters.verifiedSeller })}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0 ${
            filters.verifiedSeller ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Shield className="w-4 h-4" /> Verified
        </button>

        <button
          onClick={() => update({ productType: filters.productType === 'DIGITAL' ? '' : 'DIGITAL' })}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0 ${
            filters.productType === 'DIGITAL' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Download className="w-4 h-4" /> Digital
        </button>

        <button
          onClick={() => update({ productType: filters.productType === 'PHYSICAL' ? '' : 'PHYSICAL' })}
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors shrink-0 ${
            filters.productType === 'PHYSICAL' ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Package className="w-4 h-4" /> Physical
        </button>

        {/* Result count */}
        <span className="text-sm text-gray-400 ml-auto shrink-0 px-2">
          {resultCount} result{resultCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Expanded filters */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100"
          >
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Location */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Location
                </label>
                <input
                  type="text"
                  value={filters.location}
                  onChange={e => update({ location: e.target.value })}
                  placeholder="City or state..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                />
              </div>

              {/* Price range */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" /> Price Range
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={filters.priceMin}
                    onChange={e => update({ priceMin: e.target.value })}
                    placeholder="Min"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="number"
                    value={filters.priceMax}
                    onChange={e => update({ priceMax: e.target.value })}
                    placeholder="Max"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Product type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Type</label>
                <select
                  value={filters.productType}
                  onChange={e => update({ productType: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 outline-none bg-white transition-all"
                >
                  {PRODUCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Availability */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Availability</label>
                <select
                  value={filters.availability}
                  onChange={e => update({ availability: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 outline-none bg-white transition-all"
                >
                  {AVAILABILITY_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>

              {/* Delivery */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Delivery</label>
                <select
                  value={filters.delivery}
                  onChange={e => update({ delivery: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary-500 outline-none bg-white transition-all"
                >
                  {DELIVERY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>

              {/* Min rating */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5" /> Min Rating
                </label>
                <div className="flex items-center gap-1.5">
                  {RATING_OPTIONS.map(r => (
                    <button
                      key={r}
                      onClick={() => update({ minRating: r })}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        filters.minRating === r
                          ? 'bg-warning text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {r === 0 ? 'Any' : `${r}+`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Options</label>
                <button
                  onClick={() => update({ hasDiscount: !filters.hasDiscount })}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    filters.hasDiscount ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${filters.hasDiscount ? 'bg-red-500 border-red-500' : 'border-gray-300'}`}>
                    {filters.hasDiscount && <Check className="w-3 h-3 text-white" />}
                  </div>
                  On Sale
                </button>
                <button
                  onClick={() => update({ freeDelivery: !filters.freeDelivery })}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    filters.freeDelivery ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${filters.freeDelivery ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                    {filters.freeDelivery && <Check className="w-3 h-3 text-white" />}
                  </div>
                  Free Delivery
                </button>
              </div>

              {/* Clear */}
              {activeFilterCount > 0 && (
                <div className="flex items-end">
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-error bg-error-muted hover:bg-red-100 transition-colors"
                  >
                    <X className="w-4 h-4" /> Clear All ({activeFilterCount})
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
