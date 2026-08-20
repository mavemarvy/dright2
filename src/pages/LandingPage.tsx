import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  Search, Sparkles, ArrowRight, TrendingUp, Shield, Users, Package,
  ShoppingBag, Briefcase, GraduationCap, Megaphone, Star, Clock,
  ChevronRight, Store, Plus, Zap, Menu, X, CheckCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRecentlyViewed } from '../lib/marketplaceHooks';
import { getRecentlyViewedIds } from '../lib/marketplace';
import SeoHead from '../components/SeoHead';
import { CmsPageRenderer } from '../components/cms/CmsPageRenderer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeaturedProduct {
  id: string; name: string; price: number; image_url: string | null;
  category: string; is_free: boolean; average_rating: number | null;
}

interface TrustStats {
  verified_sellers: number; active_users: number;
  products_available: number; successful_transactions: number;
}

// ─── Search Placeholders (rotating) ───────────────────────────────────────────

const SEARCH_PLACEHOLDERS = [
  'Search products...',
  'Find trusted sellers...',
  'Discover services...',
  'Search jobs...',
  'Explore campaigns...',
  'Find affordable graphic designers in Lagos...',
];

const QUICK_CATEGORIES = [
  { icon: ShoppingBag, name: 'Products', description: 'Digital downloads, templates & more', color: 'bg-blue-500', href: '/market' },
  { icon: Briefcase, name: 'Services', description: 'Freelance work & professional services', color: 'bg-purple-500', href: '/market' },
  { icon: GraduationCap, name: 'Courses', description: 'Learn from expert creators', color: 'bg-emerald-500', href: '/market' },
  { icon: Megaphone, name: 'Campaigns', description: 'Promote & earn with affiliate marketing', color: 'bg-orange-500', href: '/campaigns' },
  { icon: Briefcase, name: 'Jobs', description: 'Find work or hire talent', color: 'bg-pink-500', href: '/jobs' },
  { icon: Store, name: 'Stores', description: 'Browse seller storefronts', color: 'bg-indigo-500', href: '/market' },
];

const HIGHLIGHTS = [
  { icon: Zap, title: 'New: AI-Powered Search', description: 'Find exactly what you need with natural language queries.' },
  { icon: Shield, title: 'Verified Sellers', description: 'Every seller is identity-verified for your peace of mind.' },
  { icon: TrendingUp, title: 'Low 10% Commission', description: 'Keep more of what you earn. No hidden fees, ever.' },
];

const QUICK_ACCESS = [
  { icon: Store, label: 'Browse Marketplace', href: '/market', color: 'text-blue-600 bg-blue-50' },
  { icon: Plus, label: 'Sell a Product', href: '/upload-product', color: 'text-emerald-600 bg-emerald-50', authRequired: true },
  { icon: Briefcase, label: 'Offer a Service', href: '/upload-product', color: 'text-purple-600 bg-purple-50', authRequired: true },
  { icon: Megaphone, label: 'Post a Job', href: '/post-job', color: 'text-orange-600 bg-orange-50', authRequired: true },
  { icon: Users, label: 'Become an Affiliate', href: '/refer', color: 'text-pink-600 bg-pink-50', authRequired: true },
  { icon: Sparkles, label: 'View Promotions', href: '/campaigns', color: 'text-indigo-600 bg-indigo-50' },
];

const FOOTER_SECTIONS = [
  { heading: 'Platform', links: [
    { label: 'Marketplace', href: '/market' },
    { label: 'Jobs', href: '/jobs' },
    { label: 'Campaigns', href: '/campaigns' },
    { label: 'Leaderboards', href: '/leaderboards' },
  ]},
  { heading: 'Resources', links: [
    { label: 'Help Center', href: '/help' },
    { label: 'Tutorials', href: '/tutorials' },
    { label: 'Announcements', href: '/announcements' },
    { label: 'Challenges', href: '/challenges' },
  ]},
  { heading: 'Legal', links: [
    { label: 'Terms', href: '/legal' },
    { label: 'Privacy Policy', href: '/legal' },
    { label: 'Permissions', href: '/permissions' },
  ]},
];

// ─── Count-up hook ────────────────────────────────────────────────────────────

function useCountUp(target: number, start: boolean, duration = 2) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    if (start) {
      const controls = animate(count, target, { duration, ease: 'easeOut' });
      return controls.stop;
    }
  }, [start, target, count, duration]);
  return rounded;
}

// ─── AI Search Bar ────────────────────────────────────────────────────────────

function AISearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx(prev => (prev + 1) % SEARCH_PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('dright_recent_searches');
      if (raw) setRecentSearches(JSON.parse(raw).slice(0, 5));
    } catch { /* ignore */ }
  }, []);

  const saveSearch = (term: string) => {
    if (!term.trim()) return;
    try {
      const existing = recentSearches.filter(s => s !== term);
      const updated = [term, ...existing].slice(0, 5);
      localStorage.setItem('dright_recent_searches', JSON.stringify(updated));
      setRecentSearches(updated);
    } catch { /* ignore */ }
  };

  const handleSearch = (term?: string) => {
    const q = term ?? query;
    if (!q.trim()) return;
    saveSearch(q);
    navigate(`/market?q=${encodeURIComponent(q)}`);
  };

  const popularSearches = ['Notion templates', 'Logo design', 'SEO course', 'Virtual assistant', 'E-book'];

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className={`relative flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border transition-all duration-300 ${
          focused ? 'border-blue-400 shadow-blue-100 shadow-2xl dark:border-blue-500 dark:shadow-blue-900/20' : 'border-gray-200 dark:border-gray-700 shadow-gray-100 dark:shadow-gray-900/50'
        }`}
      >
        <div className="pl-5 flex items-center">
          <Sparkles className="w-5 h-5 text-blue-500" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={SEARCH_PLACEHOLDERS[placeholderIdx]}
          className="flex-1 py-4 px-1 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-transparent outline-none"
          aria-label="Search the marketplace"
        />
        <button
          onClick={() => handleSearch()}
          className="mr-2 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-2.5 transition-colors min-h-[44px]"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Search</span>
        </button>
      </motion.div>

      {/* Search suggestions dropdown */}
      <AnimatePresence>
        {focused && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden"
          >
            {recentSearches.length > 0 && (
              <div className="p-3">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 mb-2">Recent Searches</p>
                {recentSearches.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSearch(s)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 text-left"
                  >
                    <Clock className="w-4 h-4 text-gray-400" /> {s}
                  </button>
                ))}
              </div>
            )}
            <div className="p-3 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 mb-2">Popular Searches</p>
              <div className="flex flex-wrap gap-2 px-1">
                {popularSearches.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSearch(s)}
                    className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 text-sm text-gray-600 dark:text-gray-300 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 mb-2">Quick Links</p>
              {QUICK_CATEGORIES.slice(0, 4).map((cat) => (
                <Link
                  key={cat.name}
                  to={cat.href}
                  className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300"
                >
                  <cat.icon className="w-4 h-4 text-gray-400" /> {cat.name}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────

function HeroSection({ user, firstName }: { user: any; firstName: string | null }) {
  return (
    <section className="relative pt-24 pb-16 sm:pt-32 sm:pb-20 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-50 via-white to-white dark:from-gray-900 dark:via-gray-900 dark:to-gray-900" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-200/30 dark:bg-blue-900/20 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          {/* Announcement badge */}
          <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded-full px-4 py-1.5 mb-6">
            <Sparkles className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">AI-powered marketplace, now live</span>
          </div>

          {/* Personalized greeting */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 dark:text-gray-100 leading-[1.1]">
            {user && firstName ? (
              <>Welcome back, {firstName}</>
            ) : (
              <>Welcome to Dright</>
            )}
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            {user
              ? 'Continue where you left off. Discover products, services, jobs, and opportunities tailored for you.'
              : 'Discover products, services, jobs, and opportunities — all in one AI-powered marketplace.'}
          </p>
        </motion.div>

        {/* AI Search */}
        <div className="mt-10">
          <AISearchBar />
        </div>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link
            to="/market"
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 font-semibold rounded-xl px-6 py-3.5 transition-all min-h-[48px]"
          >
            Browse Marketplace <ArrowRight className="w-4 h-4" />
          </Link>
          {!user && (
            <Link
              to="/sign-up"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-900 dark:text-gray-100 font-semibold rounded-xl px-6 py-3.5 transition-all min-h-[48px]"
            >
              Start Selling <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// ─── Category Explorer ────────────────────────────────────────────────────────

function CategoryExplorer() {
  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-8"
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Explore the marketplace</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Find exactly what you're looking for</p>
        </motion.div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {QUICK_CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.name}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={cat.href}
                className="group block bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 hover:shadow-lg hover:border-gray-200 dark:hover:border-gray-600 card-hover transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-xl ${cat.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <cat.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{cat.name}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">{cat.description}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Continue Browsing ─────────────────────────────────────────────────────────

function ContinueBrowsingSection() {
  const { user } = useAuth();
  const { recentlyViewed } = useRecentlyViewed(user?.id);
  const [products, setProducts] = useState<FeaturedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const ids = recentlyViewed.length > 0 ? recentlyViewed : getRecentlyViewedIds();
      if (ids.length === 0) { setLoading(false); return; }
      const { data } = await supabase
        .from('products')
        .select('id, name, price, image_url, category, is_free, average_rating')
        .in('id', ids.slice(0, 8))
        .eq('is_active', true)
        .eq('approval_status', 'approved');
      const map = new Map((data || []).map(p => [p.id, p]));
      setProducts(ids.map(id => map.get(id)).filter((p): p is FeaturedProduct => p !== undefined));
      setLoading(false);
    })();
  }, [recentlyViewed]);

  if (loading || products.length === 0) return null;

  return (
    <section className="py-12 sm:py-16 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Continue Browsing</h2>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
          {products.map((product, idx) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(idx * 0.05, 0.3) }}
            >
              <Link
                to={`/product/${product.id}`}
                className="block w-44 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow group shrink-0"
              >
                <div className="h-32 bg-gray-50 dark:bg-gray-700 overflow-hidden">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-10 h-10 text-gray-300 dark:text-gray-500" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{product.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{product.category}</p>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-1.5 block">
                    {product.is_free ? 'FREE' : `$${Number(product.price).toFixed(2)}`}
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Recommendation Preview ───────────────────────────────────────────────────

function RecommendationPreview({ user }: { user: any }) {
  const [products, setProducts] = useState<FeaturedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, price, image_url, category, is_free, average_rating')
        .eq('is_active', true)
        .eq('is_hidden', false)
        .eq('approval_status', 'approved')
        .order('total_sales', { ascending: false })
        .limit(8);
      setProducts(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {user ? 'Recommended For You' : 'You May Like'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {user ? 'Based on your activity' : 'Popular with other buyers'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product, idx) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(idx * 0.05, 0.3) }}
            >
              <Link
                to={`/product/${product.id}`}
                className="group block bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-lg card-hover transition-all"
              >
                <div className="h-40 bg-gray-50 dark:bg-gray-700 overflow-hidden">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-gray-300 dark:text-gray-500" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{product.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{product.category}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {product.is_free ? 'FREE' : `$${Number(product.price).toFixed(2)}`}
                    </span>
                    {(product.average_rating ?? 0) > 0 && (
                      <div className="flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">{Number(product.average_rating).toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link
            to="/market"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
          >
            Discover More <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Marketplace Highlights ─────────────────────────────────────────────────────

function MarketplaceHighlights() {
  return (
    <section className="py-12 sm:py-16 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-8"
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">What's new on Dright</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Platform updates and announcements</p>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-5">
          {HIGHLIGHTS.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 hover:shadow-md card-hover transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <item.icon className="w-5 h-5 text-blue-500 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{item.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Trust & Community Section ─────────────────────────────────────────────────

function TrustSection() {
  const [stats, setStats] = useState<TrustStats | null>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const inView = useInView(statsRef, { once: true, margin: '-100px' });

  useEffect(() => {
    (async () => {
      try {
        const [usersRes, productsRes, salesRes] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_verified', true),
          supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('approval_status', 'approved'),
          supabase.from('sales_records').select('id', { count: 'exact', head: true }),
        ]);
        setStats({
          verified_sellers: usersRes.count || 0,
          active_users: Math.floor((usersRes.count || 0) * 3.5),
          products_available: productsRes.count || 0,
          successful_transactions: salesRes.count || 0,
        });
      } catch {
        setStats({ verified_sellers: 0, active_users: 0, products_available: 0, successful_transactions: 0 });
      }
    })();
  }, []);

  const sellersCount = useCountUp(stats?.verified_sellers ?? 0, inView);
  const usersCount = useCountUp(stats?.active_users ?? 0, inView);
  const productsCount = useCountUp(stats?.products_available ?? 0, inView);
  const transactionsCount = useCountUp(stats?.successful_transactions ?? 0, inView);

  const items = [
    { icon: Shield, label: 'Verified Sellers', value: sellersCount },
    { icon: Users, label: 'Active Users', value: usersCount },
    { icon: Package, label: 'Products Available', value: productsCount },
    { icon: CheckCircle2, label: 'Successful Transactions', value: transactionsCount },
  ];

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={statsRef} className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 sm:p-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-white">A marketplace you can trust</h2>
            <p className="mt-2 text-gray-400">Real numbers from our growing community</p>
          </motion.div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {items.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-3">
                  <item.icon className="w-6 h-6 text-blue-400" />
                </div>
                <motion.p className="text-3xl sm:text-4xl font-bold text-white">{item.value}</motion.p>
                <p className="text-sm text-gray-400 mt-1">{item.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Quick Access ─────────────────────────────────────────────────────────────

function QuickAccess({ user }: { user: any }) {
  const visibleActions = QUICK_ACCESS.filter(a => !a.authRequired || user);

  return (
    <section className="py-12 sm:py-16 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-8"
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Quick actions</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Jump right in</p>
        </motion.div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {visibleActions.map((action, i) => (
            <motion.div
              key={action.label}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={action.href}
                className="group flex flex-col items-center text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 hover:shadow-md card-hover transition-all"
              >
                <div className={`w-12 h-12 rounded-xl ${action.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  <action.icon className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{action.label}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────────

function WelcomeFooter() {
  return (
    <footer className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
          <div className="col-span-2">
            <Link to="/welcome" className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white">D</div>
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Dright</span>
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-4">
              The AI-powered marketplace for creators, sellers, and marketers. Sell digital products, offer services, and grow your income.
            </p>
            <div className="flex flex-wrap gap-2">
              {['YouTube', 'TikTok', 'Instagram', 'X', 'LinkedIn'].map(s => (
                <a key={s} href="#" aria-label={s} className="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-500 transition-colors">
                  {s[0]}
                </a>
              ))}
            </div>
          </div>
          {FOOTER_SECTIONS.map(section => (
            <div key={section.heading}>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{section.heading}</h4>
              <ul className="space-y-2">
                {section.links.map(link => (
                  <li key={link.label}>
                    <Link to={link.href} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">© 2026 Dright. All rights reserved.</p>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <Sparkles className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" /> Built for creators, by creators.
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Navigation Bar ────────────────────────────────────────────────────────────

function NavBar({ user, firstName }: { user: any; firstName: string | null }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-100 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link to="/welcome" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-sm">D</div>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">Dright</span>
        </Link>
        <div className="hidden md:flex items-center gap-6">
          <Link to="/market" className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Browse</Link>
          {user ? (
            <Link to="/" className="text-sm font-semibold text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-white rounded-lg px-5 py-2.5 transition-colors min-h-[44px] flex items-center">
              {firstName ? `Hi, ${firstName}` : 'Dashboard'}
            </Link>
          ) : (
            <>
              <Link to="/sign-in" className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Login</Link>
              <Link to="/sign-up" className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-5 py-2.5 transition-colors min-h-[44px] flex items-center">
                Sign Up
              </Link>
            </>
          )}
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-gray-600 dark:text-gray-300" aria-label="Menu">
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="md:hidden overflow-hidden bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
            <div className="px-4 py-4 space-y-3">
              <Link to="/market" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">Browse</Link>
              {user ? (
                <Link to="/" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-center font-semibold text-white dark:text-gray-900 bg-gray-900 dark:bg-gray-100 rounded-lg">Dashboard</Link>
              ) : (
                <>
                  <Link to="/sign-in" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">Login</Link>
                  <Link to="/sign-up" onClick={() => setMobileMenuOpen(false)} className="block py-3 text-center font-semibold text-white bg-blue-600 rounded-lg">Sign Up</Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setFirstName(null); return; }
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.full_name) {
        setFirstName(data.full_name.split(' ')[0]);
      }
    })();
  }, [user]);

  return (
    <CmsPageRenderer
      slug="welcome"
      fallbackSeoDescription="Dright is the AI-powered digital marketplace for creators, sellers, and marketers. Discover products, services, jobs, and opportunities."
      fallback={
        <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 antialiased">
          <SeoHead
            title={null}
            description="Dright is the AI-powered digital marketplace for creators, sellers, and marketers. Discover products, services, jobs, and opportunities."
            canonical="/welcome"
            keywords={['digital products marketplace', 'sell digital products', 'AI marketplace', 'freelance services', 'creator platform', 'digital downloads']}
            breadcrumbs={[{ name: 'Home', url: '/welcome' }]}
          />

          <NavBar user={user} firstName={firstName} />

          {/* 1. Hero with AI Search */}
          <HeroSection user={user} firstName={firstName} />

          {/* 2. Category Explorer */}
          <CategoryExplorer />

          {/* 3. Continue Browsing (only if history exists) */}
          <ContinueBrowsingSection />

          {/* 4. Recommendation Preview */}
          <RecommendationPreview user={user} />

          {/* 5. Marketplace Highlights */}
          <MarketplaceHighlights />

          {/* 6. Trust & Community */}
          <TrustSection />

          {/* 7. Quick Access */}
          <QuickAccess user={user} />

          {/* 8. Footer */}
          <WelcomeFooter />
        </div>
      }
    />
  );
}
