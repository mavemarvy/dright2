import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal, X, MapPin, DollarSign, Star, Package,
  Download, Shield, ChevronDown, Check, Save, FolderOpen,
  RotateCcw, Eraser, Trash2, Loader2, Bookmark,
} from 'lucide-react';
import { SORT_OPTIONS } from '../../lib/marketplace';
import {
  fetchSavedConfigs,
  saveConfig,
  updateConfig,
  deleteConfig,
  type FilterState,
  type SavedFilterConfig,
} from '../../lib/filterConfigs';

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
  showResultCount?: boolean;
  userId?: string;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

export default function AdvancedFilterBar({
  filters,
  onFilterChange,
  resultCount,
  showResultCount = true,
  userId,
  searchQuery = '',
  onSearchQueryChange,
}: AdvancedFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<SavedFilterConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [configName, setConfigName] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [activeConfigId, setActiveConfigId] = useState<string>('');
  const [deletingConfig, setDeletingConfig] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const savedFilterState = useMemo<FilterState>(() => ({
    searchQuery,
    categoryFilter: filters.category,
    sortBy: filters.sortBy,
    locationFilter: filters.location,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    dateFilter: 'all',
  }), [searchQuery, filters.category, filters.sortBy, filters.location, filters.priceMin, filters.priceMax]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  const loadSavedConfigs = useCallback(async () => {
    if (!userId) {
      setSavedConfigs([]);
      return;
    }
    setLoadingConfigs(true);
    try {
      setSavedConfigs(await fetchSavedConfigs(userId));
    } catch (error) {
      console.error('Failed to load saved marketplace filters:', error);
      showToast('Could not load saved filters.');
    } finally {
      setLoadingConfigs(false);
    }
  }, [showToast, userId]);

  useEffect(() => {
    void loadSavedConfigs();
  }, [loadSavedConfigs]);

  useEffect(() => {
    if (!activeConfigId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      void updateConfig(activeConfigId, savedFilterState).catch(error => {
        console.error('Failed to auto-save marketplace filter:', error);
      });
    }, 1000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [activeConfigId, savedFilterState]);

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
    onSearchQueryChange?.('');
    onFilterChange({ ...DEFAULT_FILTER_STATE, sortBy: filters.sortBy || 'recommended' });
    setActiveConfigId('');
    showToast('Filters cleared.');
  };

  const resetAll = () => {
    onSearchQueryChange?.('');
    onFilterChange({ ...DEFAULT_FILTER_STATE, sortBy: 'recommended' });
    setActiveConfigId('');
    showToast('Filters reset to marketplace defaults.');
  };

  const handleSaveConfig = async () => {
    if (!userId || !configName.trim()) return;
    setSavingConfig(true);
    try {
      const saved = await saveConfig(userId, configName.trim(), savedFilterState);
      setSavedConfigs(prev => [saved, ...prev]);
      setActiveConfigId(saved.id);
      setConfigName('');
      setShowSaveModal(false);
      showToast(`Saved "${saved.name}".`);
    } catch (error) {
      console.error('Failed to save marketplace filter:', error);
      showToast('Could not save this filter.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleLoadConfig = (configId: string) => {
    const config = savedConfigs.find(item => item.id === configId);
    if (!config) return;

    onSearchQueryChange?.(config.searchQuery);
    onFilterChange({
      ...DEFAULT_FILTER_STATE,
      category: config.categoryFilter || 'All',
      sortBy: config.sortBy || 'recommended',
      location: config.locationFilter || '',
      priceMin: config.priceMin || '',
      priceMax: config.priceMax || '',
    });
    setActiveConfigId(config.id);
    showToast(`Loaded "${config.name}".`);
  };

  const handleDeleteActiveConfig = async () => {
    if (!activeConfigId || deletingConfig) return;
    const config = savedConfigs.find(item => item.id === activeConfigId);
    setDeletingConfig(true);
    try {
      await deleteConfig(activeConfigId);
      setSavedConfigs(prev => prev.filter(item => item.id !== activeConfigId));
      setActiveConfigId('');
      showToast(config ? `Deleted "${config.name}".` : 'Saved filter deleted.');
    } catch (error) {
      console.error('Failed to delete marketplace filter:', error);
      showToast('Could not delete this saved filter.');
    } finally {
      setDeletingConfig(false);
    }
  };

  const sortLabel = SORT_OPTIONS.find(o => o.value === filters.sortBy)?.label ?? 'Sort';

  return (
    <div className="sticky top-[56px] md:top-0 z-30 bg-white/95 backdrop-blur border border-gray-100 rounded-2xl shadow-sm">
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
        {showResultCount && (
          <span className="text-sm text-gray-400 ml-auto shrink-0 px-2">
            {resultCount} result{resultCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Saved filter controls merged into this filter bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 overflow-x-auto">
        {userId && (
          <>
            <button
              type="button"
              onClick={() => setShowSaveModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium shrink-0 transition-colors"
            >
              <Save className="w-4 h-4" /> Save As
            </button>

            <div className="relative shrink-0">
              <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={activeConfigId}
                onChange={event => handleLoadConfig(event.target.value)}
                disabled={loadingConfigs}
                className="appearance-none pl-9 pr-8 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium outline-none disabled:opacity-50"
                aria-label="Load saved filter"
              >
                <option value="">{loadingConfigs ? 'Loading…' : 'Load'}</option>
                {savedConfigs.map(config => (
                  <option key={config.id} value={config.id}>{config.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {activeConfigId && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-primary-50 text-primary-700 text-xs font-medium shrink-0">
                <Bookmark className="w-3.5 h-3.5" />
                <span className="max-w-[130px] truncate">
                  {savedConfigs.find(item => item.id === activeConfigId)?.name || 'Saved filter'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDeleteActiveConfig()}
                  disabled={deletingConfig}
                  className="p-0.5 text-primary-400 hover:text-error disabled:opacity-50"
                  aria-label="Delete active saved filter"
                >
                  {deletingConfig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium shrink-0 transition-colors"
        >
          <Eraser className="w-4 h-4" /> Clear
        </button>
        <button
          type="button"
          onClick={resetAll}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 text-sm font-medium shrink-0 transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
      </div>

      {toast && (
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-600" role="status">
          {toast}
        </div>
      )}

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

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/45 flex items-center justify-center p-4"
            onClick={() => setShowSaveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Save className="w-5 h-5 text-primary-600" /> Save Filter
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Close save filter"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                type="text"
                value={configName}
                onChange={event => setConfigName(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') void handleSaveConfig();
                }}
                placeholder="e.g. Verified digital products"
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveConfig()}
                  disabled={!configName.trim() || savingConfig}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
