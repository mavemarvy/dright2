import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Store, Loader2, ShieldAlert,
  Users, Shield, AlertCircle, Check,
  LayoutGrid, List,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { trackListingEvent } from '../lib/marketplaceAnalytics';
import { trackProductView } from '../lib/analyticsService';
import { generateAffiliateLink, copyToClipboard } from '../lib/affiliate';
import {
  fetchSystemConfig, calculateSubscriptionTotal, getExpiryDate,
  getTaskPercentForTier, ALL_TIERS, DURATIONS,
  type SalesTeamTier, type Duration, type SystemConfig,
} from '../lib/pricing';
import { useWishlist, useRecentlyViewed } from '../lib/marketplaceHooks';
import {
  MARKETPLACE_CATEGORIES, parseNaturalLanguageSearch, addRecentlyViewedId,
} from '../lib/marketplace';
import { fetchRankingWeights, rankProducts, fuzzyMatch, expandSynonyms, type RankingWeights } from '../lib/rankingEngine';
import SeoHead from '../components/SeoHead';
import NapFooter from '../components/NapFooter';
import UniversalAIAssistant from '../components/UniversalAIAssistant';
import FilterSettingsBar from '../components/FilterSettingsBar';
import type { FilterState } from '../lib/filterConfigs';

import HeroBanner from '../components/marketplace/HeroBanner';
import SmartSearch from '../components/marketplace/SmartSearch';
import CategorySection from '../components/marketplace/CategorySection';
import ProductCard, { type MarketplaceProduct } from '../components/marketplace/ProductCard';
import QuickViewModal from '../components/marketplace/QuickViewModal';
import DiscoverySections from '../components/marketplace/DiscoverySections';
import ContinueBrowsing from '../components/marketplace/ContinueBrowsing';
import { NewArrivalsSection, FeaturedSellersSection, FeaturedServicesSection, JobsSection } from '../components/marketplace/MarketplaceDiscovery';
import AdvancedFilterBar, {
  DEFAULT_FILTER_STATE, type AdvancedFilterState,
} from '../components/marketplace/AdvancedFilterBar';
import ShareMenu from '../components/marketplace/ShareMenu';
import { useLanguage } from '../contexts/LanguageContext';

export default function MarketPage() {
  const { user, isAccountLocked, isAccountBanned } = useAuth();
  const { t } = useLanguage();

  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<AdvancedFilterState>(DEFAULT_FILTER_STATE);
  const [showCategorySection, setShowCategorySection] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [searchParams] = useSearchParams();

  const [quickViewProduct, setQuickViewProduct] = useState<MarketplaceProduct | null>(null);
  const [shareProduct, setShareProduct] = useState<MarketplaceProduct | null>(null);

  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamModalProduct, setTeamModalProduct] = useState<MarketplaceProduct | null>(null);
  const [selectedTier, setSelectedTier] = useState<SalesTeamTier>('Mkt L3');
  const [selectedDuration, setSelectedDuration] = useState<Duration>('1_week');
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [teamSubmitting, setTeamSubmitting] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSuccess, setTeamSuccess] = useState(false);

  const { wishlistIds, toggleWishlist } = useWishlist(user?.id);
  const { recordView } = useRecentlyViewed(user?.id);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [rankingWeights, setRankingWeights] = useState<RankingWeights | null>(null);

  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, description, price, commission_rate, image_url, category,
        uploaded_by, created_at, sales_team_tier, is_free, stock_quantity,
        initial_stock, product_type, demo_video_url, total_reviews,
        average_rating, total_sales, view_count, is_featured, is_sponsored
      `)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const sellerIds = [...new Set(data.map(p => p.uploaded_by))];
      const { data: sellers } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, store_title, is_verified, account_status')
        .in('id', sellerIds);

      const sellerMap = new Map((sellers || []).map(s => [s.id, s]));
      const enriched = data.map(p => {
        const seller = sellerMap.get(p.uploaded_by);
        return {
          ...p,
          seller_name: seller?.full_name || null,
          seller_avatar: seller?.avatar_url || null,
          seller_verified: seller?.is_verified || false,
          store_name: seller?.store_title || null,
        } as MarketplaceProduct;
      });
      setProducts(enriched);

      const counts: Record<string, number> = {};
      for (const p of data) {
        const cat = MARKETPLACE_CATEGORIES.find(c =>
          c.name.toLowerCase() === p.category?.toLowerCase() ||
          c.subcategories.some(s => s.toLowerCase() === p.category?.toLowerCase())
        );
        if (cat) counts[cat.id] = (counts[cat.id] || 0) + 1;
      }
      setCategoryCounts(counts);
    }
    setLoading(false);
  }, []);

  const fetchReferralCode = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.referral_code) setReferralCode(data.referral_code);
  }, [user]);

  useEffect(() => {
    fetchSystemConfig().then(setSystemConfig);
    fetchProducts();
    if (user) fetchReferralCode();
    fetchRankingWeights().then(setRankingWeights);

    const cat = searchParams.get('category');
    if (cat) {
      setFilters(prev => ({ ...prev, category: cat }));
    }
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [user, searchParams, fetchProducts, fetchReferralCode]);

  useEffect(() => {
    if (quickViewProduct) {
      recordView(quickViewProduct.id);
      addRecentlyViewedId(quickViewProduct.id);
      trackListingEvent({
        listing_id: quickViewProduct.id,
        listing_type: 'product',
        event_type: 'open',
        user_id: user?.id || null,
        metadata: { source: 'quick_view' },
        view_source: 'marketplace',
      });
      trackProductView(quickViewProduct.id, quickViewProduct.uploaded_by, 'marketplace');
    }
  }, [quickViewProduct, recordView, user?.id]);

  const handleCopyAffiliateLink = async (product: MarketplaceProduct) => {
    if (isAccountLocked || isAccountBanned || !referralCode) return;
    const link = generateAffiliateLink(referralCode, product.id);
    const success = await copyToClipboard(link);
    if (success) {
      setCopiedId(product.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleCategorySelect = (categoryName: string) => {
    setFilters(prev => ({ ...prev, category: categoryName }));
    document.getElementById('marketplace-products')?.scrollIntoView({ behavior: 'smooth' });
  };

  const filteredProducts = products.filter(p => {
    if (searchQuery.trim()) {
      const parsed = parseNaturalLanguageSearch(searchQuery);
      const q = parsed.keywords.join(' ').toLowerCase();
      const synonyms = expandSynonyms(q);
      const matchesSearch = synonyms.some(syn =>
        fuzzyMatch(syn, p.name, 2) ||
        fuzzyMatch(syn, p.description ?? '', 2) ||
        fuzzyMatch(syn, p.category, 2) ||
        fuzzyMatch(syn, p.seller_name ?? '', 2)
      );
      if (!matchesSearch) return false;
      if (parsed.priceMax && p.price > parsed.priceMax) return false;
    }

    if (filters.category !== 'All') {
      const cat = MARKETPLACE_CATEGORIES.find(c => c.name === filters.category);
      if (cat) {
        const matches = p.category === filters.category ||
          cat.subcategories.some(s => s.toLowerCase() === p.category?.toLowerCase()) ||
          p.category.toLowerCase().includes(filters.category.toLowerCase());
        if (!matches) return false;
      } else if (p.category !== filters.category) {
        return false;
      }
    }

    if (filters.location) {
      if (!(p.description ?? '').toLowerCase().includes(filters.location.toLowerCase())) return false;
    }
    if (filters.priceMin && p.price < parseFloat(filters.priceMin)) return false;
    if (filters.priceMax && p.price > parseFloat(filters.priceMax)) return false;
    if (filters.productType && p.product_type !== filters.productType) return false;
    if (filters.verifiedSeller && !p.seller_verified) return false;
    if (filters.minRating > 0 && (p.average_rating ?? 0) < filters.minRating) return false;
    if (filters.availability === 'in_stock' && (p.stock_quantity ?? 1) <= 0) return false;
    if (filters.availability === 'out_of_stock' && (p.stock_quantity ?? 1) > 0) return false;
    if (filters.availability === 'limited' && (p.stock_quantity ?? 99) > 5) return false;

    return true;
  });

  const sortedProducts: MarketplaceProduct[] = (() => {
    if (filters.sortBy === 'recommended' && rankingWeights) {
      return rankProducts(filteredProducts, searchQuery, rankingWeights) as MarketplaceProduct[];
    }
    return [...filteredProducts].sort((a, b) => {
      switch (filters.sortBy) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'price_asc':
          return a.price - b.price;
        case 'price_desc':
          return b.price - a.price;
        case 'commission_desc':
          return ((b.is_free ? 0 : b.price * b.commission_rate) / 100) - ((a.is_free ? 0 : a.price * a.commission_rate) / 100);
        case 'best_selling':
          return (b.total_sales ?? 0) - (a.total_sales ?? 0);
        case 'trending':
          return (b.view_count ?? 0) - (a.view_count ?? 0);
        case 'most_viewed':
          return (b.view_count ?? 0) - (a.view_count ?? 0);
        case 'highest_rated':
          return (b.average_rating ?? 0) - (a.average_rating ?? 0);
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  })();

  const visibleProducts = sortedProducts.slice(0, visibleCount);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const target = sentinelRef.current;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !loadingMore && visibleCount < sortedProducts.length) {
          setLoadingMore(true);
          setTimeout(() => {
            setVisibleCount(prev => Math.min(prev + 12, sortedProducts.length));
            setLoadingMore(false);
          }, 300);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadingMore, visibleCount, sortedProducts.length]);

  const relatedProducts = quickViewProduct
    ? products.filter(p =>
        p.id !== quickViewProduct.id &&
        p.category === quickViewProduct.category
      ).slice(0, 4)
    : [];

  const closeTeamModal = () => {
    setShowTeamModal(false);
    setTeamModalProduct(null);
    setTeamError(null);
    setTeamSuccess(false);
  };

  const handleCreateContract = async () => {
    if (!teamModalProduct || !user || !systemConfig) return;
    setTeamSubmitting(true);
    setTeamError(null);
    try {
      let query = supabase.from('users').select('id').eq('is_admin', false);
      if (selectedTier.startsWith('Mkt')) {
        const level = parseInt(selectedTier.replace('Mkt L', ''));
        query = query.eq('marketer_status', 'approved').eq('marketer_level', level);
      } else {
        const grade = selectedTier.replace('Adv ', '');
        query = query.eq('advertiser_status', 'approved').eq('advertiser_grade', grade);
      }
      const { data: teamMembers, error: teamErr } = await query.limit(1).maybeSingle();
      if (teamErr) throw teamErr;
      if (!teamMembers) {
        setTeamError(`No ${selectedTier} available. Try a different tier.`);
        setTeamSubmitting(false);
        return;
      }

      const totalAmount = calculateSubscriptionTotal(selectedTier, selectedDuration, systemConfig);
      const expiresAt = getExpiryDate(selectedDuration);
      const { error: contractErr } = await supabase.from('sales_team_contracts').insert({
        seller_id: user.id, sales_team_id: teamMembers.id, product_id: teamModalProduct.id,
        duration: selectedDuration, total_amount: totalAmount, status: 'active',
        admin_cut_applied: false, expires_at: expiresAt,
      });
      if (contractErr) throw contractErr;

      await supabase.from('products').update({
        sales_team_tier: selectedTier,
        sales_team_task_percent: getTaskPercentForTier(selectedTier, systemConfig),
      }).eq('id', teamModalProduct.id);

      setTeamSuccess(true);
      setTimeout(() => closeTeamModal(), 2500);
    } catch (err) {
      console.error('Contract creation error:', err);
      setTeamError('Failed to create contract. Please try again.');
    } finally {
      setTeamSubmitting(false);
    }
  };

  const filterState: FilterState = {
    searchQuery,
    categoryFilter: filters.category,
    sortBy: filters.sortBy,
    locationFilter: filters.location,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    dateFilter: 'all',
  };

  const handleFilterChange = (state: FilterState) => {
    setSearchQuery(state.searchQuery);
    setFilters(prev => ({
      ...prev,
      category: state.categoryFilter || 'All',
      sortBy: state.sortBy || 'newest',
      location: state.locationFilter,
      priceMin: state.priceMin,
      priceMax: state.priceMax,
    }));
  };

  const isBrowsing = !searchQuery && filters.category === 'All';

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
      <SeoHead
        title="Marketplace"
        description="Browse digital products, courses, services, and jobs on Dright. Find software, templates, e-books, and more from creators worldwide."
        canonical="/market"
        keywords={['digital products', 'online courses', 'software marketplace', 'creative services', 'e-books', 'templates']}
        breadcrumbs={[{ name: 'Home', url: '/welcome' }, { name: 'Marketplace', url: '/market' }]}
      />

      {/* Account status banner */}
      {(isAccountLocked || isAccountBanned) && (
        <div className={`rounded-2xl p-4 mb-6 flex items-center gap-3 ${isAccountBanned ? 'bg-error-muted border border-error/20' : 'bg-warning-muted border border-warning/20'}`}>
          <ShieldAlert className={`w-5 h-5 ${isAccountBanned ? 'text-error' : 'text-warning'}`} />
          <p className={`text-sm font-medium ${isAccountBanned ? 'text-error' : 'text-warning'}`}>
            {isAccountBanned
              ? 'Your account is BANNED. You cannot generate affiliate links, accept contracts, or request withdrawals.'
              : 'Your account is LOCKED. Affiliate link generation, contracts, and withdrawals are temporarily disabled.'}
          </p>
        </div>
      )}

      {/* 1. Hero Banner */}
      <HeroBanner onSearch={handleSearch} onBrowseCategories={() => setShowCategorySection(s => !s)} />

      {/* 2. AI Search */}
      <div className="mt-6">
        <SmartSearch onSearch={handleSearch} />
      </div>

      {/* 3. Categories */}
      <AnimatePresence>
        {showCategorySection && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mt-6"
          >
            <CategorySection onCategorySelect={handleCategorySelect} categoryCounts={categoryCounts} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discovery sections — only show when browsing (no search/filter active) */}
      {isBrowsing && (
        <div className="mt-8">
          {/* 4. Recommended For You (personalized) */}
          <DiscoverySections />

          {/* 5. Continue Browsing */}
          <ContinueBrowsing />

          {/* 6. New Arrivals */}
          <NewArrivalsSection />

          {/* 7. Featured Sellers */}
          <FeaturedSellersSection />

          {/* 8. Featured Services */}
          <FeaturedServicesSection />

          {/* 9. Jobs & Opportunities */}
          <JobsSection />
        </div>
      )}

      {/* 6. All Products section */}
      <div className="mt-10" id="marketplace-products">
        <AdvancedFilterBar
          filters={filters}
          onFilterChange={setFilters}
          resultCount={sortedProducts.length}
        />

        <div className="flex items-center justify-between mb-4 mt-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('allProducts')}</h1>
            <p className="text-gray-500 mt-0.5 text-sm">{sortedProducts.length} listing{sortedProducts.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400'}`}
                aria-label={t('gridView')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-400'}`}
                aria-label={t('listView')}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <Link
              to="/upload-product"
              className="flex items-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors shadow-md shadow-primary-600/20 min-h-[48px]"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">{t('postAd')}</span>
            </Link>
          </div>
        </div>

        <FilterSettingsBar
          userId={user?.id}
          filterState={filterState}
          onFilterChange={handleFilterChange}
        />

        {/* Loading skeleton */}
        {loading && (
          <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'} gap-3 sm:gap-5 mt-6`}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="h-48 skeleton" />
                <div className="p-4 space-y-3">
                  <div className="h-4 skeleton w-3/4" />
                  <div className="h-3 skeleton w-1/2" />
                  <div className="h-6 skeleton w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sortedProducts.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center mb-5">
              <Store className="w-12 h-12 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {searchQuery || filters.category !== 'All' ? 'No products match your filters' : 'No products yet'}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-xs mb-6">
              {searchQuery || filters.category !== 'All'
                ? 'Try adjusting your search or filters.'
                : 'Be the first to add a product to the marketplace!'}
            </p>
            {!searchQuery && filters.category === 'All' && (
              <Link
                to="/upload-product"
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors"
              >
                <Plus className="w-5 h-5" /> Post First Ad
              </Link>
            )}
          </motion.div>
        )}

        {/* Product grid */}
        {!loading && sortedProducts.length > 0 && (
          <>
            <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 max-w-3xl'} gap-3 sm:gap-5 mt-6`}>
              {visibleProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={index}
                  inWishlist={wishlistIds.has(product.id)}
                  onToggleWishlist={toggleWishlist}
                  onQuickView={setQuickViewProduct}
                  onShare={setShareProduct}
                  onCopyAffiliate={handleCopyAffiliateLink}
                  copiedId={copiedId}
                  affiliateCode={referralCode}
                />
              ))}
            </div>

            {visibleCount < sortedProducts.length && (
              <div ref={sentinelRef} className="flex items-center justify-center py-8">
                {loadingMore ? (
                  <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                ) : (
                  <p className="text-sm text-gray-400">Scroll for more</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick view modal */}
      <QuickViewModal
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
        inWishlist={quickViewProduct ? wishlistIds.has(quickViewProduct.id) : false}
        onToggleWishlist={toggleWishlist}
        onShare={setShareProduct}
        relatedProducts={relatedProducts}
      />

      {/* Share menu */}
      <ShareMenu
        productId={shareProduct?.id || ''}
        productName={shareProduct?.name || ''}
        isOpen={!!shareProduct}
        onClose={() => setShareProduct(null)}
        referralCode={referralCode}
      />

      {/* Sales team modal */}
      <AnimatePresence>
        {showTeamModal && teamModalProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={closeTeamModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Users className="w-5 h-5 text-warning" /> Add Sales Team
                </h3>
                <button onClick={closeTeamModal} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close">
                  <ShieldAlert className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Product: <span className="font-medium text-gray-900 dark:text-gray-100">{teamModalProduct.name}</span>
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sales Team Tier</label>
                <select
                  value={selectedTier}
                  onChange={e => setSelectedTier(e.target.value as SalesTeamTier)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:border-primary-500 outline-none"
                >
                  {ALL_TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Duration</label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATIONS.map(d => (
                    <button
                      key={d.value}
                      onClick={() => setSelectedDuration(d.value)}
                      className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                        selectedDuration === d.value ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              {systemConfig && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Total Subscription</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      ${calculateSubscriptionTotal(selectedTier, selectedDuration, systemConfig).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
              {teamError && (
                <div className="flex items-center gap-2 text-error text-sm">
                  <AlertCircle className="w-4 h-4" /> {teamError}
                </div>
              )}
              {teamSuccess && (
                <div className="flex items-center gap-2 text-success text-sm">
                  <Check className="w-4 h-4" /> Sales team contract created!
                </div>
              )}
              <button
                onClick={handleCreateContract}
                disabled={teamSubmitting || teamSuccess}
                className="w-full py-3 bg-warning hover:bg-orange-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {teamSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <><Shield className="w-4 h-4" /> Create Contract</>
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <NapFooter />
      <UniversalAIAssistant type="shopping" />
    </div>
  );
}
