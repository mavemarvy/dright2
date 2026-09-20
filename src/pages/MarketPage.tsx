import { formatDisplayCurrency } from '../lib/currency';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  fetchSystemConfig, calculateSubscriptionTotal, getBuyerFacingPrice,
  ALL_TIERS, DURATIONS,
  type SalesTeamTier, type Duration, type SystemConfig,
} from '../lib/pricing';
import { useWishlist, useRecentlyViewed } from '../lib/marketplaceHooks';
import {
  MARKETPLACE_CATEGORIES, parseNaturalLanguageSearch, addRecentlyViewedId,
} from '../lib/marketplace';
import { fetchRankingWeights, rankProducts, fuzzyMatch, expandSynonyms, type RankingWeights } from '../lib/rankingEngine';
import { dedupeMarketplaceItems, fetchMarketplaceFeedV2 } from '../lib/marketplaceFeed';
import SeoHead from '../components/SeoHead';
import NapFooter from '../components/NapFooter';
import UniversalAIAssistant from '../components/UniversalAIAssistant';

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
import SponsoredPlacementCard from '../components/promotion/SponsoredPlacementCard';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigationVisibility } from '../contexts/NavigationVisibilityContext';
import {
  MARKETPLACE_GRID_CLASSES,
  MARKETPLACE_IMAGE_HEIGHT_CLASSES,
  MARKETPLACE_LAYOUT_STORAGE_KEY,
  isMarketplaceCardSize,
  type MarketplaceCardSize,
} from '../lib/marketplaceLayout';

export default function MarketPage() {
  const { user, isAdmin, isAccountLocked, isAccountBanned } = useAuth();
  const { t } = useLanguage();
  const { isVisible: isFeatureVisible } = useNavigationVisibility();
  const showFeaturedSellers = isFeatureVisible('marketplace_featured_sellers', isAdmin);
  const showListingCount = isFeatureVisible('marketplace_listing_count', isAdmin);
  const showSearchDiscovery = isFeatureVisible('marketplace_search_discovery', isAdmin);

  // Marketplace V2 is canonical for the Recommended discovery surface.
  // The legacy catalog path remains a resilience/deterministic-sort fallback.
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [marketFeed, setMarketFeed] = useState<MarketplaceProduct[]>([]);
  const [marketCursor, setMarketCursor] = useState<string | null>(null);
  const [marketHasMore, setMarketHasMore] = useState(false);
  const [marketPersonalized, setMarketPersonalized] = useState(false);
  const [marketAlgorithmVersion, setMarketAlgorithmVersion] = useState(2);
  const [marketV2Failed, setMarketV2Failed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<AdvancedFilterState>({ ...DEFAULT_FILTER_STATE, sortBy: 'recommended' });
  const [showCategorySection, setShowCategorySection] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [listingCardSize, setListingCardSize] = useState<MarketplaceCardSize>(() => {
    if (typeof window === 'undefined') return 'medium';
    const saved = window.localStorage.getItem(MARKETPLACE_LAYOUT_STORAGE_KEY);
    return isMarketplaceCardSize(saved) ? saved : 'medium';
  });
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

  useEffect(() => {
    try {
      window.localStorage.setItem(MARKETPLACE_LAYOUT_STORAGE_KEY, listingCardSize);
    } catch {
      // Layout preference persistence is best-effort.
    }
  }, [listingCardSize]);

  const recommendedMode = filters.sortBy === 'recommended';
  const usingMarketplaceV2 = recommendedMode && !marketV2Failed;

  const fetchCategoryCounts = useCallback(async () => {
    const [productsResult, jobsResult] = await Promise.all([
      supabase
        .from('products')
        .select('category, product_type')
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved'),
      supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('approval_status', 'approved')
        .eq('status', 'active'),
    ]);

    const counts: Record<string, number> = {};
    for (const product of productsResult.data || []) {
      const matchedIds = new Set<string>();
      if (product.product_type === 'DIGITAL') matchedIds.add('digital');
      if (product.product_type === 'COURSE') matchedIds.add('courses');
      if (product.product_type === 'SERVICE') matchedIds.add('services');

      const category = MARKETPLACE_CATEGORIES.find(c =>
        c.name.toLowerCase() === product.category?.toLowerCase() ||
        c.subcategories.some(s => s.toLowerCase() === product.category?.toLowerCase())
      );
      if (category) matchedIds.add(category.id);

      for (const id of matchedIds) counts[id] = (counts[id] || 0) + 1;
    }

    if ((jobsResult.count || 0) > 0) counts.jobs = jobsResult.count || 0;
    setCategoryCounts(counts);
  }, []);

  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, description, price, commission_rate, image_url, category,
        uploaded_by, created_at, sales_team_tier, admin_task_percent, sales_team_task_percent,
        is_free, stock_quantity, initial_stock, product_type, demo_video_url, total_reviews,
        average_rating, total_sales, view_count, is_featured, is_sponsored
      `)
      .eq('is_active', true)
      .eq('is_hidden', false)
      .eq('approval_status', 'approved')
      .order('created_at', { ascending: false });

    if (error || !data) throw error || new Error('Unable to load marketplace');
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
    return enriched;
  }, []);

  const fetchRecommendedPage = useCallback(async (reset: boolean) => {
    const cursor = reset ? null : marketCursor;
    if (!reset && (!marketHasMore || loadingMore)) return;
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const page = await fetchMarketplaceFeedV2({
        search: searchQuery,
        category: filters.category,
        minPrice: filters.priceMin ? Number(filters.priceMin) : null,
        maxPrice: filters.priceMax ? Number(filters.priceMax) : null,
        location: filters.location,
        verifiedOnly: filters.verifiedSeller,
        minRating: filters.minRating,
        productType: filters.productType,
      }, cursor, 30);

      setMarketFeed(prev => reset
        ? dedupeMarketplaceItems(page.items)
        : dedupeMarketplaceItems([...prev, ...page.items]));
      setMarketCursor(page.nextCursor);
      setMarketHasMore(page.hasMore);
      setMarketPersonalized(page.personalized);
      setMarketAlgorithmVersion(page.algorithmVersion);
      setMarketV2Failed(false);
    } catch (error) {
      console.error('[marketplace-v2] falling back to legacy catalog', error);
      setMarketV2Failed(true);
      try { await fetchProducts(); } catch (fallbackError) { console.error('[marketplace] fallback failed', fallbackError); }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [fetchProducts, filters.category, filters.location, filters.minRating, filters.priceMax, filters.priceMin, filters.productType, filters.verifiedSeller, loadingMore, marketCursor, marketHasMore, searchQuery]);

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
    void fetchCategoryCounts();
    if (user) void fetchReferralCode();
    void fetchRankingWeights().then(setRankingWeights);

    const cat = searchParams.get('category');
    if (cat) setFilters(prev => ({ ...prev, category: cat }));
    const q = searchParams.get('q');
    if (q) setSearchQuery(q);
  }, [user, searchParams, fetchCategoryCounts, fetchReferralCode]);

  useEffect(() => {
    setVisibleCount(24);
    if (recommendedMode) {
      setMarketV2Failed(false);
      const timer = window.setTimeout(() => { void fetchRecommendedPage(true); }, 250);
      return () => window.clearTimeout(timer);
    }
    setLoading(true);
    void fetchProducts().catch(error => console.error('[marketplace] catalog load failed', error)).finally(() => setLoading(false));
  // Primitive dependencies intentionally reset true pagination when a server filter changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedMode, searchQuery, filters.category, filters.location, filters.priceMin, filters.priceMax, filters.productType, filters.verifiedSeller, filters.minRating]);

  useEffect(() => {
    if (quickViewProduct) {
      recordView(quickViewProduct.id);
      addRecentlyViewedId(quickViewProduct.id);
      trackListingEvent({
        listing_id: quickViewProduct.id,
        listing_type: 'product',
        event_type: 'open',
        user_id: user?.id || null,
        metadata: { source: 'quick_view', recommendation_strategy: usingMarketplaceV2 ? 'marketplace_v2' : 'legacy' },
        view_source: 'marketplace',
      });
      trackProductView(quickViewProduct.id, quickViewProduct.uploaded_by, 'marketplace');
    }
  }, [quickViewProduct, recordView, user?.id, usingMarketplaceV2]);

  const handleCopyAffiliateLink = async (product: MarketplaceProduct) => {
    if (isAccountLocked || isAccountBanned || !referralCode) return;
    const link = generateAffiliateLink(referralCode, product.id);
    const success = await copyToClipboard(link);
    if (success) {
      setCopiedId(product.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleSearch = (query: string) => setSearchQuery(query);

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
        fuzzyMatch(syn, p.name, 2) || fuzzyMatch(syn, p.description ?? '', 2) ||
        fuzzyMatch(syn, p.category, 2) || fuzzyMatch(syn, p.seller_name ?? '', 2)
      );
      if (!matchesSearch) return false;
      if (parsed.priceMax && getBuyerFacingPrice(p) > parsed.priceMax) return false;
    }
    if (filters.category !== 'All') {
      const cat = MARKETPLACE_CATEGORIES.find(c => c.name === filters.category);
      if (cat) {
        const matches = p.category === filters.category || cat.subcategories.some(s => s.toLowerCase() === p.category?.toLowerCase()) || p.category.toLowerCase().includes(filters.category.toLowerCase());
        if (!matches) return false;
      } else if (p.category !== filters.category) return false;
    }
    if (filters.location && !(p.description ?? '').toLowerCase().includes(filters.location.toLowerCase())) return false;
    if (filters.priceMin && getBuyerFacingPrice(p) < parseFloat(filters.priceMin)) return false;
    if (filters.priceMax && getBuyerFacingPrice(p) > parseFloat(filters.priceMax)) return false;
    if (filters.productType && p.product_type !== filters.productType) return false;
    if (filters.verifiedSeller && !p.seller_verified) return false;
    if (filters.minRating > 0 && (p.average_rating ?? 0) < filters.minRating) return false;
    if (filters.availability === 'in_stock' && (p.stock_quantity ?? 1) <= 0) return false;
    if (filters.availability === 'out_of_stock' && (p.stock_quantity ?? 1) > 0) return false;
    if (filters.availability === 'limited' && (p.stock_quantity ?? 99) > 5) return false;
    return true;
  });

  const sortedProducts: MarketplaceProduct[] = (() => {
    if (filters.sortBy === 'recommended' && rankingWeights) return rankProducts(filteredProducts, searchQuery, rankingWeights) as MarketplaceProduct[];
    return [...filteredProducts].sort((a, b) => {
      switch (filters.sortBy) {
        case 'oldest': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'price_asc': return getBuyerFacingPrice(a) - getBuyerFacingPrice(b);
        case 'price_desc': return getBuyerFacingPrice(b) - getBuyerFacingPrice(a);
        case 'commission_desc': return ((b.is_free ? 0 : b.price * b.commission_rate) / 100) - ((a.is_free ? 0 : a.price * a.commission_rate) / 100);
        case 'best_selling': return (b.total_sales ?? 0) - (a.total_sales ?? 0);
        case 'trending':
        case 'most_viewed': return (b.view_count ?? 0) - (a.view_count ?? 0);
        case 'highest_rated': return (b.average_rating ?? 0) - (a.average_rating ?? 0);
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  })();

  const displayProducts = usingMarketplaceV2 ? marketFeed : sortedProducts;
  const visibleProducts = usingMarketplaceV2 ? marketFeed : sortedProducts.slice(0, visibleCount);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const target = sentinelRef.current;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting || loadingMore) return;
      if (usingMarketplaceV2) {
        if (marketHasMore) void fetchRecommendedPage(false);
      } else if (visibleCount < sortedProducts.length) {
        setLoadingMore(true);
        window.setTimeout(() => {
          setVisibleCount(prev => Math.min(prev + 12, sortedProducts.length));
          setLoadingMore(false);
        }, 250);
      }
    }, { rootMargin: '300px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchRecommendedPage, loadingMore, marketHasMore, sortedProducts.length, usingMarketplaceV2, visibleCount]);

  const relatedProducts = quickViewProduct
    ? displayProducts.filter(p => p.id !== quickViewProduct.id && p.category === quickViewProduct.category).slice(0, 4)
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
      const { data: contract, error: contractError } = await supabase.rpc('create_sales_team_contract_request', {
        p_product_id: teamModalProduct.id,
        p_selected_tier: selectedTier,
        p_duration: selectedDuration,
      });
      if (contractError) throw contractError;
      const contractId = contract?.contract_id as string | undefined;
      if (!contractId) throw new Error('Unable to create a canonical sales team contract');
      const { data: payment, error: paymentError } = await supabase.functions.invoke('sales-team-contract-initialize', { body: { contract_id: contractId } });
      if (paymentError) throw paymentError;
      if (!payment?.authorization_url) throw new Error(payment?.error || 'Unable to initialize secure payment');
      setTeamSuccess(true);
      window.location.assign(payment.authorization_url);
    } catch (err) {
      console.error('Contract creation error:', err);
      setTeamError(err instanceof Error ? err.message : 'Failed to prepare the sales team contract. Please try again.');
    } finally { setTeamSubmitting(false); }
  };

  const isBrowsing = !searchQuery && filters.category === 'All';
  const contextualPlacement = searchQuery.trim()
    ? 'search'
    : filters.productType?.toUpperCase() === 'COURSE'
      ? 'course_feed'
      : filters.productType?.toUpperCase() === 'SERVICE'
        ? 'service_feed'
        : filters.category !== 'All' ? 'category' : null;

  const resultLabel = useMemo(() => {
    if (usingMarketplaceV2) return `${displayProducts.length}${marketHasMore ? '+' : ''} ranked listing${displayProducts.length === 1 ? '' : 's'}${marketPersonalized ? ' · personalized' : ''}`;
    return `${displayProducts.length} listing${displayProducts.length !== 1 ? 's' : ''}`;
  }, [displayProducts.length, marketHasMore, marketPersonalized, usingMarketplaceV2]);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
      <SeoHead
        title="Marketplace"
        description="Browse digital products, courses, services, and jobs on Dright. Find software, templates, e-books, and more from creators worldwide."
        canonical="/market"
        keywords={['digital products', 'online courses', 'software marketplace', 'creative services', 'e-books', 'templates']}
        breadcrumbs={[{ name: 'Home', url: '/welcome' }, { name: 'Marketplace', url: '/market' }]}
      />

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

      <HeroBanner onBrowseCategories={() => setShowCategorySection(s => !s)} />
      <div className="mt-6">
        <SmartSearch onSearch={handleSearch} showMarketplaceDiscovery={showSearchDiscovery} />
      </div>
      <div className="mt-3">
        <AdvancedFilterBar
          filters={filters}
          onFilterChange={setFilters}
          resultCount={displayProducts.length}
          showResultCount={showListingCount}
          userId={user?.id}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          cardSize={listingCardSize}
          onCardSizeChange={setListingCardSize}
        />
      </div>

      <AnimatePresence>
        {showCategorySection && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-6">
            <CategorySection onCategorySelect={handleCategorySelect} categoryCounts={categoryCounts} />
          </motion.div>
        )}
      </AnimatePresence>

      {isBrowsing && (
        <div className="mt-8">
          <DiscoverySections />
          {filters.sortBy !== 'trending' && <SponsoredPlacementCard placement="suggestions" variant="recommendation" className="my-8" />}
          <ContinueBrowsing />
          <NewArrivalsSection />
          {showFeaturedSellers && <FeaturedSellersSection />}
          <FeaturedServicesSection />
          <JobsSection />
        </div>
      )}

      <div className="mt-8" id="marketplace-products">
        {filters.sortBy === 'trending' && <SponsoredPlacementCard placement="trending" variant="compact" className="mt-4" />}

        <div className="flex items-center justify-between mb-4 mt-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('allProducts')}</h1>
            {showListingCount && (
              <p className="text-gray-500 mt-0.5 text-sm">
                {resultLabel}{usingMarketplaceV2 ? ` · v${marketAlgorithmVersion}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm' : 'text-gray-400'}`} aria-label={t('gridView')}><LayoutGrid className="w-4 h-4" /></button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-primary-600 shadow-sm' : 'text-gray-400'}`} aria-label={t('listView')}><List className="w-4 h-4" /></button>
            </div>
            <Link to="/upload-product" className="flex items-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors shadow-md shadow-primary-600/20 min-h-[48px]"><Plus className="w-5 h-5" /><span className="hidden sm:inline">{t('postAd')}</span></Link>
          </div>
        </div>

        {contextualPlacement && <SponsoredPlacementCard placement={contextualPlacement} variant="compact" className="mt-4" />}

        {loading && (
          <div className={`grid ${viewMode === 'grid' ? MARKETPLACE_GRID_CLASSES[listingCardSize] : 'grid-cols-1'} gap-3 sm:gap-5 mt-6`}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className={`${MARKETPLACE_IMAGE_HEIGHT_CLASSES[listingCardSize]} skeleton`} />
                <div className="p-4 space-y-3">
                  <div className="h-4 skeleton w-3/4" />
                  <div className="h-3 skeleton w-1/2" />
                  <div className="h-6 skeleton w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && displayProducts.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center mb-5"><Store className="w-12 h-12 text-gray-400 dark:text-gray-500" /></div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{searchQuery || filters.category !== 'All' ? 'No products match your filters' : 'No products yet'}</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-xs mb-6">{searchQuery || filters.category !== 'All' ? 'Try adjusting your search or filters.' : 'Be the first to add a product to the marketplace!'}</p>
            {!searchQuery && filters.category === 'All' && <Link to="/upload-product" className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold transition-colors"><Plus className="w-5 h-5" /> Post First Ad</Link>}
          </motion.div>
        )}

        {!loading && displayProducts.length > 0 && (
          <>
            <div className={`grid ${viewMode === 'grid' ? MARKETPLACE_GRID_CLASSES[listingCardSize] : 'grid-cols-1 max-w-3xl'} gap-3 sm:gap-5 mt-6 transition-all duration-200`}>
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
                  cardSize={listingCardSize}
                />
              ))}
            </div>
            {(usingMarketplaceV2 ? marketHasMore : visibleCount < sortedProducts.length) && (
              <div ref={sentinelRef} className="flex items-center justify-center py-8">
                {loadingMore ? <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" /> : <p className="text-sm text-gray-400">Scroll for more</p>}
              </div>
            )}
          </>
        )}
      </div>

      <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} inWishlist={quickViewProduct ? wishlistIds.has(quickViewProduct.id) : false} onToggleWishlist={toggleWishlist} onShare={setShareProduct} relatedProducts={relatedProducts} />
      <ShareMenu productId={shareProduct?.id || ''} productName={shareProduct?.name || ''} isOpen={!!shareProduct} onClose={() => setShareProduct(null)} referralCode={referralCode} />

      <AnimatePresence>
        {showTeamModal && teamModalProduct && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeTeamModal}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Users className="w-5 h-5 text-warning" /> Add Sales Team</h3><button onClick={closeTeamModal} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close"><ShieldAlert className="w-5 h-5" /></button></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Product: <span className="font-medium text-gray-900 dark:text-gray-100">{teamModalProduct.name}</span></p>
              <div className="space-y-2"><label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sales Team Tier</label><select value={selectedTier} onChange={e => setSelectedTier(e.target.value as SalesTeamTier)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:border-primary-500 outline-none">{ALL_TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}</select></div>
              <div className="space-y-2"><label className="text-sm font-medium text-gray-700 dark:text-gray-300">Duration</label><div className="grid grid-cols-3 gap-2">{DURATIONS.map(d => <button key={d.value} onClick={() => setSelectedDuration(d.value)} className={`py-2 rounded-xl text-sm font-medium transition-colors ${selectedDuration === d.value ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>{d.label}</button>)}</div></div>
              {systemConfig && <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3"><div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">Estimated Subscription</span><span className="font-bold text-gray-900 dark:text-gray-100">{formatDisplayCurrency(Number(calculateSubscriptionTotal(selectedTier, selectedDuration, systemConfig).toFixed(2)))}</span></div><p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">The server confirms the final price and eligible team member before payment.</p></div>}
              {teamError && <div className="flex items-center gap-2 text-error text-sm"><AlertCircle className="w-4 h-4" /> {teamError}</div>}
              {teamSuccess && <div className="flex items-center gap-2 text-success text-sm"><Check className="w-4 h-4" /> Contract prepared. Opening secure payment…</div>}
              <button onClick={handleCreateContract} disabled={teamSubmitting || teamSuccess} className="w-full py-3 bg-warning hover:bg-orange-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">{teamSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Shield className="w-4 h-4" /> Continue to Secure Payment</>}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <NapFooter />
      <UniversalAIAssistant type="shopping" />
    </div>
  );
}
